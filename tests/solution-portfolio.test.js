import assert from "node:assert/strict";

import {
  pinnedSolutionPortfolio,
  solutionPlacementKey,
} from "../src/solutionPortfolio.js";
import {
  groupSolutionsByOutcome,
  scoringHandSummary,
  solutionOutcomeProfileKey,
  uniqueSolutionsByOutcomeProfile,
} from "../src/solutionProfiles.js";

function solution(total, id) {
  return {
    grid: [`${id}-grid`],
    discard: [`${id}-discard`],
    score: { total },
  };
}

const compareByTotal = (first, second) =>
  second.score.total - first.score.total;
const uploaded = solution(19110, "uploaded");
const observedPortfolio = pinnedSolutionPortfolio(
  [
    solution(19470, "saved"),
    solution(15870, "solver-1"),
    solution(15450, "solver-2"),
  ],
  [uploaded],
  {
    compare: compareByTotal,
    maxSolutions: 8,
  },
);
assert.deepEqual(
  observedPortfolio.map((candidate) => candidate.score.total),
  [19470, 19110, 15870, 15450],
  "the uploaded $19,110 placement should sort immediately behind the $19,470 best",
);

const duplicateUploaded = {
  ...uploaded,
  score: { total: 99999 },
};
const dedupedPortfolio = pinnedSolutionPortfolio(
  [duplicateUploaded, solution(18000, "other")],
  [uploaded],
  {
    compare: compareByTotal,
    maxSolutions: 8,
  },
);
assert.equal(
  dedupedPortfolio.filter(
    (candidate) =>
      solutionPlacementKey(candidate) === solutionPlacementKey(uploaded),
  ).length,
  1,
  "the pinned upload should appear once even when the solver returns the same placement",
);
assert.equal(dedupedPortfolio[0], uploaded);

const higherCandidates = Array.from(
  { length: 8 },
  (_, index) => solution(30000 - index * 100, `higher-${index}`),
);
const cappedPortfolio = pinnedSolutionPortfolio(
  higherCandidates,
  [uploaded],
  {
    compare: compareByTotal,
    maxSolutions: 8,
  },
);
assert.equal(cappedPortfolio.length, 8);
assert.ok(
  cappedPortfolio.some(
    (candidate) =>
      solutionPlacementKey(candidate) === solutionPlacementKey(uploaded),
  ),
  "a low uploaded placement should replace the lowest unpinned pill instead of disappearing",
);
assert.deepEqual(
  cappedPortfolio.map((candidate) => candidate.score.total),
  [...higherCandidates.slice(0, 7).map((candidate) => candidate.score.total), 19110],
);
assert.ok(
  cappedPortfolio.every(
    (candidate, index) =>
      index === 0 ||
      compareByTotal(cappedPortfolio[index - 1], candidate) <= 0,
  ),
  "the protected result should not break descending score order",
);

const normalHigherCandidates = Array.from(
  { length: 12 },
  (_, index) => solution(40000 - index * 100, `normal-higher-${index}`),
);
const normalCappedPortfolio = pinnedSolutionPortfolio(
  normalHigherCandidates,
  [uploaded],
  {
    compare: compareByTotal,
    maxSolutions: 12,
  },
);
assert.equal(normalCappedPortfolio.length, 12);
assert.ok(
  normalCappedPortfolio.some(
    (candidate) =>
      solutionPlacementKey(candidate) === solutionPlacementKey(uploaded),
  ),
  "a player's Normal outcome group should remain visible under the 12-item cap",
);

function profiledSolution(total, id, handKeys) {
  return {
    grid: [`${id}-grid`],
    discard: [`${id}-discard`],
    score: {
      total,
      handCount: handKeys.length,
      qualityHandCount: 1,
      lines: handKeys.map((key) => ({
        scores: true,
        hand: { key, base: 5 },
      })),
      discardScores: false,
      discardHand: { key: "no-hand", base: 0 },
    },
  };
}

const rotatedProfileA = profiledSolution(
  19980,
  "rotated-a",
  ["straight", "pair"],
);
const rotatedProfileB = profiledSolution(
  19980,
  "rotated-b",
  ["straight", "pair"],
);
const fullHouseProfile = profiledSolution(
  19980,
  "full-house",
  ["full-house", "pair"],
);
const lowerProfile = profiledSolution(
  19020,
  "lower",
  ["three-kind", "pair"],
);

const diverseProfiles = uniqueSolutionsByOutcomeProfile([
  rotatedProfileA,
  rotatedProfileB,
  fullHouseProfile,
  lowerProfile,
]);
assert.deepEqual(
  diverseProfiles,
  [rotatedProfileA, fullHouseProfile, lowerProfile],
  "rotated or switched layouts with the same outcome and hand profile should collapse",
);

const groupedProfiles = groupSolutionsByOutcome([
  rotatedProfileA,
  rotatedProfileB,
  fullHouseProfile,
  lowerProfile,
]);
assert.equal(groupedProfiles.length, 2);
assert.equal(groupedProfiles[0].solutions.length, 3);
assert.equal(
  groupedProfiles[0].variants.length,
  2,
  "different hand profiles for one tied outcome should remain selectable variants",
);
assert.match(scoringHandSummary(fullHouseProfile), /1 full house/);

const pinnedProfile = pinnedSolutionPortfolio(
  [rotatedProfileA],
  [rotatedProfileB],
  {
    compare: compareByTotal,
    keyOf: solutionOutcomeProfileKey,
    maxSolutions: 8,
  },
);
assert.equal(
  pinnedProfile[0],
  rotatedProfileB,
  "Your grid should be the representative when it matches a solver profile",
);

console.log("solution portfolio tests passed");
