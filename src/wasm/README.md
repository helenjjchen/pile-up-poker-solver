# Optional Exact Solver WASM Module

`src/exactSolverWorker.js` automatically tries to import `./wasm/exactSolver.mjs` before falling back to the browser JS exact solver. This folder intentionally has no compiled artifact yet because the local workspace does not currently include Emscripten.

The module should export:

```js
export async function createExactSolver() {
  return {
    async solveFantasylandExact(cardIds, options) {
      // Return the same result shape as solveFantasylandExactHighBuckets().
    },
  };
}
```

When this file exists in a GitHub Pages build, the existing worker path will use it automatically.
