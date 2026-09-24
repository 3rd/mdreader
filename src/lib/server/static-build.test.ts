import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as pdfRenderer from "./pdf-renderer";
import { buildStaticSite } from "./static-build";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "mdreader-static-"));
});

afterEach(() => {
  mock.restore();
  rmSync(directory, { recursive: true, force: true });
});

test("serves encoded page URLs during PDF export and writes decoded static files", async () => {
  const contentDir = path.join(directory, "docs");
  const outputDir = path.join(directory, "site");
  const slugPath = "a guide/café 100%";
  mkdirSync(path.join(contentDir, "a guide"), { recursive: true });
  writeFileSync(path.join(contentDir, `${slugPath}.md`), "# Encoded page\n\nContent.");
  writeFileSync(path.join(contentDir, "a guide", "an image.svg"), "<svg></svg>");

  const pdfBytes = Buffer.from("%PDF-fixture");
  spyOn(pdfRenderer, "findBrowserExecutable").mockReturnValue("/fixture/chrome");
  spyOn(pdfRenderer, "launchPdfRenderer").mockResolvedValue({
    close: () => Promise.resolve(),
    render: async ({ url }) => {
      const response = await fetch(url);
      expect(response.status).toBe(200);

      const data = await fetch(new URL("/api/page/a%20guide/caf%C3%A9%20100%25.json", url));
      expect(data.status).toBe(200);
      expect(await data.text()).toContain("Encoded page");
      return pdfBytes;
    },
  });

  await buildStaticSite({
    contentDir,
    outputDir,
    filters: { exclude: [], include: [] },
    pdfPaper: "letter",
    siteDescription: "",
    siteTitle: "Fixture",
    theme: "neutral",
  });

  expect(existsSync(path.join(outputDir, slugPath, "index.html"))).toBe(true);
  expect(readFileSync(path.join(outputDir, "api/page", `${slugPath}.json`), "utf8")).toContain(
    "Encoded page",
  );
  expect(readFileSync(path.join(outputDir, "api/page-preview", `${slugPath}.json`), "utf8")).toContain(
    "Encoded page",
  );
  expect(readFileSync(path.join(outputDir, "api/export/page", `${slugPath}.md`), "utf8")).toContain(
    "# Encoded page",
  );
  expect(readFileSync(path.join(outputDir, "api/export/page", `${slugPath}.html`), "utf8")).toContain(
    "Encoded page",
  );
  expect(readFileSync(path.join(outputDir, "api/export/page", `${slugPath}.json`), "utf8")).toContain(
    "Encoded page",
  );
  expect(readFileSync(path.join(outputDir, "a guide", "an image.svg"), "utf8")).toBe("<svg></svg>");
  expect(readFileSync(path.join(outputDir, "api/export/page", `${slugPath}.pdf`))).toEqual(pdfBytes);
});
