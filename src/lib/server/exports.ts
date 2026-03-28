import { readFileSync } from "node:fs";
import type { PageDataPayload, PageExportFormat, PageInfo, PageTree } from "../../types";
import { API_PAGE_EXPORT_PATH_PREFIX, API_PAGE_PATH_PREFIX } from "../../constants";
import { isPageExportFormat } from "../../types";
import { decodeSlugPath, escapeHtml, pageUrl } from "../../utils";
import { searchPages } from "../search";
import {
  createDownloadResponse,
  createHtmlSegment,
  HTML_CONTENT_TYPE,
  JSON_CONTENT_TYPE,
  jsonResponse,
  MARKDOWN_CONTENT_TYPE,
  textResponse,
} from "./responses";

const PAGE_EXPORT_EXTENSION_BY_SUFFIX = {
  ".html": "html",
  ".json": "json",
  ".md": "markdown",
} as const satisfies Record<string, PageExportFormat>;

interface StaticPageExportRequest {
  format: PageExportFormat;
  slugPath: string;
}

interface PageExportJsonPayload extends PageDataPayload {
  relativePath: string;
  slug: string;
  url: string;
}

const toPageDataPayload = (page: PageInfo): PageDataPayload => {
  return {
    title: page.title,
    description: page.description,
    segments: page.segments,
    toc: page.toc,
  };
};

const toPageExportJsonPayload = (page: PageInfo): PageExportJsonPayload => {
  const slug = page.slugs.join("/");
  return {
    ...toPageDataPayload(page),
    relativePath: page.relativePath,
    slug,
    url: pageUrl(slug),
  };
};

const createRootPageExportJsonPayload = (
  pages: Map<string, PageInfo>,
  siteDescription: string,
  siteTitle: string,
): PageExportJsonPayload => {
  const indexLinks = Array.from(pages.values())
    .map((entry) => {
      const url = escapeHtml(pageUrl(entry.slugs.join("/")));
      const title = escapeHtml(entry.title);
      return `<li><a href="${url}">${title}</a></li>`;
    })
    .join("");

  return {
    description: siteDescription,
    relativePath: "",
    segments: [createHtmlSegment(`<ul>${indexLinks}</ul>`)],
    slug: "",
    title: siteTitle,
    toc: [],
    url: "/",
  };
};

const buildPageIndexResponse = (pages: Map<string, PageInfo>, siteDescription: string, siteTitle: string) =>
  jsonResponse<PageDataPayload>({
    title: siteTitle,
    description: siteDescription,
    segments: [
      createHtmlSegment(
        `<ul>\n${Array.from(pages.values())
          .map((page) => {
            const url = pageUrl(page.slugs.join("/"));
            const title = escapeHtml(page.title);
            const description = page.description ? ` - ${escapeHtml(page.description)}` : "";
            return `<li><a href="${escapeHtml(url)}">${title}</a>${description}</li>`;
          })
          .join("\n")}\n</ul>`,
      ),
    ],
    toc: [],
  });

export const getPageResponse = (
  slugPath: string,
  pages: Map<string, PageInfo>,
  siteDescription: string,
  siteTitle: string,
) => {
  const page = pages.get(slugPath);
  if (page) return jsonResponse(toPageDataPayload(page));
  if (slugPath === "") return buildPageIndexResponse(pages, siteDescription, siteTitle);
  return textResponse("Not Found", 404);
};

const renderSegmentsAsHtml = (page: PageInfo) => {
  return page.segments
    .map((segment) =>
      segment.type === "html" ?
        segment.content
      : `<pre><code class="language-${escapeHtml(segment.lang)}">${escapeHtml(segment.code)}</code></pre>`,
    )
    .join("\n");
};

