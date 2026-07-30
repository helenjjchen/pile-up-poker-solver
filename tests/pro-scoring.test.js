import assert from "node:assert/strict";
import { PRO_DECK, sortProCardIds } from "../src/proCards.js";
import {
  __proHeuristicTestHooks,
  createProHeuristicSession,
  finishProHeuristicSession,
  solveProHeuristic,
  stepProHeuristicSession,
} from "../src/proHeuristicSolver.js";
import {
  proMultiplierForHandCount,
  scoreProHand,
  scoreProPlacement,
} from "../src/proScoring.js";
import {
  solutionOutcomeProfileKey,
} from "../src/solutionProfiles.js";

function assertHand(cards, key, base, quality) {
  const hand = scoreProHand(cards);
  assert.equal(hand.key, key);
  assert.equal(hand.base, base);
  assert.equal(hand.quality, quality);
}

function assertResultMatchesDeal(result, deal) {
  const sortedDeal = sortProCardIds(deal);
  assert.ok(result.best);
  assert.equal(
    new Set(result.solutions.map(solutionOutcomeProfileKey)).size,
    result.solutions.length,
    "Pro should return one representative per outcome and hand profile",
  );
  for (const solution of result.solutions) {
    assert.equal(solution.grid.length, 25);
    assert.equal(solution.discard.length, 5);
    assert.deepEqual(
      sortProCardIds([...solution.grid, ...solution.discard]),
      sortedDeal,
      "every returned Pro placement must contain exactly the requested deal",
    );
    assert.deepEqual(
      solution.score,
      scoreProPlacement(solution.grid, solution.discard),
      "the solver must return a freshly computed score",
    );
  }
}

assert.equal(PRO_DECK.length, 53);
assert.equal(new Set(PRO_DECK.map((card) => card.id)).size, 53);

assertHand(["6H", "7H", "8H", "9H", "10H"], "straight-flush", 450, true);
assertHand(["6H", "6C", "6S", "6D", "JK"], "four-kind", 325, true);
assertHand(["6H", "6C", "JD", "JS", "JK"], "full-house", 230, true);
assertHand(["AH", "2C", "3S", "4D", "5H"], "straight", 180, true);
assertHand(["6H", "7C", "8S", "9D", "JK"], "straight", 180, true);
assertHand(["6H", "6C", "6S", "9D", "10H"], "three-kind", 125, true);
assertHand(["2C", "6C", "9C", "QC", "JK"], "flush", 80, false);
assertHand(["6H", "6C", "JS", "JD", "2H"], "two-pair", 60, false);
assertHand(["6H", "6C", "3S", "9D", "AH"], "pair", 5, false);
assertHand(["2H", "4C", "7S", "9D", "AH"], "no-hand", 0, false);

for (const [hands, multiplier] of [
  [0, 1],
  [3, 1],
  [4, 2],
  [5, 2],
  [6, 3],
  [7, 3],
  [8, 4],
  [9, 4],
  [10, 5],
  [11, 5],
  [12, 6],
]) {
  assert.equal(proMultiplierForHandCount(hands), multiplier);
}

const referenceAGrid = [
  "8S", "5H", "6S", "7D", "9S",
  "8C", "10H", "6D", "7H", "9D",
  "JC", "10C", "JK", "KC", "QC",
  "JH", "6C", "6H", "4S", "QH",
  "JS", "10D", "AC", "KD", "QS",
];
const referenceADiscard = ["2H", "2C", "2S", "2D", "3D"];
const referenceAScore = scoreProPlacement(referenceAGrid, referenceADiscard);
const referenceADeal = [...referenceAGrid, ...referenceADiscard];
assert.equal(referenceAScore.gridHandCount, 11);
assert.equal(referenceAScore.discardScores, true);
assert.equal(referenceAScore.handCount, 12);
assert.equal(referenceAScore.base, 3840);
assert.equal(referenceAScore.multiplier, 6);
assert.equal(referenceAScore.total, 23040);
assert.equal(referenceAScore.lines.find((line) => line.type === "corner").cards.includes("JK"), true);
assert.equal(referenceAScore.lines.find((line) => line.type === "corner").value, 900);

