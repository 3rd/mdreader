import { Marked, type Token } from "marked";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { CodeContentSegment, ContentSegment, FileFilters, PageInfo, TocItem } from "../types";
import { IGNORED_DIRS, MARKDOWN_EXTENSIONS } from "../constants";
import {
  encodeSlugPath,
  escapeHtml,
  hasExplicitUrlScheme,
  hasIgnoredPathSegment,
  matchesFileFilters,
  normalizePathSlashes,
  pageUrl,
  slugPathFromMarkdownPath,
  stripHtmlTags,
  titleFromSlug,
} from "../utils";

const DEFAULT_ORDER = 999;
const ADMONITION_MARKER_PATTERN = /^\[!(note|tip|important|warning|caution)](.*)$/i;
const BLOCKQUOTE_PREFIX_PATTERN = /^> ?/gm;
const FRONTMATTER_PATTERN = /^---\r?\n([\S\s]*?)\r?\n---\r?\n?/;
const HTML_LINE_BREAK_PATTERN = /<(?:\/(?:blockquote|div|h[1-6]|li|ol|p|pre|table|tr|ul)|br\s*\/?)>/gi;
const MARKDOWN_EXTENSION_PATTERN = /\.md$/;
const INVALID_HEADING_ID_CHARS_PATTERN = /[^\s\w-]/g;
const HEADING_WHITESPACE_PATTERN = /\s+/g;
const NESTED_CODE_MARKER_PATTERN = /<!--mdreader-code-block:(\d+)-->/g;
const TRAILING_NEWLINE_PATTERN = /\n$/;
const SAFE_URL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

const ADMONITION_VARIANTS = {
  NOTE: "info",
  TIP: "info",
  IMPORTANT: "warn",
  WARNING: "warn",
  CAUTION: "error",
} as const;

type Frontmatter = Record<string, unknown>;
type CodeToken = Extract<Token, { type: "code" }>;
type HeadingToken = Extract<Token, { type: "heading" }>;
type HrToken = Extract<Token, { type: "hr" }>;

interface FrontmatterResult {
  frontmatter: Frontmatter;
  body: string;
}

interface Admonition {
  content: string;
  label: string;
  variant: (typeof ADMONITION_VARIANTS)[AdmonitionType];
}

interface MarkdownParserResult {
  internalLinkSlugs: Set<string>;
  nestedCodeBlocks: CodeContentSegment[];
  parser: Marked;
}

interface ParseMarkdownOptions {
  servedSourcePath?: string;
}

interface ResolvedContentHref {
  candidateBasePaths: string[];
  hash: string;
  resolvedContentDir: string;
  search: string;
}

type AdmonitionType = keyof typeof ADMONITION_VARIANTS;

const isSafeUrl = (value: string) => {
  const trimmedValue = value.trim();
  if (!trimmedValue) return false;
  if (
    trimmedValue.startsWith("#") ||
    trimmedValue.startsWith("/") ||
    trimmedValue.startsWith("./") ||
    trimmedValue.startsWith("../") ||
    trimmedValue.startsWith("?")
  ) {
    return true;
  }

  if (!hasExplicitUrlScheme(trimmedValue)) return true;

  try {
    return SAFE_URL_PROTOCOLS.has(new URL(trimmedValue).protocol);
  } catch {
    return false;
  }
};

const renderLinkTitle = (title: string | null) => (title ? ` title="${escapeHtml(title)}"` : "");

const isAdmonitionType = (value: string): value is AdmonitionType => {
  return Object.hasOwn(ADMONITION_VARIANTS, value);
};

const parseFrontmatter = (content: string): FrontmatterResult => {
  const match = FRONTMATTER_PATTERN.exec(content);
  if (!match) return { frontmatter: {}, body: content };

  const yamlSource = match[1] ?? "";
  const body = content.slice(match[0].length);

  try {
    const parsedFrontmatter = parseYaml(yamlSource);
    if (typeof parsedFrontmatter !== "object" || parsedFrontmatter === null) {
      return { frontmatter: {}, body };
    }

    return { frontmatter: parsedFrontmatter, body };
  } catch {
    return { frontmatter: {}, body: content };
  }
};

