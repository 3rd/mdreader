---
title: CLI Reference
description: Commands, flags, routing, and endpoints
order: 10
---

# CLI Reference

## Usage

```bash
mdreader [target] [options]
mdreader serve [target] [options]
mdreader doctor [target] [options]
mdreader build --source <path> --dest <dir> [options]
mdreader init [target] [options]
```

If you omit `[target]` for `mdreader` or `mdreader serve`, mdreader serves the current working directory.
`mdreader --completions <bash|zsh|fish>` prints a shell completion script.
When you serve or build a single Markdown file, mdreader uses the file basename as the site title unless you pass `--title`.

## Commands

| Command | Description |
|---|---|
| `mdreader [target]` | Serve a docs directory or a single Markdown file |
| `mdreader serve [target]` | Explicit alias for the default serve command |
| `mdreader doctor [target]` | Validate config, content parsing, unsupported `.mdx` files, client assets, and the first available port |
| `mdreader build --source <path> --dest <dir>` | Build a static site from a docs directory or single Markdown file |
| `mdreader init [target]` | Create a starter `mdreader.json` |

## Serve Flags

| Flag | Alias | Description |
|---|---|---|
| `--host <host>` | | Bind to a specific host or interface |
| `--port <number>` | `-p` | Port to serve on, auto-detected from `4000` by default |
| `--open` | `-o` | Open the browser after starting |
| `--watch` | `-w` | Watch for file changes and trigger live reload |
| `--title <title>` | | Override the site title for this run |
| `--theme <theme>` | | Override the configured theme for this run |
| `--include <glob>` | | Only include Markdown files matching a glob pattern |
| `--exclude <glob>` | | Exclude Markdown files matching a glob pattern |

## Doctor Flags

| Flag | Description |
|---|---|
| `--include <glob>` | Only include Markdown files matching a glob pattern |
| `--exclude <glob>` | Exclude Markdown files matching a glob pattern |

`mdreader doctor` exits with code `1` when any check fails. It also warns when a docs directory does not have a root `index.md`.

## Build Flags

| Flag | Description |
|---|---|
| `--source <path>` | Markdown file or docs directory to build |
| `--dest <dir>` | Output directory for the built site |
| `--title <title>` | Override the site title for this build |
| `--theme <theme>` | Override the configured theme for this build |
| `--include <glob>` | Only include Markdown files matching a glob pattern |
| `--exclude <glob>` | Exclude Markdown files matching a glob pattern |

The destination directory must not already exist, and it must live outside the docs source directory.

## Init Flags

| Flag | Alias | Description |
|---|---|---|
| `--title <title>` | | Initial site title |
| `--description <description>` | | Initial site description |
| `--theme <theme>` | | Initial site theme |
| `--force` | `-f` | Overwrite an existing `mdreader.json` |

`mdreader init` creates `mdreader.json` only. It does not create example content. If the target directory does not exist yet, mdreader creates it for you. If the target is a file path, `init` fails.

## Examples

```bash
# serve the current directory
mdreader

# serve a docs tree and open it in a browser
mdreader ./docs --open

# enable live reload
mdreader ./docs --watch --open

# serve a single Markdown file
mdreader ./README.md

# preview on your LAN
mdreader ./docs --host 0.0.0.0 --open

# validate a docs tree
mdreader doctor ./docs

# build a static site
mdreader build --source ./docs --dest ./mdreader-dist

# create a starter config
mdreader init ./docs --theme ocean --title 'My Docs'
```

## Content Discovery

- mdreader scans `.md` files
- Direct `.mdx` targets fail
- Scanned `.mdx` files are skipped with a warning
- `--include` and `--exclude` patterns match paths relative to the content directory

These directories are always ignored during scans: `.cache`, `.git`, `.next`, `.react-router`, `.source`, `build`, `dist`, `mdreader-dist`, `node_modules`

## Page Routing

| File path | URL |
|---|---|
| `index.md` | `/` |
| `guide.md` | `/guide` |
| `guides/index.md` | `/guides` |
| `guides/installation.md` | `/guides/installation` |
| `guides/advanced/nested-page.md` | `/guides/advanced/nested-page` |
| `reference/config.md` | `/reference/config` |

Serving a single Markdown file makes that file the root page at `/`.

## Assets

Relative links to common content assets such as images, SVGs, PDFs, and video files are served directly from the docs directory.

## Endpoint Reference

### Available in serve mode and static builds

| Endpoint | Description |
|---|---|
| `/api/tree.json` | Sidebar navigation tree |
| `/api/page/<slug>.json` | Page data with title, description, content segments, and TOC |
| `/api/search-index.json` | Full search index |
| `/api/export/page/<slug>.md` | Page as Markdown |
| `/api/export/page/<slug>.html` | Page as standalone HTML |
| `/api/export/page/<slug>.json` | Page as JSON |
| `/api/export/site.json` | Full site export as JSON |

Use the `.json` page-data route as the canonical form because static builds emit that file directly.

### Serve-mode only

| Endpoint | Description |
|---|---|
| `/api/search?query=<q>` | Live search results |
| `/api/export/search?query=<q>&format=json|html|markdown` | Search result export |
| `/api/events` | Server-sent events stream used for live reload |

## See also

- [Installation](/guides/installation)
- [Configuration](/reference/config)
