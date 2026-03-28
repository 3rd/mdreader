---
title: Writing Content
description: Markdown authoring features supported by mdreader
order: 1
---

# Writing Content

## Frontmatter

mdreader supports optional YAML frontmatter at the top of a page:

```yaml
---
title: Getting Started
description: How to set up your project
order: 5
---
```

| Field | Default | Description |
|---|---|---|
| `title` | First `<h1>` or filename | Page title |
| `description` | `""` | Used in page metadata and search results |
| `order` | `999` | Sidebar sort order, lower values first |

## Frontmatter is optional

If you skip frontmatter, mdreader can still render the page. The title comes from the first `#` heading, the description stays empty, and the page sorts late unless you add an explicit `order`.

See [Frontmatter Is Optional](/no-frontmatter) for a page that demonstrates the fallback behavior on purpose.

## Supported Markdown

mdreader uses GitHub Flavored Markdown, so tables, task lists, strikethrough, autolinked URLs, blockquotes, and fenced code blocks all work out of the box.

## Callouts

mdreader supports GitHub-style callouts:

> [!NOTE]
> Notes are useful for extra context.

> [!TIP]
> Tips work well for shortcuts and best practices.

> [!IMPORTANT]
> Use important callouts for constraints and requirements.

> [!WARNING]
> Warnings are good for risky operations.

> [!CAUTION]
> Caution callouts fit destructive or hard-to-reverse steps.

## Code blocks

Fenced code blocks render with syntax highlighting:

```typescript
interface Config {
  title: string;
  theme: "neutral" | "ocean" | "purple";
}
```

```bash
mdreader ./docs --watch --open
```

## Mermaid diagrams

Use fenced `mermaid` blocks for diagrams. mdreader renders them in the browser and lets readers expand them for a larger view.

See [Diagrams](/guides/diagrams) for working examples.

## Links and assets

Regular Markdown links work as expected. Internal links navigate inside the docs app, and links to local assets keep pointing at files in your content directory.

Examples:

- [Back to home](/)
- [CLI Reference](/reference/cli)
- [Diagrams](/guides/diagrams)
- [Nested Folders and Routes](/guides/advanced/nested-page)
- [Frontmatter Is Optional](/no-frontmatter)

Asset links can point to images and common media files such as `.png`, `.svg`, `.pdf`, `.mp4`, and `.webm`.

## Headings and table of contents

Headings from level 2 through level 4 are collected into the page table of contents. If the same heading text appears more than once, mdreader generates unique heading IDs automatically.

## Ordering and folder structure

Use `order` in frontmatter when you need predictable sidebar sorting:

```yaml
---
title: API Overview
order: 2
---
```

Nested folders become nested groups in the sidebar, and `index.md` becomes a folder landing page.

See [Nested Folders and Routes](/guides/advanced/nested-page) for the path-to-URL rules.

## See also

- [Diagrams](/guides/diagrams)
- [Nested Folders and Routes](/guides/advanced/nested-page)
- [Frontmatter Is Optional](/no-frontmatter)