const slugifyHeading = (text: string) => {
  const slug = stripHtmlTags(text)
    .toLowerCase()
    .replace(INVALID_HEADING_ID_CHARS_PATTERN, "")
    .replace(HEADING_WHITESPACE_PATTERN, "-");
  return slug || "section";
};

const isHeadingToken = (token: Token | undefined): token is HeadingToken => {
  return token?.type === "heading" && typeof token.depth === "number" && typeof token.text === "string";
};

const isCodeToken = (token: Token | undefined): token is CodeToken => {
  return token?.type === "code" && typeof token.text === "string";
};

const isHrToken = (token: Token | undefined): token is HrToken => token?.type === "hr";

const resolveAdmonitionVariant = (type: string) => {
  const normalizedType = type.toUpperCase();
  if (!isAdmonitionType(normalizedType)) return "info";
  return ADMONITION_VARIANTS[normalizedType];
};

const getHeadingId = (headingCounts: Map<string, number>, text: string) => {
  const baseId = slugifyHeading(text);
  const count = headingCounts.get(baseId) ?? 0;
  const nextCount = count + 1;

  headingCounts.set(baseId, nextCount);

  return count === 0 ? baseId : `${baseId}-${nextCount}`;
};

const getAdmonition = (rawBlockquote: string): Admonition | null => {
  const [firstLine = "", ...remainingLines] = rawBlockquote
    .replace(BLOCKQUOTE_PREFIX_PATTERN, "")
    .split(/\r?\n/);
  const match = ADMONITION_MARKER_PATTERN.exec(firstLine.trimStart());
  if (!match) return null;

  const type = match[1] ?? "";
  const variant = resolveAdmonitionVariant(type);
  const label = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  const firstBodyLine = match[2]?.trim();
  const body = (firstBodyLine ? [firstBodyLine, ...remainingLines] : remainingLines).join("\n").trim();

  return { content: body, label, variant };
};

