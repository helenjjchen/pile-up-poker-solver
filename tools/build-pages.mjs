import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "dist");
const ROOT_FILES = ["index.html", "pro.html", "styles.css", "favicon.svg", ".nojekyll"];
const DATA_FILES = [
  "best-known-fantasyland.json",
  "local-best-known-fantasyland.json",
  "exact-proof-status.json",
];
const RUNTIME_EXTENSIONS = new Set([".js", ".mjs", ".wasm"]);

function runtimeSourceFilter(source) {
  const sourcePath = relative(join(ROOT, "src"), source);
  return !sourcePath || !extname(source) || RUNTIME_EXTENSIONS.has(extname(source));
}

export async function buildPages() {
  await rm(OUTPUT, { recursive: true, force: true });
  await mkdir(join(OUTPUT, "data"), { recursive: true });

  await Promise.all(
    ROOT_FILES.map((file) => cp(join(ROOT, file), join(OUTPUT, file))),
  );
  await cp(join(ROOT, "src"), join(OUTPUT, "src"), {
    recursive: true,
    filter: runtimeSourceFilter,
  });
  await Promise.all(
    DATA_FILES.map((file) =>
      cp(join(ROOT, "data", file), join(OUTPUT, "data", file)),
    ),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildPages();
  console.log("Built the GitHub Pages bundle in dist/.");
}
