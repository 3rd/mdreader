import { readFileSync } from "node:fs";
import type {
  GraphDataPayload,
  PageDataPayload,
  PageExportFormat,
  PageInfo,
  PagePreviewPayload,
  PageTree,
} from "../../types";
import {
  API_PAGE_EXPORT_PATH_PREFIX,
  API_PAGE_PATH_PREFIX,
  API_PAGE_PREVIEW_PATH_PREFIX,
  PAGE_PDF_EXPORT_EXTENSION,
} from "../../constants";
import { isPageExportFormat, isPdfPaperFormat, PDF_PAPER_FORMATS } from "../../types";
import { decodeSlugPath, escapeHtml, getPageExportName, pageUrl } from "../../utils";
import { searchPages } from "../search";
import { BROWSER_NOT_FOUND_MESSAGE, findBrowserExecutable, renderPdf } from "./pdf-renderer";
import {
  createDownloadResponse,
  createHtmlSegment,
  getContentType,
  HTML_CONTENT_TYPE,
  JSON_CONTENT_TYPE,
  jsonResponse,
  MARKDOWN_CONTENT_TYPE,
  textResponse,
} from "./responses";

const PAGE_PREVIEW_EXCERPT_LENGTH = 220;
const DEFAULT_PDF_PAPER_FORMAT = "a4";
const PAGE_PDF_EXPORT_SUFFIX = `.${PAGE_PDF_EXPORT_EXTENSION}`;
const PAGE_EXPORT_EXTENSION_BY_SUFFIX = {
  ".html": "html",
  ".json": "json",
  ".md": "markdown",
} as const satisfies Record<string, PageExportFormat>;

interface StaticPageExportRequest {
  format: PageExportFormat;
  slugPath: string;
}

interface PagePdfExportRequest {
  linkOrigin: string | null;
  pages: Map<string, PageInfo>;
  paper: string | null;
  renderOrigin: string;
  slugPath: string;
}

interface PageExportJsonPayload extends PageDataPayload {
  relativePath: string;
  slug: string;
  url: string;
}

const buildPreviewExcerpt = (value: string) => {
  const excerpt = value.trim();
  if (excerpt.length <= PAGE_PREVIEW_EXCERPT_LENGTH) return excerpt;
  return `${excerpt.slice(0, PAGE_PREVIEW_EXCERPT_LENGTH).trimEnd()}...`;
};

const toPageDataPayload = (page: PageInfo): PageDataPayload => {
  return {
    backlinks: page.backlinks,
    lastUpdated: page.lastUpdated,
    title: page.title,
    description: page.description,
    segments: page.segments,
    toc: page.toc,
  };
};

const toPagePreviewPayload = (page: PageInfo, slugPath: string): PagePreviewPayload => {
  return {
    description: page.description,
    excerpt: buildPreviewExcerpt(page.plainText || page.description),
    title: page.title,
    url: pageUrl(slugPath),
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
    backlinks: [],
    description: siteDescription,
    relativePath: "",
    segments: [createHtmlSegment(`<ul>${indexLinks}</ul>`)],
    lastUpdated: undefined,
    slug: "",
    title: siteTitle,
    toc: [],
    url: "/",
  };
};

const buildPageIndexResponse = (pages: Map<string, PageInfo>, siteDescription: string, siteTitle: string) =>
  jsonResponse<PageDataPayload>({
    backlinks: [],
    title: siteTitle,
    description: siteDescription,
    lastUpdated: undefined,
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

const getRootPagePreviewResponse = (
  pages: Map<string, PageInfo>,
  siteDescription: string,
  siteTitle: string,
) => {
  const excerpt = buildPreviewExcerpt(
    siteDescription ||
      Array.from(pages.values(), (page) => page.title)
        .slice(0, 6)
        .join(" • "),
  );

  return jsonResponse<PagePreviewPayload>({
    description: siteDescription,
    excerpt,
    title: siteTitle,
    url: "/",
  });
};

export const getPagePreviewResponse = (
  slugPath: string,
  pages: Map<string, PageInfo>,
  siteDescription: string,
  siteTitle: string,
) => {
  const page = pages.get(slugPath);
  if (page) return jsonResponse(toPagePreviewPayload(page, slugPath));
  if (slugPath === "") return getRootPagePreviewResponse(pages, siteDescription, siteTitle);
  return textResponse("Not Found", 404);
};

export const getGraphResponse = jsonResponse<GraphDataPayload>;

const renderSegmentsAsHtml = (page: PageInfo) => {
  return page.segments
    .map((segment) => {
      if (segment.type === "html") return segment.content;
      if (segment.type === "slide-break") return "<hr>";

      return `<pre><code class="language-${escapeHtml(segment.lang)}">${escapeHtml(segment.code)}</code></pre>`;
    })
    .join("\n");
};

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

export const createPagePdfExporter = () => {
  let isRendering = false;

  return async ({ linkOrigin, pages, paper, renderOrigin, slugPath }: PagePdfExportRequest) => {
    const hasExportablePage = pages.has(slugPath) || slugPath === "";
    if (!hasExportablePage) return textResponse("Not Found", 404);

    const paperFormat = paper ?? DEFAULT_PDF_PAPER_FORMAT;
    if (!isPdfPaperFormat(paperFormat)) {
      return textResponse(`pdf paper must be ${PDF_PAPER_FORMATS.join(" or ")}`, 400);
    }

    if (isRendering) {
      return textResponse("A PDF export is already running. Try again when it finishes.", 429);
    }

    const executablePath = findBrowserExecutable();
    if (!executablePath) return textResponse(BROWSER_NOT_FOUND_MESSAGE, 503);

    const fileName = `${getPageExportName(slugPath)}${PAGE_PDF_EXPORT_SUFFIX}`;

    isRendering = true;

    try {
      const pdf = await renderPdf({
        executablePath,
        linkOrigin,
        paper: paperFormat,
        url: new URL(pageUrl(slugPath), renderOrigin).href,
      });
      return createDownloadResponse(pdf, getContentType(fileName), fileName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return textResponse(`PDF export failed: ${message}`, 500);
    } finally {
      isRendering = false;
    }
  };
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

function getJsonSlugFromRequest(pathname: string, prefix: string) {
  if (pathname === prefix || pathname === `${prefix}/`) return "";
  if (!pathname.startsWith(`${prefix}/`)) return null;

  const rawPath = pathname.slice(`${prefix}/`.length);
  if (!rawPath) return "";

  if (rawPath.endsWith(".json")) {
    const slugPath = rawPath.slice(0, -".json".length);
    if (slugPath === "index") return "";
    return decodeSlugPath(slugPath);
  }

  return decodeSlugPath(rawPath);
}

export const getPageSlugFromRequest = (pathname: string) => {
  return getJsonSlugFromRequest(pathname, API_PAGE_PATH_PREFIX);
};

export const getPagePreviewSlugFromRequest = (pathname: string) => {
  return getJsonSlugFromRequest(pathname, API_PAGE_PREVIEW_PATH_PREFIX);
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

export const parsePagePdfExportPath = (pathname: string) => {
  const prefix = `${API_PAGE_EXPORT_PATH_PREFIX}/`;

  const isPdfExportPath = pathname.startsWith(prefix) && pathname.endsWith(PAGE_PDF_EXPORT_SUFFIX);
  if (!isPdfExportPath) return null;

  const slugPath = decodeSlugPath(pathname.slice(prefix.length, -PAGE_PDF_EXPORT_SUFFIX.length));
  if (slugPath === null) return null;
  return slugPath === "index" ? "" : slugPath;
};
