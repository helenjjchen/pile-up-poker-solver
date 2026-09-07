import { sortProCardIds } from "./proCards.js";

// Pro uses a 30-card deal with a Joker, so these placements cannot share the
// rank-shifted 20-card cache used by Normal. Keeping the repository leaders in
// a small data module gives Pro the same instant, exact-deal floor while the
// browser's local cache continues to retain any stronger result it discovers.
const SEEDED_PRO_BEST_KNOWN = [
  {
    grid: [
      "2S", "2D", "KS", "3D", "3S",
      "6D", "4C", "8H", "7D", "5D",
      "2H", "AH", "JK", "3H", "5H",
      "6C", "9C", "8D", "7C", "5C",
      "6S", "9H", "8S", "7S", "5S",
    ],
    discard: ["JC", "QH", "10H", "KD", "AC"],
    source: "Repo best known",
  },
  {
    grid: [
      "6D", "2S", "KH", "KD", "5D",
      "8C", "2H", "AH", "AC", "AS",
      "8S", "7S", "JK", "JS", "9S",
      "6S", "2D", "QH", "QC", "3D",
      "8D", "7C", "JH", "10C", "9D",
    ],
    discard: ["4C", "3S", "4S", "3C", "4H"],
    source: "Repo best known",
  },
  {
    grid: [
      "JK", "KC", "QC", "JC", "AC",
      "4H", "KH", "QH", "7H", "5H",
      "4D", "3S", "3C", "JD", "5D",
      "10S", "KS", "QD", "JS", "AD",
      "4C", "8C", "6C", "7C", "5C",
    ],
    discard: ["9C", "7S", "9H", "9D", "9S"],
    source: "Repo best known",
  },
  {
    grid: [
      "4D", "AD", "2D", "3D", "5D",
      "KC", "AH", "6S", "10C", "KD",
      "4C", "7C", "6D", "3C", "5C",
      "4H", "AC", "2S", "3H", "5S",
      "JK", "7S", "6H", "10H", "8D",
    ],
    discard: ["JH", "9C", "9H", "9S", "9D"],
    source: "Repo best known",
  },
  {
    grid: [
      "AC", "2C", "4C", "3C", "JK",
      "7H", "6H", "4H", "8C", "5S",
      "AH", "10S", "QC", "JS", "KH",
      "AD", "2D", "4D", "3D", "5D",
      "JC", "2H", "4S", "JD", "KC",
    ],
    discard: ["7C", "9H", "9S", "9D", "9C"],
    source: "Repo best known",
  },
];

function proDealKey(cardIds) {
  return sortProCardIds(cardIds).join(" ");
}

const SEEDED_PRO_BEST_KNOWN_BY_DEAL = new Map(
  SEEDED_PRO_BEST_KNOWN.map((solution) => [
    proDealKey([...solution.grid, ...solution.discard]),
    solution,
  ]),
);

export function seededProBestKnownForDeal(cardIds) {
  const solution = SEEDED_PRO_BEST_KNOWN_BY_DEAL.get(proDealKey(cardIds));
  if (!solution) return null;
  return {
    ...solution,
    grid: [...solution.grid],
    discard: [...solution.discard],
  };
}

export const __proBestKnownTestHooks = {
  solutions: SEEDED_PRO_BEST_KNOWN,
};
