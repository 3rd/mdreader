import type { PageInfo, PageTree, PageTreeFolderNode, PageTreeNode, PageTreePageNode } from "../types";
import { pageUrl, titleFromSlug } from "../utils";

const DEFAULT_SIDEBAR_ORDER = 999;

// numeric collation keeps "item 2" ahead of "item 10" in the sidebar
const SIDEBAR_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

const createFolderNode = (name: string): PageTreeFolderNode => {
  return {
    type: "folder",
    name,
    children: [],
  };
};

const getFolderPath = (page: PageInfo) => {
  if (page.slugs.length === 0) return null;
  if (page.slug === "index") return page.slugs.join("/");
  if (page.slugs.length === 1) return null;

  return page.slugs.slice(0, -1).join("/");
};

const getOrCreateFolder = (
  folders: Map<string, PageTreeFolderNode>,
  tree: PageTree,
  folderPath: string,
): PageTreeFolderNode => {
  const parts = folderPath.split("/");
  let currentPath = "";
  let folder: PageTreeFolderNode | undefined;
  let parentChildren = tree.children;

  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;

    const existing = folders.get(currentPath);
    if (existing) {
      folder = existing;
      parentChildren = existing.children;
      continue;
    }

    folder = createFolderNode(titleFromSlug(part));
    folders.set(currentPath, folder);
    parentChildren.push(folder);
    parentChildren = folder.children;
  }

  if (!folder) throw new Error(`invalid folder path: ${folderPath}`);
  return folder;
};

const comparePageTreeNodes = (
  left: PageTreeNode,
  right: PageTreeNode,
  pinnedNodes: WeakSet<PageTreeNode>,
  sidebarOrderByNode: WeakMap<PageTreeNode, number>,
) => {
  const leftIsPinned = pinnedNodes.has(left);
  const rightIsPinned = pinnedNodes.has(right);
  if (leftIsPinned !== rightIsPinned) return leftIsPinned ? -1 : 1;

  const leftOrder = sidebarOrderByNode.get(left) ?? DEFAULT_SIDEBAR_ORDER;
  const rightOrder = sidebarOrderByNode.get(right) ?? DEFAULT_SIDEBAR_ORDER;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;

  const nameOrder = SIDEBAR_COLLATOR.compare(left.name, right.name);
  if (nameOrder !== 0) return nameOrder;

  if (left.type !== right.type) return left.type.localeCompare(right.type);
  if (left.type === "page" && right.type === "page") return left.url.localeCompare(right.url);

  return 0;
};

const sortTreeChildren = (
  children: PageTreeNode[],
  pinnedNodes: WeakSet<PageTreeNode>,
  sidebarOrderByNode: WeakMap<PageTreeNode, number>,
) => {
  children.sort((left, right) => comparePageTreeNodes(left, right, pinnedNodes, sidebarOrderByNode));

  for (const child of children) {
    if (child.type !== "folder") continue;
    sortTreeChildren(child.children, pinnedNodes, sidebarOrderByNode);
  }
};

export const buildPageTree = (pages: Map<string, PageInfo>, rootName: string): PageTree => {
  const tree: PageTree = { name: rootName, children: [] };
  const folders = new Map<string, PageTreeFolderNode>();
  const pinnedNodes = new WeakSet<PageTreeNode>();
  const sidebarOrderByNode = new WeakMap<PageTreeNode, number>();

  const sortedPages = Array.from(pages.entries()).toSorted(([leftSlug, left], [rightSlug, right]) => {
    if (left.order !== right.order) return left.order - right.order;

    const titleOrder = SIDEBAR_COLLATOR.compare(left.title, right.title);
    if (titleOrder !== 0) return titleOrder;

    return leftSlug.localeCompare(rightSlug);
  });

  for (const [slugPath, page] of sortedPages) {
    const node: PageTreePageNode = {
      type: "page",
      name: page.title,
      url: pageUrl(slugPath),
    };

    if (page.slugs.length === 0 && !page.hasExplicitOrder) {
      pinnedNodes.add(node);
    }

    sidebarOrderByNode.set(node, page.order);

    if (page.slugs.length === 0) {
      tree.children.unshift(node);
      continue;
    }

    const folderPath = getFolderPath(page);
    if (!folderPath) {
      tree.children.push(node);
      continue;
    }

    const folder = getOrCreateFolder(folders, tree, folderPath);
    sidebarOrderByNode.set(folder, sidebarOrderByNode.get(folder) ?? DEFAULT_SIDEBAR_ORDER);

    if (page.slug === "index") {
      folder.index = node;
      sidebarOrderByNode.set(folder, page.order);
      continue;
    }

    folder.children.push(node);
  }

  sortTreeChildren(tree.children, pinnedNodes, sidebarOrderByNode);
  return tree;
};