const referenceBGrid = [
  "JK", "2C", "2S", "3S", "4D",
  "4S", "6C", "6S", "7S", "8H",
  "8C", "8D", "8S", "9H", "9D",
  "9S", "10H", "JH", "JD", "QC",
  "KH", "KC", "AC", "AD", "AS",
];
const referenceBDiscard = ["3D", "3H", "3C", "4H", "2D"];
const referenceBScore = scoreProPlacement(referenceBGrid, referenceBDiscard);
assert.equal(referenceBScore.gridHandCount, 7);
assert.equal(referenceBScore.discardHand.key, "three-kind");
assert.equal(referenceBScore.discardScores, false);
assert.equal(referenceBScore.handCount, 7);
assert.equal(referenceBScore.multiplier, 3);
assert.equal(referenceBScore.total, 1830);
const referenceBState = [...referenceBGrid, ...referenceBDiscard];
const referenceBFastScore =
  __proHeuristicTestHooks.fastStateEvaluation(referenceBState);
assert.equal(referenceBFastScore.total, referenceBScore.total);
assert.equal(referenceBFastScore.base, referenceBScore.base);
assert.equal(referenceBFastScore.handCount, referenceBScore.handCount);
assert.equal(
  referenceBFastScore.qualityHandCount,
  referenceBScore.qualityHandCount,
);
for (let first = 0; first < referenceBState.length - 1; first += 1) {
  for (let second = first + 1; second < referenceBState.length; second += 1) {
    const candidate = [...referenceBState];
    [candidate[first], candidate[second]] = [
      candidate[second],
      candidate[first],
    ];
    const incremental =
      __proHeuristicTestHooks.fastStateEvaluationAfterMutation(
        candidate,
        referenceBFastScore,
        [first, second],
      );
    const authoritative = scoreProPlacement(
      candidate.slice(0, 25),
      candidate.slice(25),
    );
    assert.equal(incremental.total, authoritative.total);
    assert.equal(incremental.base, authoritative.base);
    assert.equal(incremental.handCount, authoritative.handCount);
    assert.equal(
      incremental.qualityHandCount,
      authoritative.qualityHandCount,
    );
  }
}

const cropped25560Grid = [
  "8S", "10H", "JH", "9H", "7S",
  "3H", "4H", "6H", "5H", "7H",
  "3S", "4C", "6S", "5C", "2S",
  "6C", "4D", "6D", "AC", "7D",
  "10S", "QS", "JS", "AS", "JK",
];
const cropped25560Discard = ["9D", "10D", "JD", "QD", "KD"];
const cropped25560Deal = [...cropped25560Grid, ...cropped25560Discard];
const cropped25560Score = scoreProPlacement(
  cropped25560Grid,
  cropped25560Discard,
);
assert.equal(cropped25560Score.handCount, 12);
assert.equal(cropped25560Score.total, 25560);
const qualityRowRegressionStarts =
  __proHeuristicTestHooks.qualityRowStructuredStates(
    cropped25560Deal,
    [cropped25560Discard],
  );
const qualityRowRegressionTotal = Math.max(
  ...qualityRowRegressionStarts.map((state) =>
    scoreProPlacement(state.slice(0, 25), state.slice(25)).total,
  ),
);
assert.ok(
  qualityRowRegressionTotal >= 25560,
  `straight-flush/rank portfolio regressed to ${qualityRowRegressionTotal}`,
);

const cropped3210Grid = [
  "2H", "4H", "6H", "9H", "10H",
  "JH", "QH", "AH", "2C", "4C",
  "5C", "6C", "7C", "8C", "9C",
  "10C", "JC", "QC", "KC", "AC",
  "5S", "6S", "8S", "JS", "QS",
];
const cropped3210Discard = ["JK", "AS", "6D", "8D", "AD"];
const cropped3210Deal = [...cropped3210Grid, ...cropped3210Discard];
const cropped3210Score = scoreProPlacement(cropped3210Grid, cropped3210Discard);
assert.equal(cropped3210Score.handCount, 6);
assert.equal(cropped3210Score.total, 3210);
const quadDiscard = ["AH", "AC", "AS", "AD", "6D"];
const qualityColumnRegressionStarts =
  __proHeuristicTestHooks.qualityColumnStructuredStates(
    cropped3210Deal,
    [quadDiscard],
    1,
  );
const qualityColumnRegressionState = qualityColumnRegressionStarts
  .map((state) => ({
    state,
    score: scoreProPlacement(state.slice(0, 25), state.slice(25)),
  }))
  .sort((a, b) => b.score.total - a.score.total)[0];
