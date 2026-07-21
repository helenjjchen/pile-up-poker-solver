import assert from "node:assert/strict";
import {
  adaptBestKnownRecordToDeal,
  bestKnownSolutions,
  bestKnownVariantCount,
  createBestKnownRecord,
  mergeBestKnownRecord,
  normalizeBestKnownRecord,
  serializeBestKnownRecord,
} from "../src/bestKnownCache.js";
import { canonicalDealKey, sortCardIds } from "../src/cards.js";
import { compareScores, scorePlacement } from "../src/scoring.js";
import {
  formatScoringWayCount,
  formatWayCount,
  solutionHandProfileKey,
} from "../src/solutionProfiles.js";

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
const knownHighDiscard = ["JD", "QD", "KD", "AD"];

function solution(grid, discard = knownHighDiscard, source = "test") {
  return { grid, discard, score: scorePlacement(grid, discard), source };
}

const wayA = solution(knownHighGrid, knownHighDiscard, "way-a");
const wayB = solution(alternateKnownHighGrid, knownHighDiscard, "way-b");
assert.equal(compareScores(wayA.score, wayB.score), 0);
assert.notEqual(solutionHandProfileKey(wayA), solutionHandProfileKey(wayB));

const legacyRecord = normalizeBestKnownRecord({
  deal: knownHighDeal,
  grid: knownHighGrid,
  discard: knownHighDiscard,
  source: "legacy",
});
assert.equal(bestKnownVariantCount(legacyRecord), 1);

const recordA = createBestKnownRecord({ deal: knownHighDeal, solutions: [wayA] });
const recordB = createBestKnownRecord({ deal: knownHighDeal, solutions: [wayB] });
const recordAB = mergeBestKnownRecord(recordA, recordB);
assert.equal(recordAB.score.total, 24690);
assert.equal(bestKnownVariantCount(recordAB), 2);

const duplicateMerge = mergeBestKnownRecord(recordAB, recordA);
assert.equal(bestKnownVariantCount(duplicateMerge), 2);

const serialized = serializeBestKnownRecord(recordAB);
const reloaded = normalizeBestKnownRecord(JSON.parse(JSON.stringify(serialized)), "reloaded");
assert.equal(bestKnownVariantCount(reloaded), 2);
assert.deepEqual(
  new Set(bestKnownSolutions(reloaded).map(solutionHandProfileKey)),
  new Set([solutionHandProfileKey(wayA), solutionHandProfileKey(wayB)]),
);

const lowerGrid = [...knownHighGrid];
[lowerGrid[0], lowerGrid[5]] = [lowerGrid[5], lowerGrid[0]];
const lowerSolution = solution(lowerGrid, knownHighDiscard, "lower");
assert.ok(compareScores(wayA.score, lowerSolution.score) > 0);
const lowerRecord = createBestKnownRecord({ deal: knownHighDeal, solutions: [lowerSolution] });
const improvedRecord = mergeBestKnownRecord(lowerRecord, recordAB);
assert.equal(bestKnownVariantCount(improvedRecord), 2);
assert.equal(improvedRecord.score.total, 24690);
const ignoredWorseRecord = mergeBestKnownRecord(recordAB, lowerRecord);
assert.equal(bestKnownVariantCount(ignoredWorseRecord), 2);
assert.equal(ignoredWorseRecord.score.total, 24690);

const shiftedRanks = {
  7: "6",
  8: "7",
  9: "8",
  10: "9",
  J: "10",
  Q: "J",
  K: "Q",
  A: "K",
};
const shiftCard = (cardId) => `${shiftedRanks[cardId.slice(0, -1)]}${cardId.at(-1)}`;
const shiftedDeal = knownHighDeal.map(shiftCard);
assert.equal(canonicalDealKey(knownHighDeal), canonicalDealKey(shiftedDeal));
const translated = adaptBestKnownRecordToDeal(recordAB, shiftedDeal, " canonical");
assert.equal(bestKnownVariantCount(translated), 2);
for (const translatedSolution of bestKnownSolutions(translated)) {
  assert.deepEqual(
    sortCardIds([...translatedSolution.grid, ...translatedSolution.discard]),
    sortCardIds(shiftedDeal),
  );
}

assert.equal(formatWayCount(1, false), "1 way found");
assert.equal(formatWayCount(2, false), "2 ways found");
assert.equal(formatWayCount(1, true), "1 way total");
assert.equal(formatWayCount(2, true), "2 ways total");
assert.equal(formatScoringWayCount(1, false), "1 scoring way found");
assert.equal(formatScoringWayCount(2, true), "All 2 scoring ways");

console.log("best-known cache tests passed");
