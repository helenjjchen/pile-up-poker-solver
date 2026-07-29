import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildPages } from "../tools/build-pages.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const workflow = readFileSync(`${root}/.github/workflows/pages.yml`, "utf8");
const packageJson = JSON.parse(readFileSync(`${root}/package.json`, "utf8"));

assert.equal(packageJson.dependencies, undefined, "The static app should not ship unused runtime packages.");
assert.equal(packageJson.scripts.dev, "node server.mjs");
assert.equal(packageJson.scripts["build:pages"], "node tools/build-pages.mjs");
assert.match(workflow, /run:\s*npm test/);
assert.match(workflow, /run:\s*npm run build:pages/);
assert.match(workflow, /path:\s*"dist"/);

await buildPages();

for (const path of [
  "index.html",
  "pro.html",
  "styles.css",
  "favicon.svg",
  ".nojekyll",
  "src/modeBoot.js",
  "src/proApp.js",
  "data/best-known-fantasyland.json",
  "data/local-best-known-fantasyland.json",
  "data/exact-proof-status.json",
]) {
  assert.ok(existsSync(`${root}/dist/${path}`), `Production bundle is missing ${path}`);
}

for (const path of [
  "data/exact-high-runs.jsonl",
  "data/exact-10hand-runs.jsonl",
  "src/wasm/README.md",
  "tests",
  "tools",
]) {
  assert.equal(existsSync(`${root}/dist/${path}`), false, `Production bundle should not include ${path}`);
}

console.log("Deployment contract tests passed.");
