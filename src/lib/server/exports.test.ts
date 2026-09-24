import { afterEach, expect, mock, spyOn, test } from "bun:test";
import type { PageInfo } from "../../types";
import { createPagePdfExporter } from "./exports";
import * as pdfRenderer from "./pdf-renderer";

const createRequest = () => ({
  linkOrigin: "http://localhost:4000",
  pages: new Map<string, PageInfo>([
    [
      "guide",
      {
        backlinks: [],
        description: "",
        hasExplicitOrder: false,
        internalLinks: [],
        order: 999,
        plainText: "Guide",
        relativePath: "guide.md",
        segments: [],
        slug: "guide",
        slugs: ["guide"],
        sourcePath: "/docs/guide.md",
        title: "Guide",
        toc: [],
      },
    ],
  ]),
  paper: null,
  renderOrigin: "http://localhost:4000",
  slugPath: "",
});

afterEach(() => {
  mock.restore();
});

test("rejects overlapping page exports and releases admission after success", async () => {
  const request = createRequest();
  const pdfBytes = Buffer.from("%PDF-fixture");
  spyOn(pdfRenderer, "findBrowserExecutable").mockReturnValue("/fixture/chrome");
  const pending = Promise.withResolvers<typeof pdfBytes>();
  spyOn(pdfRenderer, "renderPdf").mockReturnValueOnce(pending.promise).mockResolvedValue(pdfBytes);
  const exportPagePdf = createPagePdfExporter();

  const first = exportPagePdf(request);
  const rejected = await exportPagePdf({ ...request, slugPath: "guide" });
  expect(rejected.status).toBe(429);

  const separateServer = await createPagePdfExporter()(request);
  expect(separateServer.body).toEqual(pdfBytes);

  pending.resolve(pdfBytes);
  const completed = await first;
  expect(completed.body).toEqual(pdfBytes);

  const next = await exportPagePdf({ ...request, slugPath: "guide" });
  expect(next.body).toEqual(pdfBytes);
  expect(next.contentType).toBe("application/pdf");
});

test("releases PDF admission after a renderer failure", async () => {
  const request = createRequest();
  const pdfBytes = Buffer.from("%PDF-fixture");
  spyOn(pdfRenderer, "findBrowserExecutable").mockReturnValue("/fixture/chrome");
  const pending = Promise.withResolvers<typeof pdfBytes>();
  spyOn(pdfRenderer, "renderPdf").mockReturnValueOnce(pending.promise).mockResolvedValue(pdfBytes);
  const exportPagePdf = createPagePdfExporter();

  const first = exportPagePdf(request);
  const rejected = await exportPagePdf(request);
  expect(rejected.status).toBe(429);

  pending.reject(new Error("browser closed"));
  const failed = await first;
  expect(failed.status).toBe(500);
  expect(failed.body).toBe("PDF export failed: browser closed");

  const next = await exportPagePdf(request);
  expect(next.body).toEqual(pdfBytes);
});
