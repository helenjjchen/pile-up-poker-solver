import assert from "node:assert/strict";
import { canonicalDealKey, translatePlacementToDeal } from "../src/cards.js";
import { solveFantasylandExactHighBuckets } from "../src/exactHighBucketSolver.js";
import { scoreHand, scorePlacement, theoreticalMaxTotalForHandCount } from "../src/scoring.js";

function assertHand(cards, key, base, quality) {
  const hand = scoreHand(cards);
  assert.equal(hand.key, key);
  assert.equal(hand.base, base);
  assert.equal(hand.quality, quality);
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
