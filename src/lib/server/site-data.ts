import { initAdvancedSearch } from "fumadocs-core/search/server";
import path from "node:path";
import type { FileFilters, PageInfo, PageTree } from "../../types";
import { getPagePlainText, pageUrl, titleFromSlug } from "../../utils";
import { parseMarkdownFile, scanMarkdownFiles } from "../parser";
import { buildPageTree } from "../tree";

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
  const indexes = Array.from(pages.entries(), ([slugPath, page]) => ({
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
  }));

  return initAdvancedSearch({ indexes }).export();
};

type SearchIndex = Awaited<ReturnType<typeof buildSearchIndex>>;

interface SiteData {
  pageTree: PageTree;
  pages: Map<string, PageInfo>;
  searchIndex: SearchIndex;
}

export interface SiteDataStore {
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
  const page = parseMarkdownFile(singleFile, slug, []);

  return new Map([["", { ...page, relativePath: path.basename(singleFile), sourcePath: singleFile }]]);
};

export const loadSiteData = async (
  contentDir: string,
  filters: FileFilters,
  siteTitle: string,
  singleFile?: string,
): Promise<SiteData> => {
  const pages = loadPages(contentDir, filters, singleFile);

  return {
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
