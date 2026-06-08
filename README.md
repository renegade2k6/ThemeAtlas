# Theme Atlas

Theme Atlas is a static theme viewer and color-token catalog. It ships with 189 reusable themes for apps, dashboards, editors, terminals, and internal tools.

## Features

- 189 generated theme JSON files
- lazy-loaded: only the visible theme is fetched on demand
- searchable and grouped theme browser
- favorites stored in `localStorage`
- live UI preview for each theme, with proper light/dark chrome
- full WCAG 2.x contrast matrix per theme (AA / AAA / AA-Large / Fail)
- copy buttons for slugs, hex palettes, CSS variables, TypeScript, Tailwind, VSCode and labelled JSON
- single-theme and full-catalog JSON export
- keyboard shortcuts: `/` focus search, `f` favorite, `c` compare, `r` random
- stale-while-revalidate service worker with hashed cache busting
- skip link, ARIA-correct lists, reduced-motion support, CSP, manifest, OG image
- continuous integration (build + validate + test on every PR)

## Structure

```text
assets/
  app.css
  app.js
  app-utils.mjs
  theme-atlas-og.svg
  theme-viewer-icon.svg
themes/
  index.json
  theme-seeds.json
  <theme-slug>.json
tools/
  build-themes.mjs
  clean.mjs
  validate.mjs
index.html
site.webmanifest
sw.js
```

The viewer loads `themes/index.json` at startup and fetches each theme JSON
on demand, so visitors don't have to download the full catalog up front.

## Theme Format

Each generated theme follows the same token contract:

```json
{
  "name": "Dracula",
  "slug": "dracula",
  "appearance": "dark",
  "group": "Modern & Custom",
  "tags": ["dark", "editor", "popular"],
  "colors": {
    "background": "#282a36",
    "foreground": "#f8f8f2",
    "surface": "#3c3e4e",
    "surfaceRaised": "#44475a",
    "border": "#676f8c",
    "accent": "#bd93f9",
    "accentForeground": "#282a36",
    "mutedForeground": "#babbb9",
    "success": "#50fa7b",
    "warning": "#f1fa8c",
    "error": "#ff5555",
    "info": "#8be9fd",
    "selection": "#5e587c",
    "cursor": "#bd93f9",
    "syntax": {
      "comment": "#949690",
      "keyword": "#ff5555",
      "function": "#bd93f9",
      "string": "#50fa7b",
      "number": "#f1fa8c",
      "type": "#8be9fd",
      "variable": "#f8f8f2",
      "constant": "#f1fa8c"
    }
  }
}
```




