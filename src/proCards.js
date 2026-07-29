import { SUIT_META } from "./cards.js";

export { SUIT_META };

export const PRO_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const PRO_SUITS = ["H", "S", "C", "D"];
export const JOKER_ID = "JK";

export const PRO_RANK_INDEX = Object.fromEntries(PRO_RANKS.map((rank, index) => [rank, index]));
export const PRO_SUIT_INDEX = Object.fromEntries(PRO_SUITS.map((suit, index) => [suit, index]));

export const PRO_DECK = [
  ...PRO_RANKS.flatMap((rank) =>
    PRO_SUITS.map((suit) => ({
      id: `${rank}${suit}`,
      rank,
      suit,
      rankIndex: PRO_RANK_INDEX[rank],
      suitIndex: PRO_SUIT_INDEX[suit],
      joker: false,
    })),
  ),
  {
    id: JOKER_ID,
    rank: "JOKER",
    suit: null,
    rankIndex: PRO_RANKS.length,
    suitIndex: PRO_SUITS.length,
    joker: true,
  },
];

export const PRO_CARD_BY_ID = Object.fromEntries(PRO_DECK.map((card) => [card.id, card]));
export const PRO_STANDARD_DECK = PRO_DECK.filter((card) => !card.joker);

export function sortProCardIds(cardIds) {
  return [...cardIds].sort((a, b) => {
    const cardA = PRO_CARD_BY_ID[a];
    const cardB = PRO_CARD_BY_ID[b];
    if (!cardA || !cardB) return String(a).localeCompare(String(b));
    if (cardA.joker !== cardB.joker) return Number(cardA.joker) - Number(cardB.joker);
    if (cardA.rankIndex !== cardB.rankIndex) return cardA.rankIndex - cardB.rankIndex;
    return cardA.suitIndex - cardB.suitIndex;
  });
}

export function proCardLabel(cardId) {
  const card = PRO_CARD_BY_ID[cardId];
  if (!card) return "";
  if (card.joker) return "Joker";
  return `${card.rank}${SUIT_META[card.suit].label}`;
}
