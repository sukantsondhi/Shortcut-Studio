# Shortcut Studio

Shortcut Studio is a GitHub Pages site that aggregates official Microsoft Office keyboard shortcuts, refreshes weekly via GitHub Actions, and lets users export print-ready PDFs by app or across all apps.

## What's included

- Official shortcut sources for Word, Excel, PowerPoint (create + deliver), Outlook, OneNote, and Access.
- Weekly scheduled updates plus a manual workflow dispatch.
- Client-side PDF export (current view, all apps, or a single app).
- Favourites, spotlight shortcuts, search, and filter controls.

## Setup

1. Update official shortcut URLs in `scripts/sources.json` if Microsoft changes them.
2. Install dependencies and fetch data locally:

```bash
npm install
npm run fetch
```

3. Commit the generated `data/shortcuts.json`.

### Locale support

Set `LOCALE` to fetch a specific Microsoft Support locale:

```bash
LOCALE=en-gb npm run fetch
```

