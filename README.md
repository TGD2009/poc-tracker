# POC Evaluation Tracker

A single-page app for tracking proof-of-concept evaluation criteria: **import** from a Google Doc or markdown file, **build** a framework in the browser, mark progress by workstream, view charts and a **completion timegraph**, and generate HTML reports for email.

## Quick start

### Local (Node)

```bash
git clone https://github.com/anseifert/poc-tracker.git
cd poc-tracker
npm install   # creates state.json from state.json.example if missing
npm start
```

Open [http://localhost:8081](http://localhost:8081) (or the port shown in the console).

### Docker Compose

```bash
docker compose up --build
```

Progress is stored in the named volume `poc_tracker_state` (mounted at `/data` inside the container).

## Getting criteria into the app

On the empty home screen, set an optional **POC title** and optional **status colors** (defaults: completed `#22c55e`, in progress `#f59e0b`), then choose one of three tabs.

### Google Doc (default)

1. **Import from URL** — paste the Google Doc share link and click **Import from URL**. Requires `npm start` or Docker (the server fetches a **Markdown** export). The doc must be shared so **anyone with the link can view**.
2. **Upload from computer** — in Google Docs use **File → Download → Markdown**, then **Upload from computer…** and choose the `.md` file. Works without the import API (static hosting is read-only for progress).

After import, the **Approve workstreams** dialog lists each detected workstream. Check or uncheck entries, edit names, then **Import selected**.

**How Google Doc tabs map to workstreams:** File → Download → Markdown produces a **single** `.md` file. Multi-tab docs usually repeat a top-level `#` heading per tab. The importer recognizes that pattern automatically:

| In the downloaded `.md` | Becomes |
|-------------------------|---------|
| `# POC Doc - Kubernetes` (or `- Virtualization`, etc.) | Workstream named after the suffix (**Kubernetes**, **Virtualization**, …) |
| `# OpenShift … Evaluation Framework - …` immediately under a POC Doc line | Document subtitle only (not a separate workstream) |
| Other `# …` headings (e.g. appendix tabs) | Workstreams named from the heading text |
| `##` / `###` under a tab | **Sections** inside the current workstream |
| Tables | Criteria rows (headers taken from the table; **Objective** → **Criteria**, **Completed** → **Notes**; a **Status** column is treated like **Notes** — editable text and completion styling) |

URL import uses the same Markdown parser as upload.

### Markdown

Switch to the **Markdown** tab, paste content (or choose a `.md` file), and click **Import pasted markdown**. Same approval step for workstreams.

**Classic markdown** (single workstream doc, e.g. `example-evaluation.md`):

- One `#` line → document title only
- `##` → workstreams
- `###` → sections
- Tables → criteria rows

**Google-style tabbed markdown** (multiple `#` lines or `# POC Doc - …`):

- Rules in the table above apply; `##` / `###` are sections, not extra workstream tabs.

See `example-evaluation.md` for classic markdown. Use your Google Doc **Download → Markdown** export to exercise tab detection.

### Build here

Switch to **Build here** → **Start building POC…** to create workstreams, sections, and tables in a full-screen editor (add/rename workstreams, sections, columns, and rows; drag to reorder). **Save** loads the normal tracker UI.

After data exists, use the hamburger menu → **POC Settings** → **POC structure** to change the framework (with a warning if completion progress already exists).

### POC sign-off sheet

Hamburger → **POC sign-off sheet…** builds a printable HTML page:

- **Summary** — overall and per-workstream completion counts (from tracker checkboxes / notes).
- **Attestation** — default English text you can edit; stored in `state.json` under `signOff.attestationText`.
- **Signatories** — roster in `signatoryRoster`; names are added on **import** from table columns whose headers match **Owner**, **Assignee**, **Responsible**, and similar. Use **Refresh from Owner columns** after editing criteria. Each person has free-form **role** and **organization** fields. Check who appears on the sheet; order follows the list.
- **Incomplete POCs** — a yellow notice appears on the sheet unless everything is done. Optional checkbox blocks preview until 100% complete.
- **Output** — **Download HTML** (`poc-sign-off.html`) or **Print / Save as PDF** from the browser.

## Using the tracker

- **Workstream tabs** appear for each workstream that has rows.
- **Sections** group rows under headings (default section title **General** when none is set).
- Check **Done** on a row to record a **timestamp**; unchecking and checking again sets a new completion time. Notes can also mark items complete.
- **POC progress by workstream** chart on the main page (default colors: **green** = completed, **amber** = in progress, neutral gray = open).
- **Summary** — optional paragraph below the chart (**POC Settings** → **Summary**); stored in `state.json` as `summary`.
- **Status colors** — set **Completed** and **In progress** colors in the POC title panel (before import), on the **Build here** tab, or via **POC Settings** → **Chart colors** after data exists. Saved in `state.json` with the POC; used on the chart, legend, timegraph, and notes highlighting.
- Hamburger menu:
  - **POC Settings** — POC title, summary, structure, and chart colors
  - **View timegraph…** — timeline of check-offs; download completion log as JSON or CSV
  - **Email report…** — HTML preview, copy, or download (open / in-progress items)
  - **POC sign-off sheet…** — formal completion document with POC summary, editable attestation text, and signature lines; pick signatories from a roster (names from **Owner** / similar columns on import, or add manually); download HTML or print to PDF
  - **Download backup (JSON)** / **Restore from backup…** — full app state (criteria + progress), for moving machines or recovering after clearing browser data
  - **Reset all data** — clears criteria and progress

## Persistence and backups

| Mechanism | What it does |
|-----------|----------------|
| **Browser `localStorage`** | Always used while you work |
| **`state.json`** | Written when using `npm start` or Docker (`PUT /api/state`); includes criteria, progress, workstreams, `statusColors`, `signatoryRoster`, and `signOff` (attestation text and options); reloaded on next visit if the browser cache was cleared |
| **`state.json.backup`** | Server copies `state.json` over this file every **5 minutes** (same folder as `state.json`) |
| **`poc-tracker-backup.json`** | Manual export from the menu (same payload shape as `state.json`) |

`state.json` and `state.json.backup` are **gitignored**. Each clone gets a fresh `state.json` from `state.json.example` on `npm install` or server startup.

To restore from `state.json.backup` on the server: stop writes if needed, then `cp state.json.backup state.json` in `DATA_DIR` (or `/data` in Docker) and refresh the app.

The timegraph **Download JSON/CSV** files are completion **logs only**; use **Download backup (JSON)** or `state.json` for a full restore.

**Restore troubleshooting**

- Dropping a file named `state.json` in the project folder only loads on **`npm start`** (or Docker), not when opening the HTML as `file://`. The app merges server `state.json` with browser `localStorage`; if the file has more criteria rows than the cache, the file wins.
- A valid full backup must have **non-empty `sections.*.rows`** (and usually `progress`). A fresh `state.json` from `state.json.example` looks correct but has **zero rows** — restoring it shows an empty POC.
- Prefer **`poc-tracker-backup.json`** (menu export) or **`state.json.backup`** over a hand-edited empty `state.json`.

## Project layout

| File | Purpose |
|------|---------|
| `virtualization-kubernetes-tracker.html` | App UI and logic |
| `server.mjs` | Static server, `GET/PUT /api/state`, `GET /state.json`, `POST /api/import-google-doc`, periodic `state.json` backup |
| `scripts/ensure-state.mjs` | Creates `state.json` when missing |
| `example-evaluation.md` | Sample markdown import |
| `Dockerfile` / `docker-compose.yml` | Container deployment |

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8081` | HTTP port |
| `DATA_DIR` | project root | Directory containing `state.json` (use `/data` in Docker) |
| `BACKUP_INTERVAL_MS` | `300000` (5 min) | How often the server overwrites `state.json.backup` |