const getPageExportName = (slugPath: string) => (slugPath || "index").replace(/\//g, "-");

const renderSearchResultsAsMarkdown = (query: string, pages: Map<string, PageInfo>) => {
  const results = searchPages(pages, query);
  const heading = `# Search results for "${query}"`;
  if (results.length === 0) return `${heading}\n\nNo results found.\n`;

  const lines = results.map((result) => `- [${result.content}](${result.url})`);
  return `${heading}\n\n${lines.join("\n")}\n`;
};

const renderSearchResultsAsHtml = (query: string, pages: Map<string, PageInfo>) => {
  const results = searchPages(pages, query);
  const items = results
    .map((result) => `<li><a href="${escapeHtml(result.url)}">${escapeHtml(result.content)}</a></li>`)
    .join("");
  const escapedQuery = escapeHtml(query);

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Search results for ${escapedQuery}</title></head><body><h1>Search results for ${escapedQuery}</h1><ol>${items || "<li>No results found.</li>"}</ol></body></html>`;
};

const renderGeneratedIndexHtml = (
  pages: Map<string, PageInfo>,
  siteDescription: string,
  siteTitle: string,
) => {
  const items = Array.from(pages.values())
    .map((page) => {
      const slugPath = page.slugs.join("/");
      const title = escapeHtml(page.title);
      const description = page.description ? ` - ${escapeHtml(page.description)}` : "";
      return `<li><a href="${escapeHtml(pageUrl(slugPath))}">${title}</a>${description}</li>`;
    })
    .join("");

  const escapedSiteDescription = escapeHtml(siteDescription);
  const escapedSiteTitle = escapeHtml(siteTitle);
  const description = siteDescription ? `<p>${escapedSiteDescription}</p>` : "";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapedSiteTitle}</title><meta name="description" content="${escapedSiteDescription}"></head><body><article><h1>${escapedSiteTitle}</h1>${description}<ul>${items}</ul></article></body></html>`;
};

const createMarkdownPageExportResponse = (slugPath: string, page: PageInfo) => {
  return createDownloadResponse(
    readFileSync(page.sourcePath, "utf8"),
    MARKDOWN_CONTENT_TYPE,
    `${getPageExportName(slugPath)}.md`,
  );
};

const createMarkdownIndexExportResponse = (
  pages: Map<string, PageInfo>,
  siteDescription: string,
  siteTitle: string,
) => {
  const markdownIndex = Array.from(pages.values())
    .map((entry) => {
      const url = pageUrl(entry.slugs.join("/"));
      const description = entry.description ? ` - ${entry.description}` : "";
      return `- [${entry.title}](${url})${description}`;
    })
    .join("\n");

  return createDownloadResponse(
    `# ${siteTitle}\n\n${siteDescription}\n\n${markdownIndex}\n`,
    MARKDOWN_CONTENT_TYPE,
    "index.md",
  );
};

const createHtmlPageExportResponse = (slugPath: string, page: PageInfo) => {
  const body = renderSegmentsAsHtml(page);
  const escapedTitle = escapeHtml(page.title);
  const escapedDescription = escapeHtml(page.description);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapedTitle}</title><meta name="description" content="${escapedDescription}"></head><body><article><h1>${escapedTitle}</h1>${body}</article></body></html>`;

  return createDownloadResponse(html, HTML_CONTENT_TYPE, `${getPageExportName(slugPath)}.html`);
};

const createHtmlIndexExportResponse = (
  pages: Map<string, PageInfo>,
  siteDescription: string,
  siteTitle: string,
) => {
  return createDownloadResponse(
    renderGeneratedIndexHtml(pages, siteDescription, siteTitle),
    HTML_CONTENT_TYPE,
    "index.html",
  );
};

const createJsonPageExportResponse = (slugPath: string, page: PageInfo) => {
  return createDownloadResponse(
    JSON.stringify(toPageExportJsonPayload(page)),
    JSON_CONTENT_TYPE,
    `${getPageExportName(slugPath)}.json`,
  );
};

const createJsonIndexExportResponse = (
  pages: Map<string, PageInfo>,
  siteDescription: string,
  siteTitle: string,
) => {
  return createDownloadResponse(
    JSON.stringify(createRootPageExportJsonPayload(pages, siteDescription, siteTitle)),
    JSON_CONTENT_TYPE,
    "index.json",
  );
};

export const getPageExportResponse = (
  slugPath: string,
  format: string,
  pages: Map<string, PageInfo>,
  siteDescription: string,
  siteTitle: string,
) => {
  const page = pages.get(slugPath);
  if (!isPageExportFormat(format)) {
    return textResponse("page export format must be json, html, or markdown", 400);
  }

  if (!page && slugPath !== "") return textResponse("Not Found", 404);

  if (format === "markdown") {
    return page ?
        createMarkdownPageExportResponse(slugPath, page)
      : createMarkdownIndexExportResponse(pages, siteDescription, siteTitle);
  }

  if (format === "html") {
    return page ?
        createHtmlPageExportResponse(slugPath, page)
      : createHtmlIndexExportResponse(pages, siteDescription, siteTitle);
  }

  return page ?
      createJsonPageExportResponse(slugPath, page)
    : createJsonIndexExportResponse(pages, siteDescription, siteTitle);
};

export const getSiteExportResponse = (
  format: string,
  pages: Map<string, PageInfo>,
  siteDescription: string,
  siteTitle: string,
  tree: PageTree,
) => {
  if (format !== "json") {
    return textResponse("site export only supports json format", 400);
  }

  return createDownloadResponse(
    JSON.stringify({
      description: siteDescription,
      pages: Array.from(pages.values(), toPageExportJsonPayload),
      title: siteTitle,
      tree,
    }),
    JSON_CONTENT_TYPE,
    "site.json",
  );
};

export const getSearchExportResponse = (format: string, pages: Map<string, PageInfo>, query: string) => {
  if (!query.trim()) return textResponse("query is required", 400);
  if (!isPageExportFormat(format)) {
    return textResponse("search export format must be json, html, or markdown", 400);
  }

  if (format === "markdown") {
    return createDownloadResponse(
      renderSearchResultsAsMarkdown(query, pages),
      MARKDOWN_CONTENT_TYPE,
      "search-results.md",
    );
  }

  if (format === "html") {
    return createDownloadResponse(
      renderSearchResultsAsHtml(query, pages),
      HTML_CONTENT_TYPE,
      "search-results.html",
    );
  }

  return createDownloadResponse(
    JSON.stringify({
      query,
      results: searchPages(pages, query),
    }),
    JSON_CONTENT_TYPE,
    "search-results.json",
  );
};

export const getPageSlugFromRequest = (pathname: string) => {
  if (pathname === API_PAGE_PATH_PREFIX || pathname === `${API_PAGE_PATH_PREFIX}/`) return "";
  if (!pathname.startsWith(`${API_PAGE_PATH_PREFIX}/`)) return null;

  const rawPath = pathname.slice(`${API_PAGE_PATH_PREFIX}/`.length);
  if (!rawPath) return "";

  if (rawPath.endsWith(".json")) {
    const slugPath = rawPath.slice(0, -".json".length);
    if (slugPath === "index") return "";
    return decodeSlugPath(slugPath);
  }

  return decodeSlugPath(rawPath);
};

export const parseStaticPageExportPath = (pathname: string): StaticPageExportRequest | null => {
  if (!pathname.startsWith(`${API_PAGE_EXPORT_PATH_PREFIX}/`)) return null;

  const rawPath = pathname.slice(`${API_PAGE_EXPORT_PATH_PREFIX}/`.length);
  if (!rawPath) return null;

  for (const [suffix, format] of Object.entries(PAGE_EXPORT_EXTENSION_BY_SUFFIX)) {
    if (!rawPath.endsWith(suffix)) continue;

    const slugPath = rawPath.slice(0, -suffix.length);
    const decodedSlugPath = decodeSlugPath(slugPath);
    if (decodedSlugPath === null) return null;

    return {
      format,
      slugPath: decodedSlugPath === "index" ? "" : decodedSlugPath,
    };
  }

  return null;
};
