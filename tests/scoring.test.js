import assert from "node:assert/strict";
import { SAMPLE_FANTASYLAND_DEAL, canonicalDealKey, sortCardIds, translatePlacementToDeal } from "../src/cards.js";
import { solveFantasylandExactHighBuckets } from "../src/exactHighBucketSolver.js";
import { solveFantasylandHeuristic } from "../src/heuristicSolver.js";
import {
  canonicalScoreStructureKey,
  solutionStructureKey,
  solutionPlacementKey,
  uniqueSolutionsByPlacement,
  uniqueSolutionsByStructure,
} from "../src/layoutEquivalence.js";
import { compareScores, scoreHand, scorePlacement, theoreticalMaxTotalForHandCount } from "../src/scoring.js";
import { BOARD_TRANSFORMS, canonicalPlacementKey } from "../src/symmetry.js";

function assertHand(cards, key, base, quality) {
  const hand = scoreHand(cards);
  assert.equal(hand.key, key);
  assert.equal(hand.base, base);
  assert.equal(hand.quality, quality);
}

function solutionFor(grid, discard, source = "fixture") {
  return {
    grid,
    discard,
    score: scorePlacement(grid, discard),
    source,
  };
}

function assertSolutionMatchesDeal(solution, deal) {
  assert.deepEqual(sortCardIds([...solution.grid, ...solution.discard]), sortCardIds(deal));
  const score = scorePlacement(solution.grid, solution.discard);
  assert.equal(solution.score.total, score.total);
  assert.equal(solution.score.base, score.base);
  assert.equal(solution.score.handCount, score.handCount);
  assert.equal(solution.score.qualityHandCount, score.qualityHandCount);
}

function assertHeuristicResultWellFormed(deal, timeLimitMs = 600) {
  const result = solveFantasylandHeuristic(deal, { timeLimitMs, maxSolutions: 12 });
  assert.ok(result.best);
  assert.equal(result.solutions[0], result.best);

  const seenStructures = new Set();
  for (let index = 0; index < result.solutions.length; index += 1) {
    const solution = result.solutions[index];
    assertSolutionMatchesDeal(solution, deal);
    if (index > 0) assert.ok(compareScores(result.solutions[index - 1].score, solution.score) >= 0);

    const structureKey = solutionStructureKey(solution);
    assert.equal(seenStructures.has(structureKey), false);
    seenStructures.add(structureKey);
  }

  return result;
}

assertHand(["8H", "6H", "9H", "7H"], "straight-flush", 450, true);
assertHand(["6H", "6C", "6D", "6S"], "four-kind", 325, true);
assertHand(["6H", "9S", "7C", "8D"], "straight", 180, true);
assertHand(["6H", "6C", "6D", "AH"], "three-kind", 125, true);
assertHand(["10C", "6C", "QC", "9C"], "flush", 80, false);
assertHand(["6C", "JD", "JS", "6H"], "two-pair", 60, false);
assertHand(["6H", "6C", "QD", "AS"], "pair", 5, false);
assertHand(["6H", "8C", "QD", "AS"], "no-hand", 0, false);

const screenshotGrid = [
  "9S",
  "QC",
  "JH",
  "10S",
  "JC",
  "AD",
  "KD",
  "QD",
  "QH",
  "6H",
  "KH",
  "9H",
  "QS",
  "AS",
  "KS",
  "JS",
];
const screenshotDiscard = ["7H", "7S", "7C", "6C"];
const screenshotScore = scorePlacement(screenshotGrid, screenshotDiscard);
assert.equal(screenshotScore.base, 2480);
assert.equal(screenshotScore.handCount, 10);
assert.equal(screenshotScore.multiplier, 6);
assert.equal(screenshotScore.total, 14880);
assert.equal(BOARD_TRANSFORMS.length, 32);

