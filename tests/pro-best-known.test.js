import assert from "node:assert/strict";
import {
  __proBestKnownTestHooks,
  seededProBestKnownForDeal,
} from "../src/proBestKnown.js";
import {
  createProHeuristicSession,
} from "../src/proHeuristicSolver.js";
import { scoreProPlacement } from "../src/proScoring.js";

const expectedTotals = [21630, 20700, 24450, 24060, 24030];
assert.equal(__proBestKnownTestHooks.solutions.length, expectedTotals.length);

__proBestKnownTestHooks.solutions.forEach((solution, index) => {
  assert.equal(solution.grid.length, 25);
  assert.equal(solution.discard.length, 5);
  assert.equal(new Set([...solution.grid, ...solution.discard]).size, 30);
  assert.equal(
    scoreProPlacement(solution.grid, solution.discard).total,
    expectedTotals[index],
  );
});

const sharedCornerLeader = __proBestKnownTestHooks.solutions.at(-1);
const sharedCornerDeal = [
  ...sharedCornerLeader.grid,
  ...sharedCornerLeader.discard,
].reverse();
const restored = seededProBestKnownForDeal(sharedCornerDeal);
assert.deepEqual(restored.grid, sharedCornerLeader.grid);
assert.deepEqual(restored.discard, sharedCornerLeader.discard);

restored.grid[0] = "2H";
assert.equal(
  seededProBestKnownForDeal(sharedCornerDeal).grid[0],
  "AC",
  "callers should receive a defensive copy of a seeded placement",
);
assert.equal(
  seededProBestKnownForDeal([...sharedCornerDeal.slice(1), "QD"]),
  null,
  "a leader must never leak into a different deal",
);

const resumeLeader = seededProBestKnownForDeal(sharedCornerDeal);
const resumeSession = createProHeuristicSession(sharedCornerDeal, {
  timeLimitMs: 45000,
  incumbent: resumeLeader,
  resumeFromKnownLeader: true,
});
assert.equal(resumeSession.resumeFromKnownLeader, true);
assert.equal(resumeSession.best.score.total, 24030);
assert.equal(resumeSession.incumbentBeamPending, false);
assert.deepEqual(
  resumeSession.starts[0],
  [...resumeLeader.grid, ...resumeLeader.discard],
  "the best-known placement should be the first resumed trajectory",
);
assert.ok(
  resumeSession.starts.length < 160,
  "resume should skip the expensive first-run structure portfolio",
);

console.log("Pro best-known tests passed");
