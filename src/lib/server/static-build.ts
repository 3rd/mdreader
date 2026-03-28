import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FileFilters, Theme, TreeDataPayload } from "../../types";
import {
  API_SEARCH_INDEX_PATH,
  API_SITE_EXPORT_JSON_PATH,
  API_TREE_JSON_PATH,
  SERVABLE_EXTENSIONS,
} from "../../constants";
import { PAGE_EXPORT_FORMATS } from "../../types";
import {
  encodeSlugPath,
  hasIgnoredPathSegment,
  normalizePathSlashes,
  pageDataPath,
  pageExportPath,
} from "../../utils";
import { createClientAssetsStore, renderClientShell } from "./client-assets";
import { getPageExportResponse, getPageResponse, getSiteExportResponse } from "./exports";
import { jsonResponse, type RouteResponse } from "./responses";
import { loadSiteData } from "./site-data";

interface BuildOptions {
  contentDir: string;
  filters: FileFilters;
  outputDir: string;
  singleFile?: string;
  siteDescription: string;
  siteTitle: string;
  theme: Theme;
}

interface StaticBuildResult {
  outputDir: string;
  pageCount: number;
}

const isInsideDirectory = (directory: string, candidate: string) => {
  return candidate === directory || candidate.startsWith(`${directory}${path.sep}`);
};

const writeOutputFile = (filePath: string, content: Buffer | string) => {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
};

const writeWebPath = (outputDir: string, webPath: string, content: Buffer | string) => {
  const relativePath = webPath.replace(/^\//, "");
  const fullPath = path.join(outputDir, relativePath);
  writeOutputFile(fullPath, content);
};

const writeRoutePayload = (outputDir: string, webPath: string, payload: RouteResponse) => {
  if ((payload.status ?? 200) >= 400) {
    throw new Error(`failed to build ${webPath}: ${payload.body.toString()}`);
  }

  writeWebPath(outputDir, webPath, payload.body);
};

const copyContentAssets = (contentDir: string, outputDir: string) => {
  const scan = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const fullPath = path.join(directory, entry);
      const stat = statSync(fullPath, { throwIfNoEntry: false });
      if (!stat) continue;

      const relativePath = normalizePathSlashes(path.relative(contentDir, fullPath));
      if (relativePath && hasIgnoredPathSegment(relativePath)) continue;

      if (stat.isDirectory()) {
        scan(fullPath);
        continue;
      }

      const extension = path.extname(entry);
      if (!SERVABLE_EXTENSIONS.has(extension)) continue;

      const destinationPath = path.join(outputDir, relativePath);
      writeOutputFile(destinationPath, readFileSync(fullPath));
    }
  };

  scan(contentDir);
};

const routeHtmlPath = (slugPath: string) => {
  return slugPath ? `/${encodeSlugPath(slugPath)}/index.html` : "/index.html";
};

export const buildStaticSite = async (options: BuildOptions): Promise<StaticBuildResult> => {
  const { contentDir, filters, outputDir, singleFile, siteDescription, siteTitle, theme } = options;
  const resolvedOutputDir = path.resolve(outputDir);
  const resolvedContentDir = path.resolve(contentDir);
  const outputStat = statSync(resolvedOutputDir, { throwIfNoEntry: false });
  if (outputStat) {
    throw new Error(`build destination already exists: ${resolvedOutputDir}`);
  }

  if (isInsideDirectory(resolvedContentDir, resolvedOutputDir)) {
    throw new Error("build output directory must be outside the docs content directory");
  }

  const clientAssets = createClientAssetsStore().getClientAssets();
  const siteData = await loadSiteData(contentDir, filters, siteTitle, singleFile);
  const shellHtml = renderClientShell(clientAssets.indexHtml, theme, "static");

  mkdirSync(resolvedOutputDir, { recursive: true });

  writeWebPath(resolvedOutputDir, "/index.html", shellHtml);
  for (const slugPath of siteData.pages.keys()) {
    if (!slugPath) continue;
    writeWebPath(resolvedOutputDir, routeHtmlPath(slugPath), shellHtml);
  }

  for (const [webPath, asset] of Object.entries(clientAssets.assets)) {
    writeWebPath(resolvedOutputDir, webPath, asset);
  }

  copyContentAssets(contentDir, resolvedOutputDir);

  const treePayload: TreeDataPayload = { tree: siteData.pageTree, siteTitle };
  writeRoutePayload(resolvedOutputDir, API_TREE_JSON_PATH, jsonResponse(treePayload));
  writeRoutePayload(resolvedOutputDir, API_SEARCH_INDEX_PATH, jsonResponse(siteData.searchIndex));
  writeRoutePayload(
    resolvedOutputDir,
    API_SITE_EXPORT_JSON_PATH,
    getSiteExportResponse("json", siteData.pages, siteDescription, siteTitle, siteData.pageTree),
  );

  const outputPageSlugs = new Set(["", ...siteData.pages.keys()]);
  for (const slugPath of outputPageSlugs) {
    writeRoutePayload(
      resolvedOutputDir,
      pageDataPath(slugPath),
      getPageResponse(slugPath, siteData.pages, siteDescription, siteTitle),
    );

    for (const format of PAGE_EXPORT_FORMATS) {
      writeRoutePayload(
        resolvedOutputDir,
        pageExportPath(slugPath, format),
        getPageExportResponse(slugPath, format, siteData.pages, siteDescription, siteTitle),
      );
    }
  }

  return {
    outputDir: resolvedOutputDir,
    pageCount: siteData.pages.size,
  };
};
