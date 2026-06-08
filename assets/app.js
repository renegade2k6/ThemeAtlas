// Theme Atlas — viewer app
// Loads theme metadata from `themes/index.json` and per-theme JSON on demand,
// so visitors don't have to download the full catalog up front.

import {
  classifyTheme,
  contrastLabel,
  contrastRatio,
  escapeHtml,
  escapeStyle,
  normalizeSlug,
  themeUrl,
  toggleCompare,
  wcagLevel,
} from "./app-utils.mjs";

const COMPARE_LIMIT = 4;
const MAX_RECENT = 8;
const FETCH_TIMEOUT_MS = 8000;
const KEY_LAST = "theme-viewer-last";
const KEY_FAVORITES = "theme-viewer-favorites";
const KEY_RECENT = "theme-viewer-recent";
const KEY_COMPARE = "theme-viewer-compare";
const KEY_COMPARE_LIMIT = "theme-viewer-compare-limit";

const FILTER_OPTIONS = [
  "all",
  "favorites",
  "featured",
  "popular",
  "dark",
  "light",
  "oled",
  "terminal",
  "bright",
  "low light",
  "warm",
  "cool",
];

// ---------- Storage helpers ----------

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / privacy mode — ignore */
  }
}

// ---------- Fetch with timeout ----------

