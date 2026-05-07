export function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function themeUrl(href, slug) {
  const url = new URL(href);
  url.searchParams.set("theme", normalizeSlug(slug));
  return url.toString();
}

export function toggleCompare(current, slug, limit = 4) {
  const normalized = normalizeSlug(slug);
  const next = current.filter(item => item !== normalized);

  if (next.length !== current.length) return next;

  next.push(normalized);
  return next.slice(-limit);
}

export function classifyTheme(theme) {
  const tags = new Set(theme.tags || []);
  const colors = theme.colors || {};
  const background = String(colors.background || "#000000");
  const rgb = hexToRgb(background);
  const brightness = rgb ? (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 : 0;

  if (brightness > 185) tags.add("bright");
  if (brightness < 45) tags.add("low light");
  if (isWarm(colors.accent || colors.primary)) tags.add("warm");
  if (isCool(colors.accent || colors.primary)) tags.add("cool");

  return [...tags];
}

function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
  const n = Number.parseInt(clean, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function isWarm(hex) {
  const rgb = hexToRgb(hex);
  return !!rgb && rgb.r > rgb.b + 30;
}

function isCool(hex) {
  const rgb = hexToRgb(hex);
  return !!rgb && rgb.b > rgb.r + 20;
}
