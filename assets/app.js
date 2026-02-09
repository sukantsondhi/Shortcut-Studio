const state = {
  data: null,
  query: "",
  selectedApps: new Set(),
  selectedPlatforms: new Set(),
  showFavorites: false,
  compactMode: false,
  favorites: new Set(),
  darkMode: false,
};

const elements = {
  appFilters: document.getElementById("appFilters"),
  platformFilters: document.getElementById("platformFilters"),
  searchInput: document.getElementById("searchInput"),
  results: document.getElementById("results"),
  lastUpdated: document.getElementById("lastUpdated"),
  shortcutCount: document.getElementById("shortcutCount"),
  spotlight: document.getElementById("spotlight"),
  copySpotlight: document.getElementById("copySpotlight"),
  randomSpotlight: document.getElementById("randomSpotlight"),
  showFavorites: document.getElementById("showFavorites"),
  compactMode: document.getElementById("compactMode"),
  expandAll: document.getElementById("expandAll"),
  collapseAll: document.getElementById("collapseAll"),
  exportDialog: document.getElementById("exportDialog"),
  exportSelect: document.getElementById("exportSelect"),
  exportRun: document.getElementById("exportRun"),
  toast: document.getElementById("toast"),
  darkMode: document.getElementById("darkMode"),
};

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const loadFavorites = () => {
  try {
    const stored = JSON.parse(localStorage.getItem("office-key-atlas:favorites") || "[]");
    state.favorites = new Set(stored);
  } catch {
    state.favorites = new Set();
  }
};

const saveFavorites = () => {
  localStorage.setItem("office-key-atlas:favorites", JSON.stringify(Array.from(state.favorites)));
};

const loadTheme = () => {
  let stored = localStorage.getItem("office-key-atlas:theme");
  const migrated = localStorage.getItem("office-key-atlas:theme-migrated") === "true";
  if (stored === "light" && !migrated) {
    stored = null;
    localStorage.setItem("office-key-atlas:theme-migrated", "true");
  }
  state.darkMode = stored ? stored === "dark" : true;
  document.body.classList.toggle("dark", state.darkMode);
  if (elements.darkMode) {
    elements.darkMode.checked = state.darkMode;
  }
  if (!stored) {
    saveTheme();
  }
};

const saveTheme = () => {
  localStorage.setItem("office-key-atlas:theme", state.darkMode ? "dark" : "light");
};

const normalizeQuery = (value) => value.trim().toLowerCase();

const normalizeShortcutKeys = (value, platformName = "") => {
  let keys = (value || "")
    .replace(/\u00a0/g, " ")
    .replace(/⌘/g, "Command")
    .replace(/⌥/g, "Option")
    .replace(/⌃/g, "Control")
    .replace(/⇧/g, "Shift")
    .replace(/\s+/g, " ")
    .replace(/\s*\+\s*/g, "+")
    .replace(/\s*,\s*/g, ", ")
    .trim();

  const platform = platformName.toLowerCase();
  const macLike = platform.includes("mac") || platform === "office";

  if (macLike) {
    if (/^\+[A-Za-z0-9]/.test(keys)) {
      keys = `Command${keys}`;
    }
    keys = keys.replace(/([A-Za-z]+)\+\+(?=[A-Za-z0-9(])/g, "$1+Command+");
  }

  keys = keys.replace(/\s+or\s+\+/gi, " or Command+");
  return keys;
};

const isMalformedShortcutKeys = (keys) => {
  if (!keys) return true;
  if (/^\+/.test(keys) || /\+$/.test(keys)) return true;
  if (/[A-Za-z]\+\+[A-Za-z]/.test(keys)) return true;
  return false;
};

const renderKeys = (keys, platformName = "") => {
  const normalized = normalizeShortcutKeys(keys, platformName);
  const combos = normalized.split(/\s+or\s+/i);

  const comboHtml = combos.map((combo) => {
    const chunks = combo.split(/\s*\+\s*/).filter(Boolean);
    return chunks
      .map((chunk) => `<kbd>${escapeHtml(chunk.trim())}</kbd>`)
      .join('<span class="key-plus">+</span>');
  });

  return comboHtml.join('<span class="key-or">or</span>');
};

const buildShortcutId = (app, platform, section, shortcut) =>
  [app, platform, section, shortcut.action, shortcut.keys]
    .map((value) => value.replace(/\s+/g, " ").trim())
    .join("|")
    .toLowerCase();

const showToast = (message) => {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => elements.toast.classList.remove("show"), 2200);
};