const interiorRowSwapGrid = [...screenshotGrid];
for (let col = 0; col < 4; col += 1) {
  [interiorRowSwapGrid[4 + col], interiorRowSwapGrid[8 + col]] = [
    interiorRowSwapGrid[8 + col],
    interiorRowSwapGrid[4 + col],
  ];
}
assert.equal(canonicalPlacementKey(screenshotGrid, screenshotDiscard), canonicalPlacementKey(interiorRowSwapGrid, screenshotDiscard));
assert.equal(scorePlacement(interiorRowSwapGrid, screenshotDiscard).total, screenshotScore.total);

const straightFlushRowsGrid = [
  "JC",
  "QC",
  "KC",
  "AC",
  "JD",
  "QD",
  "KD",
  "AD",
  "JH",
  "QH",
  "KH",
  "AH",
  "JS",
  "QS",
  "KS",
  "AS",
];
const straightFlushRowsDiscard = ["7S", "8S", "9S", "10S"];
const fourKindRowsGrid = [
  "AD",
  "AC",
  "AS",
  "AH",
  "KD",
  "KC",
  "KS",
  "KH",
  "QD",
  "QC",
  "QS",
  "QH",
  "JD",
  "JC",
  "JS",
  "JH",
];
const fourKindRowsDiscard = ["10S", "9S", "8S", "7S"];
assert.equal(scorePlacement(straightFlushRowsGrid, straightFlushRowsDiscard).total, 27420);
assert.equal(scorePlacement(fourKindRowsGrid, fourKindRowsDiscard).total, 27420);
assert.notEqual(
  canonicalPlacementKey(straightFlushRowsGrid, straightFlushRowsDiscard),
  canonicalPlacementKey(fourKindRowsGrid, fourKindRowsDiscard),
);
assert.equal(
  canonicalScoreStructureKey(straightFlushRowsGrid, straightFlushRowsDiscard),
  canonicalScoreStructureKey(fourKindRowsGrid, fourKindRowsDiscard),
);
assert.equal(
  solutionPlacementKey({
    grid: straightFlushRowsGrid,
    discard: straightFlushRowsDiscard,
    key: "browser-local-copy",
  }),
  solutionPlacementKey({
    grid: straightFlushRowsGrid,
    discard: straightFlushRowsDiscard,
    key: "baseline-copy",
  }),
);
assert.equal(
  uniqueSolutionsByPlacement([
    { grid: straightFlushRowsGrid, discard: straightFlushRowsDiscard, key: "browser-local-copy" },
    { grid: straightFlushRowsGrid, discard: straightFlushRowsDiscard, key: "baseline-copy" },
  ]).length,
  1,
);

const lowRankStraightFlushRowsGrid = [
  "7C",
  "8C",
  "9C",
  "10C",
  "7D",
  "8D",
  "9D",
  "10D",
  "7H",
  "8H",
  "9H",
  "10H",
  "7S",
  "8S",
  "9S",
  "10S",
];
const lowRankStraightFlushRowsDiscard = ["JS", "QS", "KS", "AS"];
assert.equal(scorePlacement(lowRankStraightFlushRowsGrid, lowRankStraightFlushRowsDiscard).total, 27420);
assert.notEqual(
  canonicalScoreStructureKey(straightFlushRowsGrid, straightFlushRowsDiscard),
  canonicalScoreStructureKey(lowRankStraightFlushRowsGrid, lowRankStraightFlushRowsDiscard),
);

