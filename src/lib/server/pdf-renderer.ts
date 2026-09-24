import { accessSync, constants as fsConstants } from "node:fs";
import path from "node:path";
import puppeteer, { TimeoutError } from "puppeteer-core";
import type { PdfPaperFormat } from "../../types";
import { DOCUMENT_BUSY_SELECTOR, DOCUMENT_CONTENT_SELECTOR } from "../../constants";

const CHROME_PATH_ENV_KEY = "CHROME_PATH";
const PAGE_READY_TIMEOUT_MS = 30_000;
const CODE_HIGHLIGHT_TIMEOUT_MS = 3000;
const PDF_RENDER_TIMEOUT_MS = 60_000;
const PATH_EXECUTABLE_NAMES = [
  "google-chrome-stable",
  "google-chrome",
  "chromium",
  "chromium-browser",
  "microsoft-edge-stable",
  "microsoft-edge",
  "brave-browser",
  "brave",
];
const MACOS_APPLICATION_PATHS = [
  "Google Chrome.app/Contents/MacOS/Google Chrome",
  "Chromium.app/Contents/MacOS/Chromium",
  "Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "Brave Browser.app/Contents/MacOS/Brave Browser",
];
const WINDOWS_APPLICATION_PATHS = [
  "Google/Chrome/Application/chrome.exe",
  "Microsoft/Edge/Application/msedge.exe",
  "BraveSoftware/Brave-Browser/Application/brave.exe",
];
const WINDOWS_INSTALL_ROOT_ENV_KEYS = ["LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)"];
const PAGE_READY_EXPRESSION = `document.querySelector(${JSON.stringify(DOCUMENT_CONTENT_SELECTOR)}) !== null && document.querySelector(${JSON.stringify(DOCUMENT_BUSY_SELECTOR)}) === null && document.fonts.status === "loaded" && Array.from(document.images).every((image) => image.complete)`;
const UNHIGHLIGHTED_CODE_SELECTOR = `${DOCUMENT_CONTENT_SELECTOR} figure.shiki:not(.shiki-themes)`;
const CODE_HIGHLIGHTED_EXPRESSION = `document.querySelector(${JSON.stringify(UNHIGHLIGHTED_CODE_SELECTOR)}) === null`;
const CONTENT_LINK_SELECTOR = `${DOCUMENT_CONTENT_SELECTOR} a[href]`;

export const BROWSER_NOT_FOUND_MESSAGE = `PDF export needs Google Chrome, Chromium, Microsoft Edge, or Brave. Install one or set ${CHROME_PATH_ENV_KEY} to its executable.`;

interface PdfRenderRequest {
  linkOrigin: string | null;
  paper: PdfPaperFormat;
  url: string;
}

interface RenderPdfOptions extends PdfRenderRequest {
  executablePath: string;
}

const isExecutable = (filePath: string) => {
  try {
    accessSync(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const listInstalledApplicationPaths = () => {
  if (process.platform === "darwin") {
    const applicationRoots = ["/Applications", path.join(process.env["HOME"] ?? "", "Applications")];
    return applicationRoots.flatMap((root) =>
      MACOS_APPLICATION_PATHS.map((appPath) => path.join(root, appPath)),
    );
  }

  if (process.platform === "win32") {
    return WINDOWS_INSTALL_ROOT_ENV_KEYS.flatMap((key) => {
      const root = process.env[key];
      return root ? WINDOWS_APPLICATION_PATHS.map((appPath) => path.join(root, appPath)) : [];
    });
  }

  return [];
};

const listPathExecutablePaths = () => {
  const directories = (process.env["PATH"] ?? "").split(path.delimiter).filter(Boolean);
  const extension = process.platform === "win32" ? ".exe" : "";

  return directories.flatMap((directory) => {
    return PATH_EXECUTABLE_NAMES.map((name) => path.join(directory, `${name}${extension}`));
  });
};

export const findBrowserExecutable = () => {
  const configuredPath = process.env[CHROME_PATH_ENV_KEY];
  if (configuredPath) return isExecutable(configuredPath) ? configuredPath : undefined;

  return [...listInstalledApplicationPaths(), ...listPathExecutablePaths()].find(isExecutable);
};

const createLinkRewriteExpression = (linkOrigin: string | null) => {
  return `(() => {
    const linkOrigin = ${JSON.stringify(linkOrigin)};
    for (const link of document.querySelectorAll(${JSON.stringify(CONTENT_LINK_SELECTOR)})) {
      let target;

      try {
        target = new URL(link.getAttribute("href"), location.href);
      } catch {
        continue;
      }

      const isSamePageAnchor = target.pathname === location.pathname && target.hash !== "";
      if (target.origin !== location.origin || isSamePageAnchor) continue;

      if (linkOrigin === null) {
        link.replaceWith(...link.childNodes);
      } else {
        link.setAttribute("href", linkOrigin + target.pathname + target.search + target.hash);
      }
    }
  })()`;
};

export const launchPdfRenderer = async (executablePath: string) => {
  const browser = await puppeteer.launch({
    args: ["--no-first-run", "--no-default-browser-check", "--disable-extensions"],
    executablePath,
    headless: true,
  });

  const render = async ({ linkOrigin, paper, url }: PdfRenderRequest) => {
    const page = await browser.newPage();

    try {
      await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
      await page.goto(url, { timeout: PAGE_READY_TIMEOUT_MS, waitUntil: "load" });
      await page.waitForFunction(PAGE_READY_EXPRESSION, { timeout: PAGE_READY_TIMEOUT_MS });

      try {
        await page.waitForFunction(CODE_HIGHLIGHTED_EXPRESSION, { timeout: CODE_HIGHLIGHT_TIMEOUT_MS });
      } catch (error) {
        if (!(error instanceof TimeoutError)) {
          throw error;
        }
      }

      await page.evaluate(createLinkRewriteExpression(linkOrigin));
      const pdf = await page.pdf({
        format: paper,
        outline: true,
        printBackground: true,
        tagged: true,
        timeout: PDF_RENDER_TIMEOUT_MS,
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  };

  return {
    close: () => browser.close(),
    render,
  };
};

export const renderPdf = async ({ executablePath, ...request }: RenderPdfOptions) => {
  const renderer = await launchPdfRenderer(executablePath);

  try {
    return await renderer.render(request);
  } finally {
    await renderer.close();
  }
};
