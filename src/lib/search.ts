import type { SearchResult } from "../types";
import type { PageInfo } from "../types";
import { EXCERPT_CONTEXT_CHARS, SEARCH_RESULTS_LIMIT } from "../constants";
import { getPagePlainText, pageUrl } from "../utils";

const BODY_MATCH_SCORE = 40;
const DESCRIPTION_MATCH_SCORE = 70;
const DIACRITICS_PATTERN = /[\u0300-\u036f]/g;
const EXACT_MATCH_SCORE = 160;
const HEADING_MATCH_SCORE = 90;
const PREFIX_MATCH_SCORE = 120;
const SUBSEQUENCE_MATCH_SCORE = 45;
const TITLE_MATCH_SCORE = 120;
const TOKEN_MATCH_SCORE = 24;
const WORD_SEPARATOR_PATTERN = /[\s./_-]+/;

interface NormalizedText {
  offsets: number[];
  text: string;
}

interface ScoredMatch {
  index: number;
  score: number;
}

interface ScoredSearchResult extends SearchResult {
  score: number;
}

const normalizeSearchText = (value: string) => {
  return value.normalize("NFKD").replace(DIACRITICS_PATTERN, "").toLowerCase().trim();
};

const normalizeSearchTextWithOffsets = (value: string): NormalizedText => {
  let normalizedText = "";
  const offsets: number[] = [];
  let codeUnitIndex = 0;

  for (const character of value) {
    const characterLength = character.length;
    const normalizedCharacter = character.normalize("NFKD").replace(DIACRITICS_PATTERN, "").toLowerCase();

    for (const normalizedPart of normalizedCharacter) {
      normalizedText += normalizedPart;
      offsets.push(codeUnitIndex);
    }

    codeUnitIndex += characterLength;
  }

  const leadingWhitespaceLength = normalizedText.length - normalizedText.trimStart().length;
  const trailingWhitespaceLength = normalizedText.length - normalizedText.trimEnd().length;
  const trimmedText = normalizedText.trim();
  const trimmedEndOffset = offsets.length - trailingWhitespaceLength;
  const trimmedOffsets = offsets.slice(
    leadingWhitespaceLength,
    trimmedEndOffset < leadingWhitespaceLength ? leadingWhitespaceLength : trimmedEndOffset,
  );

  trimmedOffsets.push(value.length);

  return {
    text: trimmedText,
    offsets: trimmedOffsets,
  };
};

const tokenizeQuery = (value: string) => {
  return normalizeSearchText(value).split(WORD_SEPARATOR_PATTERN).filter(Boolean);
};

const isSubsequenceMatch = (text: string, query: string) => {
  let queryIndex = 0;

  for (const character of text) {
    if (character !== query[queryIndex]) continue;
    queryIndex += 1;
    if (queryIndex === query.length) return true;
  }

  return false;
};

const scoreMatch = (value: string, query: string, tokens: string[]): ScoredMatch | null => {
  const normalizedValue = normalizeSearchText(value);
  if (!normalizedValue) return null;

  const exactIndex = normalizedValue.indexOf(query);
  let score = 0;
  let bestIndex = exactIndex;

  if (normalizedValue === query) score += EXACT_MATCH_SCORE;
  if (normalizedValue.startsWith(query)) score += PREFIX_MATCH_SCORE;
  if (exactIndex !== -1) {
    score += Math.max(80 - exactIndex, 20);
  }

  let matchedTokens = 0;
  for (const token of tokens) {
    const tokenIndex = normalizedValue.indexOf(token);
    if (tokenIndex === -1) continue;

    matchedTokens += 1;
    score += TOKEN_MATCH_SCORE + Math.max(12 - tokenIndex, 0);
    if (bestIndex === -1 || tokenIndex < bestIndex) bestIndex = tokenIndex;
  }

  if (matchedTokens === tokens.length && matchedTokens > 0) {
    score += matchedTokens * 10;
  } else if (exactIndex === -1 && query.length >= 3 && isSubsequenceMatch(normalizedValue, query)) {
    score += SUBSEQUENCE_MATCH_SCORE;
  }

  if (score === 0) return null;

  return {
    index: bestIndex === -1 ? 0 : bestIndex,
    score,
  };
};

const buildExcerpt = (text: string, query: string, normalizedIndex: number) => {
  const normalizedText = normalizeSearchTextWithOffsets(text);
  if (!normalizedText.text) return "";

  const startIndex =
    normalizedText.offsets[Math.min(normalizedIndex, normalizedText.offsets.length - 1)] ?? 0;
  const matchEndIndex =
    normalizedText.offsets[Math.min(normalizedIndex + query.length, normalizedText.offsets.length - 1)] ??
    text.length;
  const start = Math.max(0, startIndex - EXCERPT_CONTEXT_CHARS);
  const end = Math.min(text.length, matchEndIndex + EXCERPT_CONTEXT_CHARS);

  return `${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
};

const compareResults = (left: ScoredSearchResult, right: ScoredSearchResult) => {
  if (left.score !== right.score) return right.score - left.score;
  if (left.type !== right.type) return left.type.localeCompare(right.type);
  return left.content.localeCompare(right.content);
};

export const searchPages = (pages: Map<string, PageInfo>, query: string): SearchResult[] => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const queryTokens = tokenizeQuery(query);
  const results: ScoredSearchResult[] = [];

  for (const [slugPath, page] of pages) {
    const url = pageUrl(slugPath);

    const titleMatch = scoreMatch(page.title, normalizedQuery, queryTokens);
    const descriptionMatch =
      page.description ? scoreMatch(page.description, normalizedQuery, queryTokens) : null;
    if (titleMatch || descriptionMatch) {
      results.push({
        id: url,
        type: "page",
        content: page.title,
        score:
          Math.max(titleMatch?.score ?? 0, descriptionMatch?.score ?? 0) +
          (titleMatch ? TITLE_MATCH_SCORE : DESCRIPTION_MATCH_SCORE),
        url,
      });
    }

    for (const heading of page.toc) {
      const headingMatch = scoreMatch(heading.title, normalizedQuery, queryTokens);
      if (!headingMatch) continue;

      results.push({
        id: `${url}-${heading.url}`,
        type: "heading",
        content: heading.title,
        score: headingMatch.score + HEADING_MATCH_SCORE,
        url: `${url}${heading.url}`,
      });
    }

    const plainText = getPagePlainText(page);
    const bodyMatch = scoreMatch(plainText, normalizedQuery, queryTokens);
    if (!bodyMatch) continue;

    results.push({
      id: `${url}-body`,
      type: "text",
      content: buildExcerpt(plainText, normalizedQuery, bodyMatch.index),
      score: bodyMatch.score + BODY_MATCH_SCORE,
      url,
    });
  }

  return results
    .toSorted(compareResults)
    .slice(0, SEARCH_RESULTS_LIMIT)
    .map(({ score: _score, ...result }) => result);
};
