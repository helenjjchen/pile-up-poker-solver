import { CARD_BY_ID } from "./cards.js";
import { scorePlacement } from "./scoring.js";
import { BOARD_TRANSFORMS, canonicalPlacementKey, transformGrid } from "./symmetry.js";

function handRankSignature(hand) {
  if (!hand || hand.base <= 0 || !hand.cards?.length) return "none";

  const rankCounts = new Map();
  for (const cardId of hand.cards) {
    const card = CARD_BY_ID[cardId];
    if (!card) continue;
    rankCounts.set(card.rankIndex, (rankCounts.get(card.rankIndex) ?? 0) + 1);
  }

  const rankEntries = [...rankCounts.entries()];
  const contributingRanks =
    hand.key === "four-kind"
      ? rankEntries.filter(([, count]) => count === 4)
      : hand.key === "three-kind"
        ? rankEntries.filter(([, count]) => count === 3)
        : hand.key === "two-pair" || hand.key === "pair"
          ? rankEntries.filter(([, count]) => count === 2)
          : rankEntries;

  return contributingRanks
    .sort((a, b) => {
      if (a[1] !== b[1]) return b[1] - a[1];
      return a[0] - b[0];
    })
    .map(([rankIndex, count]) => `${rankIndex}x${count}`)
    .join(",");
}

function scoreStructureKey(score) {
  const lineParts = score.lines.map((line) =>
    [line.key, line.scores ? 1 : 0, line.hand.key, line.value, handRankSignature(line.hand)].join(":"),
  );

  return [
    score.total,
    score.base,
    score.handCount,
    score.multiplier,
    score.qualityHandCount,
    ...lineParts,
    "discard",
    score.discardScores ? 1 : 0,
    score.discardHand.key,
    score.discardValue,
    handRankSignature(score.discardHand),
  ].join("|");
}

export function canonicalScoreStructureKey(grid, discard) {
  const keys = BOARD_TRANSFORMS.map((_, transformIndex) => {
    const transformedGrid = transformGrid(grid, transformIndex);
    return scoreStructureKey(scorePlacement(transformedGrid, discard));
  });
  keys.sort();
  return keys[0];
}

export function solutionStructureKey(solution) {
  return canonicalScoreStructureKey(solution.grid, solution.discard);
}

export function solutionPlacementKey(solution) {
  if (!solution?.grid || !solution?.discard) return solution?.key ?? "";
  return canonicalPlacementKey(solution.grid, solution.discard);
}

export function uniqueSolutionsByPlacement(solutions) {
  const seen = new Set();
  return solutions.filter(Boolean).filter((solution) => {
    const key = solutionPlacementKey(solution);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
