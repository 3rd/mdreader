---
title: mdreader
description: Serve and build local Markdown docs with mdreader
order: 0
---

# mdreader

**mdreader** turns a directory of Markdown files into a local docs site with sidebar navigation, search, syntax highlighting, Mermaid diagrams, and static exports.

## Install

```bash
bun add -g mdreader
pnpm add -g mdreader
npm install -g mdreader
```

Or run it without installing:

```bash
bunx mdreader ./docs --open
```

## Quick Start

```bash
mdreader ./docs --open
mdreader ./docs --watch --open
mdreader ./README.md
mdreader doctor ./docs
mdreader build --source ./docs --dest ./mdreader-dist
```

You do not need a config file to get started. Add an optional `mdreader.json` when you want a custom title, description, or theme.

Use `mdreader [target]` when you want to browse docs locally. Use `mdreader build` when you want a static output directory that any file server can host.

## What mdreader supports

- Recursive discovery of `.md` files
- Sidebar navigation and full-text search
- Syntax highlighting for fenced code blocks
- Mermaid diagram rendering with fullscreen zoom
- GitHub-style callouts such as `> [!NOTE]` and `> [!WARNING]`
- Live reload with `--watch`
- Include and exclude globs for large docs trees
- Built-in validation with `mdreader doctor`
- Static site builds with `mdreader build`
- Per-page exports as Markdown, HTML, and JSON

## Read Next

- [Installation](guides/installation)
- [Writing Content](guides/writing-content)
- [Diagrams](guides/diagrams)
- [CLI Reference](reference/cli)
- [Configuration](reference/config)
