import {
  createProHeuristicSession,
  finishProHeuristicSession,
  stepProHeuristicSession,
} from "./proHeuristicSolver.js?v=pro-search-7";

self.addEventListener("message", (event) => {
  const { id, cardIds, options } = event.data ?? {};
  try {
    const session = createProHeuristicSession(cardIds, options);
    const initialResult = finishProHeuristicSession(session);
    let lastPostedAt = performance.now();
    let lastPostedScore = initialResult.best?.score?.total ?? -Infinity;
    self.postMessage({
      id,
      status: "progress",
      result: initialResult,
    });

    const runSlice = () => {
      try {
        const done = stepProHeuristicSession(session, 36);
        const now = performance.now();
        const bestScore = session.best?.score?.total ?? -Infinity;
        if (!done && (bestScore > lastPostedScore || now - lastPostedAt >= 300)) {
          lastPostedAt = now;
          lastPostedScore = bestScore;
          self.postMessage({
            id,
            status: "progress",
            result: finishProHeuristicSession(session),
          });
        }
        if (done) {
          self.postMessage({
            id,
            status: "ok",
            result: finishProHeuristicSession(session),
          });
          return;
        }
        setTimeout(runSlice, 0);
      } catch (error) {
        self.postMessage({
          id,
          status: "error",
          error: error instanceof Error ? error.message : "Pro solver failed.",
        });
      }
    };

    runSlice();
  } catch (error) {
    self.postMessage({
      id,
      status: "error",
      error: error instanceof Error ? error.message : "Pro solver failed.",
    });
  }
});