const htmlToPlainText = (html: string) => {
  return stripHtmlTags(html.replace(HTML_LINE_BREAK_PATTERN, "\n"))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const getHeadingText = (markdownParser: Marked, heading: HeadingToken) => {
  return stripHtmlTags(String(markdownParser.parseInline(heading.text)));
};

const findFirstTitleHeading = (tokens: Token[]): HeadingToken | null => {
  for (const token of tokens) {
    if (isHeadingToken(token) && token.depth === 1) return token;
  }
  return null;
};

const trimLeadingTitleHeading = (tokens: Token[]) => {
  let startIndex = 0;

  while (tokens[startIndex]?.type === "space") startIndex += 1;

  const leadingToken = tokens[startIndex];
  if (!isHeadingToken(leadingToken) || leadingToken.depth !== 1) return tokens;

  startIndex += 1;
  while (tokens[startIndex]?.type === "space") startIndex += 1;

  return tokens.slice(startIndex);
};

const toCodeSegment = (token: CodeToken): CodeContentSegment => {
  return {
    type: "code",
    lang: token.lang || "text",
    code: token.text.replace(TRAILING_NEWLINE_PATTERN, ""),
  };
};

const isInsideDirectory = (directory: string, candidate: string) => {
  return candidate === directory || candidate.startsWith(`${directory}${path.sep}`);
};

const getPathStat = (candidatePath: string) => statSync(candidatePath, { throwIfNoEntry: false });

const getExistingDocPath = (candidatePath: string) => {
  const candidateExt = path.extname(candidatePath).toLowerCase();

  if (candidateExt) {
    if (!MARKDOWN_EXTENSIONS.has(candidateExt)) return null;
    const stat = getPathStat(candidatePath);
    return stat?.isFile() ? candidatePath : null;
  }

  const markdownPath = `${candidatePath}.md`;
  if (getPathStat(markdownPath)?.isFile()) return markdownPath;

  const indexMarkdownPath = path.join(candidatePath, "index.md");
  if (getPathStat(indexMarkdownPath)?.isFile()) return indexMarkdownPath;

  return null;
};

const splitHrefParts = (value: string) => {
  const hashIndex = value.indexOf("#");
  const searchIndex = value.indexOf("?");
  let pathEndIndex = -1;

  if (hashIndex === -1) {
    pathEndIndex = searchIndex;
  } else if (searchIndex === -1) {
    pathEndIndex = hashIndex;
  } else {
    pathEndIndex = Math.min(hashIndex, searchIndex);
  }

  const pathPart = pathEndIndex === -1 ? value : value.slice(0, pathEndIndex);
  const search = searchIndex === -1 ? "" : value.slice(searchIndex, hashIndex === -1 ? undefined : hashIndex);
  const hash = hashIndex === -1 ? "" : value.slice(hashIndex);

  return { hash, pathPart, search };
};

const resolveContentHref = (
  rawHref: string,
  contentDir: string,
  sourcePath: string,
): ResolvedContentHref | null => {
  const { hash, pathPart, search } = splitHrefParts(rawHref.trim());
  if (!pathPart || pathPart.startsWith("//")) return null;
  if (pathPart.startsWith("#") || pathPart.startsWith("?")) return null;

  const isAbsolutePath = path.isAbsolute(pathPart);
  if (!isAbsolutePath && hasExplicitUrlScheme(pathPart)) return null;

  const resolvedContentDir = path.resolve(contentDir);
  const resolvedSourceDir = path.dirname(path.resolve(sourcePath));
  const candidateBasePaths =
    isAbsolutePath ?
      [path.resolve(pathPart), path.resolve(resolvedContentDir, `.${pathPart}`)]
    : [path.resolve(resolvedSourceDir, pathPart)];

  return {
    candidateBasePaths,
    hash,
    resolvedContentDir,
    search,
  };
};

const resolveMarkdownLink = (
  rawHref: string,
  contentDir: string,
  sourcePath: string,
  options: ParseMarkdownOptions,
) => {
  const resolvedHref = resolveContentHref(rawHref, contentDir, sourcePath);
  if (!resolvedHref) return null;

  const { candidateBasePaths, hash, resolvedContentDir, search } = resolvedHref;
  let docPath: string | null = null;

  for (const candidateBasePath of candidateBasePaths) {
    if (!isInsideDirectory(resolvedContentDir, candidateBasePath)) continue;

    docPath = getExistingDocPath(candidateBasePath);
    if (docPath) break;
  }

  if (!docPath) return null;

  const servedSourcePath = options.servedSourcePath ? path.resolve(options.servedSourcePath) : null;
  if (servedSourcePath) {
    if (docPath !== servedSourcePath) return null;

    return {
      href: `${pageUrl("")}${search}${hash}`,
      slugPath: "",
    };
  }

  const relativeDocPath = normalizePathSlashes(path.relative(resolvedContentDir, docPath));
  const slugPath = slugPathFromMarkdownPath(relativeDocPath);

  return {
    href: `${pageUrl(slugPath)}${search}${hash}`,
    slugPath,
  };
};

const resolveContentAssetHref = (rawHref: string, contentDir: string, sourcePath: string) => {
  const resolvedHref = resolveContentHref(rawHref, contentDir, sourcePath);
  if (!resolvedHref) return null;

  const { candidateBasePaths, hash, resolvedContentDir, search } = resolvedHref;

  for (const candidateBasePath of candidateBasePaths) {
    if (!isInsideDirectory(resolvedContentDir, candidateBasePath)) continue;

    const candidateExt = path.extname(candidateBasePath).toLowerCase();
    if (!candidateExt || MARKDOWN_EXTENSIONS.has(candidateExt)) continue;
    if (!getPathStat(candidateBasePath)?.isFile()) continue;

    const relativeAssetPath = normalizePathSlashes(path.relative(resolvedContentDir, candidateBasePath));
    if (!relativeAssetPath || hasIgnoredPathSegment(relativeAssetPath)) continue;

    return `/${encodeSlugPath(relativeAssetPath)}${search}${hash}`;
  }

  return null;
};

const buildSegments = (tokens: Token[], parserResult: MarkdownParserResult): ContentSegment[] => {
  const { nestedCodeBlocks, parser: markdownParser } = parserResult;
  const segments: ContentSegment[] = [];
  let bufferedTokens: Token[] = [];

  const flushBufferedTokens = () => {
    if (bufferedTokens.length === 0) return;

    nestedCodeBlocks.length = 0;
    const html = String(markdownParser.parser(bufferedTokens));
    bufferedTokens = [];

    if (!html) return;

    if (nestedCodeBlocks.length === 0) {
      segments.push({ type: "html", content: html });
      return;
    }

    // split html at nested code block placeholders to create alternating html/code segments
    const parts = html.split(NESTED_CODE_MARKER_PATTERN);
    for (const [i, htmlPart] of parts.entries()) {
      if (i % 2 === 0) {
        if (htmlPart) segments.push({ type: "html", content: htmlPart });
      } else {
        segments.push(nestedCodeBlocks[Number(htmlPart)]);
      }
    }
  };

  for (const token of tokens) {
    if (isHrToken(token)) {
      flushBufferedTokens();
      segments.push({ type: "slide-break" });
      continue;
    }

    if (!isCodeToken(token)) {
      bufferedTokens.push(token);
      continue;
    }

    flushBufferedTokens();
    segments.push(toCodeSegment(token));
  }

  flushBufferedTokens();

  return segments;
};

const createMarkdownParser = (
  contentDir: string,
  sourcePath: string,
  toc: TocItem[],
  options: ParseMarkdownOptions,
): MarkdownParserResult => {
  const headingCounts = new Map<string, number>();
  const internalLinkSlugs = new Set<string>();
  const nestedCodeBlocks: CodeContentSegment[] = [];
  let markdownParser: Marked | null = null;

  const renderNestedMarkdown = (content: string) => {
    if (!markdownParser) throw new Error("markdown parser is not initialized");
    return String(markdownParser.parser(markdownParser.lexer(content)));
  };

  markdownParser = new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      blockquote(token) {
        const admonition = getAdmonition(token.raw);
        if (!admonition) return `<blockquote>\n${this.parser.parse(token.tokens)}</blockquote>\n`;

        const contentHtml = admonition.content ? renderNestedMarkdown(admonition.content) : "";

        return `<div class="fd-callout fd-callout-${admonition.variant}" data-type="${admonition.variant}"><p class="fd-callout-title">${admonition.label}</p><div>${contentHtml}</div></div>`;
      },
      code(token) {
        if (!isCodeToken(token)) return "";
        const index = nestedCodeBlocks.length;
        nestedCodeBlocks.push(toCodeSegment(token));
        return `<!--mdreader-code-block:${index}-->`;
      },
      heading(token) {
        const content = this.parser.parseInline(token.tokens);
        const title = stripHtmlTags(content);
        const id = getHeadingId(headingCounts, title);

        if (token.depth >= 2 && token.depth <= 4) {
          toc.push({
            depth: token.depth,
            title,
            url: `#${id}`,
          });
        }

        return `<h${token.depth} id="${id}">${content}</h${token.depth}>`;
      },
      html(token) {
        return escapeHtml(token.text);
      },
      image(token) {
        if (!isSafeUrl(token.href)) return escapeHtml(token.text);

        const src = resolveContentAssetHref(token.href, contentDir, sourcePath) ?? token.href;
        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(token.text)}"${renderLinkTitle(token.title ?? null)}>`;
      },
      link(token) {
        if (!isSafeUrl(token.href)) {
          return `<a href="#">${this.parser.parseInline(token.tokens)}</a>`;
        }

        const resolvedLink = resolveMarkdownLink(token.href, contentDir, sourcePath, options);
        if (resolvedLink) internalLinkSlugs.add(resolvedLink.slugPath);

        const href =
          resolvedLink?.href ?? resolveContentAssetHref(token.href, contentDir, sourcePath) ?? token.href;
        return `<a href="${escapeHtml(href)}"${renderLinkTitle(token.title ?? null)}>${this.parser.parseInline(token.tokens)}</a>`;
      },
    },
  });

  return { internalLinkSlugs, nestedCodeBlocks, parser: markdownParser };
};