assert.ok(qualityColumnRegressionState);
const cropped3210Search = solveProHeuristic(cropped3210Deal, {
  timeLimitMs: 30000,
  maxAnnealingAttempts: 200000,
  incumbent: {
    grid: qualityColumnRegressionState.state.slice(0, 25),
    discard: qualityColumnRegressionState.state.slice(25),
    score: qualityColumnRegressionState.score,
    source: "rank-core regression seed",
  },
});
assert.ok(
  cropped3210Search.best.score.total >= 25140,
  `mixed rank/suit search regressed to ${cropped3210Search.best.score.total}`,
);
assertResultMatchesDeal(cropped3210Search, cropped3210Deal);

const structuralBenchmarkGrid = [
  "6S", "6C", "4H", "2D", "8S",
  "KC", "AC", "QC", "2C", "8C",
  "9H", "10H", "JK", "JH", "8H",
  "9D", "AD", "4D", "JD", "8D",
  "9S", "AS", "4S", "2S", "7S",
];
const structuralBenchmarkDiscard = ["3D", "3H", "3C", "3S", "KH"];
const structuralBenchmarkDeal = sortProCardIds([
  ...structuralBenchmarkGrid,
  ...structuralBenchmarkDiscard,
]);
const structuralBenchmarkScore = scoreProPlacement(
  structuralBenchmarkGrid,
  structuralBenchmarkDiscard,
);
assert.equal(structuralBenchmarkScore.handCount, 12);
assert.equal(structuralBenchmarkScore.base, 3700);
assert.equal(structuralBenchmarkScore.total, 22200);
const structuralBenchmarkSession = createProHeuristicSession(
  structuralBenchmarkDeal,
  {
    timeLimitMs: 10000,
    maxSolutions: 4,
  },
);
const structuralBenchmarkSeedTotal = Math.max(
  ...structuralBenchmarkSession.starts.map((state) =>
    scoreProPlacement(state.slice(0, 25), state.slice(25)).total,
  ),
);
assert.ok(
  structuralBenchmarkSeedTotal >= structuralBenchmarkScore.total,
  `Balanced Pro structural search regressed to ${structuralBenchmarkSeedTotal}`,
);

const mixedScreenshotGrid = [
  "8C", "9D", "9S", "9H", "9C",
  "QD", "4D", "7S", "4H", "7H",
  "QH", "KS", "JK", "AD", "JD",
  "3S", "KH", "JS", "5D", "5H",
  "QC", "KC", "10S", "AC", "JC",
];
const mixedScreenshotDiscard = ["6C", "3C", "4C", "5C", "7C"];
const mixedScreenshotDeal = [...mixedScreenshotGrid, ...mixedScreenshotDiscard];
const mixedScreenshotScore = scoreProPlacement(
  mixedScreenshotGrid,
  mixedScreenshotDiscard,
);
assert.equal(mixedScreenshotScore.total, 22260);
assert.equal(mixedScreenshotScore.handCount, 12);
const mixedScreenshotLeaderGrid = [
  "JK", "KC", "QC", "JC", "AC",
  "4H", "KH", "QH", "7H", "5H",
  "4D", "3S", "3C", "JD", "5D",
  "10S", "KS", "QD", "JS", "AD",
  "4C", "8C", "6C", "7C", "5C",
];
const mixedScreenshotLeaderDiscard = ["9C", "7S", "9H", "9D", "9S"];
const mixedScreenshotLeaderScore = scoreProPlacement(
  mixedScreenshotLeaderGrid,
  mixedScreenshotLeaderDiscard,
);
assert.equal(mixedScreenshotLeaderScore.total, 24450);
assert.equal(mixedScreenshotLeaderScore.handCount, 12);
assert.deepEqual(
  sortProCardIds([
    ...mixedScreenshotLeaderGrid,
    ...mixedScreenshotLeaderDiscard,
  ]),
  sortProCardIds(mixedScreenshotDeal),
);
const mixedScreenshotRestartSession = createProHeuristicSession(
  mixedScreenshotDeal,
  {
    timeLimitMs: 15000,
    maxSolutions: 4,
    incumbent: {
      grid: mixedScreenshotGrid,
      discard: mixedScreenshotDiscard,
      score: mixedScreenshotScore,
      source: "screenshot regression floor",
    },
  },
);
assert.deepEqual(
  mixedScreenshotRestartSession.starts[0],
  [...mixedScreenshotGrid, ...mixedScreenshotDiscard],
  "the uploaded floor should be the first Pro trajectory instead of sorting behind weaker starts",
);
assert.equal(
  mixedScreenshotRestartSession.phase,
  "refinement",
  "a Pro run with an incumbent should check its improving swaps before broad exploration",
);
assert.equal(mixedScreenshotRestartSession.refinementResumesAnnealing, true);
while (!stepProHeuristicSession(mixedScreenshotRestartSession, 50)) {
  // Exercise the same prioritized incumbent path used by the browser worker.
}
const mixedScreenshotRestartSearch = finishProHeuristicSession(
  mixedScreenshotRestartSession,
);
assert.ok(
  mixedScreenshotRestartSearch.leaderRestartCount > 0,
  "a Pro pass should revisit its current leader before exhausting every structural start",
);
assert.ok(
  mixedScreenshotRestartSearch.best.score.total >=
    mixedScreenshotLeaderScore.total,
  `incumbent look-ahead missed the known $${mixedScreenshotLeaderScore.total} placement and returned $${mixedScreenshotRestartSearch.best.score.total}`,
);
assert.ok(
  mixedScreenshotRestartSearch.beamAttempts > 0,
  "a Pro screenshot run should spend a bounded opening lane on coordinated multi-swap improvements",
);
assertResultMatchesDeal(mixedScreenshotRestartSearch, mixedScreenshotDeal);

