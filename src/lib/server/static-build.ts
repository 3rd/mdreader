import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import type { FileFilters, PdfPaperFormat, Theme, TreeDataPayload } from "../../types";
import {
  API_GRAPH_JSON_PATH,
  API_SEARCH_INDEX_PATH,
  API_SITE_EXPORT_JSON_PATH,
  API_TREE_JSON_PATH,
  SERVABLE_EXTENSIONS,
} from "../../constants";
import { PAGE_EXPORT_FORMATS } from "../../types";
import {
  buildPagePdfExportPath,
  decodeSlugPath,
  encodeSlugPath,
  hasIgnoredPathSegment,
  normalizePathSlashes,
  pageDataPath,
  pageExportPath,
  pagePreviewPath,
  pageUrl,
} from "../../utils";
import { createClientAssetsStore, renderClientShell } from "./client-assets";
import {
  getGraphResponse,
  getPageExportResponse,
  getPagePreviewResponse,
  getPageResponse,
  getSiteExportResponse,
} from "./exports";
import { BROWSER_NOT_FOUND_MESSAGE, findBrowserExecutable, launchPdfRenderer } from "./pdf-renderer";
import { getContentType, jsonResponse, type RouteResponse, textResponse, writeResponse } from "./responses";
import { loadSiteData } from "./site-data";

interface BuildOptions {
  contentDir: string;
  filters: FileFilters;
  outputDir: string;
  pdfPaper?: PdfPaperFormat;
  singleFile?: string;
  siteDescription: string;
  siteTitle: string;
  theme: Theme;
}

interface PdfExportSettings {
  executablePath: string;
  paper: PdfPaperFormat;
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

const resolveWebPath = (outputDir: string, webPath: string) => {
  const decodedPath = decodeSlugPath(webPath);
  if (decodedPath === null) return null;

  const fullPath = path.resolve(outputDir, `.${decodedPath}`);
  return isInsideDirectory(outputDir, fullPath) ? fullPath : null;
};

const writeWebPath = (outputDir: string, webPath: string, content: Buffer | string) => {
  const fullPath = resolveWebPath(outputDir, webPath);
  if (!fullPath) {
    throw new Error(`invalid build output path: ${webPath}`);
  }

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

const resolvePdfExportSettings = (paper: PdfPaperFormat | undefined) => {
  if (!paper) return null;

  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    throw new Error(BROWSER_NOT_FOUND_MESSAGE);
  }

  return { executablePath, paper };
};

const resolveBuiltFilePath = (outputDir: string, pathname: string) => {
  const candidatePath = resolveWebPath(outputDir, pathname);
  if (!candidatePath) return null;
  if (statSync(candidatePath, { throwIfNoEntry: false })?.isFile()) return candidatePath;

  const indexPath = path.join(candidatePath, "index.html");
  return statSync(indexPath, { throwIfNoEntry: false })?.isFile() ? indexPath : null;
};

const startBuiltSiteServer = async (outputDir: string) => {
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? "/", "http://localhost");
    const filePath = resolveBuiltFilePath(outputDir, pathname);
    if (!filePath) {
      writeResponse(response, textResponse("Not Found", 404));
      return;
    }

    writeResponse(response, { body: readFileSync(filePath), contentType: getContentType(filePath) });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  const isNetworkAddress = address !== null && typeof address !== "string";
  if (!isNetworkAddress) {
    throw new Error("failed to start the PDF export server");
  }

  return {
    close: () => {
      server.closeAllConnections();
      return new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
    origin: `http://127.0.0.1:${address.port}`,
  };
};

const writePagePdfExports = async (
  outputDir: string,
  slugPaths: Iterable<string>,
  settings: PdfExportSettings,
) => {
  const site = await startBuiltSiteServer(outputDir);

  try {
    const renderer = await launchPdfRenderer(settings.executablePath);

    try {
      for (const slugPath of slugPaths) {
        const pdf = await renderer.render({
          linkOrigin: null,
          paper: settings.paper,
          url: new URL(pageUrl(slugPath), site.origin).href,
        });
        writeWebPath(outputDir, buildPagePdfExportPath(slugPath), pdf);
      }
    } finally {
      await renderer.close();
    }
  } finally {
    await site.close();
  }
};

export const buildStaticSite = async (options: BuildOptions): Promise<StaticBuildResult> => {
  const { contentDir, filters, outputDir, pdfPaper, singleFile, siteDescription, siteTitle, theme } = options;
  const resolvedOutputDir = path.resolve(outputDir);
  const resolvedContentDir = path.resolve(contentDir);
  const outputStat = statSync(resolvedOutputDir, { throwIfNoEntry: false });
  if (outputStat) {
    throw new Error(`build destination already exists: ${resolvedOutputDir}`);
  }

  if (isInsideDirectory(resolvedContentDir, resolvedOutputDir)) {
    throw new Error("build output directory must be outside the docs content directory");
  }

  const pdfExportSettings = resolvePdfExportSettings(pdfPaper);

  const clientAssets = createClientAssetsStore().getClientAssets();
  const siteData = await loadSiteData(contentDir, filters, siteTitle, singleFile);
  const shellHtml = renderClientShell(clientAssets.indexHtml, theme, {
    hasPdfExport: pdfExportSettings !== null,
    mode: "static",
  });

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
  writeRoutePayload(resolvedOutputDir, API_GRAPH_JSON_PATH, getGraphResponse(siteData.graph));
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
    writeRoutePayload(
      resolvedOutputDir,
      pagePreviewPath(slugPath),
      getPagePreviewResponse(slugPath, siteData.pages, siteDescription, siteTitle),
    );

    for (const format of PAGE_EXPORT_FORMATS) {
      writeRoutePayload(
        resolvedOutputDir,
        pageExportPath(slugPath, format),
        getPageExportResponse(slugPath, format, siteData.pages, siteDescription, siteTitle),
      );
    }
  }

  if (pdfExportSettings) {
    await writePagePdfExports(resolvedOutputDir, outputPageSlugs, pdfExportSettings);
  }

  return {
    outputDir: resolvedOutputDir,
    pageCount: siteData.pages.size,
  };
};
