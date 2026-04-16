import { initAdvancedSearch } from "fumadocs-core/search/server";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { FileFilters, GraphDataPayload, PageInfo, PageTree } from "../../types";
import { getPagePlainText, normalizePathSlashes, pageUrl, titleFromSlug } from "../../utils";
import { parseMarkdownFile, scanMarkdownFiles } from "../parser";
import { buildPageTree } from "../tree";

const GIT_LOG_LAST_UPDATED_FORMAT = "%H\t%cI";
const GIT_LOG_COMMIT_PREFIX = "commit\t";

const getBreadcrumbs = (page: PageInfo, siteTitle: string) => {
  if (page.slug === "index") return [siteTitle, ...page.slugs.map(titleFromSlug)];
  if (page.slugs.length === 0) return [siteTitle];
  return [siteTitle, ...page.slugs.slice(0, -1).map(titleFromSlug)];
};

const buildSearchContents = (page: PageInfo) => {
  const content = getPagePlainText(page);
  return content ? [{ content, heading: "" }] : [];
};

const buildSearchIndex = async (pages: Map<string, PageInfo>, siteTitle: string) => {
  const indexes = Array.from(pages.entries(), ([slugPath, page]) => {
    return {
      breadcrumbs: getBreadcrumbs(page, siteTitle),
      description: page.description,
      id: pageUrl(slugPath),
      structuredData: {
        headings: page.toc.map((heading) => ({
          content: heading.title,
          id: heading.url.replace(/^#/, ""),
        })),
        contents: buildSearchContents(page),
      },
      title: page.title,
      url: pageUrl(slugPath),
    };
  });

  return initAdvancedSearch({ indexes }).export();
};

type SearchIndex = Awaited<ReturnType<typeof buildSearchIndex>>;

interface SiteData {
  graph: GraphDataPayload;
  pageTree: PageTree;
  pages: Map<string, PageInfo>;
  searchIndex: SearchIndex;
}

export interface SiteDataStore {
  getGraphData: () => GraphDataPayload;
  getPageTree: () => PageTree;
  getPages: () => Map<string, PageInfo>;
  getSearchIndex: () => SearchIndex;
  refresh: (
    contentDir: string,
    filters: FileFilters,
    siteTitle: string,
    singleFile?: string,
  ) => Promise<boolean>;
}

const loadPages = (contentDir: string, filters: FileFilters, singleFile?: string): Map<string, PageInfo> => {
  if (!singleFile) return scanMarkdownFiles(contentDir, filters);

  const slug = path.basename(singleFile, path.extname(singleFile));
  const page = parseMarkdownFile(singleFile, slug, [], contentDir, { servedSourcePath: singleFile });

  return new Map([["", { ...page, relativePath: path.basename(singleFile), sourcePath: singleFile }]]);
};

const getLastUpdatedBySourcePath = (contentDir: string, sourcePaths: string[]) => {
  const sourcePathByRelativePath = new Map<string, string>();

  for (const sourcePath of sourcePaths) {
    const relativeSourcePath = normalizePathSlashes(path.relative(contentDir, sourcePath));
    if (!relativeSourcePath || relativeSourcePath.startsWith("../")) continue;
    sourcePathByRelativePath.set(relativeSourcePath, sourcePath);
  }

  if (sourcePathByRelativePath.size === 0) return new Map<string, NonNullable<PageInfo["lastUpdated"]>>();

  try {
    const output = execFileSync(
      "git",
      [
        "log",
        `--format=${GIT_LOG_COMMIT_PREFIX}${GIT_LOG_LAST_UPDATED_FORMAT}`,
        "--name-only",
        "--",
        ...sourcePathByRelativePath.keys(),
      ],
      {
        cwd: contentDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const lastUpdatedBySourcePath = new Map<string, NonNullable<PageInfo["lastUpdated"]>>();
    let currentCommit = "";
    let currentAt = "";

    for (const line of output.split(/\r?\n/)) {
      if (!line) continue;

      if (line.startsWith(GIT_LOG_COMMIT_PREFIX)) {
        const [commit = "", at = ""] = line.slice(GIT_LOG_COMMIT_PREFIX.length).split("\t");
        currentCommit = commit;
        currentAt = at;
        continue;
      }

      if (!currentCommit || !currentAt) continue;

      const sourcePath = sourcePathByRelativePath.get(normalizePathSlashes(line));
      if (!sourcePath || lastUpdatedBySourcePath.has(sourcePath)) continue;

      lastUpdatedBySourcePath.set(sourcePath, { at: currentAt, commit: currentCommit });
      if (lastUpdatedBySourcePath.size === sourcePathByRelativePath.size) break;
    }

    return lastUpdatedBySourcePath;
  } catch {
    // git metadata is optional
    return new Map<string, NonNullable<PageInfo["lastUpdated"]>>();
  }
};

const enrichPages = (contentDir: string, pages: Map<string, PageInfo>): GraphDataPayload => {
  const backlinksBySlug = new Map<string, PageInfo["backlinks"]>();
  const graphEdgeIds = new Set<string>();
  const edges: GraphDataPayload["edges"] = [];
  const lastUpdatedBySourcePath = getLastUpdatedBySourcePath(
    contentDir,
    Array.from(pages.values(), (page) => page.sourcePath),
  );

  for (const [sourceSlug, page] of pages) {
    page.backlinks = [];
    page.lastUpdated = lastUpdatedBySourcePath.get(page.sourcePath);

    const seenTargets = new Set<string>();
    for (const targetSlug of page.internalLinks) {
      if (sourceSlug === targetSlug || seenTargets.has(targetSlug) || !pages.has(targetSlug)) continue;
      seenTargets.add(targetSlug);

      const backlinks = backlinksBySlug.get(targetSlug) ?? [];
      backlinks.push({
        title: page.title,
        url: pageUrl(sourceSlug),
      });
      backlinksBySlug.set(targetSlug, backlinks);

      const sourceId = pageUrl(sourceSlug);
      const targetId = pageUrl(targetSlug);
      const [edgeFrom, edgeTo] =
        sourceId.localeCompare(targetId) <= 0 ? [sourceId, targetId] : [targetId, sourceId];
      const edgeId = `${edgeFrom}\u0000${edgeTo}`;
      if (graphEdgeIds.has(edgeId)) continue;

      graphEdgeIds.add(edgeId);
      edges.push({ from: edgeFrom, to: edgeTo });
    }
  }

  for (const [slugPath, page] of pages) {
    page.backlinks = (backlinksBySlug.get(slugPath) ?? []).toSorted((a, b) => a.title.localeCompare(b.title));
  }

  return {
    edges,
    nodes: Array.from(pages.entries(), ([slugPath, page]) => {
      return {
        id: pageUrl(slugPath),
        title: page.title,
        url: pageUrl(slugPath),
      };
    }),
  };
};

export const loadSiteData = async (
  contentDir: string,
  filters: FileFilters,
  siteTitle: string,
  singleFile?: string,
): Promise<SiteData> => {
  const pages = loadPages(contentDir, filters, singleFile);
  const graph = enrichPages(contentDir, pages);

  return {
    graph,
    pages,
    pageTree: buildPageTree(pages, siteTitle),
    searchIndex: await buildSearchIndex(pages, siteTitle),
  };
};

const getSiteData = (currentSiteData: SiteData | null): SiteData => {
  if (!currentSiteData) throw new Error("site data has not been loaded");
  return currentSiteData;
};

export const createSiteDataStore = (): SiteDataStore => {
  let currentSiteData: SiteData | null = null;
  let refreshVersion = 0;

  return {
    getGraphData: () => getSiteData(currentSiteData).graph,
    getPages: () => getSiteData(currentSiteData).pages,
    getPageTree: () => getSiteData(currentSiteData).pageTree,
    getSearchIndex: () => getSiteData(currentSiteData).searchIndex,
    refresh: async (contentDir, filters, siteTitle, singleFile) => {
      const version = refreshVersion + 1;
      refreshVersion = version;

      const nextSiteData = await loadSiteData(contentDir, filters, siteTitle, singleFile);
      if (version !== refreshVersion) return false;

      currentSiteData = nextSiteData;
      return true;
    },
  };
};
