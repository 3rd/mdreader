import type { PageInfo, PageTree, PageTreeFolderNode, PageTreePageNode } from "../types";
import { pageUrl, titleFromSlug } from "../utils";

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

export const buildPageTree = (pages: Map<string, PageInfo>, rootName: string): PageTree => {
  const tree: PageTree = { name: rootName, children: [] };
  const folders = new Map<string, PageTreeFolderNode>();

  const sortedPages = Array.from(pages.entries()).toSorted(([, left], [, right]) => {
    if (left.order !== right.order) return left.order - right.order;
    return left.title.localeCompare(right.title);
  });

  for (const [slugPath, page] of sortedPages) {
    const node: PageTreePageNode = {
      type: "page",
      name: page.title,
      url: pageUrl(slugPath),
    };

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

    if (page.slug === "index") {
      folder.index = node;
      continue;
    }

    folder.children.push(node);
  }

  return tree;
};
