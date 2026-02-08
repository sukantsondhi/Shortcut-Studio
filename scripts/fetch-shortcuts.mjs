import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const sourcesPath = path.join(__dirname, "sources.json");
const outputPath = path.join(rootDir, "data", "shortcuts.json");

const locale = (process.env.LOCALE || "en-us").toLowerCase();

const cleanText = (value) => {
  if (!value) return "";
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*\u2013\s*/g, " - ")
    .trim();
};

const normalizeIconLabel = (value) => {
  const cleaned = cleanText(value);
  if (!cleaned) return "";

  const normalized = cleaned
    .replace(/^the\s+/i, "")
    .replace(/\s+button on macos\.?$/i, "")
    .replace(/\s+key on macos\.?$/i, "")
    .replace(/\s+button\.?$/i, "")
    .trim();

  const lower = normalized.toLowerCase();
  if (lower === "command") return "Command";
  if (lower === "control") return "Control";
  if (lower === "option") return "Option";
  if (lower === "shift") return "Shift";
  return normalized;
};

const extractElementText = ($, element) => {
  const clone = $(element).clone();

  clone.find("img").each((_, img) => {
    const node = $(img);
    const label = normalizeIconLabel(node.attr("alt") || node.attr("aria-label") || node.attr("title"));
    node.replaceWith(label ? ` ${label} ` : " ");
  });

  clone.find("[aria-label], [title]").each((_, node) => {
    const el = $(node);
    if (cleanText(el.text())) return;
    const label = normalizeIconLabel(el.attr("aria-label") || el.attr("title"));
    if (label) {
      el.prepend(` ${label} `);
    }
  });

  return cleanText(clone.text());
};

const isMacLikePlatform = (platformName) => {
  const name = cleanText(platformName).toLowerCase();
  return name.includes("mac") || name === "office";
};

