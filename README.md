# POC Evaluation Tracker

A single-page app for tracking proof-of-concept evaluation criteria: **import** from a Google Doc or markdown file, **build** a framework in the browser, mark progress by workstream, view charts and a **completion timegraph**, edit **POC settings** (title, summary, structure, colors), generate HTML **email reports**, and produce a **POC sign-off sheet**.

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

On the empty home screen, set an optional **POC title** and optional **status colors** (defaults: completed `#22c55e`, in progress `#f59e0b`), then choose one of three tabs. You can change the title later from **POC Settings** after import.

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

After data exists, use **POC Settings** → **POC structure** to change the framework (with a warning if completion progress already exists).

## POC Settings

Hamburger → **POC Settings** opens a hub for:

| Setting | What it does |
|---------|----------------|
| **POC title** | Header title and report/sign-off titles |
| **Summary** | Optional paragraph shown below the progress chart (read-only on the main page; edit in the modal) |
| **POC structure** | Workstreams, sections, columns, and criteria rows |
| **Chart colors** | Completed / in-progress colors for chart, legend, timegraph, and notes styling |

Each screen opened from here has **← POC Settings** to return to the hub.

## POC sign-off sheet

Hamburger → **POC sign-off sheet…** (below **View timegraph…**) builds a printable HTML page:

- **Completion overview** — overall and per-workstream counts (from tracker checkboxes / notes).
- **Attestation** — default English text you can edit in the sign-off dialog (saved with the POC).
- **Signatories** — roster built from **Owner** / similar columns on import, plus manual entries; free-form role and organization; check who appears on the sheet.
- **Incomplete POCs** — a yellow notice on the sheet when not 100% done; optional setting blocks preview until complete.
- **Output** — **Download HTML** (`poc-sign-off.html`) or **Print / Save as PDF**.

## Using the tracker

- **Workstream tabs** appear for each workstream that has rows.
- **Sections** group rows under headings (default section title **General** when none is set).
- Check **Done** on a row to record a **timestamp**; unchecking clears the checkbox state (and auto-filled completion text in notes/status when applicable). Checking again sets a new completion time. Notes/status text can also drive completed vs in-progress styling.
- **POC progress by workstream** chart (default: **green** = completed, **amber** = in progress, gray = open).
- **Summary** paragraph below the chart when text exists (edit via **POC Settings** → **Summary**).
- Page footer shows **Saved** time and sync status (**Saved and synced** when using `npm start` or Docker).

### Hamburger menu (after data exists)

| Item | Purpose |
|------|---------|
| **Show all rows** / **Hide all completed** | Table visibility |
| **Email report…** | HTML preview, copy, or download (open / in-progress items) |
| **POC Settings** | Title, summary, structure, chart colors |
| **View timegraph…** | Timeline of check-offs; download completion log JSON or CSV |
| **POC sign-off sheet…** | Formal sign-off HTML / print |
| **Download backup (JSON)** / **Restore from backup…** | Full state for another machine or after clearing browser data |
| **Reset all data** | Clears criteria and progress (top of menu) |

## Persistence and backups

| Mechanism | What it does |
|-----------|----------------|
| **Browser `localStorage`** | Cache while you work |
| **`state.json`** | Server file when using `npm start` or Docker — criteria, progress, workstreams, `title`, `summary`, `statusColors`, `signatoryRoster`, `signOff`, etc. |
| **`state.json.backup`** | Server copy every **5 minutes** |
| **`poc-tracker-backup.json`** | Manual export from the menu (same shape as `state.json`) |

`state.json` and `state.json.backup` are **gitignored**. `npm install` or server startup creates `state.json` from `state.json.example` only if the file is missing.

To restore from `state.json.backup` on the server: stop writes if needed, then `cp state.json.backup state.json` in `DATA_DIR` (or `/data` in Docker) and refresh.

Timegraph **JSON/CSV** exports are completion **logs only**; use **Download backup (JSON)** or a full `state.json` for restore.

**Restore troubleshooting**

- Replacing `state.json` on disk only applies with **`npm start`** or Docker, not `file://`. The app merges server data with `localStorage`; the copy with more criteria rows usually wins.
- A valid backup must have **non-empty `sections.*.rows`**. An empty template restores as an empty POC.
- Prefer **menu backup** or **`state.json.backup`** over an empty hand-edited file.

## Project layout

| File | Purpose |
|------|---------|
| `virtualization-kubernetes-tracker.html` | App UI and logic |
| `server.mjs` | Static server, `GET/PUT /api/state`, `GET /state.json`, `POST /api/import-google-doc`, periodic backup |
| `scripts/ensure-state.mjs` | Creates `state.json` when missing |
| `example-evaluation.md` | Sample markdown import |
| `Dockerfile` / `docker-compose.yml` | Container deployment |

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8081` | HTTP port |
| `DATA_DIR` | project root | Directory containing `state.json` (use `/data` in Docker) |
| `BACKUP_INTERVAL_MS` | `300000` (5 min) | How often the server overwrites `state.json.backup` |
