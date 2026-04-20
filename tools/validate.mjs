import fs from "node:fs";
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
if (fs.existsSync(indexPath)) {
  const registry = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  const slugs = new Set();

  for (const theme of registry.themes) {
    if (slugs.has(theme.slug)) failures.push(`Duplicate slug: ${theme.slug}`);
    slugs.add(theme.slug);

    const themePath = path.join(root, ...theme.path.split("/"));
    if (!fs.existsSync(themePath)) {
      failures.push(`Missing theme file: ${theme.path}`);
      continue;
    }

    const data = JSON.parse(fs.readFileSync(themePath, "utf8"));
    if (data.slug !== theme.slug) failures.push(`Slug mismatch in ${theme.path}`);
    if (!data.group) failures.push(`Missing group in ${theme.path}`);
    if (!Array.isArray(data.tags) || data.tags.length === 0) failures.push(`Missing tags in ${theme.path}`);

    for (const key of ["background", "foreground", "surface", "surfaceRaised", "border", "accent", "success", "warning", "error", "info"]) {
      if (!/^#[0-9a-fA-F]{6}$/.test(data.colors?.[key] || "")) {
        failures.push(`Invalid ${key} in ${theme.path}`);
      }
    }
  }

  const viewerData = fs.readFileSync(path.join(root, "themes", "theme-data.js"), "utf8");
  const viewerCount = (viewerData.match(/"slug":/g) || []).length;
  if (viewerCount !== registry.themes.length) {
    failures.push(`Viewer data count ${viewerCount} does not match registry ${registry.themes.length}`);
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

const registry = JSON.parse(fs.readFileSync(indexPath, "utf8"));
console.log(`Theme Atlas validation passed: ${registry.themes.length} themes.`);
