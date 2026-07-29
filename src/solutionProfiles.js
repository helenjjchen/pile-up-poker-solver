export const SCORING_HAND_ORDER = [
  ["straight-flush", "straight flush", "straight flushes"],
  ["four-kind", "quad", "quads"],
  ["full-house", "full house", "full houses"],
  ["straight", "straight", "straights"],
  ["three-kind", "trip", "trips"],
  ["flush", "flush", "flushes"],
  ["two-pair", "two pair", "two pairs"],
  ["pair", "pair", "pairs"],
];

export function solutionOutcomeKey(solution) {
  const score = solution?.score;
  if (!score) return "";
  return [score.total, score.handCount, score.qualityHandCount].join("|");
}

export function scoringHandCounts(solution) {
  const counts = new Map();
  const addHand = (hand) => {
    if (!hand || hand.base <= 0) return;
    counts.set(hand.key, (counts.get(hand.key) ?? 0) + 1);
  };

  (solution?.score?.lines ?? []).forEach((line) => {
    if (line.scores) addHand(line.hand);
  });
  if (solution?.score?.discardScores) addHand(solution.score.discardHand);

  return counts;
}

export function solutionHandProfileKey(solution) {
  const counts = scoringHandCounts(solution);
  return SCORING_HAND_ORDER.map(([key]) => counts.get(key) ?? 0).join("|");
}

export function solutionOutcomeProfileKey(solution) {
  const outcomeKey = solutionOutcomeKey(solution);
  if (!outcomeKey) return "";
  return `${outcomeKey}::${solutionHandProfileKey(solution)}`;
}

export function uniqueSolutionsByOutcomeProfile(solutions) {
  const seen = new Set();
  return solutions.filter(Boolean).filter((solution) => {
    const key = solutionOutcomeProfileKey(solution);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function groupSolutionsByOutcome(solutions = []) {
  const groups = [];
  const byKey = new Map();

  solutions.filter(Boolean).forEach((solution, index) => {
    const key = solutionOutcomeKey(solution);
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        representative: solution,
        indexes: [],
        solutions: [],
        variants: [],
        variantsByKey: new Map(),
      };
      byKey.set(key, group);
      groups.push(group);
    }

    const profileKey = solutionHandProfileKey(solution);
    let variant = group.variantsByKey.get(profileKey);
    if (!variant) {
      variant = {
        key: profileKey,
        representative: solution,
        indexes: [],
        solutions: [],
      };
      group.variantsByKey.set(profileKey, variant);
      group.variants.push(variant);
    }

    group.indexes.push(index);
    group.solutions.push(solution);
    variant.indexes.push(index);
    variant.solutions.push(solution);
  });

  return groups;
}

export function scoringHandSummary(solution) {
  const counts = scoringHandCounts(solution);
  return SCORING_HAND_ORDER.flatMap(([key, singular, plural]) => {
    const count = counts.get(key) ?? 0;
    if (!count) return [];
    return `${count} ${count === 1 ? singular : plural}`;
  }).join(" · ");
}

export function formatWayCount(count, exhaustive = false) {
  const noun = count === 1 ? "way" : "ways";
  return exhaustive ? `${count} ${noun} total` : `${count} ${noun} found`;
}

export function formatScoringWayCount(count, exhaustive = false) {
  const noun = count === 1 ? "scoring way" : "scoring ways";
  return exhaustive ? `All ${count} ${noun}` : `${count} ${noun} found`;
}
