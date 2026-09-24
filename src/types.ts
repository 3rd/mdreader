export interface CodeContentSegment {
  type: "code";
  lang: string;
  code: string;
}

export interface HtmlContentSegment {
  type: "html";
  content: string;
}

export interface SlideBreakContentSegment {
  type: "slide-break";
}

export type ContentSegment = CodeContentSegment | HtmlContentSegment | SlideBreakContentSegment;

export interface BacklinkItem {
  title: string;
  url: string;
}

export interface LastUpdatedInfo {
  at: string;
  commit: string;
}

export interface TocItem {
  title: string;
  url: string;
  depth: number;
}

export interface PageInfo {
  backlinks: BacklinkItem[];
  internalLinks: string[];
  lastUpdated?: LastUpdatedInfo;
  slug: string;
  slugs: string[];
  title: string;
  description: string;
  order: number;
  hasExplicitOrder: boolean;
  plainText: string;
  relativePath: string;
  segments: ContentSegment[];
  sourcePath: string;
  toc: TocItem[];
}

export interface PageDataPayload {
  backlinks: BacklinkItem[];
  lastUpdated?: LastUpdatedInfo;
  title: string;
  description: string;
  segments: ContentSegment[];
  toc: TocItem[];
}

export interface PagePreviewPayload {
  description: string;
  excerpt: string;
  title: string;
  url: string;
}

export interface PageTreePageNode {
  type: "page";
  name: string;
  url: string;
}

export interface PageTreeSeparatorNode {
  type: "separator";
  name: string;
}

export interface PageTreeFolderNode {
  type: "folder";
  name: string;
  children: PageTreeNode[];
  index?: PageTreePageNode;
}

export type PageTreeNode = PageTreeFolderNode | PageTreePageNode | PageTreeSeparatorNode;

export interface PageTree {
  name: string;
  children: PageTreeNode[];
}

export interface TreeDataPayload {
  siteTitle: string;
  tree: PageTree;
}

export interface GraphNode {
  id: string;
  title: string;
  url: string;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphDataPayload {
  edges: GraphEdge[];
  nodes: GraphNode[];
}

export interface SearchResult {
  id: string;
  type: "heading" | "page" | "text";
  content: string;
  url: string;
}

export interface MdreaderConfig {
  title: string;
  description: string;
  theme: Theme;
}

export interface ConfigDiagnostic {
  level: "error" | "warn";
  message: string;
}

export interface RuntimeConfig {
  hasPdfExport: boolean;
  mode: RuntimeMode;
}

export interface ConfigLoadResult {
  config: MdreaderConfig;
  configPath: string;
  diagnostics: ConfigDiagnostic[];
  found: boolean;
}

export interface FileFilters {
  exclude: string[];
  include: string[];
}

export const PAGE_EXPORT_FORMATS = ["html", "json", "markdown"] as const;

export type PageExportFormat = (typeof PAGE_EXPORT_FORMATS)[number];

export const PDF_PAPER_FORMATS = ["a4", "letter"] as const;

export type PdfPaperFormat = (typeof PDF_PAPER_FORMATS)[number];
export type RuntimeMode = "serve" | "static";

export const VALID_THEMES = [
  "neutral",
  "ocean",
  "purple",
  "catppuccin",
  "dusk",
  "emerald",
  "ruby",
  "solar",
  "black",
  "shadcn",
  "vitepress",
  "aspen",
] as const;

export type Theme = (typeof VALID_THEMES)[number];

const PAGE_EXPORT_FORMAT_SET = new Set<string>(PAGE_EXPORT_FORMATS);
const PDF_PAPER_FORMAT_SET = new Set<string>(PDF_PAPER_FORMATS);
const VALID_THEME_SET = new Set<string>(VALID_THEMES);

export const isPageExportFormat = (value: unknown): value is PageExportFormat => {
  return typeof value === "string" && PAGE_EXPORT_FORMAT_SET.has(value);
};

export const isPdfPaperFormat = (value: unknown): value is PdfPaperFormat => {
  return typeof value === "string" && PDF_PAPER_FORMAT_SET.has(value);
};

export const isValidTheme = (value: unknown): value is Theme => {
  return typeof value === "string" && VALID_THEME_SET.has(value);
};
