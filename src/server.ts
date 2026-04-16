import { readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import type { FileFilters, PageInfo, PageTree, Theme, TreeDataPayload } from "./types";
import {
  API_EVENTS_PATH,
  API_GRAPH_JSON_PATH,
  API_PAGE_EXPORT_PATH,
  API_SEARCH_EXPORT_PATH,
  API_SEARCH_INDEX_PATH,
  API_SEARCH_PATH,
  API_SITE_EXPORT_JSON_PATH,
  API_SITE_EXPORT_PATH,
  API_TREE_JSON_PATH,
  API_TREE_LEGACY_PATH,
  SERVABLE_EXTENSIONS,
} from "./constants";
import { searchPages } from "./lib/search";
import {
  type ClientAssetsStore,
  createClientAssetsStore,
  getClientAssetStatus,
  setEmbeddedAssets,
} from "./lib/server/client-assets";
import {
  getGraphResponse,
  getPageExportResponse,
  getPagePreviewResponse,
  getPagePreviewSlugFromRequest,
  getPageResponse,
  getPageSlugFromRequest,
  getSearchExportResponse,
  getSiteExportResponse,
  parseStaticPageExportPath,
} from "./lib/server/exports";
import { createLiveReloadChannel, type LiveReloadChannel } from "./lib/server/live-reload";
import { getContentType, jsonResponse, type RouteResponse, writeResponse } from "./lib/server/responses";
import { createSiteDataStore, type SiteDataStore } from "./lib/server/site-data";
import { hasIgnoredPathSegment, normalizePathSlashes } from "./utils";

export { buildStaticSite } from "./lib/server/static-build";
export { getClientAssetStatus, setEmbeddedAssets };

interface ServerOptions {
  contentDir: string;
  filters: FileFilters;
  host?: string;
  port: number;
  singleFile?: string;
  siteDescription: string;
  siteTitle: string;
  theme: Theme;
}

interface MdreaderServer {
  port: number;
  close: () => Promise<void>;
  refresh: () => Promise<void>;
  reloadClientAssets: () => Promise<void>;
}

interface ServerRuntime {
  clientAssetsStore: ClientAssetsStore;
  liveReloadChannel: LiveReloadChannel;
  siteDataStore: SiteDataStore;
}

interface RequestSnapshot {
  graph: ReturnType<SiteDataStore["getGraphData"]>;
  pageTree: PageTree;
  pages: Map<string, PageInfo>;
  searchIndex: ReturnType<SiteDataStore["getSearchIndex"]>;
}

interface RequestContext extends RequestSnapshot {
  pathname: string;
  request: IncomingMessage;
  response: ServerResponse;
  runtime: ServerRuntime;
  searchParams: URLSearchParams;
  siteDescription: string;
  siteTitle: string;
  theme: Theme;
}

const createServerRuntime = (): ServerRuntime => {
  return {
    clientAssetsStore: createClientAssetsStore(),
    liveReloadChannel: createLiveReloadChannel(),
    siteDataStore: createSiteDataStore(),
  };
};

const resolveSafePath = (rootDir: string, pathname: string) => {
  try {
    const resolvedPath = path.resolve(rootDir, `.${decodeURIComponent(pathname)}`);
    if (resolvedPath === rootDir || resolvedPath.startsWith(`${rootDir}${path.sep}`)) return resolvedPath;
  } catch {
    return null;
  }
  return null;
};

const getFileResponse = (rootDir: string, pathname: string) => {
  const ext = path.extname(pathname);
  if (!SERVABLE_EXTENSIONS.has(ext)) return null;

  const filePath = resolveSafePath(rootDir, pathname);
  const fileStat = filePath ? statSync(filePath, { throwIfNoEntry: false }) : undefined;
  if (!filePath || !fileStat?.isFile()) return null;

  const relativePath = normalizePathSlashes(path.relative(rootDir, filePath));
  if (hasIgnoredPathSegment(relativePath)) return null;

  return {
    body: readFileSync(filePath),
    contentType: getContentType(pathname),
  };
};

const listen = (server: ReturnType<typeof createServer>, port: number, host?: string): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    const handlers: {
      error?: (error: Error) => void;
      listening?: () => void;
    } = {};

    const clearHandlers = (): void => {
      if (handlers.error) server.off("error", handlers.error);
      if (handlers.listening) server.off("listening", handlers.listening);
    };

    handlers.error = (error: Error): void => {
      clearHandlers();
      reject(error);
    };

    handlers.listening = (): void => {
      clearHandlers();
      resolve();
    };

    server.once("error", handlers.error);
    server.once("listening", handlers.listening);
    server.listen(port, host);
  });
};

const writePayload = (response: ServerResponse, payload: RouteResponse) => {
  writeResponse(response, payload);
  return true;
};

const handleTreeRoute = ({ pageTree, pathname, response, siteTitle }: RequestContext) => {
  if (pathname !== API_TREE_JSON_PATH && pathname !== API_TREE_LEGACY_PATH) return false;
  const treePayload: TreeDataPayload = { tree: pageTree, siteTitle };
  return writePayload(response, jsonResponse(treePayload));
};

const handlePageRoute = ({ pathname, response, pages, siteDescription, siteTitle }: RequestContext) => {
  const pageSlug = getPageSlugFromRequest(pathname);
  if (pageSlug === null) return false;
  return writePayload(response, getPageResponse(pageSlug, pages, siteDescription, siteTitle));
};

