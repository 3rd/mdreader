import p from "picoprint";
import type { ConfigDiagnostic } from "../types";
import { CLI_NAME } from "../constants";
import { CONFIG_FILENAME } from "../lib/config";

const UNSUPPORTED_FILE_PREVIEW_LIMIT = 3;

export interface DoctorCheck {
  detail: string;
  fix?: string;
  label: string;
  status: "error" | "ok" | "warn";
}

const formatUnsupportedMdxMessage = (unsupportedFiles: string[]) => {
  const preview = unsupportedFiles.slice(0, UNSUPPORTED_FILE_PREVIEW_LIMIT).join(", ");
  const remainingCount =
    unsupportedFiles.length - Math.min(unsupportedFiles.length, UNSUPPORTED_FILE_PREVIEW_LIMIT);
  const suffix = remainingCount > 0 ? `, +${remainingCount} more` : "";
  return `Skipping ${unsupportedFiles.length} unsupported .mdx file(s): ${preview}${suffix}`;
};

export const printUnsupportedMdxWarning = (unsupportedFiles: string[]) => {
  if (unsupportedFiles.length === 0) return;
  console.log(p.yellow(formatUnsupportedMdxMessage(unsupportedFiles)));
};

export const printDoctorChecks = (checks: DoctorCheck[]) => {
  for (const check of checks) {
    let prefix = p.red("❌");
    if (check.status === "ok") prefix = p.green("✅");
    if (check.status === "warn") prefix = p.yellow("⚠️");

    console.log(`${prefix} ${p.bold(check.label)}: ${check.detail}`);
    if (check.fix) console.log(p.gray(`   fix: ${check.fix}`));
  }
};

export const printConfigDiagnostics = (configPath: string, diagnostics: ConfigDiagnostic[]) => {
  for (const diagnostic of diagnostics) {
    const prefix = diagnostic.level === "error" ? p.red("config error") : p.yellow("config warning");
    console.log(`${prefix} ${configPath}: ${diagnostic.message}`);
  }
};

export const getMissingConfigCheck = () => {
  return {
    status: "warn",
    label: "config",
    detail: `No ${CONFIG_FILENAME} found. Defaults will be used.`,
    fix: `Run \`${CLI_NAME} init\` to create a starter config.`,
  } satisfies DoctorCheck;
};

export const getUnsupportedFilesCheck = (unsupportedFiles: string[]) => {
  return {
    status: "warn",
    label: "unsupported files",
    detail: formatUnsupportedMdxMessage(unsupportedFiles),
    fix: "Convert those files to .md if you want mdreader to include them.",
  } satisfies DoctorCheck;
};
