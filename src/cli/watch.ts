import path from "node:path";
import p from "picoprint";
import type { FileFilters } from "../types";
import { normalizePathSlashes } from "../utils";
import { findChangedFile, snapshotWatchedFiles } from "./content-files";

const WATCH_POLL_INTERVAL_MS = 500;

export const startWatcher = (
  contentDir: string,
  filters: FileFilters,
  refresh: () => Promise<void>,
  singleFile?: string,
) => {
  let snapshot = snapshotWatchedFiles(contentDir, filters, singleFile);
  let pendingRefresh: Promise<void> | null = null;
  let needsAnotherPass = false;

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

  console.log(p.gray("  watching for changes...\n"));
};