const handlePagePreviewRoute = ({
  pathname,
  response,
  pages,
  siteDescription,
  siteTitle,
}: RequestContext) => {
  const pageSlug = getPagePreviewSlugFromRequest(pathname);
  if (pageSlug === null) return false;
  return writePayload(response, getPagePreviewResponse(pageSlug, pages, siteDescription, siteTitle));
};

const handleGraphRoute = ({ pathname, response, graph }: RequestContext) => {
  if (pathname !== API_GRAPH_JSON_PATH) return false;
  return writePayload(response, getGraphResponse(graph));
};

const handleStaticPageExportRoute = ({
  pathname,
  pages,
  response,
  siteDescription,
  siteTitle,
}: RequestContext) => {
  const staticPageExport = parseStaticPageExportPath(pathname);
  if (!staticPageExport) return false;

  return writePayload(
    response,
    getPageExportResponse(
      staticPageExport.slugPath,
      staticPageExport.format,
      pages,
      siteDescription,
      siteTitle,
    ),
  );
};

const handleExportRoute = ({
  pathname,
  pageTree,
  pages,
  response,
  searchParams,
  siteDescription,
  siteTitle,
}: RequestContext) => {
  if (pathname === API_SITE_EXPORT_JSON_PATH) {
    return writePayload(response, getSiteExportResponse("json", pages, siteDescription, siteTitle, pageTree));
  }

  if (pathname === API_PAGE_EXPORT_PATH) {
    return writePayload(
      response,
      getPageExportResponse(
        searchParams.get("slug") ?? "",
        searchParams.get("format") ?? "json",
        pages,
        siteDescription,
        siteTitle,
      ),
    );
  }

  if (pathname === API_SITE_EXPORT_PATH) {
    return writePayload(
      response,
      getSiteExportResponse(
        searchParams.get("format") ?? "json",
        pages,
        siteDescription,
        siteTitle,
        pageTree,
      ),
    );
  }

  if (pathname !== API_SEARCH_EXPORT_PATH) return false;

  return writePayload(
    response,
    getSearchExportResponse(searchParams.get("format") ?? "json", pages, searchParams.get("query") ?? ""),
  );
};

const handleSearchRoute = ({ pathname, pages, response, searchIndex, searchParams }: RequestContext) => {
  if (pathname === API_SEARCH_INDEX_PATH) {
    return writePayload(response, jsonResponse(searchIndex));
  }
  if (pathname !== API_SEARCH_PATH) return false;
  return writePayload(response, jsonResponse(searchPages(pages, searchParams.get("query") ?? "")));
};

const handleEventsRoute = ({ pathname, request, response, runtime }: RequestContext) => {
  if (pathname !== API_EVENTS_PATH) return false;
  runtime.liveReloadChannel.handleEventStreamRequest(request, response);
  return true;
};

const refreshServerContent = async (
  runtime: ServerRuntime,
  {
    contentDir,
    filters,
    siteTitle,
    singleFile,
  }: Pick<ServerOptions, "contentDir" | "filters" | "singleFile" | "siteTitle">,
) => {
  const didCommit = await runtime.siteDataStore.refresh(contentDir, filters, siteTitle, singleFile);
  if (didCommit) runtime.liveReloadChannel.notifyReload();
};

const reloadServerClientAssets = async (runtime: ServerRuntime) => {
  runtime.clientAssetsStore.invalidate();
  runtime.liveReloadChannel.notifyReload("hard-reload");
};

export const startServer = async (options: ServerOptions): Promise<MdreaderServer> => {
  const { contentDir, filters, host, singleFile, port, siteDescription, siteTitle, theme } = options;
  const runtime = createServerRuntime();

  await runtime.siteDataStore.refresh(contentDir, filters, siteTitle, singleFile);

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const snapshot: RequestSnapshot = {
      graph: runtime.siteDataStore.getGraphData(),
      pages: runtime.siteDataStore.getPages(),
      pageTree: runtime.siteDataStore.getPageTree(),
      searchIndex: runtime.siteDataStore.getSearchIndex(),
    };
    const requestContext: RequestContext = {
      pathname: url.pathname,
      ...snapshot,
      request,
      response,
      runtime,
      searchParams: url.searchParams,
      siteDescription,
      siteTitle,
      theme,
    };

    if (handleTreeRoute(requestContext)) return;
    if (handlePageRoute(requestContext)) return;
    if (handlePagePreviewRoute(requestContext)) return;
    if (handleGraphRoute(requestContext)) return;
    if (handleStaticPageExportRoute(requestContext)) return;
    if (handleExportRoute(requestContext)) return;
    if (handleSearchRoute(requestContext)) return;
    if (handleEventsRoute(requestContext)) return;

    const contentFileResponse = getFileResponse(contentDir, requestContext.pathname);
    if (contentFileResponse) {
      writeResponse(response, contentFileResponse);
      return;
    }

    writeResponse(
      response,
      runtime.clientAssetsStore.getClientAppResponse(requestContext.pathname, requestContext.theme),
    );
  });

  await listen(server, port, host);

  return {
    port,
    close: () => {
      return new Promise<void>((resolve, reject) => {
        runtime.liveReloadChannel.close();
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
    refresh: () => refreshServerContent(runtime, { contentDir, filters, siteTitle, singleFile }),
    reloadClientAssets: () => reloadServerClientAssets(runtime),
  };
};