const proDeal = [...referenceBGrid, ...referenceBDiscard];
const result = solveProHeuristic(proDeal, {
  timeLimitMs: 75,
  maxSolutions: 3,
  incumbent: {
    grid: referenceBGrid,
    discard: referenceBDiscard,
    score: referenceBScore,
    source: "test incumbent",
  },
});
assert.ok(result.best);
assert.equal(result.best.grid.length, 25);
assert.equal(result.best.discard.length, 5);
assert.deepEqual(
  sortProCardIds([...result.best.grid, ...result.best.discard]),
  sortProCardIds(proDeal),
);
assert.ok(result.best.score.total >= referenceBScore.total);
assert.equal(result.exact, false);
assertResultMatchesDeal(result, proDeal);

const deterministicReferenceA = solveProHeuristic(referenceADeal, {
  timeLimitMs: 10000,
  maxAnnealingAttempts: 10000,
  maxSolutions: 4,
});
const repeatedReferenceA = solveProHeuristic(referenceADeal, {
  timeLimitMs: 10000,
  maxAnnealingAttempts: 10000,
  maxSolutions: 4,
});
assert.equal(deterministicReferenceA.annealingAttempts, 10000);
assert.equal(repeatedReferenceA.annealingAttempts, 10000);
assert.equal(
  deterministicReferenceA.best.score.total,
  repeatedReferenceA.best.score.total,
  "an attempt-bounded Pro search should be reproducible for the same deal",
);
assert.deepEqual(
  {
    grid: deterministicReferenceA.best.grid,
    discard: deterministicReferenceA.best.discard,
    attempts: deterministicReferenceA.attempts,
    refinementAttempts: deterministicReferenceA.refinementAttempts,
  },
  {
    grid: repeatedReferenceA.best.grid,
    discard: repeatedReferenceA.best.discard,
    attempts: repeatedReferenceA.attempts,
    refinementAttempts: repeatedReferenceA.refinementAttempts,
  },
  "attempt-bounded searches should reproduce the exact placement and work counts",
);
assert.ok(
  deterministicReferenceA.best.score.total >= 20000,
  `reference A from-scratch quality regressed to ${deterministicReferenceA.best.score.total}`,
);
assertResultMatchesDeal(deterministicReferenceA, referenceADeal);

const deterministicReferenceB = solveProHeuristic(proDeal, {
  timeLimitMs: 10000,
  maxAnnealingAttempts: 60000,
  maxSolutions: 4,
});
assert.equal(deterministicReferenceB.annealingAttempts, 60000);
assert.ok(
  deterministicReferenceB.best.score.total >= 19000,
  `reference B from-scratch quality regressed to ${deterministicReferenceB.best.score.total}`,
);
assertResultMatchesDeal(deterministicReferenceB, proDeal);