async function fetchJSON(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, credentials: "same-origin" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Boot ----------

async function boot() {
  const root = {
    themeList: document.querySelector("#themeList"),
    stage: document.querySelector("#stage"),
    themeName: document.querySelector("#themeName"),
    themeSlug: document.querySelector("#themeSlug"),
    themeMode: document.querySelector("#themeMode"),
    themeSearch: document.querySelector("#themeSearch"),
    themeCount: document.querySelector("#themeCount"),
    randomTheme: document.querySelector("#randomTheme"),
    filterChips: document.querySelector("#filterChips"),
    favoriteCurrent: document.querySelector("#favoriteCurrent"),
    compareCurrent: document.querySelector("#compareCurrent"),
    clearCompare: document.querySelector("#clearCompare"),
    comparePanel: document.querySelector("#comparePanel"),
    compareGrid: document.querySelector("#compareGrid"),
    exportCurrent: document.querySelector("#exportCurrent"),
    exportAll: document.querySelector("#exportAll"),
    heroStrip: document.querySelector("#heroStrip"),
    tokenGrid: document.querySelector("#tokenGrid"),
    statusGrid: document.querySelector("#statusGrid"),
    contrastList: document.querySelector("#contrastList"),
    liveRegion: document.querySelector("#liveRegion"),
    themeColorMeta: document.querySelector('meta[name="theme-color"]'),
  };

  // Cached theme records (slug -> full theme object with colors).
  const themeMap = new Map();
  // Lightweight index used for filtering and search ranking.
  const themeIndex = []; // { slug, name, appearance, group, tags, path, searchBlob }

  const state = {
    currentSlug: null,
    filterText: "",
    activeFilter: "all",
    debounceTimer: 0,
    favorites: new Set(readJSON(KEY_FAVORITES, [])),
    recentSlugs: readJSON(KEY_RECENT, []),
    compareSlugs: readJSON(KEY_COMPARE, []),
    compareLimit: readJSON(KEY_COMPARE_LIMIT, COMPARE_LIMIT),
  };
  state.compareLimit = Math.max(1, Math.min(8, state.compareLimit || COMPARE_LIMIT));

  const openGroups = new Set(["Featured", "Recently Viewed"]);
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  // ---------- Data loading ----------

  async function loadIndex() {
    const data = await fetchJSON("themes/index.json");
    if (!data || !Array.isArray(data.themes)) {
      throw new Error("themes/index.json is missing a 'themes' array");
    }
    for (const entry of data.themes) {
      if (!entry?.slug || !entry?.path) continue;
      themeIndex.push({
        slug: entry.slug,
        name: entry.name || entry.slug,
        path: entry.path,
        appearance: null,
        group: null,
        tags: [],
        searchBlob: `${(entry.name || entry.slug).toLowerCase()} ${entry.slug.toLowerCase()}`,
      });
    }
  }

  async function ensureTheme(slug) {
    if (themeMap.has(slug)) return themeMap.get(slug);
    const meta = themeIndex.find((t) => t.slug === slug);
    if (!meta) return null;
    try {
      const data = await fetchJSON(meta.path);
      const enriched = {
        ...data,
        tags: classifyTheme(data),
      };
      themeMap.set(slug, enriched);
      // Backfill metadata in the index from the first time we see the full record
      meta.appearance = data.appearance || "dark";
      meta.group = data.group || "Other";
      meta.tags = enriched.tags;
      meta.searchBlob = [
        data.name,
        data.slug,
        data.appearance,
        data.group,
        ...(enriched.tags || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return enriched;
    } catch (err) {
      console.warn("Failed to load theme", slug, err);
      return null;
    }
  }

  async function ensureAllThemes() {
    await Promise.all(themeIndex.map((m) => ensureTheme(m.slug)));
  }

  function getTheme(slug) {
    return themeMap.get(slug) || [...themeMap.values()][0] || null;
  }

  // ---------- Persistence ----------

  function saveFavorites() {
    writeJSON(KEY_FAVORITES, [...state.favorites].sort());
  }
  function saveRecent() {
    writeJSON(KEY_RECENT, state.recentSlugs);
  }
  function saveCompare() {
    writeJSON(KEY_COMPARE, state.compareSlugs);
  }
  function saveCompareLimit() {
    writeJSON(KEY_COMPARE_LIMIT, state.compareLimit);
  }

  function trackRecent(slug) {
    state.recentSlugs = [slug, ...state.recentSlugs.filter((s) => s !== slug)].slice(0, MAX_RECENT);
    saveRecent();
  }

  // ---------- Filtering ----------

  function visibleThemes() {
    const query = state.filterText.trim().toLowerCase();
    return themeIndex.filter((meta) => {
      const matchesSearch = !query || meta.searchBlob.includes(query);
      const theme = themeMap.get(meta.slug);
      const tags = theme?.tags || meta.tags || [];
      const matchesFilter =
        state.activeFilter === "all" ||
        (state.activeFilter === "favorites" && state.favorites.has(meta.slug)) ||
        tags.includes(state.activeFilter);
      return matchesSearch && matchesFilter;
    });
  }

  function tagCount(filter) {
    if (filter === "all") return themeIndex.length;
    if (filter === "favorites") return state.favorites.size;
    let n = 0;
    for (const meta of themeIndex) {
      const theme = themeMap.get(meta.slug);
      const tags = theme?.tags || meta.tags || [];
      if (tags.includes(filter)) n++;
    }
    return n;
  }

  // ---------- Render: filters ----------

  function renderFilters() {
    root.filterChips.innerHTML = FILTER_OPTIONS.map((filter) => {
      const label = filter === "all" ? "All" : filter[0].toUpperCase() + filter.slice(1);
      const count = tagCount(filter);
      const pressed = filter === state.activeFilter ? "true" : "false";
      return `<button class="filter-chip" type="button" data-filter="${escapeHtml(
        filter
      )}" aria-pressed="${pressed}">${escapeHtml(label)} <span class="chip-count">${count}</span></button>`;
    }).join("");
  }

  // ---------- Render: theme list ----------

  function snapshotOpenGroups() {
    root.themeList.querySelectorAll("details.theme-section").forEach((d) => {
      const title = d.querySelector("summary span")?.textContent;
      if (!title) return;
      if (d.open) openGroups.add(title);
      else openGroups.delete(title);
    });
  }

  function renderThemeButton(meta) {
    const theme = themeMap.get(meta.slug);
    const colors = theme?.colors;
    const tags = (theme?.tags || meta.tags || [])
      .filter((t) => ["popular", "oled", "terminal", "light", "bright", "low light", "warm", "cool"].includes(t))
      .slice(0, 3)
      .map((t) => `<span class="badge">${escapeHtml(t)}</span>`)
      .join("");
    const swatchColors = colors
      ? [colors.background, colors.foreground, colors.surfaceRaised, colors.accent, colors.success, colors.error]
      : ["#1d222c", "#1d222c", "#1d222c", "#1d222c", "#1d222c", "#1d222c"];
    const swatches = swatchColors
      .map((c) => `<span style="background:${escapeStyle(c)}"></span>`)
      .join("");
    const isFav = state.favorites.has(meta.slug);
    const isCompared = state.compareSlugs.includes(meta.slug);
    const pressed = meta.slug === state.currentSlug ? "true" : "false";

    return `<li>
      <button class="theme-button" type="button" data-slug="${escapeHtml(
        meta.slug
      )}" aria-pressed="${pressed}">
        <span class="favorite-toggle ${isFav ? "is-favorite" : ""}" data-favorite="${escapeHtml(
      meta.slug
    )}" role="switch" aria-checked="${isFav}" aria-label="Toggle favorite for ${escapeHtml(
      meta.name
    )}" title="Toggle favorite">${isFav ? "★" : "☆"}</span>
        <span class="compare-toggle ${
          isCompared ? "is-compared" : ""
        }" data-compare="${escapeHtml(meta.slug)}" role="switch" aria-checked="${isCompared}" aria-label="Pin ${
      meta.name
    } to compare" title="Toggle comparison">◆</span>
        <span class="theme-meta"><strong>${escapeHtml(meta.name)}</strong><span class="badges">${tags}</span></span>
        <span class="swatches" aria-hidden="true">${swatches}</span>
      </button>
    </li>`;
  }

  function sectionHtml(title, items) {
    const open = openGroups.has(title) || items.some((t) => t.slug === state.currentSlug);
    return `<details class="theme-section" ${open ? "open" : ""}>
      <summary><span>${escapeHtml(title)}</span><span class="section-count">${items.length}</span></summary>
      <ul class="section-list" role="list">${items.map(renderThemeButton).join("")}</ul>
    </details>`;
  }

  function renderList() {
    snapshotOpenGroups();
    const items = visibleThemes();
    const total = themeIndex.length;
    root.themeCount.textContent = `${items.length} of ${total} themes`;
    const searching = state.filterText.trim().length > 0;

    if (!items.length) {
      root.themeList.innerHTML = `<div class="panel empty">No matching themes.</div>`;
      return;
    }

    if (searching) {
      root.themeList.innerHTML = `<ul class="section-list" role="list">${items.map(renderThemeButton).join("")}</ul>`;
      return;
    }

    const featured = items.filter((m) => (themeMap.get(m.slug)?.tags || m.tags).includes("featured"));
    const grouped = new Map();
    for (const meta of items) {
      const group = themeMap.get(meta.slug)?.group || meta.group || "Other";
      if (!grouped.has(group)) grouped.set(group, []);
      grouped.get(group).push(meta);
    }

    const sections = [];
    if (state.recentSlugs.length > 1 && state.activeFilter === "all") {
      const recent = state.recentSlugs.map((s) => themeIndex.find((m) => m.slug === s)).filter(Boolean);
      if (recent.length) sections.push(sectionHtml("Recently Viewed", recent));
    }
    if (featured.length && state.activeFilter === "all") {
      sections.push(sectionHtml("Featured", featured));
    }
    for (const [group, items] of [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (group === "Featured") continue;
      sections.push(sectionHtml(group, items));
    }

    root.themeList.innerHTML = sections.join("");
  }

  // ---------- Render: stage ----------

  function setVar(name, value) {
    root.stage.style.setProperty(name, value);
  }

  function renderTokens(container, tokens) {
    container.innerHTML = Object.entries(tokens)
      .map(
        ([name, value]) => `
        <div class="token">
          <button type="button" class="chip" style="background:${escapeStyle(value)}" data-hex="${escapeHtml(
          value
        )}" aria-label="Copy ${escapeHtml(name)} ${escapeHtml(value)}" title="Click to copy ${escapeHtml(
          value
        )}"></button>
          <span>
            <span class="token-name">${escapeHtml(name)}</span><br>
            <span class="token-value">${escapeHtml(value)}</span>
          </span>
        </div>`
      )
      .join("");
  }

  function renderContrast(colors) {
    const pairs = [
      ["Text on background", colors.foreground, colors.background],
      ["Muted text on background", colors.mutedForeground, colors.background],
      ["Accent on background", colors.accent, colors.background],
      ["Accent text on accent", colors.accentForeground, colors.accent],
      ["Text on surface", colors.foreground, colors.surface],
      ["Error on background", colors.error, colors.background],
      ["Success on background", colors.success, colors.background],
    ];
    root.contrastList.innerHTML = pairs
      .map(([name, fg, bg]) => {
        const score = contrastRatio(fg, bg);
        const { aa, aaa, aaLarge } = wcagLevel(score);
        const tags = aaa ? "AAA" : aa ? "AA" : aaLarge ? "AA Large" : "Fail";
        const cls = aaa ? "pass-aaa" : aa ? "pass-aa" : aaLarge ? "pass-large" : "fail";
        return `<div class="contrast-item ${cls}">
          <span>${escapeHtml(name)}</span>
          <span class="contrast-score">${score.toFixed(2)} <em>${tags}</em></span>
        </div>`;
      })
      .join("");
  }

  function applyTheme(slug) {
    const theme = getTheme(slug);
    if (!theme) return;
    state.currentSlug = slug;
    try {
      localStorage.setItem(KEY_LAST, slug);
    } catch {}
    trackRecent(slug);
    history.replaceState(null, "", themeUrl(location.href, slug));

    const colors = theme.colors;
    document.title = `${theme.name} | Theme Atlas`;
    if (root.liveRegion) {
      root.liveRegion.textContent = `Now viewing: ${theme.name}, ${theme.appearance} theme`;
    }
    if (root.themeColorMeta && colors.accent) {
      root.themeColorMeta.setAttribute("content", colors.accent);
    }
    document.documentElement.dataset.appearance = theme.appearance || "dark";

    root.themeName.textContent = theme.name;
    root.themeSlug.textContent = `themes/${theme.slug}.json`;
    root.themeMode.textContent = `${theme.appearance} theme`;
    root.favoriteCurrent.textContent = state.favorites.has(slug) ? "Unfavorite" : "Favorite";

    setVar("--theme-background", colors.background);
    setVar("--theme-foreground", colors.foreground);
    setVar("--theme-surface", colors.surface);
    setVar("--theme-raised", colors.surfaceRaised);
    setVar("--theme-border", colors.border);
    setVar("--theme-accent", colors.accent);
    setVar("--theme-accent-foreground", colors.accentForeground);
    setVar("--theme-muted", colors.mutedForeground);
    setVar("--theme-info", colors.info);
    setVar("--syntax-comment", colors.syntax.comment);
    setVar("--syntax-keyword", colors.syntax.keyword);
    setVar("--syntax-function", colors.syntax.function);
    setVar("--syntax-string", colors.syntax.string);
    setVar("--syntax-number", colors.syntax.number);
    setVar("--syntax-type", colors.syntax.type);
    setVar("--syntax-constant", colors.syntax.constant);

    renderTokens(root.statusGrid, {
      success: colors.success,
      warning: colors.warning,
      error: colors.error,
      info: colors.info,
    });
    renderTokens(root.tokenGrid, {
      background: colors.background,
      foreground: colors.foreground,
      surface: colors.surface,
      surfaceRaised: colors.surfaceRaised,
      border: colors.border,
      accent: colors.accent,
      mutedForeground: colors.mutedForeground,
      selection: colors.selection,
      cursor: colors.cursor,
    });
    root.heroStrip.innerHTML = [
      colors.background,
      colors.surface,
      colors.surfaceRaised,
      colors.accent,
      colors.success,
      colors.warning,
      colors.error,
      colors.info,
    ]
      .map((c) => `<span style="background:${escapeStyle(c)}"></span>`)
      .join("");

    renderContrast(colors);
    updateActiveButton();
    updateCompareButton();
  }

  function updateActiveButton() {
    const prev = root.themeList.querySelector('button[aria-pressed="true"]');
    if (prev) prev.setAttribute("aria-pressed", "false");
    const next = root.themeList.querySelector(`button[data-slug="${CSS.escape(state.currentSlug || "")}"]`);
    if (next) {
      next.setAttribute("aria-pressed", "true");
      next.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion ? "auto" : "smooth" });
    }
  }

  function updateFavoriteButton(slug) {
    const btn = root.themeList.querySelector(`[data-favorite="${CSS.escape(slug)}"]`);
    if (!btn) return;
    const isFav = state.favorites.has(slug);
    btn.textContent = isFav ? "★" : "☆";
    btn.classList.toggle("is-favorite", isFav);
    btn.setAttribute("aria-checked", String(isFav));
  }

  function updateCompareButton() {
    const on = state.compareSlugs.includes(state.currentSlug);
    root.compareCurrent.textContent = on ? "Unpin compare" : "Compare";
  }

  function renderCompare() {
    root.comparePanel.hidden = state.compareSlugs.length === 0;
    root.compareGrid.innerHTML = state.compareSlugs
      .map((slug) => themeMap.get(slug))
      .filter(Boolean)
      .map((theme) => {
        const c = theme.colors;
        const swatches = [c.background, c.surface, c.accent, c.success, c.warning, c.error]
          .map((color) => `<span style="background:${escapeStyle(color)}"></span>`)
          .join("");
        const score = contrastRatio(c.foreground, c.background).toFixed(2);
        return `<article class="compare-card">
          <div>
            <strong>${escapeHtml(theme.name)}</strong>
            <span>${escapeHtml(theme.appearance)} · ${escapeHtml(theme.slug)}</span>
          </div>
          <div class="swatches" aria-hidden="true">${swatches}</div>
          <dl>
            <div><dt>Background</dt><dd>${escapeHtml(c.background)}</dd></div>
            <div><dt>Accent</dt><dd>${escapeHtml(c.accent)}</dd></div>
            <div><dt>Text contrast</dt><dd>${score}</dd></div>
          </dl>
        </article>`;
      })
      .join("");
    updateCompareButton();
  }

  // ---------- Export ----------

  function labelledTheme(theme) {
    return {
      label: theme.name,
      slug: theme.slug,
      file: `themes/${theme.slug}.json`,
      appearance: theme.appearance,
      colors: theme.colors,
    };
  }

  function cssVariables(theme) {
    return Object.entries(theme.colors)
      .filter(([, value]) => typeof value === "string")
      .map(([key, value]) => `  --${theme.slug}-${key.replace(/[A-Z]/g, (l) => "-" + l.toLowerCase())}: ${value};`)
      .join("\n");
  }

  function copyPayload(type) {
    const theme = getTheme(state.currentSlug);
    if (!theme) return "";
    const c = theme.colors;
    switch (type) {
      case "slug":
        return theme.slug;
      case "hex":
        return [
          c.background, c.foreground, c.surface, c.surfaceRaised, c.border,
          c.accent, c.success, c.warning, c.error, c.info,
        ].join(", ");
      case "css":
        return `:root {\n${cssVariables(theme)}\n}`;
      case "ts":
        return `export const ${theme.slug.replace(/-([a-z])/g, (_, l) => l.toUpperCase())}Theme = ${JSON.stringify(
          labelledTheme(theme),
          null,
          2
        )} as const;`;
      case "json":
        return JSON.stringify({ exportType: "single-theme", theme: labelledTheme(theme) }, null, 2);
      case "tailwind":
        return `// tailwind.config.js — ${theme.name}
module.exports = {
  theme: {
    extend: {
      colors: {
        background: '${c.background}',
        foreground: '${c.foreground}',
        surface: '${c.surface}',
        'surface-raised': '${c.surfaceRaised}',
        border: '${c.border}',
        accent: '${c.accent}',
        success: '${c.success}',
        warning: '${c.warning}',
        error: '${c.error}',
        info: '${c.info}',
      },
    },
  },
};`;
      case "vscode":
        return JSON.stringify(
          {
            name: theme.name,
            type: theme.appearance,
            colors: {
              "editor.background": c.background,
              "editor.foreground": c.foreground,
              "editor.selectionBackground": c.selection,
              "editorCursor.foreground": c.cursor,
              "editor.lineHighlightBackground": c.surface,
              "editorLineNumber.foreground": c.mutedForeground,
              "activityBar.background": c.background,
              "activityBar.foreground": c.foreground,
              "sideBar.background": c.surface,
              "sideBar.foreground": c.foreground,
              "statusBar.background": c.accent,
              "statusBar.foreground": c.accentForeground,
              "tab.activeBackground": c.surfaceRaised,
              "tab.inactiveBackground": c.surface,
              "titleBar.activeBackground": c.background,
              focusBorder: c.accent,
              "button.background": c.accent,
              "button.foreground": c.accentForeground,
            },
            tokenColors: [
              { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: c.syntax.comment, fontStyle: "italic" } },
              { scope: ["keyword", "storage.type", "storage.modifier"], settings: { foreground: c.syntax.keyword } },
              { scope: ["entity.name.function", "support.function"], settings: { foreground: c.syntax.function } },
              { scope: ["string", "string.quoted"], settings: { foreground: c.syntax.string } },
              { scope: ["constant.numeric"], settings: { foreground: c.syntax.number } },
              { scope: ["entity.name.type", "support.type"], settings: { foreground: c.syntax.type } },
              { scope: ["variable", "variable.other"], settings: { foreground: c.syntax.variable } },
              { scope: ["constant", "constant.language"], settings: { foreground: c.syntax.constant } },
            ],
          },
          null,
          2
        );
      default:
        return "";
    }
  }

  function downloadJson(filename, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* fall through */
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("aria-hidden", "true");
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  // ---------- Event wiring ----------

  function bindEvents() {
    root.themeList.addEventListener("click", async (event) => {
      const fav = event.target.closest("[data-favorite]");
      if (fav) {
        const slug = fav.dataset.favorite;
        if (state.favorites.has(slug)) state.favorites.delete(slug);
        else state.favorites.add(slug);
        saveFavorites();
        updateFavoriteButton(slug);
        if (slug === state.currentSlug) {
          root.favoriteCurrent.textContent = state.favorites.has(slug) ? "Unfavorite" : "Favorite";
        }
        if (state.activeFilter === "favorites") renderList();
        event.stopPropagation();
        event.preventDefault();
        return;
      }

      const cmp = event.target.closest("[data-compare]");
      if (cmp) {
        state.compareSlugs = toggleCompare(state.compareSlugs, cmp.dataset.compare, state.compareLimit);
        saveCompare();
        renderList();
        renderCompare();
        event.stopPropagation();
        event.preventDefault();
        return;
      }

      const btn = event.target.closest("button[data-slug]");
      if (!btn) return;
      const slug = btn.dataset.slug;
      const theme = await ensureTheme(slug);
      if (theme) {
        applyTheme(slug);
        // If this is a brand-new theme, re-render the list so tags/swatches reflect it
        if (!themeMap.has(slug) || true) {
          // Always re-render so derived tags (warm/cool etc.) appear immediately
          renderList();
        }
      }
    });

    // Arrow key navigation through the visible theme buttons
    root.themeList.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const buttons = [...root.themeList.querySelectorAll("button[data-slug]")];
      if (!buttons.length) return;
      event.preventDefault();
      const idx = buttons.findIndex((b) => b.dataset.slug === state.currentSlug);
      const next = event.key === "ArrowDown" ? buttons[idx + 1] || buttons[0] : buttons[idx - 1] || buttons[buttons.length - 1];
      if (next) {
        next.focus();
        ensureTheme(next.dataset.slug).then((t) => {
          if (t) applyTheme(next.dataset.slug);
        });
        next.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion ? "auto" : "smooth" });
      }
    });

    root.themeSearch.addEventListener("input", () => {
      state.filterText = root.themeSearch.value;
      clearTimeout(state.debounceTimer);
      state.debounceTimer = setTimeout(renderList, 120);
    });

    root.filterChips.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-filter]");
      if (!btn) return;
      state.activeFilter = btn.dataset.filter;
      renderFilters();
      renderList();
    });

    root.randomTheme.addEventListener("click", async () => {
      const items = visibleThemes();
      const pool = items.length ? items : themeIndex;
      const next = pool[Math.floor(Math.random() * pool.length)];
      if (!next) return;
      const theme = await ensureTheme(next.slug);
      if (theme) {
        applyTheme(next.slug);
        renderList();
      }
    });

    root.favoriteCurrent.addEventListener("click", () => {
      if (!state.currentSlug) return;
      if (state.favorites.has(state.currentSlug)) state.favorites.delete(state.currentSlug);
      else state.favorites.add(state.currentSlug);
      saveFavorites();
      root.favoriteCurrent.textContent = state.favorites.has(state.currentSlug) ? "Unfavorite" : "Favorite";
      updateFavoriteButton(state.currentSlug);
      if (state.activeFilter === "favorites") renderList();
    });

    root.compareCurrent.addEventListener("click", () => {
      if (!state.currentSlug) return;
      state.compareSlugs = toggleCompare(state.compareSlugs, state.currentSlug, state.compareLimit);
      saveCompare();
      renderList();
      renderCompare();
    });

    root.clearCompare.addEventListener("click", () => {
      state.compareSlugs = [];
      saveCompare();
      renderList();
      renderCompare();
    });

    document.addEventListener("click", async (event) => {
      const copyBtn = event.target.closest("button[data-copy]");
      if (copyBtn) {
        const original = copyBtn.textContent;
        const ok = await copyText(copyPayload(copyBtn.dataset.copy));
        copyBtn.textContent = ok ? "Copied" : "Copy failed";
        setTimeout(() => {
          copyBtn.textContent = original;
        }, 900);
        return;
      }
      const chip = event.target.closest(".chip[data-hex]");
      if (chip) {
        const hex = chip.dataset.hex;
        const ok = await copyText(hex);
        const orig = chip.getAttribute("title") || "";
        chip.setAttribute("title", ok ? "Copied!" : "Copy failed");
        setTimeout(() => chip.setAttribute("title", orig), 900);
      }
    });

    // Global keyboard shortcuts
    document.addEventListener("keydown", (event) => {
      const tag = document.activeElement?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable;
      if (event.key === "/" && !inField && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        root.themeSearch.focus();
        root.themeSearch.select();
        return;
      }
      if (event.key === "Escape" && document.activeElement === root.themeSearch) {
        root.themeSearch.value = "";
        state.filterText = "";
        root.themeSearch.blur();
        renderList();
        return;
      }
      // 'f' toggles favorite for the current theme
      if (event.key === "f" && !inField && state.currentSlug) {
        event.preventDefault();
        if (state.favorites.has(state.currentSlug)) state.favorites.delete(state.currentSlug);
        else state.favorites.add(state.currentSlug);
        saveFavorites();
        updateFavoriteButton(state.currentSlug);
        root.favoriteCurrent.textContent = state.favorites.has(state.currentSlug) ? "Unfavorite" : "Favorite";
        if (state.activeFilter === "favorites") renderList();
        return;
      }
      // 'c' toggles compare
      if (event.key === "c" && !inField && state.currentSlug) {
        event.preventDefault();
        state.compareSlugs = toggleCompare(state.compareSlugs, state.currentSlug, state.compareLimit);
        saveCompare();
        renderList();
        renderCompare();
        return;
      }
    });

    root.exportCurrent.addEventListener("click", () => {
      const theme = getTheme(state.currentSlug);
      if (!theme) return;
      downloadJson(`${theme.slug}.theme.json`, {
        exportType: "single-theme",
        theme: labelledTheme(theme),
      });
    });

    root.exportAll.addEventListener("click", async () => {
      // Make sure we have every theme loaded so the export is complete
      await ensureAllThemes();
      const all = [...themeMap.values()].map(labelledTheme);
      downloadJson("theme-catalog.json", { exportType: "theme-catalog", count: all.length, themes: all });
    });
  }

  // ---------- Service worker registration with update prompt ----------

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "http:" && location.protocol !== "https:") return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((err) => {
        console.warn("Service worker registration failed:", err);
      });
      // Listen for updates and prompt the user
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        // Soft reload once the new worker takes over
        if (window.__themeAtlasReloading) return;
        window.__themeAtlasReloading = true;
        location.reload();
      });
    });
  }

  // ---------- Initial render ----------

  async function init() {
    try {
      await loadIndex();
    } catch (err) {
      root.themeList.innerHTML = `<div class="panel empty">Failed to load themes. ${escapeHtml(
        err.message
      )}</div>`;
      return;
    }

    // Eagerly load the first theme (or whatever the URL/localStorage asks for)
    const urlSlug = normalizeSlug(new URLSearchParams(location.search).get("theme"));
    const initialSlug =
      (urlSlug && themeIndex.find((m) => m.slug === urlSlug)?.slug) ||
      readJSON(KEY_LAST, null) ||
      themeIndex[0]?.slug;

    if (initialSlug) {
      await ensureTheme(initialSlug);
    }

    renderFilters();
    renderList();
    if (initialSlug) {
      applyTheme(initialSlug);
    }
    renderCompare();
    bindEvents();
    registerServiceWorker();
  }

  init();
}

boot().catch((err) => {
  console.error("Theme Atlas failed to start:", err);
  const list = document.querySelector("#themeList");
  if (list) list.innerHTML = `<div class="panel empty">Theme Atlas failed to start: ${err.message}</div>`;
});