const kickerSwapGridA = [
  "9S",
  "8S",
  "7S",
  "10S",
  "JH",
  "KH",
  "AH",
  "QH",
  "JC",
  "KC",
  "AC",
  "8C",
  "JS",
  "KS",
  "AS",
  "QS",
];
const kickerSwapGridB = [
  "10S",
  "8S",
  "7S",
  "9S",
  "JH",
  "KH",
  "AH",
  "QH",
  "JC",
  "KC",
  "AC",
  "8C",
  "JS",
  "KS",
  "AS",
  "QS",
];
const kickerSwapDiscard = ["JD", "QD", "KD", "AD"];
assert.equal(scorePlacement(kickerSwapGridA, kickerSwapDiscard).total, 24360);
assert.equal(scorePlacement(kickerSwapGridB, kickerSwapDiscard).total, 24360);
assert.notEqual(canonicalPlacementKey(kickerSwapGridA, kickerSwapDiscard), canonicalPlacementKey(kickerSwapGridB, kickerSwapDiscard));
assert.equal(
  canonicalScoreStructureKey(kickerSwapGridA, kickerSwapDiscard),
  canonicalScoreStructureKey(kickerSwapGridB, kickerSwapDiscard),
);

const twoPairSuitGridA = [
  "JC",
  "AC",
  "JS",
  "AS",
  "JD",
  "AD",
  "JH",
  "AH",
  "KC",
  "KD",
  "KH",
  "KS",
  "QC",
  "QD",
  "QH",
  "QS",
];
const twoPairSuitGridB = [
  "AD",
  "AH",
  "JD",
  "JH",
  "AC",
  "AS",
  "JC",
  "JS",
  "KC",
  "KD",
  "KH",
  "KS",
  "QC",
  "QD",
  "QH",
  "QS",
];
const twoPairSuitDiscard = ["7C", "8C", "9C", "10C"];
assert.equal(scoreHand(["JC", "AC", "JS", "AS"]).key, "two-pair");
assert.equal(scoreHand(["AD", "AH", "JD", "JH"]).key, "two-pair");
assert.notEqual(
  canonicalPlacementKey(twoPairSuitGridA, twoPairSuitDiscard),
  canonicalPlacementKey(twoPairSuitGridB, twoPairSuitDiscard),
);
assert.equal(
  canonicalScoreStructureKey(twoPairSuitGridA, twoPairSuitDiscard),
  canonicalScoreStructureKey(twoPairSuitGridB, twoPairSuitDiscard),
);
assert.equal(
  uniqueSolutionsByStructure([
    solutionFor(twoPairSuitGridA, twoPairSuitDiscard, "two-pair suits A"),
    solutionFor(twoPairSuitGridB, twoPairSuitDiscard, "two-pair suits B"),
  ]).length,
  1,
);

const twoPairDifferentRankGrid = [
  "QC",
  "AC",
  "QS",
  "AS",
  "JD",
  "AD",
  "JH",
  "AH",
  "KC",
  "KD",
  "KH",
  "KS",
  "6C",
  "6D",
  "6H",
  "6S",
];
assert.equal(scoreHand(["QC", "AC", "QS", "AS"]).key, "two-pair");
assert.notEqual(
  canonicalScoreStructureKey(twoPairSuitGridA, twoPairSuitDiscard),
  canonicalScoreStructureKey(twoPairDifferentRankGrid, twoPairSuitDiscard),
);
assert.equal(
  uniqueSolutionsByStructure([
    solutionFor(twoPairSuitGridA, twoPairSuitDiscard, "two-pair JA"),
    solutionFor(twoPairDifferentRankGrid, twoPairSuitDiscard, "two-pair QA"),
  ]).length,
  2,
);

