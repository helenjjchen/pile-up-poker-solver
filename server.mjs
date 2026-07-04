import { execFile } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { promisify } from "node:util";
import http from "node:http";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const PORT = Number(process.env.PORT ?? 5173);
const SOLVER = join(ROOT, "tools", "bin", "exact_fantasyland_10");
const LOCAL_BEST_KNOWN = join(ROOT, "data", "local-best-known-fantasyland.json");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20000) {
        request.destroy();
        rejectBody(new Error("Request body too large."));
      }
    });
    request.on("end", () => resolveBody(body));
    request.on("error", rejectBody);
  });
}

function validateCards(cards) {
  if (!Array.isArray(cards) || cards.length !== 20) return false;
  const seen = new Set(cards);
  return seen.size === 20 && cards.every((card) => /^[0-9JQKA]+[HSCD]$/.test(card));
}

function isValidCardArray(cards, length) {
  return (
    Array.isArray(cards) &&
    cards.length === length &&
    new Set(cards).size === length &&
    cards.every((card) => /^[0-9JQKA]+[HSCD]$/.test(card))
  );
}

function compareRecordScores(a, b) {
  const scoreA = a?.score ?? {};
  const scoreB = b?.score ?? {};
  const fields = [
    ["total", 0],
    ["beforeMultiplier", 0],
    ["hands", 0],
    ["qualityHands", 0],
  ];
  for (const [field, fallback] of fields) {
    const valueA = Number(scoreA[field] ?? fallback);
    const valueB = Number(scoreB[field] ?? fallback);
    if (valueA !== valueB) return valueA - valueB;
  }
  return 0;
}

function validateBestKnownRecord(record) {
  if (!record || typeof record !== "object") return "Expected a best-known record.";
  if (typeof record.canonicalDealKey !== "string" || !record.canonicalDealKey.startsWith("rshift:")) {
    return "Record is missing a canonical deal key.";
  }
  if (!isValidCardArray(record.deal, 20)) return "Record deal must contain 20 unique card ids.";
  if (!isValidCardArray(record.grid, 16)) return "Record grid must contain 16 unique card ids.";
  if (!isValidCardArray(record.discard, 4)) return "Record discard must contain 4 unique card ids.";
  const placementCards = new Set([...record.grid, ...record.discard]);
  if (placementCards.size !== 20 || record.deal.some((card) => !placementCards.has(card))) {
    return "Record grid and discard must contain exactly the deal cards.";
  }
  if (!record.score || !Number.isFinite(Number(record.score.total))) return "Record score is missing a total.";
  return null;
}

async function readLocalBestKnownData() {
  try {
    return JSON.parse(await readFile(LOCAL_BEST_KNOWN, "utf8"));
  } catch {
    return { version: 1, records: [] };
  }
}

async function writeLocalBestKnownData(data) {
  await mkdir(join(ROOT, "data"), { recursive: true });
  await writeFile(LOCAL_BEST_KNOWN, `${JSON.stringify(data, null, 2)}\n`);
}

async function handleLocalBestKnownGet(_request, response) {
  sendJson(response, 200, await readLocalBestKnownData());
}

async function handleLocalBestKnownPost(request, response) {
  let payload;
  try {
    payload = JSON.parse(await readBody(request));
  } catch {
    sendJson(response, 400, { error: "Invalid JSON body." });
    return;
  }

  const record = payload.record ?? payload;
  const validationError = validateBestKnownRecord(record);
  if (validationError) {
    sendJson(response, 400, { error: validationError });
    return;
  }

  const data = await readLocalBestKnownData();
  const records = Array.isArray(data.records) ? data.records : [];
  const existingIndex = records.findIndex((item) => item.canonicalDealKey === record.canonicalDealKey);
  const savedRecord = {
    ...record,
    source: record.source ?? "local-file",
    foundAt: record.foundAt ?? new Date().toISOString(),
  };
  let changed = false;

  if (existingIndex === -1) {
    records.push(savedRecord);
    changed = true;
  } else if (compareRecordScores(savedRecord, records[existingIndex]) > 0) {
    records[existingIndex] = savedRecord;
    changed = true;
  }

  const nextData = {
    version: data.version ?? 1,
    updatedAt: changed ? new Date().toISOString() : data.updatedAt,
    records: records.sort((a, b) => a.canonicalDealKey.localeCompare(b.canonicalDealKey)),
  };
  if (changed) await writeLocalBestKnownData(nextData);

  sendJson(response, 200, {
    saved: changed,
    record: existingIndex === -1 ? savedRecord : nextData.records.find((item) => item.canonicalDealKey === record.canonicalDealKey),
  });
}

async function handleExactHighChunk(request, response) {
  if (!existsSync(SOLVER)) {
    sendJson(response, 500, { error: "Compiled exact solver is missing. Run pnpm compile:exact or tools/run_exact_10_chunks.py once." });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(request));
  } catch {
    sendJson(response, 400, { error: "Invalid JSON body." });
    return;
  }

  if (!validateCards(payload.cards)) {
    sendJson(response, 400, { error: "Expected exactly 20 unique card ids." });
    return;
  }

  const seconds = Math.max(0.2, Math.min(Number(payload.seconds ?? 5), 30));
  const incumbent = Math.max(0, Math.floor(Number(payload.incumbent ?? 0)));
  const skipDiscards = Math.max(0, Math.floor(Number(payload.skipDiscards ?? 0)));
  const discardLimit = Math.max(0, Math.floor(Number(payload.discardLimit ?? 0)));
  const skipRows = Math.max(0, Math.floor(Number(payload.skipRows ?? 0)));
  const rowLimit = Math.max(0, Math.floor(Number(payload.rowLimit ?? 0)));
  const mode = payload.mode === "three-plus-low" || payload.mode === "low-two" ? payload.mode : "high-buckets";

  const args = [
    ...payload.cards,
    mode === "low-two" ? "--low-two" : mode === "three-plus-low" ? "--three-plus-low" : "--high-buckets",
    "--seconds",
    String(seconds),
    "--incumbent",
    String(incumbent),
    "--skip-discards",
    String(skipDiscards),
    "--skip-rows",
    String(skipRows),
    "--row-limit",
    String(rowLimit),
    "--discard-limit",
    String(discardLimit),
  ];

  try {
    const { stdout } = await execFileAsync(SOLVER, args, {
      cwd: ROOT,
      timeout: Math.ceil(seconds * 1000 + 5000),
      maxBuffer: 1024 * 1024,
    });
    sendJson(response, 200, JSON.parse(stdout));
  } catch (error) {
    sendJson(response, 500, {
      error: "Exact solver chunk failed.",
      details: error.stderr || error.message,
    });
  }
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host ?? "127.0.0.1"}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = resolve(ROOT, normalize(pathname).replace(/^[/\\]+/, ""));

  if (!filePath.startsWith(ROOT) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": MIME_TYPES[extname(filePath)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(filePath).pipe(response);
}

const server = http.createServer((request, response) => {
  if (request.method === "POST" && request.url === "/api/exact-high-chunk") {
    handleExactHighChunk(request, response);
    return;
  }
  if (request.method === "GET" && request.url === "/api/local-best-known") {
    handleLocalBestKnownGet(request, response);
    return;
  }
  if (request.method === "POST" && request.url === "/api/local-best-known") {
    handleLocalBestKnownPost(request, response);
    return;
  }
  if (request.method === "GET" || request.method === "HEAD") {
    serveStatic(request, response);
    return;
  }
  response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
  response.end("Method not allowed");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Pile-Up Poker Solver running at http://127.0.0.1:${PORT}/`);
});
