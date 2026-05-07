    import { classifyTheme, themeUrl, toggleCompare } from "./app-utils.mjs";

    const themes = window.THEME_DATA || [];

    // O(1) slug → theme lookup
    const themeMap = new Map(themes.map(t => [t.slug, t]));

    // Pre-compute search strings once at startup
    const enrichedTags = new Map(themes.map(t => [t.slug, classifyTheme(t)]));
    const searchIndex = themes.map(t =>
      `${t.name} ${t.slug} ${t.appearance} ${t.group} ${(enrichedTags.get(t.slug) || []).join(" ")}`.toLowerCase()
    );

    const themeList = document.querySelector("#themeList");
    const stage = document.querySelector("#stage");
    const themeName = document.querySelector("#themeName");
    const themeSlug = document.querySelector("#themeSlug");
    const themeMode = document.querySelector("#themeMode");
    const themeSearch = document.querySelector("#themeSearch");
    const themeCount = document.querySelector("#themeCount");
    const randomTheme = document.querySelector("#randomTheme");
    const filterChips = document.querySelector("#filterChips");
    const favoriteCurrent = document.querySelector("#favoriteCurrent");
    const compareCurrent = document.querySelector("#compareCurrent");
    const clearCompare = document.querySelector("#clearCompare");
    const comparePanel = document.querySelector("#comparePanel");
    const compareGrid = document.querySelector("#compareGrid");
    const exportCurrent = document.querySelector("#exportCurrent");
    const exportAll = document.querySelector("#exportAll");
    const heroStrip = document.querySelector("#heroStrip");
    const tokenGrid = document.querySelector("#tokenGrid");
    const statusGrid = document.querySelector("#statusGrid");
    const contrastList = document.querySelector("#contrastList");
    const liveRegion = document.querySelector("#liveRegion");

    const lastKey = "theme-viewer-last";
    const favoriteKey = "theme-viewer-favorites";
    const recentKey = "theme-viewer-recent";
    const compareKey = "theme-viewer-compare";
    const MAX_RECENT = 8;
    const urlSlug = new URLSearchParams(location.search).get("theme");

    let currentSlug = (urlSlug && themeMap.has(urlSlug) ? urlSlug : null)
      || localStorage.getItem(lastKey)
      || themes[0]?.slug;
    let filterText = "";
    let activeFilter = "all";
    let debounceTimer;
    const filterOptions = ["all", "favorites", "featured", "popular", "dark", "light", "oled", "terminal", "bright", "low light", "warm", "cool"];
    const favorites = new Set(JSON.parse(localStorage.getItem(favoriteKey) || "[]"));
    let recentSlugs = JSON.parse(localStorage.getItem(recentKey) || "[]");
    let compareSlugs = JSON.parse(localStorage.getItem(compareKey) || "[]").filter(slug => themeMap.has(slug)).slice(0, 4);

    // Tracks user-opened/closed <details> groups across re-renders
    const openGroups = new Set(["Featured", "Recently Viewed"]);

    // Memoized luminance — hex values are static per theme
    const luminanceCache = new Map();

    function getTheme(slug) {
      return themeMap.get(slug) ?? themes[0];
    }

    function setVar(name, value) {
      stage.style.setProperty(name, value);
    }

    function visibleThemes() {
      const query = filterText.trim().toLowerCase();
      return themes.filter((theme, i) => {
        const matchesSearch = !query || searchIndex[i].includes(query);
        const matchesFilter = activeFilter === "all"
          || (activeFilter === "favorites" && favorites.has(theme.slug))
          || (enrichedTags.get(theme.slug) || []).includes(activeFilter);
        return matchesSearch && matchesFilter;
      });
    }

    function tagCount(filter) {
      if (filter === "all") return themes.length;
      if (filter === "favorites") return favorites.size;
      return themes.filter(t => (enrichedTags.get(t.slug) || []).includes(filter)).length;
    }

    function renderFilters() {
      filterChips.innerHTML = filterOptions.map((filter) => {
        const label = filter === "all" ? "All" : filter[0].toUpperCase() + filter.slice(1);
        const count = tagCount(filter);
        return `<button class="filter-chip" type="button" data-filter="${filter}" aria-pressed="${filter === activeFilter}">${label} <span class="chip-count">${count}</span></button>`;
      }).join("");
    }

    function renderThemeButton(theme) {
      const colors = theme.colors;
      const tags = (enrichedTags.get(theme.slug) || [])
        .filter((tag) => ["popular", "oled", "terminal", "light", "bright", "low light", "warm", "cool"].includes(tag))
        .slice(0, 3)
        .map((tag) => `<span class="badge">${tag}</span>`)
        .join("");
      const swatches = [
        colors.background,
        colors.foreground,
        colors.surfaceRaised,
        colors.accent,
        colors.success,
        colors.error
      ].map((color) => `<span style="background:${color}"></span>`).join("");
      const isFav = favorites.has(theme.slug);
      const isCompared = compareSlugs.includes(theme.slug);

      return `<button class="theme-button" type="button" data-slug="${theme.slug}" aria-pressed="${theme.slug === currentSlug}" role="listitem">
        <span class="favorite-toggle ${isFav ? "is-favorite" : ""}" data-favorite="${theme.slug}" title="Toggle favorite">${isFav ? "★" : "☆"}</span>
        <span class="compare-toggle ${isCompared ? "is-compared" : ""}" data-compare="${theme.slug}" title="Toggle comparison">◆</span>
        <span class="theme-meta"><strong>${theme.name}</strong><span class="badges">${tags}</span></span>
        <span class="swatches" aria-hidden="true">${swatches}</span>
      </button>`;
    }

    // Snapshot open/closed state before any re-render
    function snapshotOpenGroups() {
      themeList.querySelectorAll("details.theme-section").forEach(d => {
        const title = d.querySelector("summary span")?.textContent;
        if (title) {
          if (d.open) openGroups.add(title);
          else openGroups.delete(title);
        }
      });
    }

    function trackRecent(slug) {
      recentSlugs = [slug, ...recentSlugs.filter(s => s !== slug)].slice(0, MAX_RECENT);
      localStorage.setItem(recentKey, JSON.stringify(recentSlugs));
    }

    function renderList() {
      snapshotOpenGroups();
      const items = visibleThemes();
      themeCount.textContent = `${items.length} of ${themes.length} themes`;
      const searching = filterText.trim().length > 0;

      if (!items.length) {
        themeList.innerHTML = `<div class="panel">No matching themes.</div>`;
        return;
      }

      if (searching) {
        themeList.innerHTML = items.map(renderThemeButton).join("");
        return;
      }

      const featured = items.filter((theme) => (theme.tags || []).includes("featured"));
      const grouped = new Map();
      for (const theme of items) {
        const group = theme.group || "Other";
        if (!grouped.has(group)) grouped.set(group, []);
        grouped.get(group).push(theme);
      }

      const sections = [];

      if (recentSlugs.length > 1 && activeFilter === "all") {
        const recentThemes = recentSlugs.map(s => themeMap.get(s)).filter(Boolean);
        sections.push(sectionHtml("Recently Viewed", recentThemes));
      }

      if (featured.length && activeFilter === "all") {
        sections.push(sectionHtml("Featured", featured));
      }

      for (const [group, groupThemes] of [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (group === "Featured") continue;
        sections.push(sectionHtml(group, groupThemes));
      }

      themeList.innerHTML = sections.join("");
    }

    function sectionHtml(title, items) {
      const open = openGroups.has(title) || items.some(t => t.slug === currentSlug);
      return `<details class="theme-section" ${open ? "open" : ""}>
        <summary><span>${title}</span><span class="section-count">${items.length}</span></summary>
        <div class="section-list">${items.map(renderThemeButton).join("")}</div>
      </details>`;
    }

    // Update only the active button — avoids full list re-render on theme change
    function updateActiveButton() {
      const prev = themeList.querySelector('button[aria-pressed="true"]');
      if (prev) prev.setAttribute("aria-pressed", "false");
      const next = themeList.querySelector(`button[data-slug="${currentSlug}"]`);
      if (next) {
        next.setAttribute("aria-pressed", "true");
        next.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }

    // Update a single favorite star in-place — avoids full list re-render
    function updateFavoriteButton(slug) {
      const btn = themeList.querySelector(`[data-favorite="${slug}"]`);
      if (!btn) return;
      const isFav = favorites.has(slug);
      btn.textContent = isFav ? "★" : "☆";
      btn.classList.toggle("is-favorite", isFav);
    }

    function renderTokens(container, tokens) {
      container.innerHTML = Object.entries(tokens).map(([name, value]) => `
        <div class="token">
          <span class="chip" style="background:${value}" title="Click to copy ${value}" data-hex="${value}"></span>
          <span>
            <span class="token-name">${name}</span><br>
            <span class="token-value">${value}</span>
          </span>
        </div>
      `).join("");
    }

    function downloadJson(filename, payload) {
      const blob = new Blob([JSON.stringify(payload, null, 2) + "\n"], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }

    function labelledTheme(theme) {
      return {
        label: theme.name,
        slug: theme.slug,
        file: `themes/${theme.slug}.json`,
        appearance: theme.appearance,
        colors: theme.colors
      };
    }

    function saveFavorites() {
      localStorage.setItem(favoriteKey, JSON.stringify([...favorites].sort()));
    }

    function saveCompare() {
      localStorage.setItem(compareKey, JSON.stringify(compareSlugs));
    }

    function updateCompareButton() {
      compareCurrent.textContent = compareSlugs.includes(currentSlug) ? "Unpin compare" : "Compare";
    }

    function renderCompare() {
      comparePanel.hidden = compareSlugs.length === 0;
      compareGrid.innerHTML = compareSlugs.map(slug => themeMap.get(slug)).filter(Boolean).map(theme => {
        const colors = theme.colors;
        const swatches = [colors.background, colors.surface, colors.accent, colors.success, colors.warning, colors.error]
          .map(color => `<span style="background:${color}"></span>`)
          .join("");
        return `<article class="compare-card">
          <div>
            <strong>${theme.name}</strong>
            <span>${theme.appearance} · ${theme.slug}</span>
          </div>
          <div class="swatches" aria-hidden="true">${swatches}</div>
          <dl>
            <div><dt>Background</dt><dd>${colors.background}</dd></div>
            <div><dt>Accent</dt><dd>${colors.accent}</dd></div>
            <div><dt>Text contrast</dt><dd>${contrastRatio(colors.foreground, colors.background).toFixed(2)}</dd></div>
          </dl>
        </article>`;
      }).join("");
      updateCompareButton();
    }

    function hexToRgb(hex) {
      const clean = hex.replace("#", "");
      return [
        parseInt(clean.slice(0, 2), 16) / 255,
        parseInt(clean.slice(2, 4), 16) / 255,
        parseInt(clean.slice(4, 6), 16) / 255
      ];
    }

    function luminance(hex) {
      if (luminanceCache.has(hex)) return luminanceCache.get(hex);
      const result = hexToRgb(hex).map(v =>
        v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
      ).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      luminanceCache.set(hex, result);
      return result;
    }

    function contrastRatio(a, b) {
      const first = luminance(a);
      const second = luminance(b);
      const light = Math.max(first, second);
      const dark = Math.min(first, second);
      return (light + 0.05) / (dark + 0.05);
    }

    function contrastLabel(score) {
      if (score >= 7) return "AAA";
      if (score >= 4.5) return "AA";
      if (score >= 3) return "Large";
      return "Low";
    }

    function renderContrast(colors) {
      const pairs = [
        ["Text on background", colors.foreground, colors.background],
        ["Accent on background", colors.accent, colors.background],
        ["Text on surface", colors.foreground, colors.surface],
        ["Error on background", colors.error, colors.background],
        ["Success on background", colors.success, colors.background]
      ];

      contrastList.innerHTML = pairs.map(([name, fg, bg]) => {
        const score = contrastRatio(fg, bg);
        return `<div class="contrast-item">
          <span>${name}</span>
          <span class="contrast-score">${score.toFixed(2)} ${contrastLabel(score)}</span>
        </div>`;
      }).join("");
    }

    function cssVariables(theme) {
      return Object.entries(theme.colors)
        .filter(([, value]) => typeof value === "string")
        .map(([key, value]) => `  --${theme.slug}-${key.replace(/[A-Z]/g, l => "-" + l.toLowerCase())}: ${value};`)
        .join("\n");
    }

    function copyPayload(type) {
      const theme = getTheme(currentSlug);
      const colors = theme.colors;
      if (type === "slug") return theme.slug;
      if (type === "hex") {
        return [
          colors.background, colors.foreground, colors.surface, colors.surfaceRaised,
          colors.border, colors.accent, colors.success, colors.warning, colors.error, colors.info
        ].join(", ");
      }
      if (type === "css") return `:root {\n${cssVariables(theme)}\n}`;
      if (type === "ts") return `export const ${theme.slug.replace(/-([a-z])/g, (_, l) => l.toUpperCase())}Theme = ${JSON.stringify(labelledTheme(theme), null, 2)} as const;`;
      if (type === "tailwind") {
        const c = colors;
        return `// tailwind.config.js — ${theme.name}\nmodule.exports = {\n  theme: {\n    extend: {\n      colors: {\n        background: '${c.background}',\n        foreground: '${c.foreground}',\n        surface: '${c.surface}',\n        'surface-raised': '${c.surfaceRaised}',\n        border: '${c.border}',\n        accent: '${c.accent}',\n        success: '${c.success}',\n        warning: '${c.warning}',\n        error: '${c.error}',\n        info: '${c.info}',\n      },\n    },\n  },\n};`;
      }
      if (type === "vscode") {
        const c = colors;
        return JSON.stringify({
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
            "focusBorder": c.accent,
            "button.background": c.accent,
            "button.foreground": c.accentForeground
          },
          tokenColors: [
            { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: c.syntax.comment, fontStyle: "italic" } },
            { scope: ["keyword", "storage.type", "storage.modifier"], settings: { foreground: c.syntax.keyword } },
            { scope: ["entity.name.function", "support.function"], settings: { foreground: c.syntax.function } },
            { scope: ["string", "string.quoted"], settings: { foreground: c.syntax.string } },
            { scope: ["constant.numeric"], settings: { foreground: c.syntax.number } },
            { scope: ["entity.name.type", "support.type"], settings: { foreground: c.syntax.type } },
            { scope: ["variable", "variable.other"], settings: { foreground: c.syntax.variable } },
            { scope: ["constant", "constant.language"], settings: { foreground: c.syntax.constant } }
          ]
        }, null, 2);
      }
      return JSON.stringify({ exportType: "single-theme", theme: labelledTheme(theme) }, null, 2);
    }

    async function copyText(text) {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          return;
        }
      } catch {}
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }

    function applyTheme(slug) {
      currentSlug = slug;
      localStorage.setItem(lastKey, slug);
      trackRecent(slug);

      // Sync URL so the current theme is shareable/bookmarkable
      history.replaceState(null, "", themeUrl(location.href, slug));

      const theme = getTheme(slug);
      const colors = theme.colors;

      document.title = `${theme.name} | Theme Atlas`;
      liveRegion.textContent = `Now viewing: ${theme.name}, ${theme.appearance} theme`;

      themeName.textContent = theme.name;
      themeSlug.textContent = `themes/${theme.slug}.json`;
      themeMode.textContent = `${theme.appearance} theme`;
      favoriteCurrent.textContent = favorites.has(theme.slug) ? "Unfavorite" : "Favorite";

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

      renderTokens(statusGrid, {
        success: colors.success,
        warning: colors.warning,
        error: colors.error,
        info: colors.info
      });

      renderTokens(tokenGrid, {
        background: colors.background,
        foreground: colors.foreground,
        surface: colors.surface,
        surfaceRaised: colors.surfaceRaised,
        border: colors.border,
        accent: colors.accent,
        mutedForeground: colors.mutedForeground,
        selection: colors.selection,
        cursor: colors.cursor
      });

      heroStrip.innerHTML = [
        colors.background, colors.surface, colors.surfaceRaised, colors.accent,
        colors.success, colors.warning, colors.error, colors.info
      ].map((color) => `<span style="background:${color}"></span>`).join("");

      renderContrast(colors);
      updateActiveButton();
      updateCompareButton();
    }

    themeList.addEventListener("click", (event) => {
      const favorite = event.target.closest("[data-favorite]");
      if (favorite) {
        const slug = favorite.dataset.favorite;
        favorites.has(slug) ? favorites.delete(slug) : favorites.add(slug);
        saveFavorites();
        updateFavoriteButton(slug);
        if (slug === currentSlug) {
          favoriteCurrent.textContent = favorites.has(slug) ? "Unfavorite" : "Favorite";
        }
        if (activeFilter === "favorites") renderList();
        event.stopPropagation();
        return;
      }

      const compare = event.target.closest("[data-compare]");
      if (compare) {
        compareSlugs = toggleCompare(compareSlugs, compare.dataset.compare);
        saveCompare();
        renderList();
        renderCompare();
        event.stopPropagation();
        return;
      }

      const button = event.target.closest("button[data-slug]");
      if (!button) return;
      applyTheme(button.dataset.slug);
    });

    // Arrow key navigation through the theme list
    themeList.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const buttons = [...themeList.querySelectorAll("button[data-slug]")];
      const idx = buttons.findIndex(b => b.dataset.slug === currentSlug);
      const next = event.key === "ArrowDown" ? buttons[idx + 1] : buttons[idx - 1];
      if (next) {
        next.focus();
        applyTheme(next.dataset.slug);
        next.scrollIntoView({ block: "nearest" });
      }
    });

    themeSearch.addEventListener("input", () => {
      filterText = themeSearch.value;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(renderList, 150);
    });

    filterChips.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-filter]");
      if (!button) return;
      activeFilter = button.dataset.filter;
      renderFilters();
      renderList();
    });

    randomTheme.addEventListener("click", () => {
      const items = visibleThemes();
      const pool = items.length ? items : themes;
      const next = pool[Math.floor(Math.random() * pool.length)];
      applyTheme(next.slug);
    });

    favoriteCurrent.addEventListener("click", () => {
      favorites.has(currentSlug) ? favorites.delete(currentSlug) : favorites.add(currentSlug);
      saveFavorites();
      favoriteCurrent.textContent = favorites.has(currentSlug) ? "Unfavorite" : "Favorite";
      updateFavoriteButton(currentSlug);
      if (activeFilter === "favorites") renderList();
    });

    compareCurrent.addEventListener("click", () => {
      compareSlugs = toggleCompare(compareSlugs, currentSlug);
      saveCompare();
      renderList();
      renderCompare();
    });

    clearCompare.addEventListener("click", () => {
      compareSlugs = [];
      saveCompare();
      renderList();
      renderCompare();
    });

    document.addEventListener("click", async (event) => {
      // Copy format buttons
      const copyBtn = event.target.closest("button[data-copy]");
      if (copyBtn) {
        const original = copyBtn.textContent;
        await copyText(copyPayload(copyBtn.dataset.copy));
        copyBtn.textContent = "Copied";
        setTimeout(() => { copyBtn.textContent = original; }, 900);
        return;
      }

      // Click individual colour chip to copy its hex
      const chip = event.target.closest(".chip[data-hex]");
      if (chip) {
        const hex = chip.dataset.hex;
        await copyText(hex);
        const orig = chip.title;
        chip.title = "Copied!";
        setTimeout(() => { chip.title = orig; }, 900);
      }
    });

    // / focuses search; Escape clears it
    document.addEventListener("keydown", (event) => {
      const tag = document.activeElement?.tagName;
      if (event.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        themeSearch.focus();
        themeSearch.select();
      }
      if (event.key === "Escape" && document.activeElement === themeSearch) {
        themeSearch.value = "";
        filterText = "";
        themeSearch.blur();
        renderList();
      }
    });

    exportCurrent.addEventListener("click", () => {
      const theme = getTheme(currentSlug);
      downloadJson(`${theme.slug}.theme.json`, {
        exportType: "single-theme",
        theme: labelledTheme(theme)
      });
    });

    exportAll.addEventListener("click", () => {
      downloadJson("theme-catalog.json", {
        exportType: "theme-catalog",
        count: themes.length,
        themes: themes.map(labelledTheme)
      });
    });

    renderFilters();
    renderList();
    applyTheme(currentSlug);
    renderCompare();
