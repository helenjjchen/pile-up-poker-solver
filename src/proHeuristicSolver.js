import {
  JOKER_ID,
  PRO_CARD_BY_ID,
  PRO_RANKS,
  PRO_SUITS,
  sortProCardIds,
} from "./proCards.js";
import {
  PRO_LINE_DEFINITIONS,
  compareProScores,
  scoreProHand,
  scoreProPlacement,
} from "./proScoring.js";
import {
  uniqueSolutionsByOutcomeProfile,
} from "./solutionProfiles.js?v=solution-profiles-2";

function mulberry32(seed) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashCards(cardIds) {
  let hash = 2166136261;
  for (const character of sortProCardIds(cardIds).join("|")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function stateToSolution(state, source = "Pro heuristic") {
  const grid = state.slice(0, 25);
  const discard = state.slice(25, 30);
  return { grid, discard, score: scoreProPlacement(grid, discard), source };
}

function straightCoverage(cards) {
  const ranks = new Set(
    cards
      .filter((card) => card && !card.joker)
      .map((card) => card.rankIndex),
  );
  const jokerCount = cards.some((card) => card?.joker) ? 1 : 0;
  let best = 0;
  for (let start = 0; start <= PRO_RANKS.length - 5; start += 1) {
    let count = 0;
    for (let offset = 0; offset < 5; offset += 1) {
      if (ranks.has(start + offset)) count += 1;
    }
    best = Math.max(best, count);
  }
  const wheel = [0, 1, 2, 3, PRO_RANKS.length - 1].filter((rank) => ranks.has(rank)).length;
  return Math.min(5, Math.max(best, wheel) + jokerCount);
}

function linePotential(cardIds) {
  const cards = cardIds.map((cardId) => PRO_CARD_BY_ID[cardId]);
  const jokerCount = cards.some((card) => card?.joker) ? 1 : 0;
  const naturalCards = cards.filter((card) => card && !card.joker);

  const ranks = new Map();
  const suits = new Map();
  for (const card of naturalCards) {
    ranks.set(card.rank, (ranks.get(card.rank) ?? 0) + 1);
    suits.set(card.suit, (suits.get(card.suit) ?? 0) + 1);
  }
  const rankCounts = [...ranks.values()].sort((a, b) => b - a);
  const maxSuit = Math.min(5, Math.max(0, ...suits.values()) + jokerCount);
  const coverage = straightCoverage(cards);
  const leadingRankCount = Math.min(5, (rankCounts[0] ?? 0) + jokerCount);
  return (
    leadingRankCount ** 2 * 7 +
    (rankCounts[1] ?? 0) ** 2 * 3 +
    maxSuit ** 2 * 4 +
    coverage ** 2 * 5
  );
}

function searchFitness(state, score) {
  let potential = 0;
  for (const line of PRO_LINE_DEFINITIONS) {
    potential += linePotential(line.indices.map((index) => state[index])) * line.bonus;
  }
  potential += linePotential(state.slice(25, 30));
  return score.total + score.handCount * 75 + score.qualityHandCount * 30 + potential;
}

const FAST_HAND_CACHE_LIMIT = 160_000;
const fastHandCache = new Map();

function fastHandStats(cardIds) {
  const key = [...cardIds].sort().join("|");
  const cached = fastHandCache.get(key);
  if (cached) return cached;
  const hand = scoreProHand(cardIds);
  const stats = {
    base: hand.base,
    quality: Number(hand.quality),
    potential: linePotential(cardIds),
  };
  if (fastHandCache.size >= FAST_HAND_CACHE_LIMIT) fastHandCache.clear();
  fastHandCache.set(key, stats);
  return stats;
}

function summarizeFastState(
  lineStats,
  discard,
  shortDeterministicLane = false,
) {
  let gridBase = 0;
  let gridHandCount = 0;
  let qualityHandCount = 0;
  let potential = 0;
  for (let index = 0; index < PRO_LINE_DEFINITIONS.length; index += 1) {
    const line = PRO_LINE_DEFINITIONS[index];
    const stats = lineStats[index];
    gridBase += stats.base * line.bonus;
    gridHandCount += Number(stats.base > 0);
    qualityHandCount += stats.quality;
    potential += stats.potential * line.bonus;
  }
  const discardScores = gridHandCount === 11 && discard.base > 0;
  const handCount = gridHandCount + Number(discardScores);
  const discardValue = discardScores ? discard.base * 3 : 0;
  const base = gridBase + discardValue;
  const multiplier =
    handCount >= 12
      ? 6
      : handCount >= 10
        ? 5
        : handCount >= 8
          ? 4
          : handCount >= 6
            ? 3
            : handCount >= 4
              ? 2
              : 1;
  const total = base * multiplier;
  const totalQualityHandCount =
    qualityHandCount + Number(discardScores) * discard.quality;
  return {
    total,
    base,
    handCount,
    qualityHandCount: totalQualityHandCount,
    fitness:
      total +
      handCount * (shortDeterministicLane ? 75 : 110) +
      totalQualityHandCount * (shortDeterministicLane ? 30 : 20) +
      potential +
      discard.potential,
    lineStats,
    discardStats: discard,
  };
}

function fastStateEvaluation(state, shortDeterministicLane = false) {
  const lineStats = PRO_LINE_DEFINITIONS.map((line) =>
    fastHandStats(line.indices.map((index) => state[index])),
  );
  const discard = fastHandStats(state.slice(25, 30));
  return summarizeFastState(
    lineStats,
    discard,
    shortDeterministicLane,
  );
}

const PRO_LINE_INDEXES_BY_SLOT = Array.from({ length: 30 }, () => []);
PRO_LINE_DEFINITIONS.forEach((line, lineIndex) => {
  line.indices.forEach((slot) => {
    PRO_LINE_INDEXES_BY_SLOT[slot].push(lineIndex);
  });
});

function fastStateEvaluationAfterMutation(
  state,
  previousEvaluation,
  changedSlots,
  shortDeterministicLane = false,
) {
  if (!previousEvaluation?.lineStats || !previousEvaluation?.discardStats) {
    return fastStateEvaluation(state, shortDeterministicLane);
  }
  const affectedLines = new Set();
  let discardChanged = false;
  for (const slot of changedSlots) {
    if (slot >= 25) discardChanged = true;
    for (const lineIndex of PRO_LINE_INDEXES_BY_SLOT[slot]) {
      affectedLines.add(lineIndex);
    }
  }
  const lineStats = [...previousEvaluation.lineStats];
  for (const lineIndex of affectedLines) {
    const line = PRO_LINE_DEFINITIONS[lineIndex];
    lineStats[lineIndex] = fastHandStats(
      line.indices.map((index) => state[index]),
    );
  }
  const discard = discardChanged
    ? fastHandStats(state.slice(25, 30))
    : previousEvaluation.discardStats;
  return summarizeFastState(
    lineStats,
    discard,
    shortDeterministicLane,
  );
}

const FIVE_CARD_PERMUTATIONS = (() => {
  const permutations = [];
  const visit = (prefix, remaining) => {
    if (remaining.length === 0) {
      permutations.push(prefix);
      return;
    }
    for (let index = 0; index < remaining.length; index += 1) {
      visit(
        [...prefix, remaining[index]],
        [...remaining.slice(0, index), ...remaining.slice(index + 1)],
      );
    }
  };
  visit([], [0, 1, 2, 3, 4]);
  return permutations;
})();

function strongDiscardCandidates(cardIds) {
  const candidates = new Map();
  const naturalCards = cardIds.filter((cardId) => cardId !== JOKER_ID);
  const byRank = new Map();
  for (const cardId of naturalCards) {
    const rank = PRO_CARD_BY_ID[cardId].rank;
    if (!byRank.has(rank)) byRank.set(rank, []);
    byRank.get(rank).push(cardId);
  }

  const add = (discard) => {
    if (discard.length !== 5 || new Set(discard).size !== 5) return;
    const key = [...discard].sort().join("|");
    if (!candidates.has(key)) {
      candidates.set(key, {
        discard: [...discard],
        hand: scoreProHand(discard),
      });
    }
  };

  for (const rankCards of byRank.values()) {
    if (rankCards.length === 4) {
      for (const kicker of cardIds) {
        if (!rankCards.includes(kicker)) add([...rankCards, kicker]);
      }
    }
    if (rankCards.length >= 3 && cardIds.includes(JOKER_ID)) {
      for (const kicker of naturalCards) {
        if (!rankCards.includes(kicker)) {
          add([...rankCards.slice(0, 3), JOKER_ID, kicker]);
        }
      }
    }
  }

  const rankGroups = [...byRank.values()];
  for (const tripleCards of rankGroups) {
    if (tripleCards.length < 3) continue;
    for (const pairCards of rankGroups) {
      if (pairCards === tripleCards || pairCards.length < 2) continue;
      add([...tripleCards.slice(0, 3), ...pairCards.slice(0, 2)]);
    }
  }

  // Include available five-card straight flushes. These are uncommon, but a
  // quality discard can be the difference between the 11- and 12-hand tiers.
  for (const suit of PRO_SUITS) {
    const byRankIndex = new Map(
      naturalCards
        .filter((cardId) => PRO_CARD_BY_ID[cardId].suit === suit)
        .map((cardId) => [PRO_CARD_BY_ID[cardId].rankIndex, cardId]),
    );
    const windows = [
      ...Array.from({ length: PRO_RANKS.length - 4 }, (_, start) =>
        Array.from({ length: 5 }, (_unused, offset) => start + offset),
      ),
      [0, 1, 2, 3, PRO_RANKS.length - 1],
    ];
    for (const ranks of windows) {
      const present = ranks.map((rank) => byRankIndex.get(rank)).filter(Boolean);
      if (present.length === 5) add(present);
      if (
        present.length === 4 &&
        cardIds.includes(JOKER_ID)
      ) {
        add([...present, JOKER_ID]);
      }
    }
  }

  return [...candidates.values()]
    .sort((a, b) => {
      if (a.hand.base !== b.hand.base) return b.hand.base - a.hand.base;
      const aKeepsJoker = Number(!a.discard.includes(JOKER_ID));
      const bKeepsJoker = Number(!b.discard.includes(JOKER_ID));
      return bKeepsJoker - aKeepsJoker;
    })
    .slice(0, 96)
    .map((candidate) => candidate.discard);
}

function suitStructuredStates(
  cardIds,
  random,
  discardCandidates = strongDiscardCandidates(cardIds),
) {
  const starts = [];

  for (const discard of discardCandidates) {
    const discarded = new Set(discard);
    const boardCards = cardIds
      .filter((cardId) => !discarded.has(cardId))
      .sort((a, b) => {
        const cardA = PRO_CARD_BY_ID[a];
        const cardB = PRO_CARD_BY_ID[b];
        if (cardA.joker !== cardB.joker) {
          return Number(cardA.joker) - Number(cardB.joker);
        }
        if (cardA.suitIndex !== cardB.suitIndex) {
          return cardA.suitIndex - cardB.suitIndex;
        }
        return cardA.rankIndex - cardB.rankIndex;
      });
    const jokerAvailable = boardCards.includes(JOKER_ID);
    const naturalBySuit = Object.fromEntries(
      PRO_SUITS.map((suit) => [
        suit,
        sortProCardIds(
          boardCards.filter((cardId) => PRO_CARD_BY_ID[cardId].suit === suit),
        ),
      ]),
    );
    const jokerRows = jokerAvailable ? [...PRO_SUITS, null] : [null];

    for (const jokerSuit of jokerRows) {
      for (let variant = 0; variant < 3; variant += 1) {
        const selected = new Set();
        const suitRows = [];
        let valid = true;
        for (const suit of PRO_SUITS) {
          const targetSize = jokerAvailable && jokerSuit === suit ? 4 : 5;
          const available =
            variant === 0
              ? naturalBySuit[suit]
              : shuffle(naturalBySuit[suit], random);
          if (available.length < targetSize) {
            valid = false;
            break;
          }
          const chosen = available.slice(0, targetSize);
          chosen.forEach((cardId) => selected.add(cardId));
          suitRows.push(
            jokerAvailable && jokerSuit === suit
              ? [...chosen, JOKER_ID]
              : chosen,
          );
        }
        if (!valid) continue;
        if (jokerAvailable && jokerSuit !== null) selected.add(JOKER_ID);

        const leftovers = boardCards.filter((cardId) => !selected.has(cardId));
        if (jokerAvailable && jokerSuit === null && !leftovers.includes(JOKER_ID)) {
          leftovers.push(JOKER_ID);
        }
        if (leftovers.length !== 5 || suitRows.some((row) => row.length !== 5)) {
          continue;
        }

        const rows = [leftovers, ...suitRows].map((row) =>
          variant === 0 ? sortProCardIds(row) : shuffle(row, random),
        );
        starts.push([...rows.flat(), ...discard]);
      }
    }
  }

  return starts;
}

function combinations(items, count) {
  const results = [];
  const visit = (start, chosen) => {
    if (chosen.length === count) {
      results.push(chosen);
      return;
    }
    for (
      let index = start;
      index <= items.length - (count - chosen.length);
      index += 1
    ) {
      visit(index + 1, [...chosen, items[index]]);
    }
  };
  visit(0, []);
  return results;
}

function representativeQuadDiscards(discardCandidates) {
  const byQuadRank = new Map();
  for (const discard of discardCandidates) {
    const rankCounts = new Map();
    for (const cardId of discard) {
      const card = PRO_CARD_BY_ID[cardId];
      if (!card || card.joker) continue;
      rankCounts.set(card.rank, (rankCounts.get(card.rank) ?? 0) + 1);
    }
    const quadRank = [...rankCounts.entries()].find(
      (_entry) => _entry[1] === 4,
    )?.[0];
    if (!quadRank) continue;
    if (!byQuadRank.has(quadRank)) byQuadRank.set(quadRank, []);
    byQuadRank.get(quadRank).push(discard);
  }

  const representatives = new Map();
  for (const discards of byQuadRank.values()) {
    const byKickerSuit = new Map();
    for (const discard of discards) {
      const rankCounts = new Map();
      for (const cardId of discard) {
        const card = PRO_CARD_BY_ID[cardId];
        if (!card || card.joker) continue;
        rankCounts.set(card.rank, (rankCounts.get(card.rank) ?? 0) + 1);
      }
      const kicker = discard.find((cardId) => {
        const card = PRO_CARD_BY_ID[cardId];
        return card && !card.joker && rankCounts.get(card.rank) === 1;
      });
      if (!kicker) continue;
      const suit = PRO_CARD_BY_ID[kicker].suit;
      if (!byKickerSuit.has(suit)) byKickerSuit.set(suit, []);
      byKickerSuit.get(suit).push({ discard, kicker });
    }
    for (const suitKickers of byKickerSuit.values()) {
      suitKickers.sort(
        (a, b) =>
          PRO_CARD_BY_ID[a.kicker].rankIndex -
          PRO_CARD_BY_ID[b.kicker].rankIndex,
      );
      for (const candidate of [
        suitKickers[0],
        suitKickers[suitKickers.length - 1],
      ]) {
        if (!candidate) continue;
        representatives.set(
          [...candidate.discard].sort().join("|"),
          candidate.discard,
        );
      }
    }
  }
  return [...representatives.values()];
}

function boardCrossStructureValue(boardCards) {
  const naturalCards = boardCards
    .map((cardId) => PRO_CARD_BY_ID[cardId])
    .filter((card) => card && !card.joker);
  const jokerAvailable = boardCards.includes(JOKER_ID);
  const rankCounts = new Map();
  for (const card of naturalCards) {
    rankCounts.set(card.rankIndex, (rankCounts.get(card.rankIndex) ?? 0) + 1);
  }
  const naturalRankCores = [...rankCounts.values()].filter(
    (count) => count >= 3,
  ).length;
  const jokerPairCores = jokerAvailable
    ? [...rankCounts.values()].filter((count) => count === 2).length
    : 0;
  let value =
    naturalRankCores * 280 +
    Math.min(1, jokerPairCores) * 140;

  const windows = [
    ...Array.from({ length: PRO_RANKS.length - 4 }, (_, start) =>
      Array.from({ length: 5 }, (_unused, offset) => start + offset),
    ),
    [0, 1, 2, 3, PRO_RANKS.length - 1],
  ];
  for (const suit of PRO_SUITS) {
    const suitedRanks = new Set(
      naturalCards
        .filter((card) => card.suit === suit)
        .map((card) => card.rankIndex),
    );
    const completeRuns = windows.filter((window) =>
      window.every((rank) => suitedRanks.has(rank)),
    ).length;
    const jokerRuns = jokerAvailable
      ? windows.filter(
          (window) =>
            window.filter((rank) => suitedRanks.has(rank)).length === 4,
        ).length
      : 0;
    value += completeRuns * 90 + jokerRuns * 35;
    if (suitedRanks.size >= 5) {
      value += Math.floor(suitedRanks.size / 5) * 80;
    }
  }
  return value;
}

function qualityColumnCandidates(boardCards) {
  const indexByCard = new Map(boardCards.map((cardId, index) => [cardId, index]));
  const candidates = new Map();
  const byRank = new Map();
  for (const cardId of boardCards) {
    const card = PRO_CARD_BY_ID[cardId];
    if (card.joker) continue;
    if (!byRank.has(card.rankIndex)) byRank.set(card.rankIndex, []);
    byRank.get(card.rankIndex).push(cardId);
  }
  const add = (cards) => {
    if (cards.length !== 5 || new Set(cards).size !== 5) return;
    const hand = scoreProHand(cards);
    if (hand.base < 125) return;
    const key = [...cards].sort().join("|");
    if (candidates.has(key)) return;
    let mask = 0n;
    for (const cardId of cards) {
      mask |= 1n << BigInt(indexByCard.get(cardId));
    }
    const naturalSuits = new Set(
      cards
        .map((cardId) => PRO_CARD_BY_ID[cardId])
        .filter((card) => card && !card.joker)
        .map((card) => card.suit),
    );
    const coverage = Math.min(
      PRO_SUITS.length,
      naturalSuits.size + Number(cards.includes(JOKER_ID)),
    );
    candidates.set(key, {
      cards: [...cards],
      mask,
      base: hand.base,
      coverage,
    });
  };

  for (const rankCards of byRank.values()) {
    if (rankCards.length >= 3) {
      for (const triple of combinations(rankCards, 3)) {
        const remaining = boardCards.filter((cardId) => !triple.includes(cardId));
        for (const pair of combinations(remaining, 2)) add([...triple, ...pair]);
      }
    }
    if (rankCards.length >= 2 && boardCards.includes(JOKER_ID)) {
      for (const pairOfRank of combinations(rankCards, 2)) {
        const fixed = [...pairOfRank, JOKER_ID];
        const remaining = boardCards.filter((cardId) => !fixed.includes(cardId));
        for (const pair of combinations(remaining, 2)) add([...fixed, ...pair]);
      }
    }
  }

  const straightWindows = [
    ...Array.from({ length: PRO_RANKS.length - 4 }, (_, start) =>
      Array.from({ length: 5 }, (_unused, offset) => start + offset),
    ),
    [0, 1, 2, 3, PRO_RANKS.length - 1],
  ];
  for (const ranks of straightWindows) {
    const choices = ranks.map((rank) => byRank.get(rank) ?? []);
    const missing = choices.filter((rankCards) => rankCards.length === 0).length;
    if (missing > 1 || (missing === 1 && !boardCards.includes(JOKER_ID))) continue;
    const visit = (rankIndex, chosen) => {
      if (rankIndex === choices.length) {
        add(missing === 1 ? [...chosen, JOKER_ID] : chosen);
        return;
      }
      if (choices[rankIndex].length === 0) {
        visit(rankIndex + 1, chosen);
        return;
      }
      for (const cardId of choices[rankIndex]) {
        visit(rankIndex + 1, [...chosen, cardId]);
      }
    };
    visit(0, []);
  }

  return [...candidates.values()];
}

function qualityColumnPartitions(boardCards, beamWidth = 600) {
  const candidates = qualityColumnCandidates(boardCards);
  const fullMask = (1n << BigInt(boardCards.length)) - 1n;
  const byCardIndex = Array.from({ length: boardCards.length }, () => []);
  for (const candidate of candidates) {
    for (let index = 0; index < boardCards.length; index += 1) {
      if ((candidate.mask & (1n << BigInt(index))) !== 0n) {
        byCardIndex[index].push(candidate);
      }
    }
  }

  let beam = [{ mask: 0n, base: 0, coverage: 0, hands: [] }];
  for (let depth = 0; depth < 5; depth += 1) {
    const expanded = [];
    for (const entry of beam) {
      let smallestOptionCount = Infinity;
      const anchorOptionSets = [];
      for (let index = 0; index < boardCards.length; index += 1) {
        if ((entry.mask & (1n << BigInt(index))) !== 0n) continue;
        const options = byCardIndex[index].filter(
          (candidate) => (candidate.mask & entry.mask) === 0n,
        );
        if (options.length < smallestOptionCount) {
          smallestOptionCount = options.length;
          anchorOptionSets.length = 0;
          anchorOptionSets.push(options);
        } else if (options.length === smallestOptionCount) {
          anchorOptionSets.push(options);
        }
      }
      if (anchorOptionSets.length === 0 || smallestOptionCount === 0) continue;
      for (const anchorOptions of anchorOptionSets) {
        for (const candidate of anchorOptions) {
          expanded.push({
            mask: entry.mask | candidate.mask,
            base: entry.base + candidate.base,
            coverage: entry.coverage + candidate.coverage,
            hands: [...entry.hands, candidate],
          });
        }
      }
    }
    expanded.sort(
      (a, b) =>
        b.base + b.coverage * 120 - (a.base + a.coverage * 120),
    );
    if (depth === 4) {
      beam = expanded.slice(0, beamWidth);
      continue;
    }
    const unique = new Map();
    for (const entry of expanded) {
      const handProfile = entry.hands
        .map((hand) => `${hand.base}/${hand.coverage}`)
        .sort((a, b) => b - a)
        .join(",");
      const key = `${entry.mask}:${handProfile}`;
      if (!unique.has(key)) unique.set(key, entry);
      if (unique.size >= beamWidth) break;
    }
    beam = [...unique.values()];
    if (beam.length === 0) break;
  }

  return beam
    .filter((entry) => entry.mask === fullMask && entry.hands.length === 5)
    .sort(
      (a, b) =>
        b.base + b.coverage * 120 - (a.base + a.coverage * 120),
    )
    .slice(0, 2000);
}

function rankCoreColumnPartitions(boardCards) {
  const naturalByRank = new Map();
  for (const cardId of boardCards) {
    const card = PRO_CARD_BY_ID[cardId];
    if (!card || card.joker) continue;
    if (!naturalByRank.has(card.rank)) naturalByRank.set(card.rank, []);
    naturalByRank.get(card.rank).push(cardId);
  }
  const jokerAvailable = boardCards.includes(JOKER_ID);
  const rankCores = [...naturalByRank.values()].flatMap((cards) => {
    const sortedCards = sortProCardIds(cards);
    const cores = [];
    if (cards.length >= 3) cores.push(sortedCards);
    // Pairs are useful structural cores even when the Joker belongs elsewhere:
    // after the two or three filler cards are assigned they can become two
    // pair, a full house, or remain a low-scoring but valid pair. Requiring
    // every column to begin as trips excluded mixed layouts that combine a few
    // premium rank columns with suit/straight rows.
    if (cards.length === 2) cores.push(sortedCards);
    return cores;
  });
  if (rankCores.length < 5) return [];

  const partitions = new Map();
  const coreSelections = combinations(rankCores, 5)
    .sort((first, second) => {
      const value = (selection) =>
        selection.reduce(
          (sum, core) =>
            sum +
            core.length ** 2 * 100 +
            new Set(
              core
                .map((cardId) => PRO_CARD_BY_ID[cardId])
                .filter((card) => card && !card.joker)
                .map((card) => card.suit),
            ).size *
              20,
          0,
        );
      return value(second) - value(first);
    })
    .slice(0, 12);

  for (const selectedCores of coreSelections) {
    const jokerTargets = jokerAvailable ? [-1, 0, 1, 2, 3, 4] : [-1];
    for (const jokerTarget of jokerTargets) {
      const cores = selectedCores.map((core, index) =>
        jokerTarget === index ? [...core, JOKER_ID] : [...core],
      );
      if (cores.some((core) => core.length > 5)) continue;
      const used = new Set(cores.flat());
      const remaining = boardCards.filter((cardId) => !used.has(cardId));
      const capacities = cores.map((core) => 5 - core.length);
      if (capacities.reduce((sum, capacity) => sum + capacity, 0) !== remaining.length) {
        continue;
      }

      const makeColumnHand = (cards) => {
        const hand = scoreProHand(cards);
        if (hand.base <= 0) return null;
        const naturalSuits = new Set(
          cards
            .map((cardId) => PRO_CARD_BY_ID[cardId])
            .filter((card) => card && !card.joker)
            .map((card) => card.suit),
        );
        return {
          cards,
          base: hand.base,
          coverage: Math.min(
            PRO_SUITS.length,
            naturalSuits.size + Number(cards.includes(JOKER_ID)),
          ),
        };
      };
      const orderedRemaining = [...remaining].sort((first, second) => {
        const cardA = PRO_CARD_BY_ID[first];
        const cardB = PRO_CARD_BY_ID[second];
        if (cardA.joker !== cardB.joker) {
          return Number(cardA.joker) - Number(cardB.joker);
        }
        if (cardA.suitIndex !== cardB.suitIndex) {
          return cardA.suitIndex - cardB.suitIndex;
        }
        return cardA.rankIndex - cardB.rankIndex;
      });
      const allocationValue = (hands, remainingCapacity) => {
        let value = 0;
        const suitColumns = new Map();
        for (let column = 0; column < hands.length; column += 1) {
          value += linePotential(hands[column]);
          if (remainingCapacity[column] === 0) {
            value += scoreProHand(hands[column]).base * 3;
          }
          for (const cardId of hands[column]) {
            const card = PRO_CARD_BY_ID[cardId];
            if (!card || card.joker) continue;
            if (!suitColumns.has(card.suit)) suitColumns.set(card.suit, new Set());
            suitColumns.get(card.suit).add(column);
          }
        }
        for (const columns of suitColumns.values()) {
          value += columns.size ** 2 * 35;
        }
        return value;
      };
      let allocationBeam = [{
        hands: cores.map((core) => [...core]),
        remainingCapacity: [...capacities],
        potential: allocationValue(cores, capacities),
      }];
      for (const cardId of orderedRemaining) {
        const expanded = [];
        for (const entry of allocationBeam) {
          for (let column = 0; column < 5; column += 1) {
            if (entry.remainingCapacity[column] <= 0) continue;
            const hands = entry.hands.map((hand) => [...hand]);
            hands[column].push(cardId);
            const remainingCapacity = [...entry.remainingCapacity];
            remainingCapacity[column] -= 1;
            expanded.push({
              hands,
              remainingCapacity,
              potential: allocationValue(hands, remainingCapacity),
            });
          }
        }
        expanded.sort((a, b) => b.potential - a.potential);
        const unique = new Map();
        for (const entry of expanded) {
          const key = entry.hands
            .map((hand) => [...hand].sort().join("|"))
            .join("::");
          if (!unique.has(key)) unique.set(key, entry);
          if (unique.size >= 250) break;
        }
        allocationBeam = [...unique.values()];
        if (allocationBeam.length === 0) break;
      }
      for (const entry of allocationBeam) {
        if (entry.remainingCapacity.some((capacity) => capacity !== 0)) continue;
        const hands = entry.hands.map(makeColumnHand);
        if (hands.some((hand) => !hand)) continue;
        const key = hands
          .map((hand) => [...hand.cards].sort().join("|"))
          .sort()
          .join("::");
        if (!partitions.has(key)) {
          partitions.set(key, {
            base: hands.reduce((sum, hand) => sum + hand.base, 0),
            coverage: hands.reduce((sum, hand) => sum + hand.coverage, 0),
            hands,
          });
        }
      }
    }
  }

  return [...partitions.values()]
    .sort(
      (a, b) =>
        b.base + b.coverage * 120 - (a.base + a.coverage * 120),
    )
    .slice(0, 30000);
}

function arrangeQualityColumns(
  partition,
  discard,
  beamWidth = 24,
  refineCorner = true,
) {
  const columns = [...partition.hands]
    .sort((a, b) => b.base - a.base)
    .map((hand) => hand.cards);
  const firstColumn = sortProCardIds(columns[0]);
  let beam = [{
    rows: firstColumn.map((cardId) => [cardId]),
    potential: 0,
  }];

  for (const column of columns.slice(1)) {
    const expanded = [];
    for (const entry of beam) {
      for (const permutation of FIVE_CARD_PERMUTATIONS) {
        const rows = entry.rows.map((row, index) => [
          ...row,
          column[permutation[index]],
        ]);
        expanded.push({
          rows,
          potential: rows.reduce((sum, row) => sum + linePotential(row), 0),
        });
      }
    }
    expanded.sort((a, b) => b.potential - a.potential);
    beam = expanded.slice(0, beamWidth);
  }

  let best = null;
  for (const entry of beam) {
    const solution = stateToSolution(
      [...entry.rows.flat(), ...discard],
      "Pro quality-column beam",
    );
    const optimized = refineCorner
      ? optimizeCornerPermutation(solution)
      : solution;
    if (!best || compareProScores(optimized.score, best.score) > 0) {
      best = optimized;
    }
  }
  return best ? [...best.grid, ...best.discard] : null;
}

function arrangeStructuredRows(state, beamWidth = 160) {
  const discard = state.slice(25, 30);
  const rows = Array.from({ length: 5 }, (_unused, row) =>
    state.slice(row * 5, row * 5 + 5),
  ).sort(
    (first, second) =>
      scoreProHand(second).base - scoreProHand(first).base,
  );
  const firstRow = sortProCardIds(rows[0]);
  let beam = [{
    rows: [firstRow],
    columns: firstRow.map((cardId) => [cardId]),
    potential: 0,
  }];

  for (const row of rows.slice(1)) {
    const expanded = [];
    for (const entry of beam) {
      for (const permutation of FIVE_CARD_PERMUTATIONS) {
        const placedRow = permutation.map((index) => row[index]);
        const columns = entry.columns.map((column, index) => [
          ...column,
          placedRow[index],
        ]);
        const complete = columns[0].length === 5;
        const columnValue = complete
          ? columns.reduce((sum, column) => {
              const hand = scoreProHand(column);
              return sum + hand.base + Number(hand.base > 0) * 900;
            }, 0)
          : columns.reduce(
              (sum, column) => sum + linePotential(column),
              0,
            );
        expanded.push({
          rows: [...entry.rows, placedRow],
          columns,
          potential: columnValue,
        });
      }
    }
    expanded.sort((a, b) => b.potential - a.potential);
    beam = expanded.slice(0, beamWidth);
  }

  let best = null;
  for (const entry of beam.slice(0, Math.min(48, beam.length))) {
    const solution = stateToSolution(
      [...entry.rows.flat(), ...discard],
      "Pro structured-row beam",
    );
    const optimized = optimizeCornerPermutation(solution);
    if (!best || compareProScores(optimized.score, best.score) > 0) {
      best = optimized;
    }
  }
  return best ? [...best.grid, ...best.discard] : null;
}

function arrangeQualityCornerRows(state, beamWidth = 12) {
  const rows = Array.from({ length: 5 }, (_unused, row) =>
    state.slice(row * 5, row * 5 + 5),
  );
  const discard = state.slice(25);
  const rowByCard = new Map();
  rows.forEach((row, rowIndex) => {
    row.forEach((cardId) => rowByCard.set(cardId, rowIndex));
  });
  const cornerHands = strongDiscardCandidates(state.slice(0, 25))
    .filter((cards) => scoreProHand(cards).key === "straight-flush")
    .map((cards) => {
      const cardsByRow = new Map();
      for (const cardId of cards) {
        const rowIndex = rowByCard.get(cardId);
        if (!cardsByRow.has(rowIndex)) cardsByRow.set(rowIndex, []);
        cardsByRow.get(rowIndex).push(cardId);
      }
      const counts = [...cardsByRow.values()]
        .map((rowCards) => rowCards.length)
        .sort((a, b) => a - b);
      return counts.join(",") === "1,2,2" ? cardsByRow : null;
    })
    .filter(Boolean)
    .slice(0, 4);

  let best = null;
  for (const cardsByRow of cornerHands) {
    const centerRow = [...cardsByRow.entries()].find(
      ([_row, cards]) => cards.length === 1,
    )?.[0];
    const cornerRows = [...cardsByRow.entries()]
      .filter(([_row, cards]) => cards.length === 2)
      .map(([row]) => row);
    if (centerRow === undefined || cornerRows.length !== 2) continue;
    const otherRows = [0, 1, 2, 3, 4].filter(
      (row) => row !== centerRow && !cornerRows.includes(row),
    );
    for (const orderedCorners of [
      cornerRows,
      [...cornerRows].reverse(),
    ]) {
      for (const orderedOthers of [
        otherRows,
        [...otherRows].reverse(),
      ]) {
        const rowOrder = [
          orderedCorners[0],
          orderedOthers[0],
          centerRow,
          orderedOthers[1],
          orderedCorners[1],
        ];
        let beam = [{ rows: [], columns: Array.from({ length: 5 }, () => []), value: 0 }];
        for (let outputRow = 0; outputRow < 5; outputRow += 1) {
          const sourceRow = rowOrder[outputRow];
          const rowCards = rows[sourceRow];
          const fixedCards = cardsByRow.get(sourceRow) ?? [];
          const expanded = [];
          for (const entry of beam) {
            for (const permutation of FIVE_CARD_PERMUTATIONS) {
              const placedRow = permutation.map((index) => rowCards[index]);
              if (
                (outputRow === 0 || outputRow === 4) &&
                (!fixedCards.includes(placedRow[0]) ||
                  !fixedCards.includes(placedRow[4]))
              ) {
                continue;
              }
              if (outputRow === 2 && placedRow[2] !== fixedCards[0]) continue;
              const columns = entry.columns.map((column, index) => [
                ...column,
                placedRow[index],
              ]);
              const complete = outputRow === 4;
              const value = columns.reduce(
                (sum, column) =>
                  sum +
                  (complete
                    ? scoreProHand(column).base +
                      Number(scoreProHand(column).base > 0) * 900
                    : linePotential(column)),
                0,
              );
              expanded.push({
                rows: [...entry.rows, placedRow],
                columns,
                value,
              });
            }
          }
          expanded.sort((a, b) => b.value - a.value);
          beam = expanded.slice(0, beamWidth);
          if (beam.length === 0) break;
        }
        for (const entry of beam) {
          const solution = stateToSolution(
            [...entry.rows.flat(), ...discard],
            "Pro quality-corner row seed",
          );
          if (!best || compareProScores(solution.score, best.score) > 0) {
            best = solution;
          }
        }
      }
    }
  }
  return best ? [...best.grid, ...best.discard] : null;
}

function exhaustiveSuitRowStates(cardIds, discardCandidates) {
  const memberships = [];
  const bestDiscardByRepeatedRank = new Map();
  for (const discard of discardCandidates.slice(0, 24)) {
    if (scoreProHand(discard).key !== "four-kind") continue;
    const rankCounts = new Map();
    for (const cardId of discard) {
      const card = PRO_CARD_BY_ID[cardId];
      if (!card || card.joker) continue;
      rankCounts.set(card.rank, (rankCounts.get(card.rank) ?? 0) + 1);
    }
    const repeatedRank = [...rankCounts.entries()]
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    const key = repeatedRank ?? discard.slice().sort().join("|");
    const discarded = new Set(discard);
    const value = boardCrossStructureValue(
      cardIds.filter((cardId) => !discarded.has(cardId)),
    );
    const previous = bestDiscardByRepeatedRank.get(key);
    if (!previous || value > previous.value) {
      bestDiscardByRepeatedRank.set(key, { discard, value });
    }
  }
  for (const [structureKey, { discard }] of bestDiscardByRepeatedRank) {
    const discarded = new Set(discard);
    const boardCards = cardIds.filter((cardId) => !discarded.has(cardId));
    const jokerAvailable = boardCards.includes(JOKER_ID);
    const cornerStraightFlushes = strongDiscardCandidates(boardCards).filter(
      (cards) => scoreProHand(cards).key === "straight-flush",
    );
    const naturalBySuit = Object.fromEntries(
      PRO_SUITS.map((suit) => [
        suit,
        boardCards.filter(
          (cardId) => PRO_CARD_BY_ID[cardId]?.suit === suit,
        ),
      ]),
    );
    const jokerSuits = jokerAvailable ? [...PRO_SUITS, null] : [null];
    for (const jokerSuit of jokerSuits) {
      const choices = PRO_SUITS.map((suit) =>
        combinations(
          naturalBySuit[suit],
          jokerAvailable && jokerSuit === suit ? 4 : 5,
        ),
      );
      if (choices.some((options) => options.length === 0)) continue;
      const visit = (suitIndex, suitRows) => {
        if (suitIndex < PRO_SUITS.length) {
          for (const cards of choices[suitIndex]) {
            visit(suitIndex + 1, [
              ...suitRows,
              jokerAvailable && jokerSuit === PRO_SUITS[suitIndex]
                ? [...cards, JOKER_ID]
                : cards,
            ]);
          }
          return;
        }
        const selected = new Set(suitRows.flat());
        const leftover = boardCards.filter((cardId) => !selected.has(cardId));
        if (leftover.length !== 5) return;
        const rows = [leftover, ...suitRows];
        const rowByCard = new Map();
        rows.forEach((row, rowIndex) => {
          row.forEach((cardId) => rowByCard.set(cardId, rowIndex));
        });
        const supportsQualityCorner = cornerStraightFlushes.some((hand) => {
          const counts = new Map();
          for (const cardId of hand) {
            const rowIndex = rowByCard.get(cardId);
            counts.set(rowIndex, (counts.get(rowIndex) ?? 0) + 1);
          }
          return [...counts.values()].sort((a, b) => a - b).join(",") === "1,2,2";
        });
        memberships.push({
          structureKey,
          state: [...rows.flat(), ...discard],
          value: rows.reduce((sum, row) => {
            const hand = scoreProHand(row);
            return sum + hand.base + Number(hand.base > 0) * 500;
          }, 0) + Number(supportsQualityCorner) * 1500,
        });
      };
      visit(0, []);
    }
  }
  memberships.sort((a, b) => b.value - a.value);
  const membershipsByStructure = new Map();
  for (const entry of memberships) {
    if (!membershipsByStructure.has(entry.structureKey)) {
      membershipsByStructure.set(entry.structureKey, []);
    }
    membershipsByStructure.get(entry.structureKey).push(entry);
  }
  const diverseMemberships = [...membershipsByStructure.values()].flatMap(
    // The entries are already ranked by their row/corner proxy. Previewing 64
    // per discard structure is ample diversity; the former 256 repeated the
    // expensive row-permutation beam for many dominated memberships.
    (entries) => entries.slice(0, 64),
  );
  const previews = diverseMemberships.map((entry) => {
    const state =
      arrangeQualityCornerRows(entry.state, 2) ??
      arrangeStructuredRows(entry.state, 2);
    return {
      structureKey: entry.structureKey,
      state,
      score: state
        ? scoreProPlacement(state.slice(0, 25), state.slice(25))
        : null,
    };
  });
  previews.sort((a, b) => {
    if (!a.score) return 1;
    if (!b.score) return -1;
    return compareProScores(b.score, a.score);
  });
  const previewsByStructure = new Map();
  for (const preview of previews) {
    if (!previewsByStructure.has(preview.structureKey)) {
      previewsByStructure.set(preview.structureKey, []);
    }
    const entries = previewsByStructure.get(preview.structureKey);
    if (entries.length < 8) entries.push(preview);
  }
  return [...previewsByStructure.values()]
    .flat()
    .map((preview) => preview.state)
    .filter(Boolean);
}

function qualityRowStructuredStates(cardIds, discardCandidates) {
  const structures = [];
  for (const discard of discardCandidates) {
    const discardHand = scoreProHand(discard);
    if (discardHand.key !== "straight-flush") continue;
    const discarded = new Set(discard);
    const boardCards = cardIds.filter((cardId) => !discarded.has(cardId));
    const rowHands = strongDiscardCandidates(boardCards).filter(
      (cards) => scoreProHand(cards).key === "straight-flush",
    );
    for (let first = 0; first < rowHands.length - 1; first += 1) {
      const firstSet = new Set(rowHands[first]);
      for (let second = first + 1; second < rowHands.length; second += 1) {
        if (rowHands[second].some((cardId) => firstSet.has(cardId))) continue;
        const used = new Set([...rowHands[first], ...rowHands[second]]);
        const remaining = boardCards.filter((cardId) => !used.has(cardId));
        if (remaining.length !== 15) continue;
        const remainingRankCounts = new Map();
        for (const cardId of remaining) {
          const card = PRO_CARD_BY_ID[cardId];
          if (!card || card.joker) continue;
          remainingRankCounts.set(
            card.rank,
            (remainingRankCounts.get(card.rank) ?? 0) + 1,
          );
        }
        const rankAlignment = [
          ...rowHands[first],
          ...rowHands[second],
        ].reduce((sum, cardId) => {
          const card = PRO_CARD_BY_ID[cardId];
          if (!card || card.joker) return sum;
          return sum + (remainingRankCounts.get(card.rank) ?? 0) ** 2;
        }, 0);
        structures.push({
          discard,
          qualityRows: [rowHands[first], rowHands[second]],
          remaining,
          value:
            discardHand.base * 3 +
            scoreProHand(rowHands[first]).base +
            scoreProHand(rowHands[second]).base +
            boardCrossStructureValue(remaining) +
            rankAlignment * 100,
        });
      }
    }
  }
  structures.sort((a, b) => b.value - a.value);
  const structure = structures[0];
  if (!structure) return [];

  // Partition the 15 remaining cards by compact bit masks. The previous
  // nested-combination version rebuilt arrays, sets, and three hand scores for
  // roughly 750k ordered pairs. This enumerates the same 126,126 unordered
  // partitions while scoring each of the 3,003 possible rows only once.
  const cardIndex = new Map(
    structure.remaining.map((cardId, index) => [cardId, index]),
  );
  const rowHands = combinations(structure.remaining, 5).map((cards, index) => ({
    index,
    cards,
    mask: cards.reduce(
      (mask, cardId) => mask | (1 << cardIndex.get(cardId)),
      0,
    ),
    base: scoreProHand(cards).base,
  }));
  const rowIndexByMask = new Map(
    rowHands.map((hand) => [hand.mask, hand.index]),
  );
  const fullMask = (1 << structure.remaining.length) - 1;
  const partitions = [];
  for (let first = 0; first < rowHands.length - 2; first += 1) {
    const firstHand = rowHands[first];
    for (let second = first + 1; second < rowHands.length - 1; second += 1) {
      const secondHand = rowHands[second];
      if ((firstHand.mask & secondHand.mask) !== 0) continue;
      const thirdMask = fullMask ^ firstHand.mask ^ secondHand.mask;
      const third = rowIndexByMask.get(thirdMask);
      if (third === undefined || third <= second) continue;
      const thirdHand = rowHands[third];
      partitions.push({
        rows: [firstHand.cards, secondHand.cards, thirdHand.cards],
        rowBase: firstHand.base + secondHand.base + thirdHand.base,
      });
    }
  }
  partitions.sort((a, b) => b.rowBase - a.rowBase);

  const previews = partitions.slice(0, 32).map((partition) => {
    const state = arrangeStructuredRows(
      [
        ...partition.rows.flat(),
        ...structure.qualityRows.flat(),
        ...structure.discard,
      ],
      40,
    );
    return {
      state,
      score: state
        ? scoreProPlacement(state.slice(0, 25), state.slice(25))
        : null,
    };
  });
  previews.sort((a, b) => {
    if (!a.score) return 1;
    if (!b.score) return -1;
    return compareProScores(b.score, a.score);
  });

  const refined = [];
  for (const preview of previews.slice(0, 8)) {
    if (!preview.state) continue;
    const state = arrangeStructuredRows(preview.state, 1600);
    if (state) refined.push(state);
  }
  return refined;
}

function qualityColumnStructuredStates(
  cardIds,
  discardCandidates,
  maxDetailedDiscards = 1,
) {
  if (maxDetailedDiscards <= 0) return [];
  const shortlistLimit = Math.max(3, maxDetailedDiscards * 3);
  const cheapDiscardEntries = discardCandidates.map((discard) => {
    const discarded = new Set(discard);
    const boardCards = cardIds.filter((cardId) => !discarded.has(cardId));
    const discardHand = scoreProHand(discard);
    const crossStructureValue = boardCrossStructureValue(boardCards);
    return {
      discard,
      discardHand,
      crossStructureValue,
      cheapValue: discardHand.base * 3 + crossStructureValue,
    };
  });
  const shortlistedDiscards = [];
  const addShortlisted = (entry) => {
    if (!entry || shortlistedDiscards.includes(entry.discard)) return;
    shortlistedDiscards.push(entry.discard);
  };
  [...cheapDiscardEntries]
    .sort((a, b) => b.cheapValue - a.cheapValue)
    .slice(0, shortlistLimit)
    .forEach(addShortlisted);
  [...cheapDiscardEntries]
    .sort((a, b) => b.crossStructureValue - a.crossStructureValue)
    .slice(0, 1)
    .forEach(addShortlisted);
  [...cheapDiscardEntries]
    .sort((a, b) => b.discardHand.base - a.discardHand.base)
    .slice(0, 1)
    .forEach(addShortlisted);
  addShortlisted(
    [...cheapDiscardEntries]
      .filter((entry) => entry.discardHand.key === "straight-flush")
      .sort((a, b) => b.crossStructureValue - a.crossStructureValue)[0],
  );

  const rankedDiscards = [];
  for (const discard of shortlistedDiscards) {
    const discarded = new Set(discard);
    const boardCards = cardIds
      .filter((cardId) => !discarded.has(cardId))
      .sort((a, b) => {
        const cardA = PRO_CARD_BY_ID[a];
        const cardB = PRO_CARD_BY_ID[b];
        if (cardA.joker !== cardB.joker) {
          return Number(cardA.joker) - Number(cardB.joker);
        }
        if (cardA.suitIndex !== cardB.suitIndex) {
          return cardA.suitIndex - cardB.suitIndex;
        }
        return cardA.rankIndex - cardB.rankIndex;
      });
    const partitions = qualityColumnPartitions(boardCards);
    let previewTotal = 0;
    for (const partition of partitions.slice(0, 12)) {
      const state = arrangeQualityColumns(partition, discard, 4);
      if (!state) continue;
      const score = scoreProPlacement(state.slice(0, 25), state.slice(25));
      previewTotal = Math.max(previewTotal, score.total);
    }
    rankedDiscards.push({
      discard,
      boardCards,
      partitions,
      previewTotal,
      crossStructureValue: boardCrossStructureValue(boardCards),
      structuralValue:
        (partitions[0]?.base ?? 0) + (partitions[0]?.coverage ?? 0) * 120,
    });
  }

  const results = [];
  const byStructuralValue = [...rankedDiscards].sort(
    (a, b) => b.structuralValue - a.structuralValue,
  );
  const byCrossStructure = [...rankedDiscards].sort(
    (a, b) =>
      b.crossStructureValue - a.crossStructureValue ||
      b.structuralValue - a.structuralValue,
  );
  const byPreviewTotal = [...rankedDiscards].sort((a, b) => {
      if (a.previewTotal !== b.previewTotal) return b.previewTotal - a.previewTotal;
      return b.structuralValue - a.structuralValue;
    });
  const bestStraightFlushDiscard = [...rankedDiscards]
    .filter(
      (entry) =>
        scoreProHand(entry.discard).key === "straight-flush",
    )
    .sort(
      (a, b) =>
        b.crossStructureValue - a.crossStructureValue ||
        b.structuralValue - a.structuralValue,
    )[0];
  const detailedEntries = [];
  for (const entry of [
    byStructuralValue[0],
    byCrossStructure[0],
    byCrossStructure[1],
    bestStraightFlushDiscard,
    ...byPreviewTotal,
  ]) {
    if (!entry || detailedEntries.includes(entry)) continue;
    detailedEntries.push(entry);
    if (detailedEntries.length >= maxDetailedDiscards) break;
  }
  for (const entry of detailedEntries) {
    const rankCorePartitions = rankCoreColumnPartitions(entry.boardCards);
    const partitionMap = new Map();
    for (const partition of [
      ...rankCorePartitions,
      ...entry.partitions,
    ]) {
      const key = partition.hands
        .map((hand) => [...hand.cards].sort().join("|"))
        .sort()
        .join("::");
      if (!partitionMap.has(key)) partitionMap.set(key, partition);
    }
    const detailedPartitions = [...partitionMap.values()].sort(
      (a, b) =>
        b.base + b.coverage * 120 - (a.base + a.coverage * 120),
    );
    const candidates = [];
    const rankCorePreviews = rankCorePartitions
      .slice(0, 400)
      .map((partition) => {
        const state = arrangeQualityColumns(
          partition,
          entry.discard,
          2,
          false,
        );
        if (!state) return null;
        const score = scoreProPlacement(
          state.slice(0, 25),
          state.slice(25),
        );
        const regularLines = score.lines.slice(0, 10);
        return {
          partition,
          regularHandCount: regularLines.filter((line) => line.scores).length,
          regularBase: regularLines.reduce(
            (sum, line) => sum + line.value,
            0,
          ),
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          b.regularHandCount - a.regularHandCount ||
          b.regularBase - a.regularBase,
      )
      .slice(0, 24);
    for (const preview of rankCorePreviews) {
      const state = arrangeQualityColumns(
        preview.partition,
        entry.discard,
        2,
        true,
      );
      if (!state) continue;
      candidates.push({
        state,
        score: scoreProPlacement(state.slice(0, 25), state.slice(25)),
      });
    }
    for (const partition of detailedPartitions.slice(0, 48)) {
      const state = arrangeQualityColumns(partition, entry.discard, 8);
      if (!state) continue;
      candidates.push({
        state,
        score: scoreProPlacement(state.slice(0, 25), state.slice(25)),
      });
    }
    // Keep the original unrestricted quality-hand beam as an independent lane.
    // Rank-core partitions are intentionally numerous; merging then truncating
    // them must not crowd out a stronger mixed partition found by this lane.
    for (const partition of entry.partitions.slice(0, 48)) {
      const state = arrangeQualityColumns(partition, entry.discard, 8);
      if (!state) continue;
      candidates.push({
        state,
        score: scoreProPlacement(state.slice(0, 25), state.slice(25)),
      });
    }
    candidates.sort((a, b) => compareProScores(b.score, a.score));
    results.push(...candidates.slice(0, 8).map((candidate) => candidate.state));
  }
  return results;
}

function optimizeStructuredColumns(state, passes = 2) {
  let bestState = [...state];
  let bestSolution = stateToSolution(bestState, "Pro suit-row seed");
  let bestFitness = searchFitness(bestState, bestSolution.score);

  for (let pass = 0; pass < passes; pass += 1) {
    let improved = false;
    for (let row = 0; row < 5; row += 1) {
      const offset = row * 5;
      const rowCards = bestState.slice(offset, offset + 5);
      let rowBestState = bestState;
      let rowBestSolution = bestSolution;
      let rowBestFitness = bestFitness;
      for (const permutation of FIVE_CARD_PERMUTATIONS) {
        const candidateState = [...bestState];
        for (let column = 0; column < 5; column += 1) {
          candidateState[offset + column] = rowCards[permutation[column]];
        }
        const candidateSolution = stateToSolution(
          candidateState,
          "Pro suit-row seed",
        );
        const candidateFitness = searchFitness(
          candidateState,
          candidateSolution.score,
        );
        if (
          candidateFitness > rowBestFitness ||
          (candidateFitness === rowBestFitness &&
            compareProScores(candidateSolution.score, rowBestSolution.score) > 0)
        ) {
          rowBestState = candidateState;
          rowBestSolution = candidateSolution;
          rowBestFitness = candidateFitness;
        }
      }
      if (rowBestState !== bestState) improved = true;
      bestState = rowBestState;
      bestSolution = rowBestSolution;
      bestFitness = rowBestFitness;
    }
    if (!improved) break;
  }

  const cornerOptimized = optimizeCornerPermutation(bestSolution);
  return [...cornerOptimized.grid, ...cornerOptimized.discard];
}

function detectSuitStructure(state) {
  const rowBySuit = new Map();
  const claimedRows = new Set();
  for (let row = 0; row < 5; row += 1) {
    const rowCards = state
      .slice(row * 5, row * 5 + 5)
      .map((cardId) => PRO_CARD_BY_ID[cardId]);
    const naturalSuits = new Set(
      rowCards.filter((card) => card && !card.joker).map((card) => card.suit),
    );
    if (naturalSuits.size !== 1) continue;
    const suit = [...naturalSuits][0];
    if (rowBySuit.has(suit)) continue;
    rowBySuit.set(suit, row);
    claimedRows.add(row);
  }
  if (rowBySuit.size !== PRO_SUITS.length) return null;
  const leftoverRows = [0, 1, 2, 3, 4].filter((row) => !claimedRows.has(row));
  if (leftoverRows.length !== 1) return null;
  return { rowBySuit, leftoverRow: leftoverRows[0] };
}

function mutateSuitStructure(state, random, suppliedStructure = null) {
  const candidate = [...state];
  const structure = suppliedStructure ?? detectSuitStructure(candidate);
  if (!structure) return candidate;
  const move = random();

  if (move < 0.5) {
    const row = Math.floor(random() * 5);
    const first = row * 5 + Math.floor(random() * 5);
    let second = row * 5 + Math.floor(random() * 5);
    if (second === first) second = row * 5 + ((second + 1) % 5);
    [candidate[first], candidate[second]] = [candidate[second], candidate[first]];
    return candidate;
  }

  const swapSuitMembership = (suitIndex) => {
    const suit = PRO_SUITS[suitIndex];
    const suitRowOffset = structure.rowBySuit.get(suit) * 5;
    const leftoverRowOffset = structure.leftoverRow * 5;
    const suitRowSlots = Array.from({ length: 5 }, (_unused, column) =>
      suitRowOffset + column,
    ).filter((index) => PRO_CARD_BY_ID[candidate[index]]?.suit === suit);
    const leftoverSlots = Array.from(
      { length: 5 },
      (_unused, column) => leftoverRowOffset + column,
    )
      .filter((index) => PRO_CARD_BY_ID[candidate[index]]?.suit === suit);
    if (suitRowSlots.length === 0 || leftoverSlots.length === 0) return;
    const first =
      suitRowSlots[Math.floor(random() * suitRowSlots.length)];
    const second =
      leftoverSlots[Math.floor(random() * leftoverSlots.length)];
    [candidate[first], candidate[second]] = [candidate[second], candidate[first]];
  };

  if (move < 0.74) {
    const suitIndex = Math.floor(random() * PRO_SUITS.length);
    swapSuitMembership(suitIndex);
    return candidate;
  }

  if (move < 0.92) {
    const suitOrder = shuffle([0, 1, 2, 3], random);
    const swapCount = 2 + Math.floor(random() * 3);
    for (let index = 0; index < swapCount; index += 1) {
      swapSuitMembership(suitOrder[index]);
    }
    return candidate;
  }

  const jokerIndex = candidate.slice(0, 25).indexOf(JOKER_ID);
  if (jokerIndex === -1) return candidate;
  if (Math.floor(jokerIndex / 5) === structure.leftoverRow) {
    const suitIndex = Math.floor(random() * PRO_SUITS.length);
    const suit = PRO_SUITS[suitIndex];
    const suitRowOffset = structure.rowBySuit.get(suit) * 5;
    const naturalSlots = Array.from({ length: 5 }, (_unused, column) =>
      suitRowOffset + column,
    ).filter((index) => PRO_CARD_BY_ID[candidate[index]]?.suit === suit);
    if (naturalSlots.length > 0) {
      const target = naturalSlots[Math.floor(random() * naturalSlots.length)];
      [candidate[jokerIndex], candidate[target]] = [
        candidate[target],
        candidate[jokerIndex],
      ];
    }
    return candidate;
  }

  const jokerRow = Math.floor(jokerIndex / 5);
  const jokerSuit = PRO_SUITS.find(
    (suit) => structure.rowBySuit.get(suit) === jokerRow,
  );
  if (!jokerSuit) return candidate;
  const leftoverRowOffset = structure.leftoverRow * 5;
  const leftoverSlots = Array.from(
    { length: 5 },
    (_unused, column) => leftoverRowOffset + column,
  )
    .filter((index) => PRO_CARD_BY_ID[candidate[index]]?.suit === jokerSuit);
  if (leftoverSlots.length > 0) {
    const target = leftoverSlots[Math.floor(random() * leftoverSlots.length)];
    [candidate[jokerIndex], candidate[target]] = [
      candidate[target],
      candidate[jokerIndex],
    ];
  }
  return candidate;
}

function exploreSuitStructure(state, random, iterations) {
  let currentState = [...state];
  let currentSolution = stateToSolution(currentState, "Pro suit-row seed");
  let currentFitness = searchFitness(currentState, currentSolution.score);
  let bestState = currentState;
  let bestSolution = currentSolution;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const candidateState = mutateSuitStructure(currentState, random);
    const candidateSolution = stateToSolution(
      candidateState,
      "Pro suit-row seed",
    );
    const candidateFitness = searchFitness(
      candidateState,
      candidateSolution.score,
    );
    const progress = iteration / Math.max(1, iterations);
    const temperature = 340 * (1 - progress) + 12;
    if (
      candidateFitness >= currentFitness ||
      random() < Math.exp((candidateFitness - currentFitness) / temperature)
    ) {
      currentState = candidateState;
      currentSolution = candidateSolution;
      currentFitness = candidateFitness;
    }
    if (compareProScores(candidateSolution.score, bestSolution.score) > 0) {
      bestState = candidateState;
      bestSolution = candidateSolution;
    }
  }

  return bestState;
}

function initialStates(
  cardIds,
  random,
  incumbent,
  searchBudgetMs = 3000,
  {
    continuation = false,
    priorSolutions = [],
  } = {},
) {
  const sorted = sortProCardIds(cardIds);
  const reversed = [...sorted].reverse();
  const suitSorted = [...cardIds].sort((a, b) => {
    const cardA = PRO_CARD_BY_ID[a];
    const cardB = PRO_CARD_BY_ID[b];
    if (cardA.joker !== cardB.joker) return Number(cardA.joker) - Number(cardB.joker);
    if (cardA.suitIndex !== cardB.suitIndex) return cardA.suitIndex - cardB.suitIndex;
    return cardA.rankIndex - cardB.rankIndex;
  });
  const snake = Array(30);
  sorted.forEach((cardId, index) => {
    if (index >= 25) {
      snake[index] = cardId;
      return;
    }
    const row = Math.floor(index / 5);
    const column = index % 5;
    snake[row * 5 + (row % 2 ? 4 - column : column)] = cardId;
  });

  const starts = continuation
    ? []
    : [sorted, reversed, suitSorted, [...suitSorted].reverse(), snake];

  const addWindowStarts = (orderedCards) => {
    for (let discardStart = 0; discardStart <= 25; discardStart += 1) {
      const discard = orderedCards.slice(discardStart, discardStart + 5);
      const discarded = new Set(discard);
      const boardCards = orderedCards.filter((cardId) => !discarded.has(cardId));
      const rowMajor = [...boardCards];
      const columnMajor = Array(25);
      const snakeRows = [];

      for (let row = 0; row < 5; row += 1) {
        for (let column = 0; column < 5; column += 1) {
          columnMajor[row * 5 + column] = boardCards[column * 5 + row];
        }
        const rowCards = boardCards.slice(row * 5, row * 5 + 5);
        snakeRows.push(...(row % 2 === 0 ? rowCards : rowCards.reverse()));
      }

      for (const grid of [rowMajor, columnMajor, snakeRows]) {
        const jokerIndex = grid.indexOf(JOKER_ID);
        if (jokerIndex !== -1) {
          [grid[12], grid[jokerIndex]] = [grid[jokerIndex], grid[12]];
        }
        starts.push([...grid, ...discard]);
      }
    }
  };

  // Contiguous rank- and suit-ordered discard windows cheaply seed coherent
  // five-card rows and columns. They include natural quads/full houses and
  // straight-flush runs without enumerating all C(30, 5) possible hands.
  if (!continuation) {
    addWindowStarts(sorted);
    addWindowStarts(suitSorted);
  }
  const useStructuralPortfolio = !continuation && searchBudgetMs >= 1000;
  const structuralDiscards = useStructuralPortfolio
    ? strongDiscardCandidates(cardIds)
    : [];
  const suitStarts = useStructuralPortfolio
    ? suitStructuredStates(cardIds, random, structuralDiscards)
    : [];
  const naturalQuadDiscards = structuralDiscards.filter(
    (discard) =>
      !discard.includes(JOKER_ID) &&
      scoreProHand(discard).key === "four-kind",
  );
  const beamDiscardMap = new Map();
  const addBeamDiscard = (discard) => {
    if (!discard) return;
    beamDiscardMap.set([...discard].sort().join("|"), discard);
  };
  if (naturalQuadDiscards.length > 0) {
    representativeQuadDiscards(naturalQuadDiscards).forEach(addBeamDiscard);
  }
  structuralDiscards
    .filter(
      (discard) =>
        scoreProHand(discard).key === "straight-flush",
    )
    .forEach(addBeamDiscard);
  if (beamDiscardMap.size === 0) {
    structuralDiscards.slice(0, 12).forEach(addBeamDiscard);
  }
  const beamDiscards = [...beamDiscardMap.values()];
  const preservesSecondNaturalQuad = beamDiscards.some((discard) => {
    if (scoreProHand(discard).key !== "four-kind") return false;
    const discarded = new Set(discard);
    const remainingRankCounts = new Map();
    for (const cardId of cardIds) {
      if (discarded.has(cardId)) continue;
      const card = PRO_CARD_BY_ID[cardId];
      if (!card || card.joker) continue;
      remainingRankCounts.set(
        card.rank,
        (remainingRankCounts.get(card.rank) ?? 0) + 1,
      );
    }
    return [...remainingRankCounts.values()].some((count) => count === 4);
  });
  const qualityRowStarts =
    searchBudgetMs >= 20_000 && !preservesSecondNaturalQuad
      ? qualityRowStructuredStates(cardIds, beamDiscards)
      : [];
  const exhaustiveSuitStarts =
    qualityRowStarts.length === 0 && searchBudgetMs < 20_000
      ? exhaustiveSuitRowStates(cardIds, beamDiscards)
      : [];
  const qualityColumnStarts =
    qualityRowStarts.length > 0 || exhaustiveSuitStarts.length > 0
      ? []
      : qualityColumnStructuredStates(
          cardIds,
          beamDiscards,
          searchBudgetMs >= 8_000 ? 1 : 0,
        );
  const rankedSuitStarts = suitStarts.map((state) => {
      const solution = stateToSolution(state, "Pro suit-row seed");
      return {
        state,
        score: solution.score,
        fitness: searchFitness(state, solution.score),
      };
    });
  const suitStartsByDiscard = new Map();
  for (const entry of rankedSuitStarts) {
    const discardKey = entry.state.slice(25).sort().join("|");
    if (!suitStartsByDiscard.has(discardKey)) {
      suitStartsByDiscard.set(discardKey, []);
    }
    suitStartsByDiscard.get(discardKey).push(entry);
  }
  const exploredSuitStarts = [...suitStartsByDiscard.values()]
    .map((entries) =>
      entries.sort((a, b) => {
        if (a.fitness !== b.fitness) return b.fitness - a.fitness;
        return compareProScores(b.score, a.score);
      })[0],
    )
    .filter(Boolean)
    .sort((a, b) => {
      if (a.fitness !== b.fitness) return b.fitness - a.fitness;
      return compareProScores(b.score, a.score);
    })
    .slice(0, 12)
    .map((entry) => exploreSuitStructure(entry.state, random, 320));
  const strongestSuitStarts = exploredSuitStarts
    .map((state) => {
      const solution = stateToSolution(state, "Pro suit-row seed");
      return {
        state,
        score: solution.score,
        fitness: searchFitness(state, solution.score),
      };
    })
    .sort((a, b) => {
      if (a.fitness !== b.fitness) return b.fitness - a.fitness;
      return compareProScores(b.score, a.score);
    })
    .slice(0, 8)
    .flatMap((entry, index) => {
      const explored = exploreSuitStructure(entry.state, random, 400);
      return [
        optimizeStructuredColumns(explored, 1),
        arrangeStructuredRows(
          explored,
          index === 0 && searchBudgetMs >= 8_000
            ? searchBudgetMs >= 20_000
              ? 640
              : 320
            : 64,
        ),
      ].filter(Boolean);
    });
  starts.unshift(
    ...qualityRowStarts,
    ...exhaustiveSuitStarts,
    ...qualityColumnStarts,
    ...strongestSuitStarts,
    ...exploredSuitStarts,
    ...suitStarts,
  );
  const priorStates = [...priorSolutions, incumbent]
    .filter(Boolean)
    .map((solution) => [...(solution.grid ?? []), ...(solution.discard ?? [])])
    .filter(
      (state) =>
        state.length === 30 &&
        new Set(state).size === 30 &&
        sortProCardIds(state).join("|") === sorted.join("|"),
    );
  starts.unshift(...priorStates);
  if (continuation) {
    // Repeat runs reuse the strongest layouts but spend their opening budget on
    // fresh perturbations instead of replaying the deterministic structure
    // portfolio from the first pass.
    for (const priorState of priorStates.slice(0, 8)) {
      for (let variant = 0; variant < 8; variant += 1) {
        const perturbed = [...priorState];
        const swaps = 2 + Math.floor(random() * 7);
        for (let swap = 0; swap < swaps; swap += 1) {
          const first = Math.floor(random() * perturbed.length);
          let second = Math.floor(random() * perturbed.length);
          if (first === second) second = (second + 1) % perturbed.length;
          [perturbed[first], perturbed[second]] = [
            perturbed[second],
            perturbed[first],
          ];
        }
        starts.push(perturbed);
      }
    }
  }
  const randomStartCount = continuation ? 72 : 36;
  for (let index = 0; index < randomStartCount; index += 1) {
    starts.push(shuffle(cardIds, random));
  }

  const jokerIndex = cardIds.indexOf(JOKER_ID);
  if (!continuation && jokerIndex !== -1) {
    const centered = [...sorted];
    const currentCenter = centered.indexOf(JOKER_ID);
    [centered[12], centered[currentCenter]] = [centered[currentCenter], centered[12]];
    starts.unshift(centered);
  }
  const unique = new Map();
  for (const state of starts) unique.set(state.join("|"), state);
  const protectedKeys = new Set(priorStates.map((state) => state.join("|")));
  const rankedStarts = [...unique.values()]
    .map((state) => {
      const solution = stateToSolution(state, "Pro structured seed");
      return {
        state,
        score: solution.score,
        fitness: searchFitness(state, solution.score),
      };
    })
    .sort((a, b) => {
      if (a.score.handCount !== b.score.handCount) {
        return b.score.handCount - a.score.handCount;
      }
      const scoreComparison = compareProScores(b.score, a.score);
      if (scoreComparison !== 0) return scoreComparison;
      return b.fitness - a.fitness;
    });
  const protectedStarts = rankedStarts
    .filter((entry) => protectedKeys.has(entry.state.join("|")))
    .sort((first, second) => compareProScores(second.score, first.score));
  const exploratoryStarts = rankedStarts.filter(
    (entry) => !protectedKeys.has(entry.state.join("|")),
  );
  return [...protectedStarts, ...exploratoryStarts].map(
    (entry) => entry.state,
  );
}

function mutateTowardStraightFlush(state, random) {
  const windows = [
    ...Array.from({ length: PRO_RANKS.length - 4 }, (_unused, start) =>
      Array.from({ length: 5 }, (_unusedOffset, offset) => start + offset),
    ),
    [0, 1, 2, 3, PRO_RANKS.length - 1],
  ];
  const repairs = [];

  for (let row = 0; row < 5; row += 1) {
    const rowIndices = Array.from({ length: 5 }, (_unused, column) => row * 5 + column);
    const rowIds = rowIndices.map((index) => state[index]);
    for (const suit of PRO_SUITS) {
      const matchingCount = rowIds.filter((cardId) => {
        const card = PRO_CARD_BY_ID[cardId];
        return card?.joker || card?.suit === suit;
      }).length;
      if (matchingCount < 3) continue;

      for (const ranks of windows) {
        const targetIds = [];
        let missingRankCount = 0;
        for (const rankIndex of ranks) {
          const matchingIndex = state.findIndex((cardId) => {
            const card = PRO_CARD_BY_ID[cardId];
            return !card?.joker && card?.suit === suit && card?.rankIndex === rankIndex;
          });
          if (matchingIndex === -1) {
            missingRankCount += 1;
          } else {
            targetIds.push(state[matchingIndex]);
          }
        }
        if (missingRankCount > 1) continue;
        if (missingRankCount === 1) {
          if (!state.includes(JOKER_ID)) continue;
          targetIds.push(JOKER_ID);
        }
        if (targetIds.length !== 5) continue;
        const targetSet = new Set(targetIds);
        const incoming = targetIds.filter((cardId) => !rowIds.includes(cardId));
        if (incoming.length === 0 || incoming.length > 3) continue;
        const outgoingIndices = rowIndices.filter(
          (index) => !targetSet.has(state[index]),
        );
        if (outgoingIndices.length !== incoming.length) continue;

        const candidate = [...state];
        for (let index = 0; index < incoming.length; index += 1) {
          const incomingIndex = candidate.indexOf(incoming[index]);
          const outgoingIndex = outgoingIndices[index];
          [candidate[outgoingIndex], candidate[incomingIndex]] = [
            candidate[incomingIndex],
            candidate[outgoingIndex],
          ];
        }
        repairs.push(candidate);
      }
    }
  }

  return repairs.length
    ? repairs[Math.floor(random() * repairs.length)]
    : null;
}

function mutateShortDeterministic(state, random) {
  const suitStructure = detectSuitStructure(state);
  if (suitStructure && random() < 0.92) {
    return mutateSuitStructure(state, random, suitStructure);
  }
  const candidate = [...state];
  const move = random();
  if (move < 0.08) {
    const firstRow = Math.floor(random() * 5);
    let secondRow = Math.floor(random() * 5);
    if (secondRow === firstRow) secondRow = (secondRow + 1) % 5;
    for (let column = 0; column < 5; column += 1) {
      const first = firstRow * 5 + column;
      const second = secondRow * 5 + column;
      [candidate[first], candidate[second]] = [candidate[second], candidate[first]];
    }
    return candidate;
  }
  if (move < 0.16) {
    const firstColumn = Math.floor(random() * 5);
    let secondColumn = Math.floor(random() * 5);
    if (secondColumn === firstColumn) secondColumn = (secondColumn + 1) % 5;
    for (let row = 0; row < 5; row += 1) {
      const first = row * 5 + firstColumn;
      const second = row * 5 + secondColumn;
      [candidate[first], candidate[second]] = [candidate[second], candidate[first]];
    }
    return candidate;
  }
  if (move < 0.26) {
    const row = Math.floor(random() * 5);
    const offset = row * 5;
    candidate.splice(
      offset,
      5,
      ...shuffle(candidate.slice(offset, offset + 5), random),
    );
    return candidate;
  }
  if (move < 0.36) {
    const column = Math.floor(random() * 5);
    const shuffled = shuffle(
      Array.from({ length: 5 }, (_unused, row) => candidate[row * 5 + column]),
      random,
    );
    for (let row = 0; row < 5; row += 1) {
      candidate[row * 5 + column] = shuffled[row];
    }
    return candidate;
  }
  if (move < 0.5) {
    const first = Math.floor(random() * 30);
    let second = Math.floor(random() * 30);
    let third = Math.floor(random() * 30);
    if (second === first) second = (second + 1) % 30;
    if (third === first || third === second) {
      third = (third + 2) % 30;
      while (third === first || third === second) third = (third + 5) % 30;
    }
    [candidate[first], candidate[second], candidate[third]] = [
      candidate[third],
      candidate[first],
      candidate[second],
    ];
    return candidate;
  }
  const line = PRO_LINE_DEFINITIONS[Math.floor(random() * PRO_LINE_DEFINITIONS.length)];
  const first =
    random() < 0.72
      ? line.indices[Math.floor(random() * line.indices.length)]
      : Math.floor(random() * 30);
  let second = Math.floor(random() * 30);
  if (second === first) second = (second + 1) % 30;
  [candidate[first], candidate[second]] = [candidate[second], candidate[first]];
  return candidate;
}

function mutate(state, random, shortDeterministicLane = false) {
  if (shortDeterministicLane) return mutateShortDeterministic(state, random);
  if (!shortDeterministicLane && random() < 0.08) {
    const straightFlushRepair = mutateTowardStraightFlush(state, random);
    if (straightFlushRepair) return straightFlushRepair;
  }
  const suitStructure = detectSuitStructure(state);
  // Suit-row starts are valuable, but preserving them almost unconditionally
  // traps the search on deals whose best board mixes suit, rank, and straight
  // structures. Keep a modest structure-aware lane and let the general moves
  // do most of the exploration.
  if (
    suitStructure &&
    random() < (shortDeterministicLane ? 0.92 : 0.45)
  ) {
    return mutateSuitStructure(state, random, suitStructure);
  }
  const candidate = [...state];
  const move = random();

  if (move < 0.1) {
    const row = Math.floor(random() * 5);
    const offset = row * 5;
    const shuffled = shuffle(candidate.slice(offset, offset + 5), random);
    candidate.splice(offset, 5, ...shuffled);
    return candidate;
  }

  if (move < 0.18) {
    const column = Math.floor(random() * 5);
    const shuffled = shuffle(
      Array.from({ length: 5 }, (_, row) => candidate[row * 5 + column]),
      random,
    );
    for (let row = 0; row < 5; row += 1) {
      candidate[row * 5 + column] = shuffled[row];
    }
    return candidate;
  }

  if (move < 0.25) {
    const firstRow = Math.floor(random() * 5);
    let secondRow = Math.floor(random() * 5);
    if (secondRow === firstRow) secondRow = (secondRow + 1) % 5;
    for (let column = 0; column < 5; column += 1) {
      const first = firstRow * 5 + column;
      const second = secondRow * 5 + column;
      [candidate[first], candidate[second]] = [candidate[second], candidate[first]];
    }
    return candidate;
  }

  if (move < 0.32) {
    const firstColumn = Math.floor(random() * 5);
    let secondColumn = Math.floor(random() * 5);
    if (secondColumn === firstColumn) secondColumn = (secondColumn + 1) % 5;
    for (let row = 0; row < 5; row += 1) {
      const first = row * 5 + firstColumn;
      const second = row * 5 + secondColumn;
      [candidate[first], candidate[second]] = [candidate[second], candidate[first]];
    }
    return candidate;
  }

  if (move < 0.52) {
    const first = Math.floor(random() * 30);
    let second = Math.floor(random() * 30);
    let third = Math.floor(random() * 30);
    if (second === first) second = (second + 1) % 30;
    if (third === first || third === second) {
      third = (third + 2) % 30;
      while (third === first || third === second) third = (third + 5) % 30;
    }
    [candidate[first], candidate[second], candidate[third]] = [
      candidate[third],
      candidate[first],
      candidate[second],
    ];
    return candidate;
  }

  const line = PRO_LINE_DEFINITIONS[Math.floor(random() * PRO_LINE_DEFINITIONS.length)];
  const first =
    random() < 0.65
      ? line.indices[Math.floor(random() * line.indices.length)]
      : Math.floor(random() * 30);
  let second = Math.floor(random() * 30);
  if (second === first) second = (second + 1) % 30;
  [candidate[first], candidate[second]] = [candidate[second], candidate[first]];
  return candidate;
}

function placementKey(solution) {
  return `${solution.grid.join("|")}::${solution.discard.slice().sort().join("|")}`;
}

function optimizeCornerPermutation(solution) {
  let best = null;
  for (let centerRow = 0; centerRow < 5; centerRow += 1) {
    for (let centerColumn = 0; centerColumn < 5; centerColumn += 1) {
      const otherRows = [0, 1, 2, 3, 4].filter((row) => row !== centerRow);
      const otherColumns = [0, 1, 2, 3, 4].filter(
        (column) => column !== centerColumn,
      );
      for (let firstRowIndex = 0; firstRowIndex < 3; firstRowIndex += 1) {
        for (
          let secondRowIndex = firstRowIndex + 1;
          secondRowIndex < 4;
          secondRowIndex += 1
        ) {
          const cornerRows = [
            otherRows[firstRowIndex],
            otherRows[secondRowIndex],
          ];
          for (
            let firstColumnIndex = 0;
            firstColumnIndex < 3;
            firstColumnIndex += 1
          ) {
            for (
              let secondColumnIndex = firstColumnIndex + 1;
              secondColumnIndex < 4;
              secondColumnIndex += 1
            ) {
              const cornerColumns = [
                otherColumns[firstColumnIndex],
                otherColumns[secondColumnIndex],
              ];
              const cards = [
                solution.grid[cornerRows[0] * 5 + cornerColumns[0]],
                solution.grid[cornerRows[0] * 5 + cornerColumns[1]],
                solution.grid[centerRow * 5 + centerColumn],
                solution.grid[cornerRows[1] * 5 + cornerColumns[0]],
                solution.grid[cornerRows[1] * 5 + cornerColumns[1]],
              ];
              const hand = scoreProHand(cards);
              if (!best || hand.base > best.hand.base) {
                best = { centerRow, centerColumn, cornerRows, cornerColumns, hand };
              }
            }
          }
        }
      }
    }
  }

  if (!best) return solution;
  const remainingRows = [0, 1, 2, 3, 4].filter(
    (row) => row !== best.centerRow && !best.cornerRows.includes(row),
  );
  const remainingColumns = [0, 1, 2, 3, 4].filter(
    (column) =>
      column !== best.centerColumn && !best.cornerColumns.includes(column),
  );
  const rowOrder = [
    best.cornerRows[0],
    remainingRows[0],
    best.centerRow,
    remainingRows[1],
    best.cornerRows[1],
  ];
  const columnOrder = [
    best.cornerColumns[0],
    remainingColumns[0],
    best.centerColumn,
    remainingColumns[1],
    best.cornerColumns[1],
  ];
  const grid = rowOrder.flatMap((row) =>
    columnOrder.map((column) => solution.grid[row * 5 + column]),
  );
  const optimized = stateToSolution(
    [...grid, ...solution.discard],
    "Pro corner refinement",
  );
  return compareProScores(optimized.score, solution.score) >= 0
    ? optimized
    : solution;
}

function validProDeal(cardIds) {
  return (
    Array.isArray(cardIds) &&
    cardIds.length === 30 &&
    new Set(cardIds).size === 30 &&
    cardIds.includes(JOKER_ID) &&
    cardIds.every((cardId) => Boolean(PRO_CARD_BY_ID[cardId]))
  );
}

function perturbLeader(solution, random) {
  const state = [...solution.grid, ...solution.discard];
  const swapCount = 2 + Math.floor(random() * 7);
  for (let swap = 0; swap < swapCount; swap += 1) {
    const first = Math.floor(random() * state.length);
    let second = Math.floor(random() * state.length);
    if (second === first) second = (second + 1) % state.length;
    [state[first], state[second]] = [state[second], state[first]];
  }
  return state;
}

function startRestart(session) {
  const revisitLeader =
    session.best &&
    session.restartCount > 0 &&
    session.restartCount % session.leaderRestartInterval === 0;
  const structuredSeed = session.starts[session.startIndex];
  const seed = revisitLeader
    ? perturbLeader(session.best, session.random)
    : structuredSeed
      ? [...structuredSeed]
      : perturbLeader(session.best, session.random);
  if (revisitLeader) session.leaderRestartCount += 1;
  if (!revisitLeader && structuredSeed) session.startIndex += 1;
  session.restartCount += 1;
  session.currentState = seed;
  session.current = stateToSolution(seed);
  session.currentEvaluation = fastStateEvaluation(
    seed,
    session.maxAnnealingAttempts !== null &&
      session.maxAnnealingAttempts <= 60_000,
  );
  session.currentFitness = session.currentEvaluation.fitness;
  session.iteration = 0;
  session.iterationBudget =
    session.maxAnnealingAttempts !== null &&
    session.maxAnnealingAttempts <= 60_000
      ? 900 + Math.floor(session.random() * 700)
      : 8_000 + Math.floor(session.random() * 6_000);

  if (!session.best || compareProScores(session.current.score, session.best.score) > 0) {
    session.best = session.current;
    session.bestSolutions.set(placementKey(session.current), session.current);
  }
}

function startRefinement(session, resumeAnnealing = false) {
  if (!session.best) startRestart(session);
  session.phase = "refinement";
  session.refinementResumesAnnealing = resumeAnnealing;
  const candidateSeeds = new Map();
  const structuredSeeds = session.starts
    .slice(0, Math.max(session.maxRefinementSeeds * 4, 16))
    .map((state) => stateToSolution(state, "Pro structured refinement"));
  for (const solution of [
    ...session.bestSolutions.values(),
    session.best,
    ...structuredSeeds,
  ]) {
    candidateSeeds.set(placementKey(solution), solution);
  }
  const uniqueSeeds = new Map();
  for (const solution of [...candidateSeeds.values()]
    .sort((a, b) => compareProScores(b.score, a.score))
    .slice(0, session.maxRefinementSeeds)) {
    const optimized = optimizeCornerPermutation(solution);
    uniqueSeeds.set(placementKey(optimized), optimized);
    session.bestSolutions.set(placementKey(optimized), optimized);
    if (compareProScores(optimized.score, session.best.score) > 0) {
      session.best = optimized;
    }
  }
  session.refinementQueue = [...uniqueSeeds.values()]
    .sort((a, b) => compareProScores(b.score, a.score))
    .slice(0, session.maxRefinementSeeds);
  session.refinementQueueIndex = 0;
  startRefinementSeed(session, session.refinementQueue[0] ?? session.best);
}

function startRefinementSeed(session, solution) {
  session.refinementState = [...solution.grid, ...solution.discard];
  session.refinementBase = solution;
  session.refinementBaseEvaluation = fastStateEvaluation(
    session.refinementState,
  );
  session.refinementBestNeighbor = null;
  session.refinementFirstIndex = 0;
  session.refinementSecondIndex = 1;
}

function startLeaderRefinement(session) {
  if (!session.best) return;
  session.phase = "refinement";
  session.refinementResumesAnnealing = true;
  session.refinementQueue = [session.best];
  session.refinementQueueIndex = 0;
  startRefinementSeed(session, session.best);
}

function startBeamSeed(session) {
  const state = session.beamSeeds[session.beamSeedIndex];
  if (!state) {
    session.incumbentBeamPending = false;
    session.phase = "annealing";
    session.currentState = null;
    session.current = null;
    session.iteration = 0;
    return;
  }
  session.beamDepth = 0;
  session.beam = [{
    state: [...state],
    evaluation: fastStateEvaluation(state),
  }];
  session.beamNext = [];
  session.beamNextKeys = new Set();
  session.beamParentIndex = 0;
  session.beamFirstIndex = 0;
  session.beamSecondIndex = 1;
}

function startIncumbentBeam(session) {
  const leaderKey = session.best
    ? [...session.best.grid, ...session.best.discard].join("|")
    : "";
  session.beamSeeds = session.starts
    .filter((state) => state.join("|") !== leaderKey)
    .slice(0, 3)
    .map((state) => [...state]);
  session.beamSeedIndex = 0;
  session.phase = "beam";
  startBeamSeed(session);
}

function advanceBeamPair(session) {
  session.beamSecondIndex += 1;
  if (session.beamSecondIndex < 30) return;
  session.beamFirstIndex += 1;
  session.beamSecondIndex = session.beamFirstIndex + 1;
  if (session.beamFirstIndex < 29) return;
  session.beamParentIndex += 1;
  session.beamFirstIndex = 0;
  session.beamSecondIndex = 1;
}

function finishBeamDepth(session) {
  session.beamDepth += 1;
  session.beam = session.beamNext
    .sort((first, second) => {
      if (first.evaluation.fitness !== second.evaluation.fitness) {
        return second.evaluation.fitness - first.evaluation.fitness;
      }
      return compareProScores(second.evaluation, first.evaluation);
    })
    .slice(0, session.beamWidth);
  session.beamNext = [];
  session.beamNextKeys = new Set();
  session.beamParentIndex = 0;
  session.beamFirstIndex = 0;
  session.beamSecondIndex = 1;

  if (session.beam.length && session.beamDepth < session.beamMaxDepth) return;
  session.beamSeedIndex += 1;
  startBeamSeed(session);
}

function stepBeam(session) {
  if (session.beamParentIndex >= session.beam.length) {
    finishBeamDepth(session);
    return;
  }
  const parent = session.beam[session.beamParentIndex];
  const candidateState = [...parent.state];
  const first = session.beamFirstIndex;
  const second = session.beamSecondIndex;
  [candidateState[first], candidateState[second]] = [
    candidateState[second],
    candidateState[first],
  ];
  const key = candidateState.join("|");
  if (!session.beamNextKeys.has(key)) {
    session.beamNextKeys.add(key);
    const candidateEvaluation = fastStateEvaluationAfterMutation(
      candidateState,
      parent.evaluation,
      [first, second],
    );
    session.beamNext.push({
      state: candidateState,
      evaluation: candidateEvaluation,
    });
    session.attempts += 1;
    session.beamAttempts += 1;

    const comparison = compareProScores(
      candidateEvaluation,
      session.best.score,
    );
    if (comparison >= 0) {
      const candidate = stateToSolution(
        candidateState,
        "Pro incumbent look-ahead",
      );
      session.bestSolutions.set(placementKey(candidate), candidate);
      if (comparison > 0) session.best = candidate;
    }
  }
  advanceBeamPair(session);
  if (session.beamParentIndex >= session.beam.length) {
    finishBeamDepth(session);
  }
}

function advanceRefinementPair(session) {
  session.refinementSecondIndex += 1;
  if (session.refinementSecondIndex < 30) return;
  session.refinementFirstIndex += 1;
  session.refinementSecondIndex = session.refinementFirstIndex + 1;
}

function finishRefinementPass(session) {
  session.refinementPasses += 1;
  if (
    session.refinementBestNeighbor &&
    compareProScores(
      session.refinementBestNeighbor.score,
      session.refinementBase.score,
    ) > 0
  ) {
    session.refinementBase = session.refinementBestNeighbor;
    session.bestSolutions.set(
      placementKey(session.refinementBase),
      session.refinementBase,
    );
    if (compareProScores(session.refinementBase.score, session.best.score) > 0) {
      session.best = session.refinementBase;
    }
    startRefinementSeed(session, session.refinementBase);
    return;
  }

  session.refinementQueueIndex += 1;
  if (session.refinementQueueIndex < session.refinementQueue.length) {
    startRefinementSeed(
      session,
      session.refinementQueue[session.refinementQueueIndex],
    );
    return;
  }

  if (session.refinementResumesAnnealing) {
    session.refinementResumesAnnealing = false;
    if (session.incumbentBeamPending) {
      startIncumbentBeam(session);
      return;
    }
    session.phase = "annealing";
    session.currentState = null;
    session.current = null;
    session.iteration = 0;
    return;
  }

  session.refinementExhausted = true;
  session.done = true;
}

function stepRefinement(session) {
  if (session.refinementFirstIndex >= 29) {
    finishRefinementPass(session);
    return;
  }

  const candidateState = [...session.refinementState];
  const first = session.refinementFirstIndex;
  const second = session.refinementSecondIndex;
  [candidateState[first], candidateState[second]] = [
    candidateState[second],
    candidateState[first],
  ];
  const candidateEvaluation = fastStateEvaluationAfterMutation(
    candidateState,
    session.refinementBaseEvaluation,
    [first, second],
  );
  session.attempts += 1;
  session.refinementAttempts += 1;

  if (
    compareProScores(candidateEvaluation, session.refinementBase.score) > 0
  ) {
    const candidate = stateToSolution(candidateState, "Pro local refinement");
    if (
      !session.refinementBestNeighbor ||
      compareProScores(candidate.score, session.refinementBestNeighbor.score) > 0
    ) {
      session.refinementBestNeighbor = candidate;
    }
  }
  advanceRefinementPair(session);
  if (session.refinementFirstIndex >= 29) finishRefinementPass(session);
}

export function createProHeuristicSession(cardIds, options = {}) {
  if (!validProDeal(cardIds)) {
    throw new Error("Pro solver requires exactly 30 unique cards.");
  }

  const requestedTimeLimit = Number(options.timeLimitMs ?? 3000);
  const timeLimitMs =
    Number.isFinite(requestedTimeLimit) && requestedTimeLimit > 0
      ? Math.max(50, requestedTimeLimit)
      : 3000;
  const maxAnnealingAttempts =
    Number.isFinite(Number(options.maxAnnealingAttempts)) &&
    Number(options.maxAnnealingAttempts) > 0
      ? Math.floor(Number(options.maxAnnealingAttempts))
      : null;
  const continuationIndex =
    Number.isFinite(Number(options.continuationIndex)) &&
    Number(options.continuationIndex) > 0
      ? Math.floor(Number(options.continuationIndex))
      : 0;
  const startedAt = performance.now();
  const requestedSeed = Number(options.seed ?? hashCards(cardIds)) >>> 0;
  const baseSeed =
    (requestedSeed ^ Math.imul(continuationIndex, 0x9e3779b9)) >>> 0;
  const random = mulberry32(baseSeed);
  const starts = initialStates(
    cardIds,
    random,
    options.incumbent,
    maxAnnealingAttempts === null ? timeLimitMs : 0,
    {
      continuation: continuationIndex > 0,
      priorSolutions: options.priorSolutions,
    },
  );
  const bestSolutions = new Map();
  let best = null;
  let hasValidIncumbent = false;
  const incumbent = options.incumbent;
  const requestedDealKey = sortProCardIds(cardIds).join("|");
  const requestedMaxSolutions = Number(options.maxSolutions ?? 8);
  const maxSolutions =
    Number.isFinite(requestedMaxSolutions) && requestedMaxSolutions > 0
      ? Math.floor(requestedMaxSolutions)
      : 8;
  const requestedRefinementSeeds = Number(options.maxRefinementSeeds ?? 8);
  const maxRefinementSeeds =
    Number.isFinite(requestedRefinementSeeds) && requestedRefinementSeeds > 0
      ? Math.floor(requestedRefinementSeeds)
      : 8;
  if (
    incumbent?.grid?.length === 25 &&
    incumbent?.discard?.length === 5 &&
    validProDeal([...incumbent.grid, ...incumbent.discard]) &&
    sortProCardIds([...incumbent.grid, ...incumbent.discard]).join("|") ===
      requestedDealKey
  ) {
    hasValidIncumbent = true;
    best = {
      ...incumbent,
      grid: [...incumbent.grid],
      discard: [...incumbent.discard],
      score: scoreProPlacement(incumbent.grid, incumbent.discard),
    };
    bestSolutions.set(placementKey(best), best);
  }
  for (const priorSolution of options.priorSolutions ?? []) {
    const state = [
      ...(priorSolution?.grid ?? []),
      ...(priorSolution?.discard ?? []),
    ];
    if (
      state.length !== 30 ||
      new Set(state).size !== 30 ||
      sortProCardIds(state).join("|") !== requestedDealKey
    ) {
      continue;
    }
    const normalized = stateToSolution(state, "Prior search pass");
    bestSolutions.set(placementKey(normalized), normalized);
    if (!best || compareProScores(normalized.score, best.score) > 0) {
      best = normalized;
    }
  }
  const strongestStart = starts[0]
    ? stateToSolution(starts[0], "Pro structured seed")
    : null;
  if (
    strongestStart &&
    (!best || compareProScores(strongestStart.score, best.score) > 0)
  ) {
    best = strongestStart;
    bestSolutions.set(placementKey(strongestStart), strongestStart);
  }

  const session = {
    cardIds: [...cardIds],
    continuationIndex,
    timeLimitMs,
    startedAt,
    deadline: startedAt + timeLimitMs,
    annealingDeadline: startedAt + timeLimitMs * 0.92,
    maxAnnealingAttempts,
    portfolioSwitchAttempt:
      maxAnnealingAttempts === null ? 5000 : Math.floor(maxAnnealingAttempts / 2),
    portfolioSeed: baseSeed,
    portfolioIndex: 0,
    checkpointAnnealingAttempts: 60_000,
    checkpointRefinementStarted: false,
    random,
    starts,
    bestSolutions,
    best,
    hasValidIncumbent,
    startIndex: 0,
    restartCount: 0,
    leaderRestartCount: 0,
    leaderRestartInterval:
      maxAnnealingAttempts !== null && maxAnnealingAttempts <= 60_000
        ? Number.POSITIVE_INFINITY
        : hasValidIncumbent
          ? 2
          : 4,
    currentState: null,
    current: null,
    currentEvaluation: null,
    currentFitness: 0,
    iteration: 0,
    iterationBudget: 0,
    attempts: 0,
    annealingAttempts: 0,
    maxSolutions,
    maxRefinementSeeds,
    phase: "annealing",
    incumbentBeamPending: hasValidIncumbent,
    beamSeeds: [],
    beamSeedIndex: 0,
    beamWidth: 96,
    beamMaxDepth: 8,
    beamDepth: 0,
    beam: [],
    beamNext: [],
    beamNextKeys: new Set(),
    beamParentIndex: 0,
    beamFirstIndex: 0,
    beamSecondIndex: 1,
    beamAttempts: 0,
    refinementQueue: null,
    refinementQueueIndex: 0,
    refinementResumesAnnealing: false,
    refinementState: null,
    refinementBase: null,
    refinementBaseEvaluation: null,
    refinementBestNeighbor: null,
    refinementFirstIndex: 0,
    refinementSecondIndex: 1,
    refinementAttempts: 0,
    refinementPasses: 0,
    refinementExhausted: false,
    done: false,
  };
  if (hasValidIncumbent) startLeaderRefinement(session);
  return session;
}

export function stepProHeuristicSession(session, sliceMs = 16) {
  if (session.done) return true;
  const sliceDeadline = Math.min(session.deadline, performance.now() + Math.max(1, sliceMs));

  while (!session.done && performance.now() < sliceDeadline) {
    if (session.phase === "beam") {
      stepBeam(session);
      continue;
    }
    if (session.phase === "refinement") {
      stepRefinement(session);
      continue;
    }
    const annealingComplete =
      session.maxAnnealingAttempts === null
        ? performance.now() >= session.annealingDeadline
        : session.annealingAttempts >= session.maxAnnealingAttempts;
    if (annealingComplete) {
      startRefinement(session);
      continue;
    }
    if (
      !session.checkpointRefinementStarted &&
      session.annealingAttempts >= session.checkpointAnnealingAttempts
    ) {
      session.checkpointRefinementStarted = true;
      startRefinement(session, true);
      continue;
    }
    const switchPortfolio =
      session.portfolioIndex === 0 &&
      session.annealingAttempts >= session.portfolioSwitchAttempt;
    if (switchPortfolio) {
      session.portfolioIndex = 1;
      session.random = mulberry32((session.portfolioSeed ^ 0xd3a2646c) >>> 0);
      // Keep the second lane independent of the first so longer budgets explore
      // a strict extension of the same alternate trajectory. The global best is
      // still retained separately as the incumbent floor.
      session.starts = initialStates(
        session.cardIds,
        session.random,
        null,
        0,
        { continuation: session.continuationIndex > 0 },
      );
      if (session.hasValidIncumbent && session.best) {
        session.starts.unshift(perturbLeader(session.best, session.random));
      }
      session.startIndex = 0;
      session.currentState = null;
      session.current = null;
      session.iteration = 0;
      continue;
    }

    if (!session.currentState || session.iteration >= session.iterationBudget) {
      startRestart(session);
    }

    const candidateState = mutate(
      session.currentState,
      session.random,
      session.maxAnnealingAttempts !== null &&
        session.maxAnnealingAttempts <= 60_000,
    );
    const shortDeterministicLane =
      session.maxAnnealingAttempts !== null &&
      session.maxAnnealingAttempts <= 60_000;
    const changedSlots = [];
    for (let slot = 0; slot < candidateState.length; slot += 1) {
      if (candidateState[slot] !== session.currentState[slot]) {
        changedSlots.push(slot);
      }
    }
    const candidateEvaluation = fastStateEvaluationAfterMutation(
      candidateState,
      session.currentEvaluation,
      changedSlots,
      shortDeterministicLane,
    );
    const candidateFitness = candidateEvaluation.fitness;
    const progress = session.iteration / session.iterationBudget;
    const temperature = shortDeterministicLane
      ? 520 * (1 - progress) + 18
      : 680 * (1 - progress) + 9;
    const accept =
      candidateFitness >= session.currentFitness ||
      session.random() < Math.exp((candidateFitness - session.currentFitness) / temperature);
    session.attempts += 1;
    session.annealingAttempts += 1;
    session.iteration += 1;

    if (accept) {
      session.currentState = candidateState;
      session.current = null;
      session.currentEvaluation = candidateEvaluation;
      session.currentFitness = candidateFitness;
    }

    const bestComparison =
      !session.best
        ? 1
        : compareProScores(candidateEvaluation, session.best.score);
    if (bestComparison > 0) {
      const candidate = stateToSolution(candidateState);
      session.best = candidate;
      session.bestSolutions.set(placementKey(candidate), candidate);
    } else if (bestComparison === 0) {
      const candidate = stateToSolution(candidateState);
      session.bestSolutions.set(placementKey(candidate), candidate);
    }
  }

  if (performance.now() >= session.deadline) session.done = true;
  return session.done;
}

export function finishProHeuristicSession(session) {
  if (!session.best) session.best = stateToSolution(session.starts[0] ?? session.cardIds);
  session.bestSolutions.set(placementKey(session.best), session.best);
  const solutions = uniqueSolutionsByOutcomeProfile(
    [...session.bestSolutions.values()]
      .sort((a, b) => compareProScores(b.score, a.score)),
  )
    .slice(0, session.maxSolutions);

  return {
    best: solutions[0] ?? session.best,
    solutions,
    elapsedMs: Math.max(0, performance.now() - session.startedAt),
    attempts: session.attempts,
    annealingAttempts: session.annealingAttempts,
    refinementAttempts: session.refinementAttempts,
    beamAttempts: session.beamAttempts,
    refinementPasses: session.refinementPasses,
    refinementExhausted: session.refinementExhausted,
    leaderRestartCount: session.leaderRestartCount,
    continuationIndex: session.continuationIndex,
    exact: false,
    searchOrder:
      "A score-competing portfolio combines rank-core quality partitions, suit-row and ordered-hand seeds, unrestricted annealing, corner refinement, and improving swaps.",
  };
}

export function solveProHeuristic(cardIds, options = {}) {
  const session = createProHeuristicSession(cardIds, options);
  while (!stepProHeuristicSession(session, 50)) {
    // Synchronous worker/Node path. The browser file:// fallback uses the
    // cooperative session API directly so its UI remains responsive.
  }
  return finishProHeuristicSession(session);
}

export const __proHeuristicTestHooks = {
  arrangeQualityColumns,
  arrangeStructuredRows,
  boardCrossStructureValue,
  exhaustiveSuitRowStates,
  fastStateEvaluation,
  fastStateEvaluationAfterMutation,
  qualityColumnCandidates,
  qualityColumnPartitions,
  qualityColumnStructuredStates,
  qualityRowStructuredStates,
  rankCoreColumnPartitions,
  representativeQuadDiscards,
  strongDiscardCandidates,
  suitStructuredStates,
  mutateTowardStraightFlush,
  optimizeStructuredColumns,
};
