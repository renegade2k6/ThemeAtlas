// Remove generated artifacts. Useful before a fresh build.

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const themesDir = path.join(root, "themes");

if (fs.existsSync(themesDir)) {
  for (const entry of fs.readdirSync(themesDir)) {
    if (entry === "theme-seeds.json") continue;
    fs.rmSync(path.join(themesDir, entry), { recursive: true, force: true });
  }
}

for (const file of ["sitemap.xml"]) {
  const p = path.join(root, file);
  if (fs.existsSync(p)) fs.rmSync(p);
}

console.log("Cleaned generated artifacts.");
