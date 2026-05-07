import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const BASE_URL = process.env.SITE_URL || "https://themeatlas.dev";
const seedsPath = path.join(root, "themes", "theme-seeds.json");
const seeds = JSON.parse(fs.readFileSync(seedsPath, "utf8"));

const featuredSlugs = new Set([
  "dracula",
  "catppuccin-mocha",
  "tokyo-night",
  "gruvbox",
  "nord",
  "github-dark",
  "one-dark",
  "cyberpunk-2077",
  "kanagawa",
  "rose-pine",
  "night-owl",
  "oled-black"
]);

const familyRules = [
  ["Catppuccin", /^catppuccin/],
  ["Tokyo Night", /^tokyo-night/],
  ["Gruvbox", /^gruvbox/],
  ["GitHub", /^github/],
  ["Rose Pine", /^rose-pine/],
  ["Material", /^material/],
  ["Nightfox", /fox$/],
  ["Solarized", /^solarized/],
  ["One / Atom", /^(one|atom)/],
  ["Ayu", /^ayu/],
  ["Cyberpunk / Neon", /(cyber|neon|synth|arcade|laser|miami|hotline|matrix)/],
  ["Nord", /^(nord|nordic)/],
  ["Kanagawa", /^kanagawa/],
  ["Base16", /^base16/],
  ["Light Themes", /light|latte|dawn|lux/],
  ["Terminal Classics", /(apprentice|deus|gotham|miasma|moonfly|nightfly|posterpole|seoul|zenbones|srcery|tender|jellybeans|iceberg|lucario|panda|tomorrow|papercolor|flatland|spacedust)/]
];

function groupFor(seed) {
  if (seed.group) return seed.group;
  const found = familyRules.find(([, pattern]) => pattern.test(seed.slug));
  return found ? found[0] : "Modern & Custom";
}

function tagsFor(seed) {
  const tags = new Set(seed.tags || []);
  const name = `${seed.name} ${seed.slug}`.toLowerCase();
  const appearance = seed.appearance || "dark";

  tags.add(appearance);
  tags.add("editor");
  if (featuredSlugs.has(seed.slug)) tags.add("featured");
  if (/catppuccin|dracula|tokyo|gruvbox|nord|github|one-dark|rose-pine|kanagawa|night-owl|material|ayu/.test(name)) tags.add("popular");
  if (/terminal|base16|moonfly|nightfly|srcery|tender|jellybeans|seoul|zenbones|apprentice|gotham|deus|one-half/.test(name)) tags.add("terminal");
  if (/oled|black|carbon|high-contrast/.test(name)) tags.add("oled");
  if (/cyber|neon|synth|arcade|laser|miami|hotline|matrix/.test(name)) tags.add("cyberpunk");
  if (/catppuccin|rose|nord|everforest|poimandres|dusk|moon/.test(name)) tags.add("pastel");
  if (appearance === "light") tags.add("light");
  if (appearance === "dark") tags.add("dark");

  return [...tags].sort();
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16)
  ];
}

function mix(a, b, amount) {
  const ar = hexToRgb(a);
  const br = hexToRgb(b);
  const mixed = ar.map((channel, index) => {
    return Math.round(channel * (1 - amount) + br[index] * amount);
  });
  return "#" + mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("");
}

const PALETTE_SIZE = 8;

function themeFromSeed(seed) {
  if (!Array.isArray(seed.palette) || seed.palette.length < PALETTE_SIZE) {
    throw new Error(`Seed "${seed.slug}" palette needs ${PALETTE_SIZE} entries, got ${seed.palette?.length ?? 0}`);
  }
  const [background, foreground, raised, accent, success, error, warning, info] = seed.palette;
  const surface = mix(raised, background, 0.25);
  const border = mix(raised, foreground, 0.2);

  return {
    name: seed.name,
    slug: seed.slug,
    appearance: seed.appearance || "dark",
    group: groupFor(seed),
    tags: tagsFor(seed),
    colors: {
      background,
      foreground,
      surface,
      surfaceRaised: raised,
      border,
      accent,
      accentForeground: background,
      mutedForeground: mix(foreground, background, 0.35),
      success,
      warning,
      error,
      info,
      selection: mix(raised, accent, 0.22),
      cursor: accent,
      syntax: {
        comment: mix(foreground, background, 0.48),
        keyword: error,
        function: accent,
        string: success,
        number: warning,
        type: info,
        variable: foreground,
        constant: warning
      }
    }
  };
}

const themes = seeds.map(themeFromSeed);

for (const theme of themes) {
  fs.writeFileSync(
    path.join(root, "themes", `${theme.slug}.json`),
    `${JSON.stringify(theme, null, 2)}\n`
  );
}

fs.writeFileSync(
  path.join(root, "themes", "index.json"),
  `${JSON.stringify({
    themes: themes.map((theme) => ({
      name: theme.name,
      slug: theme.slug,
      path: `themes/${theme.slug}.json`
    }))
  }, null, 2)}\n`
);

fs.writeFileSync(
  path.join(root, "themes", "theme-data.js"),
  `window.THEME_DATA = ${JSON.stringify(themes)};\n`
);

const today = new Date().toISOString().slice(0, 10);
const urlEntries = [
  `  <url>\n    <loc>${BASE_URL}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>`,
  ...themes.map(t =>
    `  <url>\n    <loc>${BASE_URL}/?theme=${t.slug}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`
  )
].join("\n");

fs.writeFileSync(
  path.join(root, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>\n`
);

console.log(`Generated ${themes.length} themes.`);
