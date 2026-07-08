import { solveFantasylandHeuristic } from "./heuristicSolver.js?v=solver-fast-1";

self.addEventListener("message", (event) => {
  const { id, type, payload } = event.data ?? {};
  if (!id) return;

  try {
    if (type !== "solve-heuristic") {
      throw new Error(`Unknown worker request: ${type}`);
    }

    const result = solveFantasylandHeuristic(payload.cardIds, payload.options);
    self.postMessage({
      id,
      ok: true,
      payload: {
        ...result,
        searchOrder: `${result.searchOrder} Engine: heuristic-worker.`,
      },
    });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : "Heuristic worker failed.",
    });
  }
});