const buildPlainText = (segments: ContentSegment[]) => {
  return segments
    .map((segment) => {
      if (segment.type === "html") return htmlToPlainText(segment.content);
      if (segment.type === "slide-break") return "";
      return segment.code;
    })
    .join("\n")
    .trim();
};

const extractTitle = (frontmatter: Frontmatter, markdownParser: Marked, tokens: Token[], slug: string) => {
  const title = frontmatter["title"];
  if (typeof title === "string") return title;
  const firstHeading = findFirstTitleHeading(tokens);
  return firstHeading ? getHeadingText(markdownParser, firstHeading) : titleFromSlug(slug);
};

const extractOrder = (frontmatter: Frontmatter) => {
  return typeof frontmatter["order"] === "number" ? frontmatter["order"] : DEFAULT_ORDER;
};

export const parseMarkdownFile = (
  fullPath: string,
  slug: string,
  slugs: string[],
  contentDir: string,
  options: ParseMarkdownOptions = {},
): PageInfo => {
  const rawContent = readFileSync(fullPath, "utf8");
  const { frontmatter, body } = parseFrontmatter(rawContent);
  const toc: TocItem[] = [];
  const parserResult = createMarkdownParser(contentDir, fullPath, toc, options);
  const { internalLinkSlugs, parser: markdownParser } = parserResult;
  const tokens = markdownParser.lexer(body);
  const contentTokens = trimLeadingTitleHeading(tokens);
  const segments = buildSegments(contentTokens, parserResult);
  const title = extractTitle(frontmatter, markdownParser, tokens, slug);
  const order = extractOrder(frontmatter);
  const description = typeof frontmatter["description"] === "string" ? frontmatter["description"] : "";

  return {
    backlinks: [],
    internalLinks: [...internalLinkSlugs],
    lastUpdated: undefined,
    slug,
    slugs,
    title,
    description,
    order,
    plainText: buildPlainText(segments),
    relativePath: "",
    segments,
    sourcePath: fullPath,
    toc,
  };
};

