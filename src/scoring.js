import { CARD_BY_ID, RANKS } from "./cards.js";

export const HANDS = {
  STRAIGHT_FLUSH: {
    key: "straight-flush",
    label: "Straight flush",
    shortLabel: "Str. flush",
    base: 450,
    quality: true,
  },
  FOUR_KIND: {
    key: "four-kind",
    label: "4 of a kind",
    shortLabel: "4 kind",
    base: 325,
    quality: true,
  },
  STRAIGHT: {
    key: "straight",
    label: "Straight",
    shortLabel: "Straight",
    base: 180,
    quality: true,
  },
  THREE_KIND: {
    key: "three-kind",
    label: "3 of a kind",
    shortLabel: "3 kind",
    base: 125,
    quality: true,
  },
  FLUSH: {
    key: "flush",
    label: "Flush",
    shortLabel: "Flush",
    base: 80,
    quality: false,
  },
  TWO_PAIR: {
    key: "two-pair",
    label: "2 pair",
    shortLabel: "2 pair",
    base: 60,
    quality: false,
  },
  PAIR: {
    key: "pair",
    label: "Pair",
    shortLabel: "Pair",
    base: 5,
    quality: false,
  },
  NO_HAND: {
    key: "no-hand",
    label: "No hand",
    shortLabel: "No hand",
    base: 0,
    quality: false,
  },
};

export const LINE_DEFINITIONS = [
  { key: "row-1", label: "Row 1", type: "row", indices: [0, 1, 2, 3], bonus: 1 },
  { key: "row-2", label: "Row 2", type: "row", indices: [4, 5, 6, 7], bonus: 1 },
  { key: "row-3", label: "Row 3", type: "row", indices: [8, 9, 10, 11], bonus: 1 },
  { key: "row-4", label: "Row 4", type: "row", indices: [12, 13, 14, 15], bonus: 1 },
  { key: "col-1", label: "Column 1", type: "column", indices: [0, 4, 8, 12], bonus: 1 },
  { key: "col-2", label: "Column 2", type: "column", indices: [1, 5, 9, 13], bonus: 1 },
  { key: "col-3", label: "Column 3", type: "column", indices: [2, 6, 10, 14], bonus: 1 },
  { key: "col-4", label: "Column 4", type: "column", indices: [3, 7, 11, 15], bonus: 1 },
  { key: "corners", label: "Corners", type: "corner", indices: [0, 3, 12, 15], bonus: 2 },
];

export function scoreHand(cardIds) {
  if (!cardIds || cardIds.length !== 4 || cardIds.some((cardId) => !cardId)) {
    return { ...HANDS.NO_HAND, cards: cardIds ?? [] };
  }

  const cards = cardIds.map((cardId) => CARD_BY_ID[cardId]);
  const rankCounts = new Map();
  const suitCounts = new Map();

  for (const card of cards) {
    rankCounts.set(card.rank, (rankCounts.get(card.rank) ?? 0) + 1);
    suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
  }

  const counts = [...rankCounts.values()].sort((a, b) => b - a);
  const uniqueRankIndexes = [...rankCounts.keys()]
    .map((rank) => RANKS.indexOf(rank))
    .sort((a, b) => a - b);

  const isFlush = suitCounts.size === 1;
  const isStraight =
    uniqueRankIndexes.length === 4 &&
    uniqueRankIndexes[3] - uniqueRankIndexes[0] === 3 &&
    uniqueRankIndexes.every((rankIndex, index) => rankIndex === uniqueRankIndexes[0] + index);

  let hand = HANDS.NO_HAND;
  if (isStraight && isFlush) hand = HANDS.STRAIGHT_FLUSH;
  else if (counts[0] === 4) hand = HANDS.FOUR_KIND;
  else if (isStraight) hand = HANDS.STRAIGHT;
  else if (counts[0] === 3) hand = HANDS.THREE_KIND;
  else if (isFlush) hand = HANDS.FLUSH;
  else if (counts[0] === 2 && counts[1] === 2) hand = HANDS.TWO_PAIR;
  else if (counts[0] === 2) hand = HANDS.PAIR;

  return { ...hand, cards: [...cardIds] };
}

export function multiplierForHandCount(handCount) {
  if (handCount >= 10) return 6;
  if (handCount >= 8) return 5;
  if (handCount >= 6) return 4;
  if (handCount >= 4) return 3;
  if (handCount >= 2) return 2;
  return 1;
}

export function theoreticalMaxBaseForHandCount(handCount) {
  if (handCount <= 0) return 0;
  if (handCount >= 10) return 8 * HANDS.STRAIGHT_FLUSH.base + 2 * HANDS.STRAIGHT_FLUSH.base + 3 * HANDS.STRAIGHT_FLUSH.base;

  const gridHands = Math.min(handCount, 9);
  const cornerValue = 2 * HANDS.STRAIGHT_FLUSH.base;
  const normalLineValue = Math.max(0, gridHands - 1) * HANDS.STRAIGHT_FLUSH.base;
  return cornerValue + normalLineValue;
}

export function theoreticalMaxTotalForHandCount(handCount) {
  return theoreticalMaxBaseForHandCount(handCount) * multiplierForHandCount(handCount);
}

export function scorePlacement(grid, discard = []) {
  const lines = LINE_DEFINITIONS.map((line) => {
    const cards = line.indices.map((index) => grid[index] ?? null);
    const hand = scoreHand(cards);
    const value = hand.base * line.bonus;
    return {
      ...line,
      cards,
      hand,
      value,
      scores: hand.base > 0,
    };
  });

  const gridHandCount = lines.filter((line) => line.scores).length;
  const gridBase = lines.reduce((sum, line) => sum + line.value, 0);
  const discardHand = scoreHand(discard);
  const discardScores = gridHandCount === 9 && discardHand.base > 0;
  const discardValue = discardScores ? discardHand.base * 3 : 0;
  const handCount = gridHandCount + (discardScores ? 1 : 0);
  const multiplier = multiplierForHandCount(handCount);
  const base = gridBase + discardValue;
  const total = base * multiplier;
  const qualityHandCount =
    lines.filter((line) => line.scores && line.hand.quality).length +
    (discardScores && discardHand.quality ? 1 : 0);

  return {
    total,
    base,
    multiplier,
    handCount,
    qualityHandCount,
    gridHandCount,
    gridBase,
    discardValue,
    discardScores,
    discardHand,
    lines,
  };
}

export function compareScores(a, b) {
  if (a.total !== b.total) return a.total - b.total;
  if (a.base !== b.base) return a.base - b.base;
  if (a.handCount !== b.handCount) return a.handCount - b.handCount;
  if (a.qualityHandCount !== b.qualityHandCount) return a.qualityHandCount - b.qualityHandCount;
  return 0;
}
