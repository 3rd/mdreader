import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CONFIG_FILENAME, loadConfig } from "./config";

describe("loadConfig", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "mdreader-config-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const writeConfig = (content: string) => {
    writeFileSync(path.join(dir, CONFIG_FILENAME), content);
  };

  test("returns defaults with found=false when no config exists", async () => {
    const result = await loadConfig(dir);

    expect(result.found).toBe(false);
    expect(result.diagnostics).toEqual([]);
    expect(result.config).toEqual({
      title: path.basename(dir),
      description: "",
      theme: "neutral",
    });
  });

  test("loads valid fields and keeps defaults for omitted ones", async () => {
    writeConfig(JSON.stringify({ title: "My Docs", theme: "ocean" }));
    const result = await loadConfig(dir);

    expect(result.found).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.config).toEqual({ title: "My Docs", description: "", theme: "ocean" });
  });

  test("warns on unknown fields and ignores them", async () => {
    writeConfig(JSON.stringify({ title: "Docs", sidebar: true }));
    const result = await loadConfig(dir);

    expect(result.diagnostics).toEqual([
      { level: "warn", message: 'Unknown config field "sidebar" will be ignored.' },
    ]);
    expect(result.config.title).toBe("Docs");
  });

  test("warns and falls back per field on wrong types and invalid theme", async () => {
    writeConfig(JSON.stringify({ title: 42, theme: "sparkle", description: "ok" }));
    const result = await loadConfig(dir);

    expect(result.diagnostics.map((diagnostic) => diagnostic.level)).toEqual(["warn", "warn"]);
    expect(result.config).toEqual({
      title: path.basename(dir),
      description: "ok",
      theme: "neutral",
    });
  });

  test("reports an error and returns defaults for invalid JSON", async () => {
    writeConfig("{ not json");
    const result = await loadConfig(dir);

    expect(result.found).toBe(true);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.level).toBe("error");
    expect(result.diagnostics[0]?.message).toStartWith(`Failed to parse ${CONFIG_FILENAME}:`);
    expect(result.config.theme).toBe("neutral");
  });

  test("reports an error when the config is not a JSON object", async () => {
    writeConfig('"just a string"');
    const result = await loadConfig(dir);

    expect(result.found).toBe(true);
    expect(result.diagnostics).toEqual([
      { level: "error", message: `${CONFIG_FILENAME} must contain a JSON object.` },
    ]);
  });
});