const updateSpotlight = (items) => {
  if (!items.length) {
    elements.spotlight.innerHTML =
      "<div class=\"spotlight-empty\">Select an app and OS to see spotlight shortcuts.</div>";
    return;
  }

  const item = items[Math.floor(Math.random() * items.length)];
  elements.spotlight.innerHTML = `
    <div class="spotlight-app">${escapeHtml(item.app)}</div>
    <div class="spotlight-action">${escapeHtml(item.action)}</div>
    <div class="spotlight-keys">${renderKeys(item.keys, item.platform)}</div>
    <div class="spotlight-meta">${escapeHtml(item.platform)} · ${escapeHtml(item.section)}</div>
  `;
  elements.spotlight.dataset.copy = `${item.action} — ${item.keys}`;
};

const collectPlatforms = (apps) => {
  const platforms = new Set();
  apps.forEach((app) => {
    app.sources.forEach((source) => {
      source.platforms.forEach((platform) => platforms.add(platform.name));
    });
  });
  return Array.from(platforms);
};

const computeStats = (apps) => {
  let count = 0;
  apps.forEach((app) => {
    app.sources.forEach((source) => {
      source.platforms.forEach((platform) => {
        platform.sections.forEach((section) => {
          count += section.shortcuts.length;
        });
      });
    });
  });
  return count;
};

const filterData = () => {
  const query = normalizeQuery(state.query);
  const showFavorites = state.showFavorites;

  const results = [];

  if (!state.selectedApps.size || !state.selectedPlatforms.size) {
    return results;
  }

  state.data.apps.forEach((app) => {
    if (!state.selectedApps.has(app.name)) return;

    const appEntry = {
      name: app.name,
      id: app.id,
      sources: [],
    };

    app.sources.forEach((source) => {
      const sourceEntry = {
        label: source.label,
        url: source.url,
        platforms: [],
      };

      source.platforms.forEach((platform) => {
        if (!state.selectedPlatforms.has(platform.name)) return;

        const sections = [];
        platform.sections.forEach((section) => {
          const shortcuts = section.shortcuts
            .map((shortcut) => ({
              ...shortcut,
              keys: normalizeShortcutKeys(shortcut.keys, platform.name),
            }))
            .filter((shortcut) => {
              if (!shortcut.action || !shortcut.keys) return false;
              if (/not assigned|unassigned|n\/a|none/i.test(shortcut.keys)) return false;
              if (isMalformedShortcutKeys(shortcut.keys)) return false;
              const id = buildShortcutId(app.name, platform.name, section.title, shortcut);
              if (showFavorites && !state.favorites.has(id)) return false;

              if (!query) return true;
              const haystack = `${shortcut.action} ${shortcut.keys} ${shortcut.notes || ""}`.toLowerCase();
              return haystack.includes(query);
            });

          if (shortcuts.length) {
            sections.push({
              title: section.title,
              shortcuts,
            });
          }
        });

        if (sections.length) {
          sourceEntry.platforms.push({
            name: platform.name,
            sections,
          });
        }
      });

      if (sourceEntry.platforms.length) {
        appEntry.sources.push(sourceEntry);
      }
    });

    if (appEntry.sources.length) {
      results.push(appEntry);
    }
  });

  return results;
};

const flattenShortcuts = (apps) => {
  const items = [];
  apps.forEach((app) => {
    app.sources.forEach((source) => {
      source.platforms.forEach((platform) => {
        platform.sections.forEach((section) => {
          section.shortcuts.forEach((shortcut) => {
            items.push({
              app: app.name,
              platform: platform.name,
              section: section.title,
              action: shortcut.action,
              keys: shortcut.keys,
              notes: shortcut.notes,
            });
          });
        });
      });
    });
  });
  return items;
};

