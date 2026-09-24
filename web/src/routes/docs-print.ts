import { useEffect, useEffectEvent } from "react";
import {
  DOCUMENT_BUSY_SELECTOR,
  PAGE_PDF_EXPORT_EXTENSION,
  PDF_PAPER_QUERY_PARAM,
} from "../../../src/constants";
import { buildPagePdfExportPath, getPageExportName } from "../../../src/utils";

const DARK_THEME_CLASS = "dark";
const LIGHT_THEME_CLASS = "light";
const PRINT_THEME_RESTORE_ATTRIBUTE = "data-print-restore-color-scheme";
const PRINT_READY_TIMEOUT_MS = 10_000;
const LETTER_PAPER_REGIONS = new Set(["CA", "MX", "PH", "US"]);
const OBJECT_URL_REVOKE_DELAY_MS = 30_000;

const applyPrintTheme = () => {
  const root = document.documentElement;
  if (!root.classList.contains(DARK_THEME_CLASS)) return;

  root.setAttribute(PRINT_THEME_RESTORE_ATTRIBUTE, root.style.colorScheme);
  root.classList.replace(DARK_THEME_CLASS, LIGHT_THEME_CLASS);
  root.style.colorScheme = "light";
};

const restoreScreenTheme = () => {
  const root = document.documentElement;

  const colorScheme = root.getAttribute(PRINT_THEME_RESTORE_ATTRIBUTE);
  if (colorScheme === null) return;

  root.removeAttribute(PRINT_THEME_RESTORE_ATTRIBUTE);
  root.classList.replace(LIGHT_THEME_CLASS, DARK_THEME_CLASS);
  root.style.colorScheme = colorScheme;
};

const isPrintReady = () => document.querySelector(DOCUMENT_BUSY_SELECTOR) === null;

const waitForPrintReady = async () => {
  const deadline = performance.now() + PRINT_READY_TIMEOUT_MS;
  const shouldKeepWaiting = () => !isPrintReady() && performance.now() < deadline;

  while (shouldKeepWaiting()) {
    await new Promise((resolve) => {
      window.requestAnimationFrame(resolve);
    });
  }
};

export const printDocument = async () => {
  applyPrintTheme();
  await Promise.all([waitForPrintReady(), document.fonts.ready]);
  window.print();
};

const getPreferredPaperFormat = () => {
  const { region } = new Intl.Locale(navigator.language).maximize();

  const usesLetterPaper = region !== undefined && LETTER_PAPER_REGIONS.has(region);
  return usesLetterPaper ? "letter" : "a4";
};

export const downloadPagePdf = async (pagePath: string) => {
  const exportUrl = `${buildPagePdfExportPath(pagePath)}?${PDF_PAPER_QUERY_PARAM}=${getPreferredPaperFormat()}`;

  const response = await fetch(exportUrl);
  if (!response.ok) {
    throw new Error(await response.text());
  }

  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `${getPageExportName(pagePath)}.${PAGE_PDF_EXPORT_EXTENSION}`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), OBJECT_URL_REVOKE_DELAY_MS);
};

export const useDocumentPrinting = () => {
  const handleWindowKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const isPrintShortcut =
      (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "p";
    if (!isPrintShortcut) return;

    event.preventDefault();
    printDocument();
  });

  useEffect(() => {
    window.addEventListener("beforeprint", applyPrintTheme);
    window.addEventListener("afterprint", restoreScreenTheme);
    window.addEventListener("keydown", handleWindowKeyDown);

    return () => {
      window.removeEventListener("beforeprint", applyPrintTheme);
      window.removeEventListener("afterprint", restoreScreenTheme);
      window.removeEventListener("keydown", handleWindowKeyDown);
      restoreScreenTheme();
    };
  }, [handleWindowKeyDown]);
};
