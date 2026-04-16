import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import p from "picoprint";
import type { FileFilters } from "../types";
import { normalizePathSlashes } from "../utils";
import { findChangedFile, snapshotWatchedFiles } from "./content-files";

const WATCH_POLL_INTERVAL_MS = 500;
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(MODULE_DIR, "../..");
const WEB_SOURCE_DIR = path.resolve(ROOT_DIR, "web/src");
const WEB_WATCHED_PATHS = [
  WEB_SOURCE_DIR,
  path.resolve(ROOT_DIR, "web/package.json"),
  path.resolve(ROOT_DIR, "scripts/generate-themes.ts"),
] as const;

interface WatchedFileState {
  mtimeMs: number;
  size: number;
}

const getFileState = (filePath: string): WatchedFileState | null => {
  const stat = statSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile()) return null;

  return {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
  };
};

const snapshotDirectoryFiles = (directory: string, snapshot: Map<string, WatchedFileState>) => {
  let entries: string[] = [];

  try {
    entries = readdirSync(directory);
  } catch {
    return;
  }

  for (const entry of entries) {
    const filePath = path.join(directory, entry);
    const stat = statSync(filePath, { throwIfNoEntry: false });
    if (!stat) continue;

    if (stat.isDirectory()) {
      snapshotDirectoryFiles(filePath, snapshot);
      continue;
    }

    snapshot.set(filePath, {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    });
  }
};

const snapshotWebSourceFiles = () => {
  const snapshot = new Map<string, WatchedFileState>();

  for (const watchPath of WEB_WATCHED_PATHS) {
    const stat = statSync(watchPath, { throwIfNoEntry: false });
    if (!stat) continue;

    if (stat.isDirectory()) {
      snapshotDirectoryFiles(watchPath, snapshot);
      continue;
    }

    const fileState = getFileState(watchPath);
    if (fileState) snapshot.set(watchPath, fileState);
  }

  return snapshot;
};

const runWebBuild = () => {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("bun", ["run", "--cwd", "./web", "build"], {
      cwd: ROOT_DIR,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`web build failed with status ${code ?? "unknown"}`));
    });
  });
};

export const startWatcher = (
  contentDir: string,
  filters: FileFilters,
  refresh: () => Promise<void>,
  reloadClientAssets: () => Promise<void>,
  singleFile?: string,
) => {
  let snapshot = snapshotWatchedFiles(contentDir, filters, singleFile);
  let webSnapshot = snapshotWebSourceFiles();
  let pendingRefresh: Promise<void> | null = null;
  let pendingWebRefresh: Promise<void> | null = null;
  let needsAnotherPass = false;
  let needsAnotherWebPass = false;

  const runRefresh = () => {
    if (pendingRefresh) {
      needsAnotherPass = true;
      return;
    }

    pendingRefresh = refresh()
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(p.red(`  failed to refresh: ${message}`));
      })
      .finally(() => {
        pendingRefresh = null;
        if (!needsAnotherPass) return;

        needsAnotherPass = false;
        runRefresh();
      });
  };

  const runWebRefresh = () => {
    if (pendingWebRefresh) {
      needsAnotherWebPass = true;
      return;
    }

    pendingWebRefresh = runWebBuild()
      .then(reloadClientAssets)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(p.red(`  failed to rebuild web client: ${message}`));
      })
      .finally(() => {
        pendingWebRefresh = null;
        if (!needsAnotherWebPass) return;

        needsAnotherWebPass = false;
        runWebRefresh();
      });
  };

  const watcher = setInterval(() => {
    const nextSnapshot = snapshotWatchedFiles(contentDir, filters, singleFile);
    const changedFile = findChangedFile(snapshot, nextSnapshot);
    snapshot = nextSnapshot;

    if (!changedFile) return;

    let changedLabel = path.basename(changedFile);
    if (singleFile) {
      changedLabel = path.basename(singleFile);
    } else {
      changedLabel = normalizePathSlashes(path.relative(contentDir, changedFile)) || changedLabel;
    }

    console.log(p.gray(`  changed: ${changedLabel}`));

    runRefresh();
  }, WATCH_POLL_INTERVAL_MS);

  watcher.unref();

  if (existsSync(WEB_SOURCE_DIR)) {
    const webWatcher = setInterval(() => {
      const nextWebSnapshot = snapshotWebSourceFiles();
      const changedFile = findChangedFile(webSnapshot, nextWebSnapshot);
      webSnapshot = nextWebSnapshot;

      if (!changedFile) return;

      const changedLabel =
        normalizePathSlashes(path.relative(ROOT_DIR, changedFile)) || path.basename(changedFile);
      console.log(p.gray(`  changed ui: ${changedLabel}`));

      runWebRefresh();
    }, WATCH_POLL_INTERVAL_MS);

    webWatcher.unref();
  }

  console.log(p.gray("  watching for changes...\n"));
};
