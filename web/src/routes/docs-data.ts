import type {
  Folder as DocsTreeFolder,
  Item as DocsTreeItem,
  Node as DocsTreeNode,
  Root as DocsTreeRoot,
} from "fumadocs-core/page-tree";
import type { ContentSegment, PageDataPayload, TocItem } from "../../../src/types";
import type { Route } from "./+types/docs";
import { API_TREE_JSON_PATH } from "../../../src/constants";
import { pageDataPath } from "../../../src/utils";

interface LoaderData {
  pagePath: string;
  tree: DocsTreeRoot;
  page: PageDataPayload;
  siteTitle: string;
}

interface TreeLoaderData {
  siteTitle: string;
  tree: DocsTreeRoot;
}

let cachedTreePayloadPromise: Promise<TreeLoaderData> | null = null;

const asRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value === "object" && value !== null) return value as Record<string, unknown>;
  throw new Error(`invalid ${label}`);
};

const parseContentSegment = (value: unknown): ContentSegment => {
  const segment = asRecord(value, "content segment");

  if (segment.type === "code" && typeof segment.lang === "string" && typeof segment.code === "string") {
    return {
      type: "code",
      lang: segment.lang,
      code: segment.code,
    };
  }

  if (segment.type === "html" && typeof segment.content === "string") {
    return {
      type: "html",
      content: segment.content,
    };
  }

  throw new Error("invalid content segment");
};

const parseTocItem = (value: unknown): TocItem => {
  const item = asRecord(value, "toc item");

  if (
    typeof item.title !== "string" ||
    typeof item.url !== "string" ||
    typeof item.depth !== "number" ||
    !Number.isFinite(item.depth)
  ) {
    throw new TypeError("invalid toc item");
  }

  return {
    title: item.title,
    url: item.url,
    depth: item.depth,
  };
};

const createDocsTreeItem = (name: string, url: string): DocsTreeItem => {
  return { type: "page", name, url };
};

const parseDocsTreeNode = (value: unknown): DocsTreeNode => {
  const node = asRecord(value, "page tree node");

  if (node.type === "page" && typeof node.name === "string" && typeof node.url === "string") {
    return createDocsTreeItem(node.name, node.url);
  }

  if (node.type === "separator" && typeof node.name === "string") {
    return {
      type: "separator",
      name: node.name,
    };
  }

  if (node.type === "folder" && typeof node.name === "string" && Array.isArray(node.children)) {
    const folder: DocsTreeFolder = {
      type: "folder",
      name: node.name,
      children: node.children.map(parseDocsTreeNode),
    };

    if (node.index !== undefined) {
      const indexNode = parseDocsTreeNode(node.index);
      if (indexNode.type !== "page") throw new Error("invalid page tree folder index");
      folder.index = indexNode;
    }

    return folder;
  }

  throw new Error("invalid page tree node");
};

const parseTreePayload = (value: unknown): TreeLoaderData => {
  const payload = asRecord(value, "tree payload");
  if (typeof payload.siteTitle !== "string") throw new Error("invalid tree payload");

  const rawTree = asRecord(payload.tree, "page tree");
  if (typeof rawTree.name !== "string" || !Array.isArray(rawTree.children)) {
    throw new TypeError("invalid page tree");
  }

  return {
    siteTitle: payload.siteTitle,
    tree: {
      name: rawTree.name,
      children: rawTree.children.map(parseDocsTreeNode),
    },
  };
};

const parsePageData = (value: unknown): PageDataPayload => {
  const page = asRecord(value, "page payload");
  if (typeof page.title !== "string" || typeof page.description !== "string") {
    throw new TypeError("invalid page payload");
  }
  if (!Array.isArray(page.segments) || !Array.isArray(page.toc)) {
    throw new TypeError("invalid page payload");
  }

  return {
    title: page.title,
    description: page.description,
    segments: page.segments.map(parseContentSegment),
    toc: page.toc.map(parseTocItem),
  };
};

const fetchJson = async <TResult>(url: string, parse: (value: unknown) => TResult): Promise<TResult> => {
  const response = await fetch(url);
  if (!response.ok) {
    // react router route boundaries use thrown responses for status-aware errors
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw new Response(response.status === 404 ? "Not found" : response.statusText, {
      status: response.status,
      statusText: response.statusText,
    });
  }

  return parse(await response.json());
};

export const invalidateTreePayload = () => {
  cachedTreePayloadPromise = null;
};

const getTreePayload = () => {
  cachedTreePayloadPromise ??= fetchJson(API_TREE_JSON_PATH, parseTreePayload).catch((error: unknown) => {
    cachedTreePayloadPromise = null;
    throw error;
  });
  return cachedTreePayloadPromise;
};

export const clientLoader = async ({ params }: Route.ClientLoaderArgs): Promise<LoaderData> => {
  const pagePath = params["*"]?.split("/").filter(Boolean).join("/") ?? "";

  const [treePayload, page] = await Promise.all([
    getTreePayload(),
    fetchJson(pageDataPath(pagePath), parsePageData),
  ]);

  return {
    pagePath,
    tree: treePayload.tree,
    page,
    siteTitle: treePayload.siteTitle,
  };
};
