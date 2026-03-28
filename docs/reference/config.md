---
title: Configuration
description: mdreader.json and theme reference
order: 11
---

# Configuration

Create `mdreader.json` in your content directory when you want to customize the site title, description, or theme.

```json
{
  "title": "My Project",
  "description": "Project documentation",
  "theme": "ocean"
}
```

## Recognized fields

Only these fields are supported:

| Field | Type | Default | Description |
|---|---|---|---|
| `title` | string | directory name | Site title shown in the sidebar header |
| `description` | string | `""` | Site description used in metadata |
| `theme` | string | `"neutral"` | Color theme |

Unknown fields are ignored and reported as warnings.

## Validation and diagnostics

`mdreader` validates `mdreader.json` during `serve`, `doctor`, and `build`.

- Invalid JSON falls back to defaults and is reported as an error
- Invalid field types fall back to defaults and are reported as warnings
- Invalid theme names fall back to `"neutral"` and are reported as warnings

## Themes

Available values:

`neutral`, `ocean`, `purple`, `catppuccin`, `dusk`, `emerald`, `ruby`, `solar`, `black`, `shadcn`, `vitepress`, `aspen`

The selected theme is applied to the HTML shell with a `data-theme` attribute.

Dark mode follows the system preference automatically.

## See also

- [CLI Reference](/reference/cli)
- [Writing Content](/guides/writing-content)
