export const CLI_NAME = "mdreader";
export const DEFAULT_PORT = 4000;
export const PORT_SCAN_RANGE = 100;
export const SEARCH_RESULTS_LIMIT = 20;
export const EXCERPT_CONTEXT_CHARS = 40;
export const MARKDOWN_EXTENSIONS = new Set([".md"]);
export const API_EVENTS_PATH = "/api/events";
export const API_SEARCH_PATH = "/api/search";
export const API_TREE_JSON_PATH = "/api/tree.json";
export const API_TREE_LEGACY_PATH = "/api/tree";
export const API_SEARCH_INDEX_PATH = "/api/search-index.json";
export const API_PAGE_PATH_PREFIX = "/api/page";
export const API_PAGE_PREVIEW_PATH_PREFIX = "/api/page-preview";
export const API_PAGE_EXPORT_PATH_PREFIX = "/api/export/page";
export const API_PAGE_EXPORT_PATH = "/api/export/page";
export const PAGE_PDF_EXPORT_EXTENSION = "pdf";
export const PDF_PAPER_QUERY_PARAM = "paper";
export const API_SITE_EXPORT_PATH = "/api/export/site";
export const API_SITE_EXPORT_JSON_PATH = "/api/export/site.json";
export const API_SEARCH_EXPORT_PATH = "/api/export/search";
export const API_GRAPH_JSON_PATH = "/api/graph.json";
export const DOCUMENT_CONTENT_SELECTOR = "#nd-page";
export const DOCUMENT_BUSY_SELECTOR = '[aria-busy="true"]';

export const IGNORED_DIRS = new Set([
  ".cache",
  ".git",
  ".next",
  ".react-router",
  ".source",
  "build",
  "dist",
  "mdreader-dist",
  "node_modules",
]);

export const SERVABLE_EXTENSIONS = new Set([
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mp4",
  ".pdf",
  ".png",
  ".svg",
  ".webm",
  ".webp",
]);
