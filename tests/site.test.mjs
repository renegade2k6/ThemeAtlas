import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");

test("site uses cacheable app assets and service worker", () => {
  const html = read("index.html");

  assert.match(html, /<link rel="stylesheet" href="assets\/app\.css">/);
  assert.match(html, /<script type="module" src="assets\/app\.js"><\/script>/);
  assert.match(html, /navigator\.serviceWorker\.register\("sw\.js"\)/);
  assert.ok(fs.existsSync(new URL("assets/app.css", root)));
  assert.ok(fs.existsSync(new URL("assets/app.js", root)));
  assert.ok(fs.existsSync(new URL("sw.js", root)));
});

test("app utility API supports shareable urls and comparison limits", async () => {
  const module = await import("../assets/app-utils.mjs");

  assert.equal(module.normalizeSlug("Tokyo Night"), "tokyo-night");
  assert.equal(module.themeUrl("https://example.test/?x=1", "dracula"), "https://example.test/?x=1&theme=dracula");
  assert.deepEqual(module.toggleCompare(["dracula", "nord"], "dracula"), ["nord"]);
  assert.deepEqual(module.toggleCompare(["a", "b", "c", "d"], "e"), ["b", "c", "d", "e"]);
});

test("service worker precaches generated site assets", () => {
  const worker = read("sw.js");

  for (const asset of ["./", "index.html", "assets/app.css", "assets/app.js", "themes/theme-data.js"]) {
    assert.match(worker, new RegExp(asset.replace(/[./]/g, "\\$&")));
  }
});

test("theme data remains valid JavaScript", () => {
  const code = read("themes/theme-data.js");
  const context = { window: {} };

  vm.runInNewContext(code, context);

  assert.ok(Array.isArray(context.window.THEME_DATA));
  assert.ok(context.window.THEME_DATA.length >= 180);
});
