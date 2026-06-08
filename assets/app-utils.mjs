// Pure-functional utilities for Theme Atlas.
// No DOM, no globals — safe to import anywhere (browser, node, worker).

/**
 * Normalize a free-form string into a kebab-case slug.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Add or replace a `theme` query param on a URL.
 * @param {string | URL} href
 * @param {string} slug
 * @returns {string}
 */
export function themeUrl(href, slug) {
  const url = new URL(href);
  url.searchParams.set("theme", normalizeSlug(slug));
  return url.toString();
}

/**
 * Toggle a slug in a compare list. If present, remove it; if absent, append
 * (capped at `limit` items, oldest first removed).
 * @param {string[]} current
 * @param {string} slug
 * @param {number} [limit=4]
 * @returns {string[]}
 */
export function toggleCompare(current, slug, limit = 4) {
  const normalized = normalizeSlug(slug);
  const next = current.filter((item) => item !== normalized);
  if (next.length !== current.length) return next;
  next.push(normalized);
  return next.slice(-limit);
}

// ---------- Color helpers ----------

const HEX_RE = /^#?([0-9a-f]{6})$/i;

/**
 * Convert a `#rrggbb` hex string to an `[r, g, b]` array of 0–255 ints.
 * Returns `null` for invalid input.
 * @param {string} hex
 * @returns {[number, number, number] | null}
 */
export function hexToRgb(hex) {
  const m = HEX_RE.exec(String(hex || ""));
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Validate a `#rrggbb` string. Returns the normalized form or `null`.
 * @param {string} hex
 * @returns {string | null}
 */
export function validHex(hex) {
  const m = HEX_RE.exec(String(hex || ""));
  return m ? `#${m[1].toLowerCase()}` : null;
}

/**
 * Relative WCAG luminance for a hex color.
 * @param {string} hex
 * @returns {number} 0..1
 */
export function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.x contrast ratio between two hex colors.
 * @param {string} a
 * @param {string} b
 * @returns {number} 1..21
 */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Determine WCAG pass levels for a contrast score.
 * @param {number} score
 * @returns {{ aa: boolean, aaa: boolean, aaLarge: boolean }}
 */
export function wcagLevel(score) {
  return {
    aa: score >= 4.5,
    aaa: score >= 7,
    aaLarge: score >= 3,
  };
}

/**
 * Short text label for a contrast score (used in the UI list).
 * @param {number} score
 * @returns {string}
 */
export function contrastLabel(score) {
  if (score >= 7) return "AAA";
  if (score >= 4.5) return "AA";
  if (score >= 3) return "Large";
  return "Low";
}

/**
 * Perceived brightness (0..255) using the standard luminance weights.
 * @param {string} hex
 * @returns {number}
 */
export function brightness(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
}

/**
 * Mix two hex colors. `amount` is the weight of `b` (0 = all `a`, 1 = all `b`).
 * @param {string} a
 * @param {string} b
 * @param {number} amount
 * @returns {string}
 */
export function mix(a, b, amount) {
  const ar = hexToRgb(a);
  const br = hexToRgb(b);
  if (!ar || !br) return a;
  const t = Math.max(0, Math.min(1, amount));
  const mixed = ar.map((channel, i) => Math.round(channel * (1 - t) + br[i] * t));
  return "#" + mixed.map((c) => c.toString(16).padStart(2, "0")).join("");
}

// ---------- Theme classification ----------

/**
 * Add derived classification tags (bright, low light, warm, cool) to a theme.
 * @param {object} theme
 * @returns {string[]}
 */
export function classifyTheme(theme) {
  const tags = new Set(theme.tags || []);
  const colors = theme.colors || {};
  const b = brightness(colors.background);
  if (b > 185) tags.add("bright");
  if (b < 45) tags.add("low light");

  const accent = colors.accent || colors.primary;
  const rgb = hexToRgb(accent);
  if (rgb) {
    if (rgb[0] > rgb[2] + 30) tags.add("warm");
    if (rgb[2] > rgb[0] + 30) tags.add("cool");
  }
  return [...tags];
}

// ---------- DOM-safe escape helpers (for any HTML we generate) ----------

const ESCAPE_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/**
 * Escape a string for safe insertion into HTML attribute or text.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

/**
 * Escape a value for safe use in a CSS `url(...)` or inline `style="..."` value.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeStyle(value) {
  return String(value ?? "").replace(/[^a-zA-Z0-9#%(),./:_-]/g, "");
}