const renderFilters = () => {
  elements.appFilters.innerHTML = "";
  state.data.apps.forEach((app) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-chip";
    button.textContent = app.name;
    button.dataset.value = app.name;
    if (state.selectedApps.has(app.name)) button.classList.add("active");
    elements.appFilters.appendChild(button);
  });

  elements.platformFilters.innerHTML = "";
  collectPlatforms(state.data.apps).forEach((platform) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-chip";
    button.textContent = platform;
    button.dataset.value = platform;
    if (state.selectedPlatforms.has(platform)) button.classList.add("active");
    elements.platformFilters.appendChild(button);
  });
};

const renderResults = () => {
  const filtered = filterData();
  const totalShortcuts = flattenShortcuts(filtered).length;
  elements.shortcutCount.textContent = `${totalShortcuts.toLocaleString()} shortcuts`;

  if (!filtered.length) {
    const needsSelection = !state.selectedApps.size || !state.selectedPlatforms.size;
    elements.results.innerHTML = `
      <div class="empty-state">
        <h3>${needsSelection ? "Select an app and OS to begin." : "No shortcuts match your filters."}</h3>
        <p>${
          needsSelection
            ? "Choose at least one app and one platform to reveal official shortcuts."
            : "Try adjusting the search, platform, or favorites filters."
        }</p>
      </div>
    `;
    return;
  }

  const container = document.createElement("div");
  container.className = "app-list";

  filtered.forEach((app) => {
    const appCard = document.createElement("details");
    appCard.className = "app-card";
    appCard.open = true;

    const appSummary = document.createElement("summary");
    appSummary.innerHTML = `
      <div>
        <div class="app-name">${escapeHtml(app.name)}</div>
        <div class="app-meta">${app.sources.length} source${app.sources.length === 1 ? "" : "s"}</div>
      </div>
      <div class="app-count">${flattenShortcuts([app]).length.toLocaleString()} shortcuts</div>
    `;
    appCard.appendChild(appSummary);

    app.sources.forEach((source) => {
      const sourceBlock = document.createElement("div");
      sourceBlock.className = "source-block";
      sourceBlock.innerHTML = `
        <div class="source-header">
          <div class="source-title">${escapeHtml(source.label)}</div>
          <a class="source-link" href="${source.url}" target="_blank" rel="noreferrer">Official source</a>
        </div>
      `;

      source.platforms.forEach((platform) => {
        const platformBlock = document.createElement("div");
        platformBlock.className = "platform-block";
        platformBlock.innerHTML = `<div class="platform-title">${escapeHtml(platform.name)}</div>`;

        platform.sections.forEach((section) => {
          const sectionCard = document.createElement("details");
          sectionCard.className = "section-card";
          sectionCard.open = true;

          const sectionSummary = document.createElement("summary");
          sectionSummary.innerHTML = `
            <div>${escapeHtml(section.title)}</div>
            <div class="section-count">${section.shortcuts.length} items</div>
          `;
          sectionCard.appendChild(sectionSummary);

          const table = document.createElement("div");
          table.className = "shortcut-table";

          section.shortcuts.forEach((shortcut) => {
            const row = document.createElement("div");
            row.className = "shortcut-row";

            const shortcutId = buildShortcutId(app.name, platform.name, section.title, shortcut);
            const isFav = state.favorites.has(shortcutId);

            row.innerHTML = `
              <div class="shortcut-action">
                <div class="action-text">${escapeHtml(shortcut.action)}</div>
                ${shortcut.notes ? `<div class="action-notes">${escapeHtml(shortcut.notes)}</div>` : ""}
              </div>
              <div class="shortcut-keys">${renderKeys(shortcut.keys, platform.name)}</div>
              <div class="shortcut-actions">
                <button class="icon-btn copy-btn" data-copy="${escapeHtml(
                  `${shortcut.action} — ${shortcut.keys}`
                )}">Copy</button>
                <button class="icon-btn star-btn ${isFav ? "active" : ""}" data-fav="${escapeHtml(
                  shortcutId
                )}">${isFav ? "Saved" : "Save"}</button>
              </div>
            `;
            table.appendChild(row);
          });

          sectionCard.appendChild(table);
          platformBlock.appendChild(sectionCard);
        });

        sourceBlock.appendChild(platformBlock);
      });

      appCard.appendChild(sourceBlock);
    });

    container.appendChild(appCard);
  });

  elements.results.innerHTML = "";
  elements.results.appendChild(container);
};

