import { mkdirSync, readdirSync, type Stats, statSync } from "node:fs";
import path from "node:path";
import type { FileFilters } from "../types";
import { IGNORED_DIRS, MARKDOWN_EXTENSIONS } from "../constants";
import { matchesFileFilters, normalizePathSlashes } from "../utils";

const MDX_EXTENSION = ".mdx";

type ContentFileKind = "markdown" | "mdx";

interface Target {
  contentDir: string;
  singleFile?: string;
}

interface WatchedFileState {
  mtimeMs: number;
  size: number;
}

const visitContentFiles = (
  contentDir: string,
  filters: FileFilters,
  visitFile: (filePath: string, relativePath: string, stat: Stats, kind: ContentFileKind) => void,
) => {
  const scan = (currentDirectory: string): void => {
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
        if (!IGNORED_DIRS.has(entry)) scan(fullPath);
        continue;
      }

      const relativePath = normalizePathSlashes(path.relative(contentDir, fullPath));
      const extension = path.extname(entry).toLowerCase();
      let kind: ContentFileKind | null = null;
      if (MARKDOWN_EXTENSIONS.has(extension)) kind = "markdown";
      if (extension === MDX_EXTENSION) kind = "mdx";
      if (!kind || !matchesFileFilters(relativePath, filters)) continue;

      visitFile(fullPath, relativePath, stat, kind);
    }
  };

  scan(contentDir);
};

const getWatchedFileState = (filePath: string): WatchedFileState | null => {
  const stat = statSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile()) return null;

  return {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
  };
};

export const createFileFilters = (include?: string[], exclude?: string[]): FileFilters => ({
  exclude: [...new Set((exclude ?? []).map((value) => normalizePathSlashes(value.trim())).filter(Boolean))],
  include: [...new Set((include ?? []).map((value) => normalizePathSlashes(value.trim())).filter(Boolean))],
});

export const countMarkdownFiles = (directory: string, filters: FileFilters) => {
  let count = 0;

  visitContentFiles(directory, filters, (_filePath, _relativePath, _stat, kind) => {
    if (kind === "markdown") count += 1;
  });

  return count;
};

export const findUnsupportedMdxFiles = (directory: string, filters: FileFilters) => {
  const unsupportedFiles: string[] = [];

  visitContentFiles(directory, filters, (_filePath, relativePath, _stat, kind) => {
    if (kind === "mdx") unsupportedFiles.push(relativePath);
  });

  return unsupportedFiles;
};

export const snapshotWatchedFiles = (
  contentDir: string,
  filters: FileFilters,
  singleFile?: string,
): Map<string, WatchedFileState> => {
  const snapshot = new Map<string, WatchedFileState>();

  if (singleFile) {
    const fileState = getWatchedFileState(singleFile);
    if (fileState) snapshot.set(singleFile, fileState);
    return snapshot;
  }

  visitContentFiles(contentDir, filters, (filePath, _relativePath, stat, kind) => {
    if (kind !== "markdown") return;

    snapshot.set(filePath, {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    });
  });

  return snapshot;
};

export const findChangedFile = (
  previous: Map<string, WatchedFileState>,
  next: Map<string, WatchedFileState>,
) => {
  for (const [filePath, nextState] of next) {
    const previousState = previous.get(filePath);
    if (previousState?.mtimeMs !== nextState.mtimeMs || previousState?.size !== nextState.size) {
      return filePath;
    }
  }

  for (const filePath of previous.keys()) {
    if (!next.has(filePath)) return filePath;
  }

  return null;
};

export const resolveTarget = (target?: string): Target => {
  if (!target) return { contentDir: process.cwd() };

  const resolvedTarget = path.resolve(target);
  const stat = statSync(resolvedTarget, { throwIfNoEntry: false });
  if (!stat) throw new Error(`path not found: ${resolvedTarget}`);
  if (!stat.isFile()) return { contentDir: resolvedTarget };

  const extension = path.extname(resolvedTarget).toLowerCase();
  if (extension === MDX_EXTENSION) throw new Error(`.mdx files are not supported: ${resolvedTarget}`);
  if (!MARKDOWN_EXTENSIONS.has(extension)) {
    throw new Error(`target file must be markdown (.md): ${resolvedTarget}`);
  }

  return {
    contentDir: path.dirname(resolvedTarget),
    singleFile: resolvedTarget,
  };
};

export const resolveInitDirectory = (target?: string) => {
  const directory = path.resolve(target ?? process.cwd());
  const stat = statSync(directory, { throwIfNoEntry: false });
  if (stat?.isFile()) throw new Error(`init target must be a directory: ${directory}`);
  if (!stat) mkdirSync(directory, { recursive: true });

  return directory;
};
