# mdreader


A CLI that turns a folder of Markdown files into a polished local docs site with sidebar navigation, full-text search, syntax highlighting, Mermaid diagrams, and live reload. Built on [Fumadocs](https://www.fumadocs.dev/).

```bash
bun add -g mdreader
pnpm add -g mdreader
npm install -g mdreader
```


Or run without installing: `bunx mdreader ./docs --open`

## Quick Start

```bash
mdreader ./docs --open            # serve a docs directory and open in browser
mdreader ./docs --watch --open    # serve with live reload
mdreader ./README.md              # serve a single markdown file
mdreader doctor ./docs            # validate your docs tree
mdreader build --source ./docs --dest ./mdreader-dist  # build a static site
```

No configuration is needed. If you want a custom title, description, or theme, add an optional `mdreader.json` or run `mdreader init`.

## Commands

### `mdreader [target]`

Serve a directory or single Markdown file. This is the default command.

| Flag | Alias | Description |
|---|---|---|
| `--host <host>` | | Bind to a specific host or interface |
| `--port <number>` | `-p` | Port to serve on (default: auto-detect from 4000) |
| `--open` | `-o` | Open in browser after starting |
| `--watch` | `-w` | Watch for file changes and live reload |
| `--title <title>` | | Override the site title for this run |
| `--theme <theme>` | | Override the configured theme for this run |
| `--include <glob>` | | Only include files matching a glob pattern (repeatable) |
| `--exclude <glob>` | | Exclude files matching a glob pattern (repeatable) |

```bash
mdreader ./docs --host 0.0.0.0 --port 8080
mdreader ./docs --include 'guides/**' --exclude '**/drafts/**'
```

`mdreader serve [target]` is an explicit alias for this command.

### `mdreader build`

Build a deployable static site to disk. The destination directory must not already exist.

| Flag | Description |
|---|---|
| `--source <path>` | Markdown file or docs directory to build (required) |
| `--dest <dir>` | Output directory (required) |
| `--title <title>` | Override the site title |
| `--theme <theme>` | Override the configured theme |
| `--include <glob>` | Only include files matching a glob (repeatable) |
| `--exclude <glob>` | Exclude files matching a glob (repeatable) |

The output is a directory of static files that can be served by any static file server.

### `mdreader doctor [target]`

Validate your docs setup. Checks:

- Config loading and field validation
- Content discovery and parsing
- Unsupported `.mdx` files
- Client asset availability
- Port availability

| Flag | Description |
|---|---|
| `--include <glob>` | Only include files matching a glob (repeatable) |
| `--exclude <glob>` | Exclude files matching a glob (repeatable) |

Exits with code 1 if any check fails. It also warns when a docs directory does not have a root landing page file (`index.md`, `INDEX.md`, or `README.md`).

### `mdreader init [target]`

Create a starter `mdreader.json`.

| Flag | Alias | Description |
|---|---|---|
| `--title <title>` | | Initial site title |
| `--description <desc>` | | Initial site description |
| `--theme <theme>` | | Initial site theme |
| `--force` | `-f` | Overwrite an existing `mdreader.json` |

```bash
mdreader init ./docs --theme ocean --title 'My Docs'
```

## Configuration

**mdreader** works without configuration. To customize, add a `mdreader.json` in your content directory:

```json
{
  "title": "My Project",
  "description": "Project documentation",
  "theme": "ocean"
}
```

| Field | Default | Description |
|---|---|---|
| `title` | Directory name | Site title shown in the sidebar header |
| `description` | `""` | Site description used in metadata |
| `theme` | `neutral` | Color theme (see below) |

## Themes

Available values: `neutral`, `ocean`, `purple`, `catppuccin`, `dusk`, `emerald`, `ruby`, `solar`, `black`, `shadcn`, `vitepress`, `aspen`

Dark mode is automatic and follows your system preference.

## Writing Content

mdreader works with regular `.md` files. MDX is not supported.

### Frontmatter

```yaml
---
title: Getting Started
description: How to set up your project
order: 1
---
```

| Field | Default | Description |
|---|---|---|
| `title` | First `<h1>` or filename | Page title |
| `description` | `""` | Shown below the title and in search |
| `order` | `999` | Sort position in the sidebar; items with the same order are sorted alphanumerically, and the home page stays pinned first unless it has its own `order` |

### Supported features

- GitHub Flavored Markdown (tables, task lists, strikethrough, autolinks)
- Fenced code blocks with syntax highlighting (via [Shiki](https://shiki.style/))
- Mermaid diagram code fences (with expand/zoom)
- GitHub-style callouts: `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`
- Nested directory trees with `index.md` as the preferred folder landing page, with `INDEX.md` and `README.md` as fallbacks when `index.md` is missing
- Full-text search with `Cmd+K` / `Ctrl+K`
- Per-page actions menu (copy link, print, export as Markdown/HTML/JSON)

### Ignored directories

These directories are always skipped during content scanning: `.cache`, `.git`, `.next`, `.react-router`, `.source`, `build`, `dist`, `mdreader-dist`, `node_modules`.

## API Endpoints

The server exposes data and export endpoints for automation and integrations.

### Data

| Endpoint | Description |
|---|---|
| `/api/tree.json` | Sidebar navigation tree |
| `/api/page/<slug>` | Page data (title, description, segments, TOC) |
| `/api/search-index.json` | Full search index |
| `/api/search?query=<q>` | Live search results (serve mode only) |

### Export

| Endpoint | Description |
|---|---|
| `/api/export/page/<slug>.md` | Page as Markdown |
| `/api/export/page/<slug>.html` | Page as standalone HTML |
| `/api/export/page/<slug>.json` | Page as JSON |
| `/api/export/site.json` | Full site export |
| `/api/export/search?query=<q>&format=json` | Search results export (serve mode only) |