const hydrateExportOptions = () => {
  elements.exportSelect.innerHTML = `
    <option value="current">Current view</option>
    <option value="all">All apps</option>
  `;

  state.data.apps.forEach((app) => {
    const option = document.createElement("option");
    option.value = `app:${app.name}`;
    option.textContent = app.name;
    elements.exportSelect.appendChild(option);
  });
};

const exportPdf = (mode) => {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast("PDF export is not available yet.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const now = new Date();

  let dataset = filterData();
  if (mode === "all") {
    dataset = state.data.apps.map((app) => ({
      name: app.name,
      id: app.id,
      sources: app.sources,
    }));
  } else if (mode.startsWith("app:")) {
    const appName = mode.replace("app:", "");
    const app = state.data.apps.find((item) => item.name === appName);
    dataset = app ? [{ name: app.name, id: app.id, sources: app.sources }] : [];
  }

  if (!dataset.length) {
    doc.setFontSize(12);
    doc.text("No shortcuts available for this export scope.", 40, 90);
    doc.save(`Office-Shortcuts-${now.toISOString().slice(0, 10)}.pdf`);
    return;
  }

  const pageHeight = doc.internal.pageSize.getHeight();
  const pageBottom = pageHeight - 60;
  const topMargin = 96;

  const drawHeader = (appName) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Shortcut Studio", 40, 32);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Generated ${now.toLocaleString()}`, 40, 48);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(appName, 40, 72);
  };

  dataset.forEach((app, appIndex) => {
    if (appIndex > 0) doc.addPage();
    drawHeader(app.name);

    let cursorY = 90;
    app.sources.forEach((source) => {
      source.platforms.forEach((platform) => {
        if (cursorY > pageBottom) {
          doc.addPage();
          drawHeader(app.name);
          cursorY = 90;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text(`${platform.name} — ${source.label}`, 40, cursorY);
        cursorY += 16;

        platform.sections.forEach((section) => {
          if (cursorY > pageBottom) {
            doc.addPage();
            drawHeader(app.name);
            cursorY = 90;
          }
          doc.setFont("helvetica", "normal");
          doc.setFontSize(11);
          doc.text(section.title, 40, cursorY);
          cursorY += 12;

          const body = section.shortcuts.map((shortcut) => [shortcut.action, shortcut.keys]);
          if (cursorY + 12 > pageBottom) {
            doc.addPage();
            drawHeader(app.name);
            cursorY = 90;
          }
          doc.autoTable({
            startY: cursorY + 8,
            head: [["Action", "Keys"]],
            body,
            styles: {
              fontSize: 9,
              cellPadding: 4,
              overflow: "linebreak",
            },
            headStyles: {
              fillColor: [20, 46, 64],
              textColor: [255, 255, 255],
            },
            alternateRowStyles: {
              fillColor: [240, 238, 232],
            },
            margin: { top: topMargin, left: 40, right: 40 },
            didDrawPage: () => drawHeader(app.name),
          });

          cursorY = doc.lastAutoTable.finalY + 18;
          if (cursorY > pageBottom) {
            doc.addPage();
            drawHeader(app.name);
            cursorY = 90;
          }
        });
      });
    });
  });

  const fileName = `Office-Shortcuts-${mode.replace(/[^a-z0-9]+/gi, "-")}-${now
    .toISOString()
    .slice(0, 10)}.pdf`;
  doc.save(fileName);
};

const bindEvents = () => {
  elements.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderResults();
  });

  elements.appFilters.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    const value = target.dataset.value;
    if (state.selectedApps.has(value)) {
      state.selectedApps.delete(value);
    } else {
      state.selectedApps.add(value);
    }
    renderFilters();
    renderResults();
  });

  elements.platformFilters.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    const value = target.dataset.value;
    if (state.selectedPlatforms.has(value)) {
      state.selectedPlatforms.delete(value);
    } else {
      state.selectedPlatforms.add(value);
    }
    renderFilters();
    renderResults();
  });

  elements.results.addEventListener("click", (event) => {
    const copyBtn = event.target.closest(".copy-btn");
    if (copyBtn) {
      const text = copyBtn.dataset.copy;
      navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard"));
      return;
    }

    const starBtn = event.target.closest(".star-btn");
    if (starBtn) {
      const id = starBtn.dataset.fav;
      if (state.favorites.has(id)) {
        state.favorites.delete(id);
      } else {
        state.favorites.add(id);
      }
      saveFavorites();
      renderResults();
      return;
    }
  });

  elements.copySpotlight.addEventListener("click", () => {
    const text = elements.spotlight.dataset.copy || "";
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => showToast("Spotlight copied"));
  });

  elements.randomSpotlight.addEventListener("click", () => {
    const items = flattenShortcuts(filterData());
    updateSpotlight(items);
  });

  elements.showFavorites.addEventListener("change", (event) => {
    state.showFavorites = event.target.checked;
    renderResults();
  });

  elements.compactMode.addEventListener("change", (event) => {
    state.compactMode = event.target.checked;
    document.body.classList.toggle("compact", state.compactMode);
  });

  if (elements.darkMode) {
    elements.darkMode.addEventListener("change", (event) => {
      state.darkMode = event.target.checked;
      document.body.classList.toggle("dark", state.darkMode);
      saveTheme();
    });
  }

  elements.expandAll.addEventListener("click", () => {
    document.querySelectorAll("details").forEach((detail) => (detail.open = true));
  });

  elements.collapseAll.addEventListener("click", () => {
    document.querySelectorAll("details").forEach((detail) => (detail.open = false));
  });

  document.getElementById("exportOpen").addEventListener("click", () => {
    elements.exportDialog.showModal();
  });

  elements.exportRun.addEventListener("click", (event) => {
    event.preventDefault();
    const mode = elements.exportSelect.value;
    exportPdf(mode);
    elements.exportDialog.close();
  });

  document.addEventListener("keydown", (event) => {
    const tag = event.target.tagName.toLowerCase();
    const isTyping = tag === "input" || tag === "textarea";

    if (!isTyping && event.key === "/") {
      event.preventDefault();
      elements.searchInput.focus();
    }

    if (!isTyping && event.key.toLowerCase() === "f") {
      state.showFavorites = !state.showFavorites;
      elements.showFavorites.checked = state.showFavorites;
      renderResults();
    }

    if (!isTyping && event.key.toLowerCase() === "r") {
      const items = flattenShortcuts(filterData());
      updateSpotlight(items);
    }
  });
};

