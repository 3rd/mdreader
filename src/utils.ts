import type { FileFilters, PageExportFormat, PageInfo } from "./types";
import {
  API_GRAPH_JSON_PATH,
  API_PAGE_EXPORT_PATH_PREFIX,
  API_PAGE_PATH_PREFIX,
  API_PAGE_PREVIEW_PATH_PREFIX,
  IGNORED_DIRS,
} from "./constants";

const HTML_TAG_PATTERN = /<[^>]*>/g;
const GLOB_ASTERISK_PATTERN = /\\\*\\\*/g;
const GLOB_SINGLE_ASTERISK_PATTERN = /\\\*/g;
const GLOB_QUESTION_PATTERN = /\\\?/g;
const INDEX_PAGE_PATTERN = /(?:^|\/)index\.md$/;
const SLUG_SEPARATOR_PATTERN = /[_-]/g;
const TITLE_CASE_PATTERN = /\b\w/g;
const WINDOWS_SEPARATOR_PATTERN = /\\/g;

const globPatternCache = new Map<string, RegExp>();
const PAGE_EXPORT_EXTENSION_BY_FORMAT = {
  html: "html",
  json: "json",
  markdown: "md",
} as const;
const URL_SCHEME_PATTERN = /^[A-Za-z][\d+.A-Za-z-]*:/;

const escapeRegExp = (value: string) => value.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&");

export const encodeSlugPath = (slugPath: string) => {
  return slugPath ? slugPath.split("/").map(encodeURIComponent).join("/") : "";
};

export const decodeSlugPath = (slugPath: string) => {
  if (!slugPath) return "";
  try {
    return slugPath.split("/").map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
};

export const pageUrl = (slugPath: string) => {
  return slugPath ? `/${encodeSlugPath(slugPath)}` : "/";
};

export const pageDataPath = (slugPath: string) => {
  return `${API_PAGE_PATH_PREFIX}/${encodeSlugPath(slugPath || "index")}.json`;
};

export const pagePreviewPath = (slugPath: string) => {
  return `${API_PAGE_PREVIEW_PATH_PREFIX}/${encodeSlugPath(slugPath || "index")}.json`;
};

export const pageExportPath = (slugPath: string, format: PageExportFormat) => {
  return `${API_PAGE_EXPORT_PATH_PREFIX}/${encodeSlugPath(slugPath || "index")}.${PAGE_EXPORT_EXTENSION_BY_FORMAT[format]}`;
};

export const graphDataPath = () => API_GRAPH_JSON_PATH;

export const normalizePathSlashes = (value: string) => value.replace(WINDOWS_SEPARATOR_PATTERN, "/");

export const slugPathFromMarkdownPath = (relativePath: string) => {
  const normalizedPath = normalizePathSlashes(relativePath).replace(/^\.\//, "");
  if (!normalizedPath) return "";
  if (INDEX_PAGE_PATTERN.test(normalizedPath)) {
    return normalizedPath.replace(INDEX_PAGE_PATTERN, "");
  }
  return normalizedPath.replace(/\.md$/, "");
};

const compileGlobPattern = (pattern: string): RegExp => {
  const cachedPattern = globPatternCache.get(pattern);
  if (cachedPattern) return cachedPattern;

  const normalizedPattern = normalizePathSlashes(pattern).replace(/^\.\//, "");
  const source = escapeRegExp(normalizedPattern)
    .replace(GLOB_ASTERISK_PATTERN, ".*")
    .replace(GLOB_SINGLE_ASTERISK_PATTERN, "[^/]*")
    .replace(GLOB_QUESTION_PATTERN, "[^/]");
  // eslint-disable-next-line security/detect-non-literal-regexp
  const compiledPattern = new RegExp(`^${source}$`);

  globPatternCache.set(pattern, compiledPattern);

  return compiledPattern;
};

const matchesGlobPattern = (value: string, pattern: string) => {
  return compileGlobPattern(pattern).test(normalizePathSlashes(value).replace(/^\.\//, ""));
};

export const matchesFileFilters = (value: string, filters: FileFilters) => {
  const normalizedValue = normalizePathSlashes(value).replace(/^\.\//, "");
  const includeMatches =
    filters.include.length === 0 ||
    filters.include.some((pattern) => matchesGlobPattern(normalizedValue, pattern));
  if (!includeMatches) return false;

  return !filters.exclude.some((pattern) => matchesGlobPattern(normalizedValue, pattern));
};

export const hasIgnoredPathSegment = (value: string) => {
  return normalizePathSlashes(value)
    .split("/")
    .some((segment) => IGNORED_DIRS.has(segment));
};

export const titleFromSlug = (slug: string) => {
  if (slug === "index") return "Introduction";
  return slug
    .replace(SLUG_SEPARATOR_PATTERN, " ")
    .replace(TITLE_CASE_PATTERN, (value) => value.toUpperCase());
};

export const escapeHtml = (value: string) => {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
};

export const stripHtmlTags = (html: string) => {
  return html
    .replace(HTML_TAG_PATTERN, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
};

export const getPagePlainText = (page: Pick<PageInfo, "plainText">) => page.plainText;

export const hasExplicitUrlScheme = (value: string) => URL_SCHEME_PATTERN.test(value);
