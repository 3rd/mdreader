import cli from "gunsmith";
import { z } from "zod";
import packageJson from "../../package.json";
import { CLI_NAME } from "../constants";
import { isValidTheme, type Theme, VALID_THEMES } from "../types";

const CLI_VERSION = packageJson.version;
const CONTENT_TARGET_ARGS_SCHEMA = z.object({
  target: z.string().optional().describe("Docs directory or Markdown file"),
});
const INIT_TARGET_ARGS_SCHEMA = z.object({
  target: z.string().optional().describe("Docs directory"),
});

const globOptionsSchema = {
  exclude: z.array(z.string()).default([]).describe("Exclude markdown files matching a glob pattern"),
  include: z.array(z.string()).default([]).describe("Only include markdown files matching a glob pattern"),
};

const titleOptionSchema = z.string().optional().describe("Override the site title for this run");
const themeOptionSchema = z.string().optional();

const serveOptionsSchema = z.object({
  ...globOptionsSchema,
  host: z.string().optional().describe("Bind the server to a specific host or interface"),
  open: z.boolean().default(false).describe("Open in browser after starting").meta({ alias: "o" }),
  port: z.coerce
    .number()
    .optional()
    .describe("Port to serve on (default: auto-detect from 4000)")
    .meta({ alias: "p" }),
  theme: themeOptionSchema.describe("Override the configured theme for this run"),
  title: titleOptionSchema,
  watch: z.boolean().default(false).describe("Watch for file changes and live reload").meta({ alias: "w" }),
});

const doctorOptionsSchema = z.object(globOptionsSchema);

const buildOptionsSchema = z.object({
  ...globOptionsSchema,
  dest: z.string().optional().describe("Output directory for the built site (must not already exist)"),
  source: z.string().optional().describe("Markdown file or docs directory to build"),
  theme: themeOptionSchema.describe("Override the configured theme for this build"),
  title: titleOptionSchema.describe("Override the site title for this build"),
});

const initOptionsSchema = z.object({
  description: z.string().optional().describe("Initial site description"),
  force: z.boolean().default(false).describe("Overwrite an existing mdreader.json").meta({ alias: "f" }),
  theme: themeOptionSchema.describe("Initial site theme"),
  title: titleOptionSchema.describe("Initial site title"),
});

export interface ServeCommandInput {
  exclude: string[];
  host?: string;
  include: string[];
  open: boolean;
  port?: number;
  target?: string;
  theme?: Theme;
  title?: string;
  watch: boolean;
}

export interface DoctorCommandInput {
  exclude: string[];
  include: string[];
  target?: string;
}

export interface BuildCommandInput {
  dest?: string;
  exclude: string[];
  include: string[];
  source?: string;
  theme?: Theme;
  title?: string;
}

export interface InitCommandInput {
  description?: string;
  force: boolean;
  target?: string;
  theme?: Theme;
  title?: string;
}

interface CliCommandHandlers {
  build: (input: BuildCommandInput) => Promise<void>;
  doctor: (input: DoctorCommandInput) => Promise<void>;
  init: (input: InitCommandInput) => Promise<void>;
  serve: (input: ServeCommandInput) => Promise<void>;
}

const parseThemeOption = (value: string | undefined): Theme | undefined => {
  if (value === undefined) return undefined;
  if (isValidTheme(value)) return value;
  throw new Error(`theme must be one of: ${VALID_THEMES.join(", ")}`);
};

interface ServeRunContext {
  args: { target?: string };
  options: z.infer<typeof serveOptionsSchema>;
}

export const createMdreaderCli = (handlers: CliCommandHandlers) => {
  const runServe = ({ args, options }: ServeRunContext) =>
    handlers.serve({
      exclude: options.exclude,
      host: options.host,
      include: options.include,
      open: options.open,
      port: options.port,
      target: args.target,
      theme: parseThemeOption(options.theme),
      title: options.title,
      watch: options.watch,
    });

  const app = cli.create(CLI_NAME, {
    version: CLI_VERSION,
    description: "Serve markdown docs locally with search, live reload, and export/share endpoints.",
    args: CONTENT_TARGET_ARGS_SCHEMA,
    options: serveOptionsSchema,
    examples: [
      { command: CLI_NAME },
      { command: `${CLI_NAME} ./docs --open --watch` },
      { command: `${CLI_NAME} ./docs --host 0.0.0.0 --port 8080` },
      { command: `${CLI_NAME} ./docs --include 'guides/**' --exclude '**/drafts/**'` },
      { command: `${CLI_NAME} init ./docs` },
      { command: `${CLI_NAME} doctor ./docs` },
    ],
    run: runServe,
  });

  // inherits the root serve options; only args are re-declared (args do not inherit)
  app.command("serve", {
    description: "Serve markdown docs locally (explicit form of the default command).",
    args: CONTENT_TARGET_ARGS_SCHEMA,
    examples: [{ command: `${CLI_NAME} serve ./docs --open --watch` }],
    run: runServe,
  });

  app.command("build", {
    inheritOptions: false,
    description: "Build a deployable static docs site to disk.",
    options: buildOptionsSchema,
    examples: [
      { command: `${CLI_NAME} build --source ./docs --dest ./mdreader-dist` },
      { command: `${CLI_NAME} build --source ./docs --dest ./release/mdreader-dist` },
      {
        command: `${CLI_NAME} build --source ./docs --dest ./mdreader-dist --include 'guides/**' --exclude '**/drafts/**'`,
      },
    ],
    run: ({ options }) =>
      handlers.build({
        dest: options.dest,
        exclude: options.exclude,
        include: options.include,
        source: options.source,
        theme: parseThemeOption(options.theme),
        title: options.title,
      }),
  });

  app.command("doctor", {
    inheritOptions: false,
    description: "Validate config, content discovery, parsed pages, port availability, and client assets.",
    args: CONTENT_TARGET_ARGS_SCHEMA,
    options: doctorOptionsSchema,
    examples: [
      { command: `${CLI_NAME} doctor` },
      { command: `${CLI_NAME} doctor ./docs` },
      { command: `${CLI_NAME} doctor ./docs --include 'guides/**'` },
    ],
    run: ({ args, options }) =>
      handlers.doctor({
        exclude: options.exclude,
        include: options.include,
        target: args.target,
      }),
  });

  app.command("init", {
    inheritOptions: false,
    description: "Create a starter mdreader.json.",
    args: INIT_TARGET_ARGS_SCHEMA,
    options: initOptionsSchema,
    examples: [
      { command: `${CLI_NAME} init` },
      { command: `${CLI_NAME} init ./docs` },
      { command: `${CLI_NAME} init ./docs --theme ocean --title 'My Docs'` },
    ],
    run: ({ args, options }) =>
      handlers.init({
        description: options.description,
        force: options.force,
        target: args.target,
        theme: parseThemeOption(options.theme),
        title: options.title,
      }),
  });

  return app;
};