const initialize = async () => {
  loadFavorites();
  loadTheme();

  try {
    const response = await fetch("data/shortcuts.json", { cache: "no-store" });
    state.data = await response.json();
  } catch (error) {
    elements.lastUpdated.textContent = "Failed to load data";
    elements.shortcutCount.textContent = "0 shortcuts";
    elements.results.innerHTML = `
      <div class="empty-state">
        <h3>Could not load shortcut data</h3>
        <p>Please refresh or check that data/shortcuts.json exists.</p>
      </div>
    `;
    bindEvents();
    return;
  }

  bindEvents();

  if (!state.data.apps || !state.data.apps.length) {
    elements.lastUpdated.textContent = "Awaiting first update";
    elements.shortcutCount.textContent = "0 shortcuts";
    updateSpotlight([]);
    elements.results.innerHTML = `
      <div class="empty-state">
        <h3>No data yet</h3>
        <p>Run the fetch workflow or npm run fetch to populate official shortcuts.</p>
      </div>
    `;
    return;
  }

  state.selectedApps.clear();
  state.selectedPlatforms.clear();

  const lastUpdated = state.data.generatedAt
    ? new Date(state.data.generatedAt).toLocaleString()
    : "Unknown";
  elements.lastUpdated.textContent = `Updated ${lastUpdated}`;
  elements.shortcutCount.textContent = `${computeStats(state.data.apps).toLocaleString()} shortcuts`;

  renderFilters();
  hydrateExportOptions();
  renderResults();
  updateSpotlight(flattenShortcuts(filterData()));
};

initialize();
