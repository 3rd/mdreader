import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import p from "picoprint";
import type { ConfigLoadResult, FileFilters } from "../types";
import { CLI_NAME } from "../constants";
import { CONFIG_FILENAME, getDefaultConfig, loadConfig } from "../lib/config";
import { parseMarkdownFile, scanMarkdownFiles } from "../lib/parser";
import { findAvailablePort } from "../lib/port";
import { buildStaticSite, getClientAssetStatus, startServer } from "../server";
import { parseBuildArgv, parseDoctorArgv, parseInitArgv, parseServeArgv } from "./argv";
import { getServeUrls, openInBrowser } from "./browser";
import {
  countMarkdownFiles,
  createFileFilters,
  findUnsupportedMdxFiles,
  resolveInitDirectory,
  resolveTarget,
} from "./content-files";
import {
  type DoctorCheck,
  getMissingConfigCheck,
  getUnsupportedFilesCheck,
  printConfigDiagnostics,
  printDoctorChecks,
  printUnsupportedMdxWarning,
} from "./output";
import { startWatcher } from "./watch";

interface ContentCommandContext {
  configResult: ConfigLoadResult;
  contentDir: string;
  filters: FileFilters;
  singleFile?: string;
  unsupportedFiles: string[];
}

const loadContentCommandContext = async (
  target: string | undefined,
  include: string[] | undefined,
  exclude: string[] | undefined,
): Promise<ContentCommandContext> => {
  const { contentDir, singleFile } = resolveTarget(target);
  const filters = createFileFilters(include, exclude);

  return {
    configResult: await loadConfig(contentDir),
    contentDir,
    filters,
    singleFile,
    unsupportedFiles: singleFile ? [] : findUnsupportedMdxFiles(contentDir, filters),
  };
};

const printContentRunWarnings = ({ configResult, unsupportedFiles }: ContentCommandContext) => {
  if (configResult.diagnostics.length > 0) {
    printConfigDiagnostics(configResult.configPath, configResult.diagnostics);
  }
  printUnsupportedMdxWarning(unsupportedFiles);
};

const printDiscoveredMarkdownFiles = (
  action: "building" | "serving",
  { contentDir, filters, singleFile }: ContentCommandContext,
) => {
  if (singleFile) {
    console.log(p.blue(`${action} ${path.basename(singleFile)}`));
    return;
  }

  const fileCount = countMarkdownFiles(contentDir, filters);
  if (fileCount === 0) {
    const filteredSuffix =
      filters.include.length > 0 || filters.exclude.length > 0 ?
        " for the current include/exclude filters"
      : "";
    throw new Error(`no markdown files found in ${contentDir}${filteredSuffix}`);
  }

  console.log(p.blue(`found ${fileCount} markdown file(s)`));
};

const resolveSiteTitle = (
  title: string | undefined,
  { configResult, singleFile }: Pick<ContentCommandContext, "configResult" | "singleFile">,
) => {
  if (title) return title;
  if (!singleFile) return configResult.config.title;
  return path.basename(singleFile, path.extname(singleFile));
};

const runServeCommand = async (argv: string[]) => {
  const parsed = parseServeArgv(argv);
  const include = parsed.flags["include"];
  const exclude = parsed.flags["exclude"];
  const host = parsed.flags["host"];
  const open = parsed.flags["open"];
  const portFlag = parsed.flags["port"];
  const theme = parsed.flags["theme"];
  const title = parsed.flags["title"];
  const watch = parsed.flags["watch"];
  const content = await loadContentCommandContext(parsed._.target, include, exclude);
  const { configResult, contentDir, filters, singleFile } = content;

  printContentRunWarnings(content);
  printDiscoveredMarkdownFiles("serving", content);

  const port = await findAvailablePort(portFlag);
  const siteTitle = resolveSiteTitle(title, content);
  const serveUrls = getServeUrls(host, port);
  const server = await startServer({
    contentDir,
    filters,
    host,
    singleFile,
    port,
    siteDescription: configResult.config.description,
    siteTitle,
    theme: theme ?? configResult.config.theme,
  });

  console.log(p.green(`\n  ${CLI_NAME} serving ${siteTitle}`));
  for (const url of serveUrls.urls) {
    console.log(p.cyan(`  ${url}`));
  }

  if (watch) {
    startWatcher(contentDir, filters, server.refresh, server.reloadClientAssets, singleFile);
  } else {
    console.log("");
  }

  if (open) openInBrowser(serveUrls.browserUrl);
};

