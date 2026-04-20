# Theme Atlas

Theme Atlas is a static theme viewer and color-token catalog. It includes 169 reusable themes for apps, dashboards, editors, terminals, and internal tools.

Open `index.html` locally or publish the folder with GitHub Pages.

## Features

- 169 generated theme JSON files
- searchable and grouped theme browser
- favorites stored in `localStorage`
- live UI preview for each theme
- contrast checks for key color pairs
- copy buttons for slugs, hex palettes, CSS variables, TypeScript exports, and labelled JSON
- single-theme and full-catalog JSON export
- favicon, web manifest, Open Graph image, and GitHub Pages workflow

## Structure

```text
assets/
  theme-atlas-og.svg
  theme-viewer-icon.svg
themes/
  index.json
  theme-data.js
  theme-seeds.json
  <theme-slug>.json
tools/
  build-themes.mjs
  validate.mjs
index.html
site.webmanifest
```

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