const knownHighDeal = [
  "7S",
  "8S",
  "9S",
  "10S",
  "9C",
  "JC",
  "KC",
  "AC",
  "JH",
  "QH",
  "KH",
  "AH",
  "JS",
  "QS",
  "KS",
  "AS",
  "JD",
  "QD",
  "KD",
  "AD",
];
const knownHighGrid = [
  "9S",
  "7S",
  "8S",
  "10S",
  "JC",
  "KC",
  "AC",
  "9C",
  "QH",
  "KH",
  "AH",
  "JH",
  "JS",
  "KS",
  "AS",
  "QS",
];
const knownHighDiscard = ["JD", "QD", "KD", "AD"];
const knownHighScore = scorePlacement(knownHighGrid, knownHighDiscard);
assert.equal(knownHighScore.total, 24690);
const alternateKnownHighGrid = [
  "10S",
  "8S",
  "7S",
  "9S",
  "JH",
  "KH",
  "AH",
  "QH",
  "JC",
  "KC",
  "AC",
  "9C",
  "JS",
  "KS",
  "AS",
  "QS",
];
assert.equal(scorePlacement(alternateKnownHighGrid, knownHighDiscard).total, 24690);
assert.notEqual(
  canonicalScoreStructureKey(knownHighGrid, knownHighDiscard),
  canonicalScoreStructureKey(alternateKnownHighGrid, knownHighDiscard),
);
const knownHighHeuristic = solveFantasylandHeuristic(knownHighDeal, {
  timeLimitMs: 7000,
  maxSolutions: 24,
  initialPlacements: [
    {
      grid: knownHighGrid,
      discard: knownHighDiscard,
      score: knownHighScore,
    },
    {
      grid: alternateKnownHighGrid,
      discard: knownHighDiscard,
      score: scorePlacement(alternateKnownHighGrid, knownHighDiscard),
    },
  ],
});
const knownHighStructures = new Set(
  knownHighHeuristic.solutions
    .filter((solution) => solution.score.total === 24690)
    .map((solution) => canonicalScoreStructureKey(solution.grid, solution.discard)),
);
assert.equal(knownHighHeuristic.best.score.total >= knownHighScore.total, true);
assert.equal(knownHighStructures.has(canonicalScoreStructureKey(knownHighGrid, knownHighDiscard)), true);
assert.equal(knownHighStructures.has(canonicalScoreStructureKey(alternateKnownHighGrid, knownHighDiscard)), true);

const screenshotAttemptGrid = [
  "JH",
  "9C",
  "8D",
  "10D",
  "KH",
  "6C",
  "KD",
  "JS",
  "6H",
  "8S",
  "7D",
  "9S",
  "9H",
  "7S",
  "6D",
  "8H",
];
const screenshotAttemptDiscard = ["JC", "QD", "KS", "AC"];
const screenshotAttemptScore = scorePlacement(screenshotAttemptGrid, screenshotAttemptDiscard);
const screenshotAttemptDeal = sortCardIds([...screenshotAttemptGrid, ...screenshotAttemptDiscard]);
assert.equal(screenshotAttemptScore.total, 11790);
const seededScreenshotHeuristic = solveFantasylandHeuristic(screenshotAttemptDeal, {
  timeLimitMs: 500,
  maxSolutions: 8,
  fastMode: true,
  incumbentTotal: screenshotAttemptScore.total,
  initialPlacements: [
    {
      grid: screenshotAttemptGrid,
      discard: screenshotAttemptDiscard,
      score: screenshotAttemptScore,
    },
  ],
});
assert.equal(seededScreenshotHeuristic.best.score.total >= screenshotAttemptScore.total, true);
assert.equal(
  seededScreenshotHeuristic.solutions.some((solution) => solution.score.total >= screenshotAttemptScore.total),
  true,
);

[
  SAMPLE_FANTASYLAND_DEAL,
  knownHighDeal,
  screenshotAttemptDeal,
  [
    "6H",
    "6S",
    "6C",
    "7H",
    "7C",
    "8S",
    "8C",
    "8D",
    "9S",
    "9D",
    "10H",
    "10C",
    "JH",
    "JS",
    "JC",
    "JD",
    "QC",
    "QD",
    "KD",
    "AS",
  ],
].forEach((deal) => assertHeuristicResultWellFormed(deal));

