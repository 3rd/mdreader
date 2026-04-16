#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AUTO_RUN_DISABLED_KEY } from "../src/index";
import { readClientAssetsFromDirectory } from "../src/lib/server/client-assets";

const ROOT_DIR = path.resolve(import.meta.dirname, "..");
const WEB_BUILD_DIR = path.resolve(ROOT_DIR, "web/build/client");
const TEMP_DIR = path.resolve(ROOT_DIR, ".cache/mdreader-build");
const TEMP_ASSET_MODULE = path.join(TEMP_DIR, "embedded-assets.generated.ts");
const TEMP_ENTRY_FILE = path.join(TEMP_DIR, "entry.ts");
const BUILD_MODE = process.argv.includes("--compile") ? "compile" : "bundle";
const OUTPUT_FILE =
  BUILD_MODE === "compile" ? path.resolve(ROOT_DIR, "build/mdreader") : path.resolve(ROOT_DIR, "dist/mdreader.js");
const EXECUTABLE_SHEBANG = "#!/usr/bin/env node";

type AssetEncoding = "base64" | "utf8";

interface EmbeddedAssetEntry {
  content: string;
  encoding: AssetEncoding;
  webPath: string;
}

const toImportSpecifier = (relativePath: string) => relativePath.split(path.sep).join("/");

const toEmbeddedAssetEntry = ([webPath, content]: [string, Buffer | string]): EmbeddedAssetEntry => {
  if (typeof content === "string") {
    return {
      webPath,
      encoding: "utf8",
      content,
    };
  }

  return {
    webPath,
    encoding: "base64",
    content: content.toString("base64"),
  };
};

const serializeEmbeddedAsset = (entry: EmbeddedAssetEntry) => {
  if (entry.encoding === "utf8") {
    return `  ${JSON.stringify(entry.webPath)}: ${JSON.stringify(entry.content)},`;
  }

  return `  ${JSON.stringify(entry.webPath)}: Buffer.from(${JSON.stringify(entry.content)}, "base64"),`;
};

const createAssetModule = (
  assetEntries: EmbeddedAssetEntry[],
  indexHtml: string,
) => {
  return `// auto-generated build artifact
  export const EMBEDDED_INDEX_HTML = ${JSON.stringify(indexHtml)};
  export const EMBEDDED_ASSETS: Record<string, Buffer | string> = {
  ${assetEntries.map(serializeEmbeddedAsset).join("\n")}
  };
  `
};

const createEntryModule = () => {
  const indexImport = toImportSpecifier(path.relative(TEMP_DIR, path.resolve(ROOT_DIR, "src/index.ts")));

  return `// auto-generated build artifact
import { EMBEDDED_ASSETS, EMBEDDED_INDEX_HTML } from "./embedded-assets.generated";

Reflect.set(globalThis, ${JSON.stringify(AUTO_RUN_DISABLED_KEY)}, true);

const { handleFatalError, runCli, setEmbeddedAssetsForBundle } = await import(${JSON.stringify(indexImport)});

setEmbeddedAssetsForBundle({
  assets: EMBEDDED_ASSETS,
  indexHtml: EMBEDDED_INDEX_HTML,
});
runCli().catch(handleFatalError);
`;
};

const ensureBundleExecutable = () => {
  if (BUILD_MODE !== "bundle") {
    chmodSync(OUTPUT_FILE, 0o755);
    return;
  }

  const output = readFileSync(OUTPUT_FILE, "utf8");
  const executableOutput =
    output.startsWith(EXECUTABLE_SHEBANG) ? output : `${EXECUTABLE_SHEBANG}\n${output}`;

  if (executableOutput !== output) {
    writeFileSync(OUTPUT_FILE, executableOutput);
  }

  chmodSync(OUTPUT_FILE, 0o755);
};

const getBuildArgs = () => {
  return BUILD_MODE === "compile" ?
    ["build", "--compile", "--minify", TEMP_ENTRY_FILE, "--outfile", OUTPUT_FILE]
  : ["build", TEMP_ENTRY_FILE, "--outfile", OUTPUT_FILE, "--target", "node", "--minify"]
};

const prepareOutputDirectory = () => {
  const outputDir = path.dirname(OUTPUT_FILE);

  rmSync(TEMP_DIR, { recursive: true, force: true });
  mkdirSync(TEMP_DIR, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  if (BUILD_MODE === "bundle") {
    rmSync(path.resolve(ROOT_DIR, "dist"), { recursive: true, force: true });
    mkdirSync(path.resolve(ROOT_DIR, "dist"), { recursive: true });
    return;
  }

  rmSync(OUTPUT_FILE, { force: true });
};

const main = () => {
  if (!existsSync(WEB_BUILD_DIR)) {
    throw new Error(`web build not found: ${WEB_BUILD_DIR}`);
  }

  const { assets, indexHtml } = readClientAssetsFromDirectory(WEB_BUILD_DIR);
  const assetEntries = Object.entries(assets).map(toEmbeddedAssetEntry);
  const assetModule = createAssetModule(assetEntries, indexHtml);
  const entryModule = createEntryModule();

  prepareOutputDirectory();
  writeFileSync(TEMP_ASSET_MODULE, assetModule);
  writeFileSync(TEMP_ENTRY_FILE, entryModule);

  try {
    const buildArgs = getBuildArgs();
    const result = spawnSync("bun", buildArgs, {
      cwd: ROOT_DIR,
      stdio: "inherit",
    });

    if (result.status !== 0) {
      throw new Error(`bun ${buildArgs.join(" ")} failed with status ${result.status ?? "unknown"}`);
    }

    ensureBundleExecutable();
  } finally {
    rmSync(TEMP_DIR, { recursive: true, force: true });
  }

  console.log(`built ${OUTPUT_FILE}`);
};

main();