const runDoctorCommand = async (argv: string[]) => {
  const parsed = parseDoctorArgv(argv);
  const include = parsed.flags["include"];
  const exclude = parsed.flags["exclude"];
  const content = await loadContentCommandContext(parsed._.target, include, exclude);
  const { configResult, contentDir, filters, singleFile, unsupportedFiles } = content;
  const checks: DoctorCheck[] = [];

  if (!configResult.found) {
    checks.push(getMissingConfigCheck());
  } else if (configResult.diagnostics.length === 0) {
    checks.push({
      status: "ok",
      label: "config",
      detail: `Loaded ${configResult.configPath}.`,
    });
  }

  for (const diagnostic of configResult.diagnostics) {
    checks.push({
      status: diagnostic.level,
      label: "config",
      detail: diagnostic.message,
    });
  }

  if (unsupportedFiles.length > 0) checks.push(getUnsupportedFilesCheck(unsupportedFiles));

  try {
    if (singleFile) {
      const slug = path.basename(singleFile, path.extname(singleFile));
      parseMarkdownFile(singleFile, slug, [], contentDir, { servedSourcePath: singleFile });
      checks.push({
        status: "ok",
        label: "content",
        detail: `Parsed ${path.basename(singleFile)} successfully.`,
      });
    } else {
      const pages = scanMarkdownFiles(contentDir, filters);
      if (pages.size === 0) {
        checks.push({
          status: "error",
          label: "content",
          detail: "No markdown files were found.",
          fix: "Pass a docs directory or relax the include/exclude filters.",
        });
      } else {
        checks.push({
          status: "ok",
          label: "content",
          detail: `Found and parsed ${pages.size} markdown file(s).`,
        });
        if (!pages.has("")) {
          checks.push({
            status: "warn",
            label: "root page",
            detail: "No root index page was found.",
            fix: "Add an `index.md`, `INDEX.md`, or `README.md` to customize the landing page.",
          });
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({
      status: "error",
      label: "content",
      detail: message,
    });
  }

  const assetStatus = getClientAssetStatus();
  checks.push(
    assetStatus.ok ?
      {
        status: "ok",
        label: "client assets",
        detail: "Client assets are available.",
      }
    : {
        status: "error",
        label: "client assets",
        detail: assetStatus.message ?? "Client assets are unavailable.",
      },
  );

  const availablePort = await findAvailablePort();
  checks.push({
    status: "ok",
    label: "port",
    detail: `First available port is ${availablePort}.`,
  });

  printDoctorChecks(checks);

  if (checks.some((check) => check.status === "error")) {
    process.exitCode = 1;
  }
};

const runBuildCommand = async (argv: string[]) => {
  const parsed = parseBuildArgv(argv);
  const dest = parsed.flags.dest;
  const exclude = parsed.flags.exclude;
  const include = parsed.flags.include;
  const source = parsed.flags.source;
  const theme = parsed.flags.theme;
  const title = parsed.flags.title;

  if (!source) throw new Error("build requires --source <path>");
  if (!dest) throw new Error("build requires --dest <dir>");

  const content = await loadContentCommandContext(source, include, exclude);
  const { configResult, contentDir, filters, singleFile } = content;
  const outputDir = path.resolve(dest);
  if (existsSync(outputDir)) {
    throw new Error(`build destination already exists: ${outputDir}`);
  }

  printContentRunWarnings(content);
  printDiscoveredMarkdownFiles("building", content);

  const siteTitle = resolveSiteTitle(title, content);
  const buildResult = await buildStaticSite({
    contentDir,
    filters,
    outputDir,
    singleFile,
    siteDescription: configResult.config.description,
    siteTitle,
    theme: theme ?? configResult.config.theme,
  });

  console.log(p.green(`\n  ${CLI_NAME} built ${siteTitle}`));
  console.log(p.cyan(`  ${buildResult.outputDir}`));
  console.log(p.gray(`  ${buildResult.pageCount} page(s)\n`));
};

const runInitCommand = async (argv: string[]) => {
  const parsed = parseInitArgv(argv);
  const description = parsed.flags["description"];
  const force = parsed.flags["force"];
  const theme = parsed.flags["theme"];
  const title = parsed.flags["title"];
  const contentDir = resolveInitDirectory(parsed._.target);
  const configPath = path.join(contentDir, CONFIG_FILENAME);
  const hasConfig = existsSync(configPath);

  if (hasConfig && !force) {
    throw new Error(`${CONFIG_FILENAME} already exists at ${configPath}. Use --force to overwrite it.`);
  }

  const defaultConfig = getDefaultConfig(contentDir);
  const config = {
    title: title ?? defaultConfig.title,
    description: description ?? defaultConfig.description,
    theme: theme ?? defaultConfig.theme,
  };

  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(p.green(`created ${configPath}`));
};

export const runCli = async () => {
  const argv = process.argv.slice(2);
  const [subcommand, ...rest] = argv;

  switch (subcommand) {
    case "doctor": {
      await runDoctorCommand(rest);
      return;
    }
    case "build": {
      await runBuildCommand(rest);
      return;
    }
    case "init": {
      await runInitCommand(rest);
      return;
    }
    case "serve": {
      await runServeCommand(rest);
      return;
    }
    default: {
      await runServeCommand(argv);
    }
  }
};