const wrongDealIncumbentResult = solveProHeuristic(proDeal, {
  timeLimitMs: 50,
  maxSolutions: 2,
  incumbent: {
    grid: referenceAGrid,
    discard: referenceADiscard,
    score: referenceAScore,
    source: "wrong-deal incumbent",
  },
});
assert.deepEqual(
  sortProCardIds([
    ...wrongDealIncumbentResult.best.grid,
    ...wrongDealIncumbentResult.best.discard,
  ]),
  sortProCardIds(proDeal),
  "a cached or supplied incumbent must never introduce cards from another deal",
);
assertResultMatchesDeal(wrongDealIncumbentResult, proDeal);
assert.throws(
  () => solveProHeuristic([...proDeal.slice(0, 29), "not-a-card"], { timeLimitMs: 50 }),
  /exactly 30 unique cards/,
);
assert.throws(
  () =>
    solveProHeuristic(
      proDeal.map((cardId) => (cardId === "JK" ? "2H" : cardId)),
      { timeLimitMs: 50 },
    ),
  /exactly 30 unique cards/,
);
const sanitizedOptionsSession = createProHeuristicSession(proDeal, {
  timeLimitMs: Number.NaN,
  maxSolutions: -1,
  maxRefinementSeeds: Number.NaN,
});
assert.equal(sanitizedOptionsSession.timeLimitMs, 3000);
assert.equal(sanitizedOptionsSession.maxSolutions, 8);
assert.equal(sanitizedOptionsSession.maxRefinementSeeds, 8);

const cooperativeSession = createProHeuristicSession(proDeal, {
  timeLimitMs: 50,
  maxSolutions: 2,
  incumbent: result.best,
});
while (!stepProHeuristicSession(cooperativeSession, 2)) {
  // This is the same sliced search API used when Pro is opened from file://.
}
const cooperativeResult = finishProHeuristicSession(cooperativeSession);
assert.ok(cooperativeResult.best.score.total >= result.best.score.total);
assert.ok(cooperativeResult.attempts > 0);
assertResultMatchesDeal(cooperativeResult, proDeal);
const continuationSession = createProHeuristicSession(proDeal, {
  timeLimitMs: 50,
  maxSolutions: 2,
  incumbent: cooperativeResult.best,
  priorSolutions: cooperativeResult.solutions,
  continuationIndex: 1,
});
assert.equal(continuationSession.continuationIndex, 1);
while (!stepProHeuristicSession(continuationSession, 2)) {
  // Repeat searches use a fresh stream while retaining the previous floor.
}
const continuationResult = finishProHeuristicSession(continuationSession);
assert.equal(continuationResult.continuationIndex, 1);
assert.ok(
  continuationResult.best.score.total >= cooperativeResult.best.score.total,
);
assertResultMatchesDeal(continuationResult, proDeal);

for (let seed = 0; seed < 16; seed += 1) {
  const mutationStressResult = solveProHeuristic(proDeal, {
    timeLimitMs: 5000,
    maxAnnealingAttempts: 1500,
    maxSolutions: 8,
    seed,
  });
  assert.equal(
    mutationStressResult.annealingAttempts,
    1500,
    `seed ${seed} should complete its deterministic mutation budget`,
  );
  assertResultMatchesDeal(mutationStressResult, proDeal);
}

let workerMessageHandler = null;
const workerMessages = [];
let resolveWorkerDone;
const workerDone = new Promise((resolve) => {
  resolveWorkerDone = resolve;
});
globalThis.self = {
  addEventListener(type, handler) {
    if (type === "message") workerMessageHandler = handler;
  },
  postMessage(message) {
    workerMessages.push(message);
    if (message.id === 17 && message.status === "ok") resolveWorkerDone();
  },
};
await import("../src/proHeuristicWorker.js?pro-scoring-test");
assert.equal(typeof workerMessageHandler, "function");
workerMessageHandler({
  data: {
    id: 17,
    cardIds: proDeal,
    options: { timeLimitMs: 100, maxSolutions: 2, incumbent: result.best },
  },
});
let workerTimeout;
await Promise.race([
  workerDone,
  new Promise((_, reject) => {
    workerTimeout = setTimeout(
      () => reject(new Error("Pro worker did not finish in time.")),
      2000,
    );
  }),
]);
clearTimeout(workerTimeout);
const progressMessages = workerMessages.filter(
  (message) => message.id === 17 && message.status === "progress",
);
assert.ok(progressMessages.length > 0, "the worker should stream a usable placement");
for (let index = 1; index < progressMessages.length; index += 1) {
  assert.ok(
    progressMessages[index].result.best.score.total >=
      progressMessages[index - 1].result.best.score.total,
    "worker progress must never move backward",
  );
}
const workerFinal = workerMessages.find(
  (message) => message.id === 17 && message.status === "ok",
);
assert.ok(workerFinal);
assertResultMatchesDeal(workerFinal.result, proDeal);
workerMessageHandler({
  data: { id: 18, cardIds: proDeal.slice(0, 29), options: { timeLimitMs: 50 } },
});
assert.match(
  workerMessages.find((message) => message.id === 18)?.error ?? "",
  /exactly 30 unique cards/,
);
delete globalThis.self;

console.log("Pro scoring and solver tests passed.");
