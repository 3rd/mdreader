#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./cli/run-cli";
import { setEmbeddedAssets } from "./server";

export { runCli };
export const AUTO_RUN_DISABLED_KEY = "__MDREADER_SKIP_AUTO_RUN__";

export const setEmbeddedAssetsForBundle = (assets: Parameters<typeof setEmbeddedAssets>[0]) => {
  // used by the generated bundle entry before running the cli
  setEmbeddedAssets(assets);
};

export const handleFatalError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
};

const isMainModule = () => {
  const entryPath = process.argv[1];
  if (!entryPath) return false;

  return path.resolve(entryPath) === fileURLToPath(import.meta.url);
};

const isAutoRunDisabled = () => Reflect.get(globalThis, AUTO_RUN_DISABLED_KEY) === true;

if (isMainModule() && !isAutoRunDisabled()) {
  void runCli().catch(handleFatalError);
}
