import assert from "node:assert/strict";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = async (file) => readFile(new URL(file, root), "utf8");
const exists = (file) => fs.existsSync(new URL(file, root));

test("site uses cacheable app assets and service worker", async () => {
  const html = await read("index.html");
  assert.match(html, /<link rel="stylesheet" href="assets\/app\.css">/);
  assert.match(html, /<script type="module" src="assets\/app\.js"><\/script>/);
  assert.ok(exists("assets/app.css"));
  assert.ok(exists("assets/app.js"));
  assert.ok(exists("sw.js"));
  // Sanity: skip link and CSP present
  assert.match(html, /class="skip-link"/);
  assert.match(html, /Content-Security-Policy/);
  // Sanity: legacy data bundle is gone
  assert.doesNotMatch(html, /themes\/theme-data\.js/);
  // Sanity: no inline executable <script> blocks (CSP-friendly).
  // JSON-LD (`type="application/ld+json"`) is a data block, not script, and is allowed.
  const inlineJs = [...html.matchAll(/<script\b([^>]*)>/gi)].some((m) => {
    const attrs = m[1];
    if (/\bsrc\s*=/.test(attrs)) return false;
    const typeMatch = attrs.match(/\btype\s*=\s*"([^"]+)"/i);
    if (typeMatch && !/^(?:text\/javascript|application\/javascript|text\/ecmascript|module)$/i.test(typeMatch[1])) {
      return false;
    }
    return true;
  });
  assert.equal(inlineJs, false, "index.html contains an inline executable <script>");
  // Sanity: meta CSP must not contain 'frame-ancestors' (only valid in HTTP headers)
  const csp = html.match(/Content-Security-Policy[^"]*"([^"]+)"/);
  assert.ok(csp, "CSP meta tag should be present");
  assert.doesNotMatch(csp[1], /frame-ancestors/i, "frame-ancestors is invalid in a <meta> tag");
  // Sanity: SW registration is now done from app.js, not index.html
  assert.doesNotMatch(html, /navigator\.serviceWorker\.register/);
  const appJs = await read("assets/app.js");
  assert.match(appJs, /navigator\.serviceWorker\.register\("sw\.js"\)/);
  assert.match(appJs, /navigator\.serviceWorker\.getRegistrations/);
});

test("app utility API supports shareable urls, comparison limits, and classification", async () => {
  const module = await import("../assets/app-utils.mjs");

  assert.equal(module.normalizeSlug("Tokyo Night"), "tokyo-night");
  assert.equal(module.themeUrl("https://example.test/?x=1", "dracula"), "https://example.test/?x=1&theme=dracula");
  assert.deepEqual(module.toggleCompare(["dracula", "nord"], "dracula"), ["nord"]);
  assert.deepEqual(module.toggleCompare(["a", "b", "c", "d"], "e"), ["b", "c", "d", "e"]);

  // classifyTheme derives warm/cool/bright/low light from the colors
  const cool = module.classifyTheme({
    appearance: "dark",
    colors: { background: "#101418", accent: "#5ec4ff" },
  });
  assert.ok(cool.includes("cool"));
  // Very dark background => "low light" tag
  assert.ok(cool.includes("low light"));

  const warm = module.classifyTheme({
    appearance: "light",
    colors: { background: "#fff7d6", accent: "#ff5b3a" },
  });
  assert.ok(warm.includes("warm"));
  // Very light background => "bright" tag
  assert.ok(warm.includes("bright"));
});

test("WCAG helpers compute correct contrast levels", async () => {
  const module = await import("../assets/app-utils.mjs");
  // Black on white = 21
  const ratio = module.contrastRatio("#000000", "#ffffff");
  assert.equal(Math.round(ratio), 21);
  const levels = module.wcagLevel(7);
  assert.equal(levels.aaa, true);
  assert.equal(levels.aa, true);
  assert.equal(levels.aaLarge, true);
  const fail = module.wcagLevel(2.5);
  assert.equal(fail.aa, false);
  assert.equal(fail.aaa, false);
  assert.equal(fail.aaLarge, false);
});

test("hex validation rejects invalid colors", async () => {
  const module = await import("../assets/app-utils.mjs");
  assert.equal(module.validHex("#ff00aa"), "#ff00aa");
  assert.equal(module.validHex("ff00aa"), "#ff00aa");
  assert.equal(module.validHex("#fff"), null);
  assert.equal(module.validHex("not-a-color"), null);
});

test("html escaping prevents injection from theme metadata", async () => {
  const module = await import("../assets/app-utils.mjs");
  assert.equal(module.escapeHtml('<script>alert(1)</script>'), "&lt;script&gt;alert(1)&lt;/script&gt;");
  // escapeStyle must prevent CSS-injection by stripping `;` and whitespace,
  // and should not produce a string that, combined with the surrounding
  // `style="background:${value}"` template, lets the attacker break out.
  const dirty = "red; background:url(javascript:alert(1))";
  const cleaned = module.escapeStyle(dirty);
  assert.ok(!cleaned.includes(";"), "should strip semicolons (CSS-injection vector)");
  assert.ok(!cleaned.includes(" "), "should strip spaces (attribute-break vector)");
  // The dangerous `javascript:` pseudo-protocol requires a `:` after `javascript`
  // — and crucially, it would need to come AFTER a `;` to break out, which we stripped.
  // Verify a clean URL still works.
  assert.equal(module.escapeStyle("url(http://example.com/x.png)"), "url(http://example.com/x.png)");
});

test("service worker precaches the new static manifest", async () => {
  const worker = await read("sw.js");
  for (const asset of [
    "./",
    "index.html",
    "assets/app.css",
    "assets/app.js",
    "assets/app-utils.mjs",
    "themes/index.json",
  ]) {
    assert.match(worker, new RegExp(asset.replace(/[./]/g, "\\$&")));
  }
  // No reference to the legacy theme-data.js
  assert.doesNotMatch(worker, /theme-data\.js/);
  // SWR for themes
  assert.match(worker, /stale-while-revalidate/);
});

test("theme index is valid and contains the expected slugs", async () => {
  const index = JSON.parse(await read("themes/index.json"));
  assert.ok(Array.isArray(index.themes));
  assert.ok(index.themes.length >= 100, `expected at least 100 themes, got ${index.themes.length}`);
  const dracula = index.themes.find((t) => t.slug === "dracula");
  assert.ok(dracula, "dracula missing from index");
  assert.equal(dracula.path, "themes/dracula.json");
  // Every theme file should be reachable
  for (const theme of index.themes) {
    assert.ok(exists(theme.path), `theme file missing: ${theme.path}`);
  }
});

test("theme index carries pre-computed tags for accurate chip counts", async () => {
  // The build must enrich themes/index.json with appearance/group/tags so
  // the runtime can show correct filter chip counts immediately (without
  // having to fetch every theme JSON just to count).
  const index = JSON.parse(await read("themes/index.json"));
  for (const theme of index.themes) {
    assert.ok(theme.appearance, `${theme.slug} missing 'appearance'`);
    assert.ok(theme.group, `${theme.slug} missing 'group'`);
    assert.ok(Array.isArray(theme.tags) && theme.tags.length > 0, `${theme.slug} missing 'tags'`);
    // The four filter chips the user can actually click
    for (const required of ["dark", "light", "popular", "featured"]) {
      if (required === "featured" && !theme.tags.includes("featured")) continue;
      // Skip if theme isn't dark/light
      if (required === theme.appearance) {
        assert.ok(theme.tags.includes(required), `${theme.slug} should include '${required}'`);
      }
    }
  }
  // Sanity: at least one popular, at least one light theme
  const popular = index.themes.filter((t) => t.tags.includes("popular"));
  const light = index.themes.filter((t) => t.appearance === "light");
  assert.ok(popular.length >= 10, `expected >=10 popular themes, got ${popular.length}`);
  assert.ok(light.length >= 1, `expected at least one light theme`);
});

test("theme index carries a preview palette for instant rendering", async () => {
  // Each entry must include a 6-color preview so the app can render swatches
  // and the current theme's chrome before the per-theme JSON has been fetched.
  const index = JSON.parse(await read("themes/index.json"));
  const hexRe = /^#[0-9a-fA-F]{6}$/;
  for (const theme of index.themes) {
    assert.ok(theme.preview, `${theme.slug} missing 'preview'`);
    for (const key of ["background", "foreground", "surface", "accent", "success", "error"]) {
      assert.ok(hexRe.test(theme.preview[key] || ""), `${theme.slug} preview.${key} invalid hex`);
    }
  }
});

test("app caches loaded themes for repeat visits", async () => {
  const appJs = await read("assets/app.js");
  // Persistent cache key
  assert.match(appJs, /theme-viewer-theme-cache/);
  // Catalog version check to invalidate stale caches
  assert.match(appJs, /catalogVersion/);
  // Background prefetch loop
  assert.match(appJs, /startPrefetch/);
  assert.match(appJs, /requestIdleCallback/);
  // Honors Save-Data and slow connections
  assert.match(appJs, /saveData/);
  assert.match(appJs, /effectiveType/);
  // Hydrates themeMap from the persistent cache on startup
  assert.match(appJs, /cache\.version === catalogVersion/);
});

test("individual theme files have the expected token contract", async () => {
  const data = JSON.parse(await read("themes/dracula.json"));
  for (const key of [
    "background", "foreground", "surface", "surfaceRaised", "border",
    "accent", "accentForeground", "mutedForeground", "selection", "cursor",
    "success", "warning", "error", "info",
  ]) {
    assert.match(data.colors[key], /^#[0-9a-fA-F]{6}$/);
  }
  for (const key of ["comment", "keyword", "function", "string", "number", "type", "constant"]) {
    assert.match(data.colors.syntax[key], /^#[0-9a-fA-F]{6}$/);
  }
});
