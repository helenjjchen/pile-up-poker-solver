import { solveFantasylandExactHighBuckets } from "./exactHighBucketSolver.js";

let wasmSolver = null;
let wasmLoadAttempted = false;

async function optionalWasmSolver() {
  if (wasmLoadAttempted) return wasmSolver;
  wasmLoadAttempted = true;
  try {
    const module = await import("./wasm/exactSolver.mjs");
    if (typeof module.createExactSolver === "function") {
      wasmSolver = await module.createExactSolver();
    }
  } catch {
    wasmSolver = null;
  }
  return wasmSolver;
}

self.addEventListener("message", async (event) => {
  const { id, type, payload } = event.data ?? {};
  if (!id) return;

  try {
    if (type === "capabilities") {
      const solver = await optionalWasmSolver();
      self.postMessage({
        id,
        ok: true,
        payload: {
          worker: true,
          wasm: Boolean(solver),
        },
      });
      return;
    }

    if (type !== "solve-exact") {
      throw new Error(`Unknown worker request: ${type}`);
    }

    const solver = payload?.preferWasm ? await optionalWasmSolver() : null;
    const result = solver?.solveFantasylandExact
      ? await solver.solveFantasylandExact(payload.cardIds, payload.options)
      : solveFantasylandExactHighBuckets(payload.cardIds, payload.options);

    self.postMessage({
      id,
      ok: true,
      payload: {
        ...result,
        searchOrder: `${result.searchOrder} Engine: ${solver ? "wasm-worker" : "js-worker"}.`,
      },
    });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : "Exact worker failed.",
    });
  }
});
