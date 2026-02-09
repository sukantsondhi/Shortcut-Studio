# Shortcut Studio

Shortcut Studio is a GitHub Pages site that aggregates official Microsoft Office keyboard shortcuts, refreshes weekly via GitHub Actions, and lets users export print-ready PDFs by app or across all apps.

## What's included

- Official shortcut sources for Word, Excel, PowerPoint (create + deliver), Outlook, OneNote, and Access.
- Weekly scheduled updates plus a manual workflow dispatch.
- Client-side PDF export (current view, all apps, or a single app).
- Favorites, spotlight shortcuts, search, and filter controls.

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

## GitHub Actions

The workflow at `.github/workflows/update-data.yml` runs weekly (every Monday at 06:00 UTC) and can be triggered manually. It fetches updated data and commits any changes to `data/shortcuts.json`.

## GitHub Pages

Enable GitHub Pages for the repo and set the source to the default branch root.

## Buy me a coffee

Update the link in `index.html` to your Buy Me a Coffee URL.
