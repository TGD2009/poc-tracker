#!/usr/bin/env node
/**
 * Serves the tracker and persists state.json on PUT /api/state.
 * When a checklist has rows, also writes customers/<title>.json so each
 * customer can be kept in git. state.json stays the one checklist on screen.
 * Run: node server.mjs  →  http://localhost:8081
 * Docker: set DATA_DIR=/data for persistent state volume.
 */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureStateFile } from "./scripts/ensure-state.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || ROOT;
const PORT = Number(process.env.PORT) || 8081;
const STATE_FILE = path.join(DATA_DIR, "state.json");
const STATE_BACKUP_FILE = path.join(DATA_DIR, "state.json.backup");
const CUSTOMERS_DIR = path.join(DATA_DIR, "customers");
const BACKUP_INTERVAL_MS = Number(process.env.BACKUP_INTERVAL_MS) || 5 * 60 * 1000;
const INDEX = "virtualization-kubernetes-tracker.html";

let backupInFlight = false;

async function backupStateFile() {
  if (backupInFlight) return;
  backupInFlight = true;
  try {
    await fs.access(STATE_FILE);
    await fs.copyFile(STATE_FILE, STATE_BACKUP_FILE);
  } catch (err) {
    if (err?.code !== "ENOENT") {
      console.error("state.json backup failed:", err.message || err);
    }
  } finally {
    backupInFlight = false;
  }
}

function startStateBackupJob() {
  void backupStateFile();
  return setInterval(() => {
    void backupStateFile();
  }, BACKUP_INTERVAL_MS);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function extractGoogleDocId(url) {
  const s = String(url || "").trim();
  const m1 = s.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(body);
}

function countCriteriaRows(payload) {
  const sections = payload?.sections;
  if (!sections || typeof sections !== "object") return 0;
  let total = 0;
  for (const section of Object.values(sections)) {
    if (Array.isArray(section?.rows)) total += section.rows.length;
  }
  return total;
}

function customerFileSlug(title) {
  const slug = String(title || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "untitled-customer";
}

function safeCustomerFileName(name) {
  const base = path.basename(String(name || ""));
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(base)) return null;
  return base;
}

async function writeCustomerCopy(payload) {
  if (countCriteriaRows(payload) < 1) return null;
  const fileName = `${customerFileSlug(payload.title)}.json`;
  if (!safeCustomerFileName(fileName)) return null;
  await fs.mkdir(CUSTOMERS_DIR, { recursive: true });
  const dest = path.join(CUSTOMERS_DIR, fileName);
  if (path.dirname(dest) !== CUSTOMERS_DIR) return null;
  await fs.writeFile(dest, JSON.stringify(payload, null, 2) + "\n");
  return fileName;
}

async function listCustomerCopies() {
  let names;
  try {
    names = await fs.readdir(CUSTOMERS_DIR);
  } catch (err) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
  const out = [];
  for (const name of names) {
    const safe = safeCustomerFileName(name);
    if (!safe) continue;
    const full = path.join(CUSTOMERS_DIR, safe);
    if (path.dirname(full) !== CUSTOMERS_DIR) continue;
    try {
      const data = JSON.parse(await fs.readFile(full, "utf8"));
      const rows = countCriteriaRows(data);
      if (rows < 1) continue;
      out.push({
        file: safe,
        title: String(data.title || safe.replace(/\.json$/, "")),
        updatedAt: data.updatedAt || null,
        rows,
      });
    } catch {
      // Skip files that are not a tracker checklist.
    }
  }
  out.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return out;
}

function safePath(urlPath) {
  const rel = urlPath === "/" ? INDEX : decodeURIComponent(urlPath).replace(/^\/+/, "");
  const resolved = path.resolve(ROOT, rel);
  if (!resolved.startsWith(ROOT)) return null;
  return resolved;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (url.pathname === "/api/state" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ writable: true }));
    return;
  }

  if (url.pathname === "/state.json" && req.method === "GET") {
    try {
      const data = await fs.readFile(STATE_FILE);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(data);
    } catch {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end("{}");
    }
    return;
  }

  if (url.pathname === "/api/import-google-doc" && req.method === "POST") {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }
    const docId = extractGoogleDocId(payload.url);
    if (!docId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Could not read a Google Doc ID from that URL." }));
      return;
    }
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=md`;
    try {
      const upstream = await fetch(exportUrl, {
        redirect: "follow",
        headers: {
          "User-Agent": "poc-tracker/1.0 (+https://github.com/anseifert/poc-tracker)",
        },
      });
      if (!upstream.ok) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error:
              "Could not download the document. Share it as “Anyone with the link can view” and try again.",
          })
        );
        return;
      }
      const text = await upstream.text();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ text }));
    } catch {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Network error while fetching Google Doc export." }));
    }
    return;
  }

  if (url.pathname === "/api/state" && req.method === "PUT") {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }
    const body = JSON.stringify(payload, null, 2) + "\n";
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(STATE_FILE, body);
    let customerFile = null;
    try {
      customerFile = await writeCustomerCopy(payload);
    } catch (err) {
      console.error("customer copy failed:", err.message || err);
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, customerFile }));
    return;
  }

  if (url.pathname === "/api/customers" && req.method === "GET") {
    try {
      const list = await listCustomerCopies();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(list));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message || "Could not list customers." }));
    }
    return;
  }

  const customerMatch = url.pathname.match(/^\/api\/customers\/([^/]+)$/);
  if (customerMatch && req.method === "GET") {
    const name = safeCustomerFileName(decodeURIComponent(customerMatch[1]));
    if (!name) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "That customer file name is not allowed." }));
      return;
    }
    try {
      const data = await fs.readFile(path.join(CUSTOMERS_DIR, name));
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(data);
    } catch {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No saved customer with that name." }));
    }
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Unknown API route: ${url.pathname}` }));
    return;
  }

  const filePath = safePath(url.pathname);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

await fs.mkdir(DATA_DIR, { recursive: true });
await ensureStateFile(DATA_DIR);

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use.`);
    console.error(`  Stop the other process, or run: PORT=${PORT + 1} npm start`);
    console.error(`  macOS: lsof -i :${PORT} -sTCP:LISTEN`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`POC tracker: http://localhost:${PORT}`);
  console.log(`State file: ${STATE_FILE}`);
  console.log(`State backup: ${STATE_BACKUP_FILE} (every ${BACKUP_INTERVAL_MS / 1000}s)`);
  console.log(`Customer copies: ${CUSTOMERS_DIR}`);
  startStateBackupJob();
});