const shiftedLowRun = [
  "6H",
  "6S",
  "6C",
  "6D",
  "7H",
  "7S",
  "7C",
  "7D",
  "8H",
  "8S",
  "8C",
  "8D",
  "9H",
  "9S",
  "9C",
  "9D",
  "10H",
  "10S",
  "10C",
  "10D",
];
const shiftedHighRun = [
  "7H",
  "7S",
  "7C",
  "7D",
  "8H",
  "8S",
  "8C",
  "8D",
  "9H",
  "9S",
  "9C",
  "9D",
  "10H",
  "10S",
  "10C",
  "10D",
  "JH",
  "JS",
  "JC",
  "JD",
];
assert.equal(canonicalDealKey(shiftedLowRun), canonicalDealKey(shiftedHighRun));

const translated = translatePlacementToDeal(shiftedLowRun.slice(0, 16), shiftedLowRun.slice(16, 20), shiftedHighRun);
assert.deepEqual(translated.grid.slice(0, 4), ["7H", "7S", "7C", "7D"]);
assert.deepEqual(translated.discard, ["JH", "JS", "JC", "JD"]);

assert.equal(theoreticalMaxTotalForHandCount(7), 14400);
assert.equal(theoreticalMaxTotalForHandCount(8), 20250);
assert.equal(theoreticalMaxTotalForHandCount(10), 35100);

const structuredHighScore = scorePlacement(
  [
    "6H",
    "6S",
    "6C",
    "6D",
    "7H",
    "7S",
    "7C",
    "7D",
    "8H",
    "8S",
    "8C",
    "8D",
    "9H",
    "9S",
    "9C",
    "9D",
  ],
  ["10H", "10S", "10C", "10D"],
);
const lowBucketOnlyProof = solveFantasylandExactHighBuckets(shiftedLowRun, {
  timeLimitMs: 1000,
  minGridHandCount: 0,
  maxGridHandCount: 7,
  includeThreePositiveRows: true,
  incumbentSolution: {
    grid: structuredHighScore.lines.flatMap((line, index) => (index < 4 ? line.cards : [])),
    discard: ["10H", "10S", "10C", "10D"],
    score: structuredHighScore,
  },
});
assert.equal(lowBucketOnlyProof.exact, false);
const lowBucketWithHighProof = solveFantasylandExactHighBuckets(shiftedLowRun, {
  timeLimitMs: 1000,
  minGridHandCount: 0,
  maxGridHandCount: 7,
  includeThreePositiveRows: true,
  highBucketsAlreadyExhausted: true,
  incumbentSolution: {
    grid: structuredHighScore.lines.flatMap((line, index) => (index < 4 ? line.cards : [])),
    discard: ["10H", "10S", "10C", "10D"],
    score: structuredHighScore,
  },
});
assert.equal(lowBucketWithHighProof.exact, true);

const finalLowRowsWithoutPriorProof = solveFantasylandExactHighBuckets(shiftedLowRun, {
  timeLimitMs: 1000,
  minGridHandCount: 0,
  maxGridHandCount: 5,
  maxColumnHandCount: 2,
  includeFourPositiveRows: false,
  includeTwoOrFewerPositiveRows: true,
  incumbentSolution: {
    grid: structuredHighScore.lines.flatMap((line, index) => (index < 4 ? line.cards : [])),
    discard: ["10H", "10S", "10C", "10D"],
    score: structuredHighScore,
  },
});
assert.equal(finalLowRowsWithoutPriorProof.exact, false);
const finalLowRowsWithPriorProof = solveFantasylandExactHighBuckets(shiftedLowRun, {
  timeLimitMs: 1000,
  minGridHandCount: 0,
  maxGridHandCount: 5,
  maxColumnHandCount: 2,
  includeFourPositiveRows: false,
  includeTwoOrFewerPositiveRows: true,
  highBucketsAlreadyExhausted: true,
  threePlusRowsAlreadyExhausted: true,
  incumbentSolution: {
    grid: structuredHighScore.lines.flatMap((line, index) => (index < 4 ? line.cards : [])),
    discard: ["10H", "10S", "10C", "10D"],
    score: structuredHighScore,
  },
});
assert.equal(finalLowRowsWithPriorProof.exact, true);

console.log("scoring tests passed");
