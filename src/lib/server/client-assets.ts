import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RuntimeConfig, Theme } from "../../types";
import type { RouteResponse } from "./responses";
import { getContentType, htmlResponse, TEXT_ASSET_EXTENSIONS, textResponse } from "./responses";

const WEB_ASSET_ERROR_MESSAGE = "web assets not available";
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_SCRIPT_PATTERN = /<\/body>/i;
const HTML_DOC_PATTERN = "<html";

export interface EmbeddedAssets {
  assets: Record<string, Buffer | string>;
  indexHtml: string;
}

export interface ClientAssetsStore {
  getClientAppResponse: (pathname: string, theme: Theme) => RouteResponse;
  getClientAssetStatus: () => { ok: false; message: string } | { ok: true };
  getClientAssets: () => EmbeddedAssets;
  invalidate: () => void;
}

const injectTheme = (html: string, theme: Theme) => {
  return html.replace(HTML_DOC_PATTERN, `<html data-theme="${theme}"`);
};

const injectRuntimeConfig = (html: string, config: RuntimeConfig) => {
  const runtimeScript = `<script>window.__MDREADER_RUNTIME__=${JSON.stringify(config)};</script>`;
  if (RUNTIME_SCRIPT_PATTERN.test(html)) {
    return html.replace(RUNTIME_SCRIPT_PATTERN, `${runtimeScript}</body>`);
  }
  return `${html}${runtimeScript}`;
};

export const renderClientShell = (html: string, theme: Theme, mode: RuntimeConfig["mode"]) => {
  return injectRuntimeConfig(injectTheme(html, theme), { mode });
};

let defaultEmbeddedAssets: EmbeddedAssets | null = null;
export const setEmbeddedAssets = (assets: EmbeddedAssets) => {
  defaultEmbeddedAssets = assets;
};

const resolveAssetDirectory = () => {
  const candidates = [
    path.resolve(MODULE_DIR, "client"),
    path.resolve(MODULE_DIR, "../../../web/build/client"),
    path.resolve(path.dirname(process.execPath), "client"),
  ];

  const assetDirectory = candidates.find((candidate) => existsSync(path.join(candidate, "index.html")));
  if (assetDirectory) return assetDirectory;

  throw new Error(`web assets not found. checked: ${candidates.join(", ")}`);
};

const readAssetFile = (filePath: string): Buffer | string => {
  return TEXT_ASSET_EXTENSIONS.has(path.extname(filePath)) ?
      readFileSync(filePath, "utf8")
    : readFileSync(filePath);
};

export const readClientAssetsFromDirectory = (assetDir: string): EmbeddedAssets => {
  const assets: Record<string, Buffer | string> = {};
  let indexHtml = "";

  const scan = (directory: string, prefix = ""): void => {
    for (const entry of readdirSync(directory)) {
      const fullPath = path.join(directory, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        scan(fullPath, `${prefix}${entry}/`);
        continue;
      }

      const webPath = `/${prefix}${entry}`;
      const content = readAssetFile(fullPath);
      if (webPath === "/index.html" && typeof content === "string") {
        indexHtml = content;
        continue;
      }

      assets[webPath] = content;
    }
  };
  scan(assetDir);

  if (!indexHtml) throw new Error(`web build is missing ${path.join(assetDir, "index.html")}`);

  return {
    assets,
    indexHtml,
  };
};

export const createClientAssetsStore = (): ClientAssetsStore => {
  let resolvedAssets: EmbeddedAssets | null = null;

  const getClientAssets = (): EmbeddedAssets => {
    if (defaultEmbeddedAssets) return defaultEmbeddedAssets;
    if (resolvedAssets) return resolvedAssets;
    resolvedAssets = readClientAssetsFromDirectory(resolveAssetDirectory());
    return resolvedAssets;
  };

  return {
    getClientAssets,
    invalidate: () => {
      resolvedAssets = null;
    },
    getClientAssetStatus: () => {
      try {
        getClientAssets();
        return { ok: true } as const;
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        } as const;
      }
    },
    getClientAppResponse: (pathname, theme) => {
      try {
        const clientAssets = getClientAssets();

        if (pathname !== "/" && pathname !== "/index.html") {
          const asset = clientAssets.assets[pathname];
          if (asset) {
            return {
              body: asset,
              contentType: getContentType(pathname),
            };
          }
        }

        return htmlResponse(renderClientShell(clientAssets.indexHtml, theme, "serve"));
      } catch {
        return textResponse(WEB_ASSET_ERROR_MESSAGE, 500);
      }
    },
  };
};

export const getClientAssetStatus = () => createClientAssetsStore().getClientAssetStatus();
