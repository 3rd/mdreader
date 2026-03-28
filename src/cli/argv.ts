import { cli as cleye } from "cleye";
import packageJson from "../../package.json";
import { CLI_NAME } from "../constants";
import { isValidTheme, type Theme, VALID_THEMES } from "../types";

const CLI_VERSION = packageJson.version;
const TARGET_PARAMETER: ["[target]"] = ["[target]"];

const GLOB_FLAGS = {
  exclude: {
    type: [String],
    description: "Exclude markdown files matching a glob pattern",
    placeholder: "<glob>",
  },
  include: {
    type: [String],
    description: "Only include markdown files matching a glob pattern",
    placeholder: "<glob>",
  },
} as const;

const TITLE_FLAG = {
  type: String,
  description: "Override the site title for this run",
  placeholder: "<title>",
} as const;

const parseThemeFlag = (value: string): Theme => {
  if (isValidTheme(value)) return value;
  throw new Error(`theme must be one of: ${VALID_THEMES.join(", ")}`);
};

const overrideThemeFlag = (description: string) => ({
  type: parseThemeFlag,
  description,
  placeholder: "<theme>",
});

export const parseServeArgv = (argv: string[]) =>
  cleye(
    {
      name: CLI_NAME,
      version: CLI_VERSION,
      help: {
        description: "Serve markdown docs locally with search, live reload, and export/share endpoints.",
        examples: [
          CLI_NAME,
          `${CLI_NAME} ./docs --open --watch`,
          `${CLI_NAME} ./docs --host 0.0.0.0 --port 8080`,
          `${CLI_NAME} ./docs --include 'guides/**' --exclude '**/drafts/**'`,
          `${CLI_NAME} init ./docs`,
          `${CLI_NAME} doctor ./docs`,
        ],
      },
      parameters: TARGET_PARAMETER,
      flags: {
        ...GLOB_FLAGS,
        host: {
          type: String,
          description: "Bind the server to a specific host or interface",
          placeholder: "<host>",
        },
        open: {
          type: Boolean,
          alias: "o",
          default: false,
          description: "Open in browser after starting",
        },
        port: {
          type: Number,
          alias: "p",
          description: "Port to serve on (default: auto-detect from 4000)",
        },
        theme: overrideThemeFlag("Override the configured theme for this run"),
        title: TITLE_FLAG,
        watch: {
          type: Boolean,
          alias: "w",
          default: false,
          description: "Watch for file changes and live reload",
        },
      },
    },
    undefined,
    argv,
  );

export const parseDoctorArgv = (argv: string[]) =>
  cleye(
    {
      name: CLI_NAME,
      version: CLI_VERSION,
      help: {
        description:
          "Validate config, content discovery, parsed pages, port availability, and client assets.",
        examples: [
          `${CLI_NAME} doctor`,
          `${CLI_NAME} doctor ./docs`,
          `${CLI_NAME} doctor ./docs --include 'guides/**'`,
        ],
        usage: `${CLI_NAME} doctor [target] [flags]`,
      },
      parameters: TARGET_PARAMETER,
      flags: GLOB_FLAGS,
    },
    undefined,
    argv,
  );

export const parseBuildArgv = (argv: string[]) =>
  cleye(
    {
      name: CLI_NAME,
      version: CLI_VERSION,
      help: {
        description: "Build a deployable static docs site to disk.",
        examples: [
          `${CLI_NAME} build --source ./docs --dest ./mdreader-dist`,
          `${CLI_NAME} build --source ./docs --dest ./release/mdreader-dist`,
          `${CLI_NAME} build --source ./docs --dest ./mdreader-dist --include 'guides/**' --exclude '**/drafts/**'`,
        ],
        usage: `${CLI_NAME} build --source <path> --dest <dir> [flags]`,
      },
      parameters: [] as const,
      flags: {
        ...GLOB_FLAGS,
        dest: {
          type: String,
          description: "Output directory for the built site (must not already exist)",
          placeholder: "<dir>",
        },
        source: {
          type: String,
          description: "Markdown file or docs directory to build",
          placeholder: "<path>",
        },
        theme: overrideThemeFlag("Override the configured theme for this build"),
        title: {
          ...TITLE_FLAG,
          description: "Override the site title for this build",
        },
      },
    },
    undefined,
    argv,
  );

export const parseInitArgv = (argv: string[]) =>
  cleye(
    {
      name: CLI_NAME,
      version: CLI_VERSION,
      help: {
        description: "Create a starter mdreader.json.",
        examples: [
          `${CLI_NAME} init`,
          `${CLI_NAME} init ./docs`,
          `${CLI_NAME} init ./docs --theme ocean --title 'My Docs'`,
        ],
        usage: `${CLI_NAME} init [target] [flags]`,
      },
      parameters: TARGET_PARAMETER,
      flags: {
        description: {
          type: String,
          description: "Initial site description",
          placeholder: "<description>",
        },
        force: {
          type: Boolean,
          alias: "f",
          default: false,
          description: "Overwrite an existing mdreader.json",
        },
        theme: overrideThemeFlag("Initial site theme"),
        title: {
          ...TITLE_FLAG,
          description: "Initial site title",
        },
      },
    },
    undefined,
    argv,
  );
