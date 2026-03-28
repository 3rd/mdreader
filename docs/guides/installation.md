---
title: Installation
description: Install mdreader and serve your first docs site
order: 0
---

# Installation

## Prerequisites

- Node.js 22 or newer
- Bun is only required when you are developing mdreader from source in this repository

## Install mdreader

```bash
bun add -g mdreader
pnpm add -g mdreader
npm install -g mdreader
```

If you do not want a global install, run it with `bunx`:

```bash
bunx mdreader ./docs --open
```

## Serve a docs directory

```bash
mdreader my-project/docs --open
```

If you are already inside `my-project/docs`, `mdreader --open` serves the current working directory.

If port `4000` is busy, mdreader picks the next available port automatically.

## Serve a single Markdown file

```bash
mdreader my-project/README.md
```

Serving a single file is useful for quick previews or small notes that do not need a full docs tree.
By default, the file basename becomes the site title. Pass `--title` if you want a different title for that run.

## Watch for changes

```bash
mdreader my-project/docs --watch --open
```

Use `--watch` when you want mdreader to push live updates after Markdown files change. The watch status line only appears when watch mode is enabled.

## Validate a docs tree

```bash
mdreader doctor my-project/docs
```

`mdreader doctor` checks config loading, content parsing, unsupported `.mdx` files, client assets, and the first available port. It also warns when a docs directory does not contain a root `index.md`.

## Build a static site

```bash
mdreader build --source my-project/docs --dest my-project/mdreader-dist
```

The destination directory must not already exist, and it must be outside the docs source directory.

## Create an optional config

```bash
mdreader init my-project/docs --theme ocean --title 'My Docs'
```

`mdreader init` creates a starter `mdreader.json`. It does not create sample content, and it creates the target directory if it does not exist yet. If the target is a file path, `init` fails instead of overwriting it.

## Preview on your LAN

```bash
mdreader my-project/docs --host 0.0.0.0 --open
```

## See also

- [Writing Content](/guides/writing-content)
- [CLI Reference](/reference/cli)
- [Configuration](/reference/config)
