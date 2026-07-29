import {
  JOKER_ID,
  PRO_CARD_BY_ID,
  PRO_RANKS,
  PRO_STANDARD_DECK,
} from "./proCards.js";

export const PRO_HANDS = {
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
  FULL_HOUSE: {
    key: "full-house",
    label: "Full house",
    shortLabel: "Full house",
    base: 230,
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

export const PRO_LINE_DEFINITIONS = [
  ...Array.from({ length: 5 }, (_, row) => ({
    key: `row-${row + 1}`,
    label: `Row ${row + 1}`,
    type: "row",
    indices: Array.from({ length: 5 }, (_, column) => row * 5 + column),
    bonus: 1,
  })),
  ...Array.from({ length: 5 }, (_, column) => ({
    key: `col-${column + 1}`,
    label: `Column ${column + 1}`,
    type: "column",
    indices: Array.from({ length: 5 }, (_, row) => row * 5 + column),
    bonus: 1,
  })),
  {
    key: "corners",
    label: "Corners + center",
    type: "corner",
    indices: [0, 4, 12, 20, 24],
    bonus: 2,
  },
];

const PRO_HAND_CACHE_LIMIT = 100_000;
const proHandCache = new Map();

function proHandCacheKey(cardIds) {
  return [...cardIds].sort().join("|");
}

function cacheProHand(key, hand) {
  if (proHandCache.size >= PRO_HAND_CACHE_LIMIT) proHandCache.clear();
  proHandCache.set(key, {
    key: hand.key,
    label: hand.label,
    shortLabel: hand.shortLabel,
    base: hand.base,
    quality: hand.quality,
    jokerAs: hand.jokerAs ?? null,
  });
}

function isFiveCardStraight(rankIndexes) {
  const unique = [...new Set(rankIndexes)].sort((a, b) => a - b);
  if (unique.length !== 5) return false;
  if (unique.every((rankIndex, index) => rankIndex === unique[0] + index)) return true;
  // Ace may play low in A-2-3-4-5.
  return unique.join(",") === `0,1,2,3,${PRO_RANKS.length - 1}`;
}

function scoreNaturalFiveCardHand(cardIds) {
  const cards = cardIds.map((cardId) => PRO_CARD_BY_ID[cardId]);
  if (cards.some((card) => !card || card.joker)) return PRO_HANDS.NO_HAND;

  const rankCounts = new Map();
  for (const card of cards) {
    rankCounts.set(card.rank, (rankCounts.get(card.rank) ?? 0) + 1);
  }

  const counts = [...rankCounts.values()].sort((a, b) => b - a);
  const isFlush = cards.every((card) => card.suit === cards[0].suit);
  const isStraight = isFiveCardStraight(cards.map((card) => card.rankIndex));

  if (isStraight && isFlush) return PRO_HANDS.STRAIGHT_FLUSH;
  // The joker may complete natural quads. Five equal ranks still score only as quads.
  if (counts[0] >= 4) return PRO_HANDS.FOUR_KIND;
  if (counts[0] === 3 && counts[1] === 2) return PRO_HANDS.FULL_HOUSE;
  if (isStraight) return PRO_HANDS.STRAIGHT;
  if (counts[0] === 3) return PRO_HANDS.THREE_KIND;
  if (isFlush) return PRO_HANDS.FLUSH;
  if (counts[0] === 2 && counts[1] === 2) return PRO_HANDS.TWO_PAIR;
  if (counts[0] === 2) return PRO_HANDS.PAIR;
  return PRO_HANDS.NO_HAND;
}

export function scoreProHand(cardIds) {
  if (!cardIds || cardIds.length !== 5 || cardIds.some((cardId) => !PRO_CARD_BY_ID[cardId])) {
    return { ...PRO_HANDS.NO_HAND, cards: cardIds ?? [], jokerAs: null };
  }

  const cacheKey = proHandCacheKey(cardIds);
  const cached = proHandCache.get(cacheKey);
  if (cached) return { ...cached, cards: [...cardIds] };

  const jokerIndex = cardIds.indexOf(JOKER_ID);
  if (jokerIndex === -1) {
    const hand = { ...scoreNaturalFiveCardHand(cardIds), cards: [...cardIds], jokerAs: null };
    cacheProHand(cacheKey, hand);
    return hand;
  }

  let best = PRO_HANDS.NO_HAND;
  let jokerAs = PRO_STANDARD_DECK[0].id;
  for (const replacement of PRO_STANDARD_DECK) {
    const substituted = [...cardIds];
    substituted[jokerIndex] = replacement.id;
    const candidate = scoreNaturalFiveCardHand(substituted);
    if (candidate.base > best.base) {
      best = candidate;
      jokerAs = replacement.id;
    }
  }

  const hand = { ...best, cards: [...cardIds], jokerAs };
  cacheProHand(cacheKey, hand);
  return hand;
}

export function proMultiplierForHandCount(handCount) {
  if (handCount >= 12) return 6;
  if (handCount >= 10) return 5;
  if (handCount >= 8) return 4;
  if (handCount >= 6) return 3;
  if (handCount >= 4) return 2;
  return 1;
}

export function scoreProPlacement(grid, discard = []) {
  const lines = PRO_LINE_DEFINITIONS.map((line) => {
    const cards = line.indices.map((index) => grid[index] ?? null);
    const hand = scoreProHand(cards);
    return {
      ...line,
      cards,
      hand,
      value: hand.base * line.bonus,
      scores: hand.base > 0,
    };
  });

  const gridHandCount = lines.filter((line) => line.scores).length;
  const gridBase = lines.reduce((sum, line) => sum + line.value, 0);
  const discardHand = scoreProHand(discard);
  const discardScores = gridHandCount === 11 && discardHand.base > 0;
  const discardValue = discardScores ? discardHand.base * 3 : 0;
  const handCount = gridHandCount + (discardScores ? 1 : 0);
  const multiplier = proMultiplierForHandCount(handCount);
  const base = gridBase + discardValue;

  return {
    total: base * multiplier,
    base,
    multiplier,
    handCount,
    qualityHandCount:
      lines.filter((line) => line.scores && line.hand.quality).length +
      (discardScores && discardHand.quality ? 1 : 0),
    gridHandCount,
    gridBase,
    discardValue,
    discardScores,
    discardHand,
    lines,
  };
}

export function compareProScores(a, b) {
  if (a.total !== b.total) return a.total - b.total;
  if (a.base !== b.base) return a.base - b.base;
  if (a.handCount !== b.handCount) return a.handCount - b.handCount;
  if (a.qualityHandCount !== b.qualityHandCount) return a.qualityHandCount - b.qualityHandCount;
  return 0;
}