export const scanMarkdownFiles = (
  directory: string,
  filters: FileFilters = { include: [], exclude: [] },
): Map<string, PageInfo> => {
  const pages = new Map<string, PageInfo>();
  const encodedSlugPaths = new Set<string>();

  const scan = (currentDirectory: string, prefix: string[]): void => {
    let entries: string[];

    try {
      entries = readdirSync(currentDirectory);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDirectory, entry);
      const stat = statSync(fullPath, { throwIfNoEntry: false });
      if (!stat) continue;

      if (stat.isDirectory()) {
        if (!IGNORED_DIRS.has(entry)) scan(fullPath, [...prefix, entry]);
        continue;
      }

      if (!MARKDOWN_EXTENSIONS.has(path.extname(entry))) continue;
      const relativePath = normalizePathSlashes(path.relative(directory, fullPath));
      if (!matchesFileFilters(relativePath, filters)) continue;

      const slug = entry.replace(MARKDOWN_EXTENSION_PATTERN, "");
      const slugs = slug === "index" ? prefix : [...prefix, slug];
      const slugPath = slugs.join("/");
      const encodedSlugPath = encodeSlugPath(slugPath);
      if (encodedSlugPaths.has(encodedSlugPath)) {
        const label = slugPath || "index";
        throw new Error(`duplicate page slug detected after url encoding: ${label}`);
      }

      if (pages.has(slugPath)) {
        const label = slugPath || "index";
        throw new Error(`duplicate page slug detected: ${label}`);
      }

      encodedSlugPaths.add(encodedSlugPath);
      pages.set(slugPath, {
        ...parseMarkdownFile(fullPath, slug, slugs, directory),
        relativePath,
        sourcePath: fullPath,
      });
    }
  };

  scan(directory, []);
  return pages;
};