const normalizeKeys = (value, platformName) => {
  let keys = cleanText(value)
    .replace(/⌘/g, "Command")
    .replace(/⌥/g, "Option")
    .replace(/⌃/g, "Control")
    .replace(/⇧/g, "Shift")
    .replace(/\s*\+\s*/g, "+")
    .replace(/\s*,\s*/g, ", ");

  if (isMacLikePlatform(platformName)) {
    if (/^\+[A-Za-z0-9]/.test(keys)) {
      keys = `Command${keys}`;
    }
    keys = keys.replace(/([A-Za-z]+)\+\+(?=[A-Za-z0-9(])/g, "$1+Command+");
  }

  keys = keys.replace(/\s+or\s+\+/gi, " or Command+");

  return keys;
};

const isIncompleteKeys = (value) => {
  const keys = cleanText(value);
  if (!keys) return true;
  if (/^\+/.test(keys) || /\+$/.test(keys)) return true;
  if (/[A-Za-z]\+\+[A-Za-z]/.test(keys)) return true;
  return false;
};

const isKeyLike = (value) => {
  if (!value) return false;
  const text = value.toLowerCase();
  return (
    /ctrl|control|alt|shift|cmd|command|option|⌘|⌥|⌃|enter|return|tab|esc|escape|arrow|home|end|page|f\d+/.test(
      text
    ) || /\+/.test(text)
  );
};

const splitShortcutText = (text) => {
  const cleaned = cleanText(text);
  if (!cleaned) return null;
  const separators = [" — ", " – ", " - ", "—", "–", ":"];

  for (const separator of separators) {
    const idx = cleaned.indexOf(separator);
    if (idx === -1) continue;
    const left = cleanText(cleaned.slice(0, idx));
    const right = cleanText(cleaned.slice(idx + separator.length));
    if (!left || !right) continue;
    if (isKeyLike(right)) {
      return { action: left, keys: right };
    }
  }

  return null;
};

const normalizePlatformName = (name) => {
  if (!name) return "All";
  const cleaned = cleanText(name);
  if (!cleaned) return "All";
  return cleaned
    .replace(/\s*\(.+?\)\s*/g, "")
    .replace(/\s+for\s+.+/i, "")
    .trim();
};

const resolveHeading = (value) => {
  const cleaned = cleanText(value);
  if (!cleaned || cleaned.toLowerCase() === "in this topic") return "General";
  return cleaned;
};

const guessIndices = (headers) => {
  if (!headers.length) return { actionIndex: 0, keysIndex: 1 };
  const lower = headers.map((h) => h.toLowerCase());
  const find = (matcher) => lower.findIndex((h) => matcher.test(h));

  const keyIndex = find(/\bkey\b|\bkeys\b|\bshortcut\b|\bpress\b/);
  const descIndex = find(/\bdescription\b|\bto do this\b|\baction\b|\bfunction\b/);

  if (keyIndex !== -1 && descIndex !== -1) {
    return { actionIndex: descIndex, keysIndex: keyIndex };
  }

  const pressIndex = find(/\bpress\b|\bshortcut\b/);
  const actionIndex = find(/\bto do this\b|\baction\b|\bdescription\b/);

  return {
    actionIndex: actionIndex !== -1 ? actionIndex : 0,
    keysIndex: pressIndex !== -1 ? pressIndex : 1,
  };
};

const parseTable = ($, table, platformName) => {
  const rows = [];
  let headers = [];

  table.find("tr").each((index, row) => {
    const cells = $(row).find("th, td");
    if (!cells.length) return;

    const values = cells
      .map((_, cell) => extractElementText($, $(cell)))
      .get()
      .filter((value) => value.length || cells.length === 1);

    if (!values.length) return;

    const isHeaderRow =
      cells.first().is("th") ||
      (index === 0 && values.some((value) => /to do this|press|key|description/i.test(value)));

    if (isHeaderRow && !headers.length) {
      headers = values;
      return;
    }

    rows.push(values);
  });

  const { actionIndex, keysIndex } = guessIndices(headers);
  const shortcuts = [];
  const dedupe = new Set();

  rows.forEach((values) => {
    if (values.length < 2) return;

    const action = cleanText(values[actionIndex] || values[0]);
    const keys = normalizeKeys(values[keysIndex] || values[1], platformName);

    if (!action || !keys) return;
    if (!isKeyLike(keys)) return;
    if (isIncompleteKeys(keys)) return;
    if (/not assigned|unassigned|n\/a|none/i.test(keys)) return;
    if (/to do this|press|key|description/i.test(action)) return;

    const notesValues = values.filter((_, idx) => idx !== actionIndex && idx !== keysIndex);
    const notes = cleanText(notesValues.join(" "));

    const key = `${action}|${keys}|${notes}`.toLowerCase();
    if (dedupe.has(key)) return;
    dedupe.add(key);

    const entry = { action, keys };
    if (notes) entry.notes = notes;
    shortcuts.push(entry);
  });

  return shortcuts;
};

const parseList = ($, list, platformName) => {
  const shortcuts = [];
  const dedupe = new Set();

  list.find("li").each((_, item) => {
    const itemEl = $(item);
    let action = "";
    let keys = "";

    const strong = itemEl.find("strong, b").first();
    if (strong.length) {
      action = cleanText(extractElementText($, strong));
      const full = cleanText(extractElementText($, itemEl));
      keys = cleanText(full.replace(action, ""));
    } else {
      const parsed = splitShortcutText(extractElementText($, itemEl));
      if (parsed) {
        action = parsed.action;
        keys = parsed.keys;
      }
    }

    keys = normalizeKeys(keys, platformName);
    if (!action || !keys) return;
    if (!isKeyLike(keys)) return;
    if (isIncompleteKeys(keys)) return;
    if (/not assigned|unassigned|n\/a|none/i.test(keys)) return;

    const key = `${action}|${keys}`.toLowerCase();
    if (dedupe.has(key)) return;
    dedupe.add(key);
    shortcuts.push({ action, keys });
  });

  return shortcuts;
};

const parseDefinitionList = ($, list, platformName) => {
  const shortcuts = [];
  const dedupe = new Set();
  const terms = list.find("dt");

  terms.each((_, term) => {
    const termEl = $(term);
    const action = cleanText(extractElementText($, termEl));
    const defEl = termEl.nextAll("dd").first();
    const keys = normalizeKeys(extractElementText($, defEl), platformName);
    if (!action || !keys) return;
    if (!isKeyLike(keys)) return;
    if (isIncompleteKeys(keys)) return;
    if (/not assigned|unassigned|n\/a|none/i.test(keys)) return;

    const key = `${action}|${keys}`.toLowerCase();
    if (dedupe.has(key)) return;
    dedupe.add(key);
    shortcuts.push({ action, keys });
  });

  return shortcuts;
};

const mergeSectionShortcuts = (section, shortcuts) => {
  if (!shortcuts.length) return;
  if (!section.shortcuts) section.shortcuts = [];
  const dedupe = new Set(section.shortcuts.map((item) => `${item.action}|${item.keys}`.toLowerCase()));
  shortcuts.forEach((shortcut) => {
    const action = cleanText(shortcut.action);
    const keys = cleanText(shortcut.keys);
    if (!action || !keys) return;
    if (/not assigned|unassigned|n\/a|none/i.test(keys)) return;
    const key = `${action}|${keys}`.toLowerCase();
    if (dedupe.has(key)) return;
    dedupe.add(key);
    section.shortcuts.push({ action, keys, notes: shortcut.notes });
  });
};

const parseSections = ($, container, platformName) => {
  const sections = [];
  const sectionMap = new Map();
  let currentTitle = "General";

  container.find("h2, h3, h4, table, ul, ol, dl").each((_, element) => {
    const tagName = element.tagName.toLowerCase();
    if (tagName.startsWith("h")) {
      currentTitle = resolveHeading($(element).text());
      return;
    }

    const title = currentTitle || "General";
    let existing = sectionMap.get(title);
    if (!existing) {
      existing = { title, shortcuts: [] };
      sectionMap.set(title, existing);
      sections.push(existing);
    }

    if (tagName === "table") {
      const shortcuts = parseTable($, $(element), platformName);
      mergeSectionShortcuts(existing, shortcuts);
      return;
    }

    if (tagName === "ul" || tagName === "ol") {
      const shortcuts = parseList($, $(element), platformName);
      mergeSectionShortcuts(existing, shortcuts);
      return;
    }

    if (tagName === "dl") {
      const shortcuts = parseDefinitionList($, $(element), platformName);
      mergeSectionShortcuts(existing, shortcuts);
    }
  });

  return sections;
};

const extractPanels = ($, main) => {
  const panels = main.find("[role='tabpanel']");
  if (panels.length) {
    return panels.toArray().map((panel) => {
      const panelEl = $(panel);
      const labelledBy = panelEl.attr("aria-labelledby");
      const label = labelledBy ? cleanText($(`#${labelledBy}`).text()) : panelEl.attr("aria-label");
      return {
        name: normalizePlatformName(label || panelEl.attr("id") || "All"),
        element: panelEl,
      };
    });
  }

  const altPanels = main.find("[data-bi-name='tab-panel']");
  if (altPanels.length) {
    return altPanels.toArray().map((panel) => {
      const panelEl = $(panel);
      const label = panelEl.attr("aria-label") || panelEl.attr("data-bi-id");
      return {
        name: normalizePlatformName(label || panelEl.attr("id") || "All"),
        element: panelEl,
      };
    });
  }

  return [{ name: "All", element: main }];
};

const fetchSource = async (source) => {
  const url = source.url.replace("{locale}", locale);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Accept-Language": locale,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = load(html);
  const main = $("main").first().length ? $("main").first() : $("article").first();
  const root = main.length ? main : $("body");

  const panels = extractPanels($, root);
  const platforms = panels
    .map((panel) => {
      const sections = parseSections($, panel.element, panel.name);
      if (!sections.length) return null;
      return {
        name: panel.name || "All",
        sections,
      };
    })
    .filter(Boolean);

  return {
    url,
    platforms,
  };
};

const countShortcuts = (platforms) =>
  platforms.reduce(
    (total, platform) =>
      total +
      platform.sections.reduce((sectionTotal, section) => sectionTotal + section.shortcuts.length, 0),
    0
  );

const main = async () => {
  const rawFile = await fs.readFile(sourcesPath, "utf-8");
  const rawSources = JSON.parse(rawFile.replace(/^\uFEFF/, ""));

  const appMap = new Map();
  let sourceCount = 0;
  let platformCount = 0;
  let shortcutCount = 0;

  for (const source of rawSources) {
    const { url, platforms } = await fetchSource(source);
    sourceCount += 1;
    platformCount += platforms.length;
    shortcutCount += countShortcuts(platforms);

    const entry = {
      id: source.id,
      label: source.label,
      url,
      platforms,
    };

    if (!appMap.has(source.app)) {
      appMap.set(source.app, {
        id: source.app.toLowerCase().replace(/\s+/g, "-"),
        name: source.app,
        sources: [entry],
      });
    } else {
      appMap.get(source.app).sources.push(entry);
    }
  }

  const apps = Array.from(appMap.values());

  const output = {
    generatedAt: new Date().toISOString(),
    locale,
    stats: {
      appCount: apps.length,
      sourceCount,
      platformCount,
      shortcutCount,
    },
    apps,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2));

  console.log(`Saved ${outputPath}`);
  console.log(`Apps: ${apps.length}`);
  console.log(`Sources: ${sourceCount}`);
  console.log(`Platforms: ${platformCount}`);
  console.log(`Shortcuts: ${shortcutCount}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
