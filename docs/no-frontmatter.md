# Frontmatter Is Optional

You can write a page without YAML frontmatter. When you do, mdreader falls back to the first `#` heading for the page title.

## What still works

- The page renders normally
- The title comes from the first heading
- The page still appears in the sidebar

## What you do not get automatically

- No description in search results unless you add frontmatter
- No explicit `order`, so the page uses the default sort value of `999`

## When to add frontmatter

Add frontmatter when you want tighter control over titles, descriptions, or sidebar ordering:

```yaml
---
title: Getting Started
description: First steps for new users
order: 1
---
```

If you just need a quick page and the defaults are fine, plain Markdown works without any extra metadata.

## See also

- [Writing Content](/guides/writing-content)
- [Configuration](/reference/config)
