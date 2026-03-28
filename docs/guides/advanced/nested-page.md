---
title: Nested Folders and Routes
description: How nested folders map to sidebar groups and URLs
order: 3
---

# Nested Folders and Routes

mdreader uses your directory structure to build the sidebar and page URLs.

## Folder structure becomes navigation

A nested Markdown file like `guides/advanced/nested-page.md` appears in the sidebar as `Guides > Advanced > Nested Folders and Routes`.

Top-level files stay at the root of the docs tree. Nested folders become nested groups automatically.

## Path to URL examples

| File path | URL |
|---|---|
| `index.md` | `/` |
| `guides/installation.md` | `/guides/installation` |
| `guides/advanced/nested-page.md` | `/guides/advanced/nested-page` |
| `reference/config.md` | `/reference/config` |

## Folder landing pages

If a folder contains an `index.md`, mdreader uses that page as the folder landing page.

Examples:

| File path | URL |
|---|---|
| `guides/index.md` | `/guides` |
| `reference/index.md` | `/reference` |

Without an `index.md`, the folder still appears in the sidebar, but it only groups its child pages.

## When to use nesting

Use nested folders when you want related pages grouped together or when a topic needs its own URL section. Keep the directory structure close to the mental model you want readers to see in the sidebar.

`order` still controls page sorting inside a folder, so you can keep nested sections predictable when a folder contains several pages.

## See also

- [Writing Content](/guides/writing-content)
- [CLI Reference](/reference/cli)
