import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "index.html",
  "site.webmanifest",
  "robots.txt",
  ".nojekyll",
  "assets/theme-viewer-icon.svg",
  "assets/theme-atlas-og.svg",
  "themes/index.json",
  "themes/theme-data.js",
  "themes/theme-seeds.json"
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

  // Check all theme files in parallel
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

      for (const key of ["background", "foreground", "surface", "surfaceRaised", "border", "accent", "success", "warning", "error", "info"]) {
        if (!/^#[0-9a-fA-F]{6}$/.test(data.colors?.[key] || "")) {
          errs.push(`Invalid ${key} in ${theme.path}`);
        }
      }

      return errs;
    })
  );
  failures.push(...themeResults.flat());

  // Parse theme-data.js properly — strip the assignment wrapper and JSON.parse
  const viewerRaw = fs.readFileSync(path.join(root, "themes", "theme-data.js"), "utf8");
  try {
    const jsonStr = viewerRaw.replace(/^window\.THEME_DATA\s*=\s*/, "").replace(/;\s*\n?$/, "");
    const viewerThemes = JSON.parse(jsonStr);
    if (viewerThemes.length !== registry.themes.length) {
      failures.push(`Viewer data count ${viewerThemes.length} does not match registry ${registry.themes.length}`);
    }
  } catch {
    failures.push("Failed to parse themes/theme-data.js");
  }
}

const html = fs.existsSync(path.join(root, "index.html"))
  ? fs.readFileSync(path.join(root, "index.html"), "utf8")
  : "";

for (const expected of [
  "Theme Atlas",
  "assets/theme-viewer-icon.svg",
  "assets/theme-atlas-og.svg",
  "site.webmanifest",
  "Export current JSON",
  "Export all JSON",
  "filterOptions",
  "contrastRatio"
]) {
  if (!html.includes(expected)) failures.push(`index.html missing: ${expected}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Theme Atlas validation passed: ${registry.themes.length} themes.`);
