import { describe, expect, test } from "bun:test";
import type { PageInfo } from "../types";
import { buildPageTree } from "./tree";

const createPage = (slugPath: string, overrides: Partial<PageInfo> = {}): PageInfo => {
  const slugs = slugPath === "" ? [] : slugPath.split("/");
  const slug = slugs.at(-1) ?? "";

  return {
    backlinks: [],
    internalLinks: [],
    slug,
    slugs,
    title: slug || "Home",
    description: "",
    order: 999,
    hasExplicitOrder: false,
    plainText: "",
    relativePath: slugPath ? `${slugPath}.md` : "index.md",
    segments: [],
    sourcePath: slugPath ? `/docs/${slugPath}.md` : "/docs/index.md",
    toc: [],
    ...overrides,
  };
};

const childNames = (tree: ReturnType<typeof buildPageTree>) => tree.children.map((node) => node.name);

describe("buildPageTree", () => {
  test("returns an empty tree with the root name for no pages", () => {
    const tree = buildPageTree(new Map(), "My Docs");
    expect(tree).toEqual({ name: "My Docs", children: [] });
  });

  test("pins the root page first unless it has an explicit order", () => {
    const pages = new Map([
      ["alpha", createPage("alpha", { order: 1, title: "Alpha" })],
      ["", createPage("", { title: "Home" })],
    ]);

    expect(childNames(buildPageTree(pages, "Docs"))).toEqual(["Home", "Alpha"]);
  });

  test("sorts by explicit order before title", () => {
    const pages = new Map([
      ["zeta", createPage("zeta", { order: 1, title: "Zeta" })],
      ["alpha", createPage("alpha", { title: "Alpha" })],
    ]);

    expect(childNames(buildPageTree(pages, "Docs"))).toEqual(["Zeta", "Alpha"]);
  });

  test("uses numeric collation so item 2 sorts before item 10", () => {
    const pages = new Map([
      ["item-10", createPage("item-10", { title: "Item 10" })],
      ["item-2", createPage("item-2", { title: "Item 2" })],
    ]);

    expect(childNames(buildPageTree(pages, "Docs"))).toEqual(["Item 2", "Item 10"]);
  });

  test("nests pages into folders and uses the folder index page order", () => {
    // guides/index.md scans to slug path "guides" with slug "index"
    const guidesIndex = createPage("guides", {
      slug: "index",
      order: 1,
      title: "Guides Home",
      hasExplicitOrder: true,
      relativePath: "guides/index.md",
    });
    const pages = new Map([
      ["guides/setup", createPage("guides/setup", { title: "Setup" })],
      ["guides", guidesIndex],
      ["about", createPage("about", { title: "About" })],
    ]);

    const tree = buildPageTree(pages, "Docs");
    expect(childNames(tree)).toEqual(["Guides", "About"]);

    const guides = tree.children[0];
    if (guides?.type !== "folder") throw new Error("expected a folder node");
    expect(guides.index?.name).toBe("Guides Home");
    expect(guides.children.map((node) => node.name)).toEqual(["Setup"]);
  });
});
