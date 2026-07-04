export const RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const SUITS = ["H", "S", "C", "D"];

export const SUIT_META = {
  H: { label: "♥", name: "Hearts", colorClass: "suit-hearts" },
  S: { label: "♠", name: "Spades", colorClass: "suit-spades" },
  C: { label: "♣", name: "Clubs", colorClass: "suit-clubs" },
  D: { label: "♦", name: "Diamonds", colorClass: "suit-diamonds" },
};

export const RANK_INDEX = Object.fromEntries(RANKS.map((rank, index) => [rank, index]));
export const SUIT_INDEX = Object.fromEntries(SUITS.map((suit, index) => [suit, index]));

export const DECK = RANKS.flatMap((rank) =>
  SUITS.map((suit) => ({
    id: `${rank}${suit}`,
    rank,
    suit,
    rankIndex: RANK_INDEX[rank],
    suitIndex: SUIT_INDEX[suit],
  })),
);

export const CARD_BY_ID = Object.fromEntries(DECK.map((card) => [card.id, card]));

export const SAMPLE_FANTASYLAND_DEAL = [
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
  "7H",
  "7S",
  "7C",
  "6C",
];

export function sortCardIds(cardIds) {
  return [...cardIds].sort((a, b) => {
    const cardA = CARD_BY_ID[a];
    const cardB = CARD_BY_ID[b];
    if (cardA.rankIndex !== cardB.rankIndex) return cardA.rankIndex - cardB.rankIndex;
    return cardA.suitIndex - cardB.suitIndex;
  });
}

export function cardLabel(cardId) {
  const card = CARD_BY_ID[cardId];
  return `${card.rank}${SUIT_META[card.suit].label}`;
}

function permutations(items) {
  if (items.length <= 1) return [items];
  const result = [];
  items.forEach((item, index) => {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    permutations(rest).forEach((tail) => result.push([item, ...tail]));
  });
  return result;
}

const SUIT_PERMUTATIONS = permutations(SUITS);
const CANONICAL_SUITS = ["a", "b", "c", "d"];

function compareCanonicalTokenParts(a, b) {
  if (a.normalizedRank !== b.normalizedRank) return a.normalizedRank - b.normalizedRank;
  return a.normalizedSuit.localeCompare(b.normalizedSuit);
}

export function canonicalizeDeal(cardIds) {
  const sorted = sortCardIds(cardIds);
  if (sorted.length === 0) {
    return { key: "rshift:", tokens: [], tokenByCard: {} };
  }

  const minRankIndex = Math.min(...sorted.map((cardId) => CARD_BY_ID[cardId].rankIndex));
  let best = null;

  for (const suitPermutation of SUIT_PERMUTATIONS) {
    const suitMap = Object.fromEntries(suitPermutation.map((suit, index) => [suit, CANONICAL_SUITS[index]]));
    const tokens = sorted
      .map((cardId) => {
        const card = CARD_BY_ID[cardId];
        const normalizedRank = card.rankIndex - minRankIndex;
        const normalizedSuit = suitMap[card.suit];
        return {
          cardId,
          normalizedRank,
          normalizedSuit,
          token: `${normalizedRank}${normalizedSuit}`,
        };
      })
      .sort(compareCanonicalTokenParts);
    const key = tokens.map((token) => token.token).join(" ");

    if (!best || key < best.key) {
      best = { key, tokens };
    }
  }

  return {
    key: `rshift:${best.key}`,
    tokens: best.tokens,
    tokenByCard: Object.fromEntries(best.tokens.map((token) => [token.cardId, token.token])),
  };
}

export function canonicalDealKey(cardIds) {
  return canonicalizeDeal(cardIds).key;
}

export function translatePlacementToDeal(grid, discard, targetDeal) {
  const sourceDeal = sortCardIds([...grid, ...discard]);
  const source = canonicalizeDeal(sourceDeal);
  const target = canonicalizeDeal(targetDeal);
  if (source.key !== target.key) return null;

  const targetByToken = new Map(target.tokens.map((token) => [token.token, token.cardId]));
  const translateCard = (cardId) => targetByToken.get(source.tokenByCard[cardId]) ?? null;
  const translatedGrid = grid.map(translateCard);
  const translatedDiscard = discard.map(translateCard);

  if (translatedGrid.some((cardId) => !cardId) || translatedDiscard.some((cardId) => !cardId)) return null;
  return {
    grid: translatedGrid,
    discard: translatedDiscard,
  };
}
