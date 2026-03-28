import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ConfigLoadResult, MdreaderConfig } from "../types";
import { type ConfigDiagnostic, isValidTheme } from "../types";

const CONFIG_FIELDS = new Set(["description", "theme", "title"]);

export const CONFIG_FILENAME = "mdreader.json";

export const getDefaultConfig = (dir: string): MdreaderConfig => ({
  title: path.basename(dir),
  description: "",
  theme: "neutral",
});

export const loadConfig = async (dir: string): Promise<ConfigLoadResult> => {
  const configPath = path.join(dir, CONFIG_FILENAME);
  const hasConfig = existsSync(configPath);
  const defaults = getDefaultConfig(dir);
  const diagnostics: ConfigDiagnostic[] = [];

  if (!hasConfig) {
    return {
      config: defaults,
      configPath,
      diagnostics,
      found: false,
    };
  }

  try {
    const configLabel = path.basename(configPath);
    const rawConfig: unknown = JSON.parse(await readFile(configPath, "utf8"));
    if (typeof rawConfig !== "object" || rawConfig === null) {
      diagnostics.push({
        level: "error",
        message: `${configLabel} must contain a JSON object.`,
      });

      return {
        config: defaults,
        configPath,
        diagnostics,
        found: true,
      };
    }

    const config = rawConfig as Record<string, unknown>;

    for (const field of Object.keys(config)) {
      if (CONFIG_FIELDS.has(field)) continue;
      diagnostics.push({
        level: "warn",
        message: `Unknown config field "${field}" will be ignored.`,
      });
    }

    const title = config["title"];
    const description = config["description"];
    const theme = config["theme"];

    if (title !== undefined && typeof title !== "string") {
      diagnostics.push({
        level: "warn",
        message: `Config field "title" must be a string.`,
      });
    }
    if (description !== undefined && typeof description !== "string") {
      diagnostics.push({
        level: "warn",
        message: `Config field "description" must be a string.`,
      });
    }
    if (theme !== undefined && !isValidTheme(theme)) {
      diagnostics.push({
        level: "warn",
        message: `Config field "theme" must be one of the supported theme names.`,
      });
    }

    return {
      config: {
        title: typeof title === "string" ? title : defaults.title,
        description: typeof description === "string" ? description : defaults.description,
        theme: isValidTheme(theme) ? theme : defaults.theme,
      },
      configPath,
      diagnostics,
      found: true,
    };
  } catch (error) {
    diagnostics.push({
      level: "error",
      message: `Failed to parse ${path.basename(configPath)}: ${error instanceof Error ? error.message : String(error)}`,
    });

    return {
      config: defaults,
      configPath,
      diagnostics,
      found: true,
    };
  }
};
