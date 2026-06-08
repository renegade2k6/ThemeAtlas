// Theme Atlas validator.
// Runs after `npm run build` to catch:
//
//  - missing required files
//  - duplicate slugs in themes/index.json
//  - missing or invalid per-theme JSON (color token shape, group, tags)
//  - stale references in index.html (e.g. theme-data.js)
//  - the contract symbols app.js relies on still existing in app-utils.mjs

import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "index.html",
  "site.webmanifest",
  "robots.txt",
  ".nojekyll",
  "assets/app.css",
  "assets/app.js",
  "assets/app-utils.mjs",
  "assets/theme-viewer-icon.svg",
  "assets/theme-atlas-og.svg",
  "sw.js",
  "themes/index.json",
  "themes/theme-seeds.json",
];

const failures = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    failures.push(`Missing required file: ${file}`);
  }
}

const indexPath = path.join(root, "themes", "index.json");
let registry;

if (fs.existsSync(indexPath)) {
  registry = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  const slugs = new Set();

  for (const theme of registry.themes) {
    if (slugs.has(theme.slug)) failures.push(`Duplicate slug: ${theme.slug}`);
    slugs.add(theme.slug);
  }

  const themeResults = await Promise.all(
    registry.themes.map(async (theme) => {
      const errs = [];
      const themePath = path.join(root, ...theme.path.split("/"));

      if (!fs.existsSync(themePath)) {
        errs.push(`Missing theme file: ${theme.path}`);
        return errs;
      }

      let data;
      try {
        data = JSON.parse(await readFile(themePath, "utf8"));
      } catch {
        errs.push(`Failed to parse: ${theme.path}`);
        return errs;
      }

      if (data.slug !== theme.slug) errs.push(`Slug mismatch in ${theme.path}`);
      if (!data.group) errs.push(`Missing group in ${theme.path}`);
      if (!Array.isArray(data.tags) || data.tags.length === 0) errs.push(`Missing tags in ${theme.path}`);

      const hexRe = /^#[0-9a-fA-F]{6}$/;
      for (const key of [
        "background", "foreground", "surface", "surfaceRaised", "border",
        "accent", "accentForeground", "mutedForeground", "selection", "cursor",
        "success", "warning", "error", "info",
      ]) {
        if (!hexRe.test(data.colors?.[key] || "")) errs.push(`Invalid ${key} in ${theme.path}`);
      }

      for (const key of ["comment", "keyword", "function", "string", "number", "type", "constant"]) {
        if (!hexRe.test(data.colors?.syntax?.[key] || "")) errs.push(`Invalid syntax.${key} in ${theme.path}`);
      }

      return errs;
    })
  );
  failures.push(...themeResults.flat());
}

const html = fs.existsSync(path.join(root, "index.html"))
  ? fs.readFileSync(path.join(root, "index.html"), "utf8")
  : "";

for (const expected of [
  "Theme Atlas",
  "assets/theme-viewer-icon.svg",
  "assets/theme-atlas-og.svg",
  "site.webmanifest",
  "assets/app.css",
  "assets/app.js",
  "themes/index.json",
  "Export current JSON",
  "Export all JSON",
  "Skip to theme preview",
  "Content-Security-Policy",
]) {
  if (!html.includes(expected)) failures.push(`index.html missing: ${expected}`);
}

// index.html should NOT load the legacy theme-data.js bundle
if (/themes\/theme-data\.js/.test(html)) {
  failures.push("index.html still references themes/theme-data.js — should be removed");
}

// index.html should NOT contain any inline executable <script> blocks.
// JSON-LD (`type="application/ld+json"`) and other data-block types are
// not executed and are therefore allowed.
const inlineJs = [...html.matchAll(/<script\b([^>]*)>/gi)].some((m) => {
  const attrs = m[1];
  // Has a src attribute => external, allowed
  if (/\bsrc\s*=/.test(attrs)) return false;
  // Has an explicit non-executable type => data block, allowed
  const typeMatch = attrs.match(/\btype\s*=\s*"([^"]+)"/i);
  if (typeMatch && !/^(?:text\/javascript|application\/javascript|text\/ecmascript|module)$/i.test(typeMatch[1])) {
    return false;
  }
  return true;
});
if (inlineJs) {
  failures.push("index.html contains an inline executable <script> — must be moved to an external module");
}

// The meta CSP must not include 'frame-ancestors' (invalid in a <meta> tag)
const cspMatch = html.match(/Content-Security-Policy[^"]*"([^"]+)"/);
if (cspMatch && /frame-ancestors/i.test(cspMatch[1])) {
  failures.push("CSP meta tag contains 'frame-ancestors' (only valid in HTTP headers, not <meta>)");
}

const appJs = fs.existsSync(path.join(root, "assets", "app.js"))
  ? fs.readFileSync(path.join(root, "assets", "app.js"), "utf8")
  : "";

for (const expected of [
  "themeIndex", "themeMap", "compareSlugs", "toggleCompare",
  "contrastRatio", "wcagLevel", "classifyTheme", "fetchJSON",
  "navigator.serviceWorker.register", "navigator.serviceWorker.getRegistrations",
]) {
  if (!appJs.includes(expected)) failures.push(`assets/app.js missing symbol: ${expected}`);
}

// The theme index must carry pre-computed tags so filter chip counts are
// correct from first paint (no fetch needed for counting).
if (registry?.themes?.length) {
  const sample = registry.themes[0];
  for (const field of ["appearance", "group", "tags"]) {
    if (sample[field] === undefined) {
      failures.push(`themes/index.json entries are missing '${field}' — needed for filter chip counts`);
      break;
    }
  }
  // Every entry should have a non-empty tags array
  const noTags = registry.themes.filter((t) => !Array.isArray(t.tags) || t.tags.length === 0);
  if (noTags.length) failures.push(`${noTags.length} theme(s) in index.json have empty tags array`);
}

const utils = fs.existsSync(path.join(root, "assets", "app-utils.mjs"))
  ? fs.readFileSync(path.join(root, "assets", "app-utils.mjs"), "utf8")
  : "";

for (const expected of [
  "export function normalizeSlug",
  "export function themeUrl",
  "export function toggleCompare",
  "export function classifyTheme",
  "export function contrastRatio",
  "export function wcagLevel",
  "export function validHex",
  "export function escapeHtml",
]) {
  if (!utils.includes(expected)) failures.push(`assets/app-utils.mjs missing export: ${expected}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Theme Atlas validation passed: ${registry.themes.length} themes.`);
