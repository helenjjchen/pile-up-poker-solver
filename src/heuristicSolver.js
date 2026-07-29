import { sortCardIds } from "./cards.js";
import { solutionStructureKey } from "./layoutEquivalence.js";
import {
  LINE_DEFINITIONS,
  compareScores,
  multiplierForHandCount,
  scoreHand,
  scorePlacement,
  theoreticalMaxTotalForHandCount,
} from "./scoring.js";
import { canonicalPlacementKey } from "./symmetry.js";

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function stateToPlacement(state) {
  return {
    grid: state.slice(0, 16),
    discard: state.slice(16, 20),
  };
}

function scoreState(state) {
  const placement = stateToPlacement(state);
  return scorePlacement(placement.grid, placement.discard);
}

function createFastStateEvaluator(cardIds) {
  const bitByCardId = new Map(cardIds.map((cardId, index) => [cardId, 1 << index]));
  const handStatsByMask = new Map();
  let candidateEvaluations = 0;

  for (let a = 0; a < cardIds.length - 3; a += 1) {
    for (let b = a + 1; b < cardIds.length - 2; b += 1) {
      for (let c = b + 1; c < cardIds.length - 1; c += 1) {
        for (let d = c + 1; d < cardIds.length; d += 1) {
          const cards = [cardIds[a], cardIds[b], cardIds[c], cardIds[d]];
          const hand = scoreHand(cards);
          const mask =
            bitByCardId.get(cards[0]) |
            bitByCardId.get(cards[1]) |
            bitByCardId.get(cards[2]) |
            bitByCardId.get(cards[3]);
          handStatsByMask.set(mask, {
            base: hand.base,
            quality: hand.quality,
          });
        }
      }
    }
  }

  const statsForSlots = (state, slots) => {
    let mask = 0;
    for (const slot of slots) mask |= bitByCardId.get(state[slot]);
    return handStatsByMask.get(mask);
  };

  const summarize = (lineStats, discardStats) => {
    let gridHandCount = 0;
    let gridBase = 0;
    let gridQualityHandCount = 0;

    for (let index = 0; index < lineStats.length; index += 1) {
      const stats = lineStats[index];
      if (stats.base <= 0) continue;
      gridHandCount += 1;
      gridBase += stats.base * LINE_DEFINITIONS[index].bonus;
      if (stats.quality) gridQualityHandCount += 1;
    }

    const discardScores = gridHandCount === 9 && discardStats.base > 0;
    const discardValue = discardScores ? discardStats.base * 3 : 0;
    const handCount = gridHandCount + Number(discardScores);
    const multiplier = multiplierForHandCount(handCount);
    const base = gridBase + discardValue;

    return {
      total: base * multiplier,
      base,
      multiplier,
      handCount,
      qualityHandCount: gridQualityHandCount + Number(discardScores && discardStats.quality),
      gridHandCount,
      gridBase,
      discardValue,
      discardScores,
      lineStats,
      discardStats,
    };
  };

  const evaluateState = (state) => {
    candidateEvaluations += 1;
    const lineStats = LINE_DEFINITIONS.map((line) => statsForSlots(state, line.indices));
    const discardStats = statsForSlots(state, [16, 17, 18, 19]);
    return summarize(lineStats, discardStats);
  };

  const lineIndexesBySlot = Array.from({ length: 20 }, () => []);
  LINE_DEFINITIONS.forEach((line, lineIndex) => {
    line.indices.forEach((slot) => lineIndexesBySlot[slot].push(lineIndex));
  });

  const evaluateSwap = (state, currentEvaluation, first, second) => {
    candidateEvaluations += 1;
    const affectedLineIndexes = new Set([
      ...lineIndexesBySlot[first],
      ...lineIndexesBySlot[second],
    ]);
    const lineStats = [...currentEvaluation.lineStats];
    affectedLineIndexes.forEach((lineIndex) => {
      lineStats[lineIndex] = statsForSlots(state, LINE_DEFINITIONS[lineIndex].indices);
    });
    const discardChanged = first >= 16 || second >= 16;
    const discardStats = discardChanged
      ? statsForSlots(state, [16, 17, 18, 19])
      : currentEvaluation.discardStats;
    return summarize(lineStats, discardStats);
  };

  return {
    evaluateState,
    evaluateSwap,
    get candidateEvaluations() {
      return candidateEvaluations;
    },
  };
}

function compareStateScores(a, b) {
  return compareScores(a, b);
}

function allCombinations4(cardIds) {
  const result = [];
  for (let a = 0; a < cardIds.length - 3; a += 1) {
    for (let b = a + 1; b < cardIds.length - 2; b += 1) {
      for (let c = b + 1; c < cardIds.length - 1; c += 1) {
        for (let d = c + 1; d < cardIds.length; d += 1) {
          const cards = [cardIds[a], cardIds[b], cardIds[c], cardIds[d]];
          const hand = scoreHand(cards);
          if (hand.base > 0) result.push({ cards, hand });
        }
      }
    }
  }

  result.sort((a, b) => {
    if (a.hand.base !== b.hand.base) return b.hand.base - a.hand.base;
    if (a.hand.quality !== b.hand.quality) return Number(b.hand.quality) - Number(a.hand.quality);
    return a.cards.join("").localeCompare(b.cards.join(""));
  });

  return result;
}

function remainingCards(cardIds, usedCards) {
  const used = new Set(usedCards);
  return cardIds.filter((cardId) => !used.has(cardId));
}

function makeStateFromParts(gridCards, discardCards) {
  return [...gridCards.slice(0, 16), ...discardCards.slice(0, 4)];
}

function stateDealKey(state) {
  return sortCardIds(state).join("|");
}

function placementToState(placement, expectedDealKey) {
  if (!placement?.grid || !placement?.discard || placement.grid.length !== 16 || placement.discard.length !== 4) {
    return null;
  }
  const state = makeStateFromParts(placement.grid, placement.discard);
  if (state.some((cardId) => !cardId)) return null;
  if (new Set(state).size !== 20) return null;
  if (expectedDealKey && stateDealKey(state) !== expectedDealKey) return null;
  return state;
}

function placeLineSeed(cardIds, candidate, lineSlots) {
  const grid = Array(16).fill(null);
  candidate.cards.forEach((cardId, index) => {
    grid[lineSlots[index]] = cardId;
  });

  const rest = remainingCards(sortCardIds(cardIds), candidate.cards);
  let restIndex = 0;
  for (let slot = 0; slot < 16; slot += 1) {
    if (!grid[slot]) {
      grid[slot] = rest[restIndex];
      restIndex += 1;
    }
  }

  return makeStateFromParts(grid, rest.slice(restIndex, restIndex + 4));
}

function placeCornerAndDiscardSeed(cardIds, cornerCandidate, discardCandidate, cornerOrder) {
  const grid = Array(16).fill(null);
  const cornerSlots = [0, 3, 12, 15];
  cornerOrder.forEach((candidateIndex, index) => {
    grid[cornerSlots[index]] = cornerCandidate.cards[candidateIndex];
  });

  const rest = remainingCards(sortCardIds(cardIds), [...cornerCandidate.cards, ...discardCandidate.cards]);
  let restIndex = 0;
  for (let slot = 0; slot < 16; slot += 1) {
    if (!grid[slot]) {
      grid[slot] = rest[restIndex];
      restIndex += 1;
    }
  }

  return makeStateFromParts(grid, discardCandidate.cards);
}

function placeCornerEdgesDiscardSeed(cardIds, cornerCandidate, discardCandidate, cornerOrder, edgeA, edgeB, mode) {
  const grid = Array(16).fill(null);
  const cornerSlots = [0, 3, 12, 15];
  cornerOrder.forEach((candidateIndex, index) => {
    grid[cornerSlots[index]] = cornerCandidate.cards[candidateIndex];
  });

  const slotPairs =
    mode === "rows"
      ? [
          [0, 1, 2, 3],
          [12, 13, 14, 15],
        ]
      : [
          [0, 4, 8, 12],
          [3, 7, 11, 15],
        ];

  const fillEdge = (edge, slots) => {
    const present = new Set(slots.map((slot) => grid[slot]).filter(Boolean));
    const extras = edge.cards.filter((cardId) => !present.has(cardId));
    let extraIndex = 0;
    for (const slot of slots) {
      if (!grid[slot]) {
        grid[slot] = extras[extraIndex];
        extraIndex += 1;
      }
    }
  };

  fillEdge(edgeA, slotPairs[0]);
  fillEdge(edgeB, slotPairs[1]);

  const used = [...grid.filter(Boolean), ...discardCandidate.cards];
  const rest = remainingCards(sortCardIds(cardIds), used);
  let restIndex = 0;
  for (let slot = 0; slot < 16; slot += 1) {
    if (!grid[slot]) {
      grid[slot] = rest[restIndex];
      restIndex += 1;
    }
  }

  return makeStateFromParts(grid, discardCandidate.cards);
}

function edgeCandidatesForPair(candidates, requiredPair, blockedCards) {
  return candidates
    .filter((candidate) => {
      if (!requiredPair.every((cardId) => candidate.cards.includes(cardId))) return false;
      return candidate.cards.every((cardId) => requiredPair.includes(cardId) || !blockedCards.has(cardId));
    })
    .slice(0, 10);
}

function uniqueStates(states) {
  const seen = new Set();
  return states.filter((state) => {
    const key = state.join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function makeStructuredStarts(cardIds, candidates, deadlineMs = Infinity, limits = {}) {
  const lineCandidateLimit = limits.lineCandidateLimit ?? 80;
  const cornerCandidateLimit = limits.cornerCandidateLimit ?? 40;
  const discardCandidateLimit = limits.discardCandidateLimit ?? 180;
  const cornerEdgeSpecLimit = limits.cornerEdgeSpecLimit ?? 900;
  const topCandidateLimit = limits.topCandidateLimit ?? 36;
  const maxStarts = limits.maxStarts ?? 1600;
  const sorted = sortCardIds(cardIds);
  const reversed = [...sorted].reverse();
  const suitSorted = [...cardIds].sort((a, b) => {
    const suitA = a.at(-1);
    const suitB = b.at(-1);
    if (suitA !== suitB) return suitA.localeCompare(suitB);
    return sortCardIds([a, b])[0] === a ? -1 : 1;
  });

  const starts = [
    makeStateFromParts(sorted.slice(0, 16), sorted.slice(16, 20)),
    makeStateFromParts(reversed.slice(0, 16), reversed.slice(16, 20)),
    makeStateFromParts(suitSorted.slice(0, 16), suitSorted.slice(16, 20)),
    makeStateFromParts([...suitSorted].reverse().slice(0, 16), [...suitSorted].reverse().slice(16, 20)),
  ];

  const lineSlots = [
    [0, 1, 2, 3],
    [12, 13, 14, 15],
    [0, 4, 8, 12],
    [3, 7, 11, 15],
    [0, 3, 12, 15],
  ];

  for (const candidate of candidates.slice(0, lineCandidateLimit)) {
    if (performance.now() >= deadlineMs) return uniqueStates(starts);
    const rest = remainingCards(sorted, candidate.cards);
    starts.push(makeStateFromParts(rest.slice(0, 16), candidate.cards));
    lineSlots.forEach((slots) => starts.push(placeLineSeed(cardIds, candidate, slots)));
    if (starts.length > maxStarts) return uniqueStates(starts);
  }

  const cornerOrders = [
    [0, 1, 2, 3],
    [0, 1, 3, 2],
    [0, 2, 1, 3],
    [0, 3, 1, 2],
    [1, 0, 2, 3],
    [2, 0, 1, 3],
  ];
  const discardPriority = {
    "straight-flush": 0,
    "four-kind": 1,
    "three-kind": 2,
    straight: 3,
    flush: 4,
    "two-pair": 5,
    pair: 6,
  };
  const cornerCandidates = candidates.slice(0, cornerCandidateLimit);
  const discardCandidates = [...candidates]
    .sort((a, b) => {
      const priorityA = discardPriority[a.hand.key] ?? 9;
      const priorityB = discardPriority[b.hand.key] ?? 9;
      if (priorityA !== priorityB) return priorityA - priorityB;
      if (a.hand.base !== b.hand.base) return b.hand.base - a.hand.base;
      return a.cards.join("").localeCompare(b.cards.join(""));
    })
    .slice(0, discardCandidateLimit);
  const cornerEdgeSpecs = [];
  cornerSpecLoop: for (const cornerCandidate of cornerCandidates) {
    if (performance.now() >= deadlineMs) break;
    for (const discardCandidate of discardCandidates) {
      if (performance.now() >= deadlineMs) break cornerSpecLoop;
      if (cornerCandidate.cards.some((cardId) => discardCandidate.cards.includes(cardId))) continue;
      for (const order of cornerOrders) {
        if (performance.now() >= deadlineMs) break cornerSpecLoop;
        const orderedCorners = order.map((index) => cornerCandidate.cards[index]);
        const topPair = [orderedCorners[0], orderedCorners[1]];
        const bottomPair = [orderedCorners[2], orderedCorners[3]];
        const leftPair = [orderedCorners[0], orderedCorners[2]];
        const rightPair = [orderedCorners[1], orderedCorners[3]];
        const blocked = new Set([...discardCandidate.cards, ...cornerCandidate.cards]);

        cornerEdgeSpecs.push({
          rough: cornerCandidate.hand.base * 2 + discardCandidate.hand.base * 3,
          kind: "corner-discard",
          cornerCandidate,
          discardCandidate,
          order,
        });

        const addEdgeSeeds = (firstPair, secondPair, mode) => {
          const firstEdges = edgeCandidatesForPair(candidates, firstPair, blocked);
          const secondEdges = edgeCandidatesForPair(candidates, secondPair, blocked);
          for (const firstEdge of firstEdges.slice(0, 5)) {
            for (const secondEdge of secondEdges.slice(0, 5)) {
              const firstExtras = firstEdge.cards.filter((cardId) => !firstPair.includes(cardId));
              const secondExtras = secondEdge.cards.filter((cardId) => !secondPair.includes(cardId));
              if (firstExtras.some((cardId) => secondExtras.includes(cardId))) continue;
              cornerEdgeSpecs.push({
                rough:
                  cornerCandidate.hand.base * 2 +
                  discardCandidate.hand.base * 3 +
                  firstEdge.hand.base +
                  secondEdge.hand.base,
                kind: "corner-edges-discard",
                cornerCandidate,
                discardCandidate,
                order,
                firstEdge,
                secondEdge,
                mode,
              });
            }
          }
        };

        addEdgeSeeds(topPair, bottomPair, "rows");
        addEdgeSeeds(leftPair, rightPair, "columns");
      }
    }
  }

  for (const spec of cornerEdgeSpecs.sort((a, b) => b.rough - a.rough).slice(0, cornerEdgeSpecLimit)) {
    if (starts.length > maxStarts) return uniqueStates(starts);
    if (spec.kind === "corner-discard") {
      starts.push(placeCornerAndDiscardSeed(cardIds, spec.cornerCandidate, spec.discardCandidate, spec.order));
    } else {
      starts.push(
        placeCornerEdgesDiscardSeed(
          cardIds,
          spec.cornerCandidate,
          spec.discardCandidate,
          spec.order,
          spec.firstEdge,
          spec.secondEdge,
          spec.mode,
        ),
      );
    }
  }

  const top = candidates.slice(0, topCandidateLimit);
  for (let firstIndex = 0; firstIndex < top.length; firstIndex += 1) {
    if (performance.now() >= deadlineMs) return uniqueStates(starts);
    for (let secondIndex = firstIndex + 1; secondIndex < top.length; secondIndex += 1) {
      if (performance.now() >= deadlineMs) return uniqueStates(starts);
      const first = top[firstIndex];
      const second = top[secondIndex];
      if (first.cards.some((cardId) => second.cards.includes(cardId))) continue;
      const grid = Array(16).fill(null);
      [0, 1, 2, 3].forEach((slot, index) => {
        grid[slot] = first.cards[index];
      });
      [12, 13, 14, 15].forEach((slot, index) => {
        grid[slot] = second.cards[index];
      });
      const rest = remainingCards(sorted, [...first.cards, ...second.cards]);
      let restIndex = 0;
      for (let slot = 0; slot < 16; slot += 1) {
        if (!grid[slot]) {
          grid[slot] = rest[restIndex];
          restIndex += 1;
        }
      }
      starts.push(makeStateFromParts(grid, rest.slice(restIndex, restIndex + 4)));
      if (starts.length > maxStarts) return uniqueStates(starts);
    }
  }

  return uniqueStates(starts);
}

function improveBySwaps(
  initialState,
  evaluator,
  maxPasses = 90,
  allowedSlots = null,
  deadlineMs = Infinity,
) {
  const state = [...initialState];
  const slots = allowedSlots ?? state.map((_, index) => index);
  let currentScore = evaluator.evaluateState(state);
  let passes = 0;

  while (passes < maxPasses && performance.now() < deadlineMs) {
    passes += 1;
    let bestSwap = null;
    let bestScore = currentScore;

    for (let firstIndex = 0; firstIndex < slots.length - 1; firstIndex += 1) {
      if (performance.now() >= deadlineMs) break;
      for (let secondIndex = firstIndex + 1; secondIndex < slots.length; secondIndex += 1) {
        const first = slots[firstIndex];
        const second = slots[secondIndex];
        [state[first], state[second]] = [state[second], state[first]];
        const candidateScore = evaluator.evaluateSwap(
          state,
          currentScore,
          first,
          second,
        );
        if (compareStateScores(candidateScore, bestScore) > 0) {
          bestScore = candidateScore;
          bestSwap = [first, second];
        }
        [state[first], state[second]] = [state[second], state[first]];
      }
    }

    if (!bestSwap) break;
    const [first, second] = bestSwap;
    [state[first], state[second]] = [state[second], state[first]];
    currentScore = bestScore;
  }

  return { state, score: currentScore, passes };
}

function anneal(
  initialState,
  evaluator,
  random,
  iterations,
  allowedSlots = null,
  deadlineMs = Infinity,
) {
  const state = [...initialState];
  const slots = allowedSlots ?? state.map((_, index) => index);
  let currentScore = evaluator.evaluateState(state);
  let bestState = [...state];
  let bestScore = currentScore;

  for (let step = 0; step < iterations && performance.now() < deadlineMs; step += 1) {
    const temperature = Math.max(12, 900 * (1 - step / iterations));
    const firstSlotIndex = Math.floor(random() * slots.length);
    let secondSlotIndex = Math.floor(random() * slots.length);
    if (secondSlotIndex === firstSlotIndex) secondSlotIndex = (secondSlotIndex + 1) % slots.length;
    const first = slots[firstSlotIndex];
    const second = slots[secondSlotIndex];

    [state[first], state[second]] = [state[second], state[first]];
    const nextScore = evaluator.evaluateSwap(
      state,
      currentScore,
      first,
      second,
    );
    const delta = nextScore.total - currentScore.total;
    const accept = delta >= 0 || Math.exp(delta / temperature) > random();

    if (accept) {
      currentScore = nextScore;
      if (compareStateScores(nextScore, bestScore) > 0) {
        bestScore = nextScore;
        bestState = [...state];
      }
    } else {
      [state[first], state[second]] = [state[second], state[first]];
    }
  }

  return { state: bestState, score: bestScore };
}

function addSolution(solutions, state, score, source) {
  const placement = stateToPlacement(state);
  const completeScore = score?.lines ? score : scoreState(state);
  const placementKey = canonicalPlacementKey(placement.grid, placement.discard);
  const solution = {
    ...placement,
    score: completeScore,
    source,
    key: placementKey,
    placementKey,
  };
  const structureKey = solutionStructureKey(solution);
  const existing = solutions.get(structureKey);
  if (!existing || compareScores(completeScore, existing.score) > 0) {
    solutions.set(structureKey, { ...solution, structureKey });
  }
}

function rankStartStates(states, evaluator) {
  return uniqueStates(states)
    .map((state) => ({ state, score: evaluator.evaluateState(state) }))
    .sort((a, b) => {
      if (a.score.handCount !== b.score.handCount) return b.score.handCount - a.score.handCount;
      return compareScores(b.score, a.score);
    });
}

export function solveFantasylandHeuristic(cardIds, options = {}) {
  if (cardIds.length !== 20) {
    throw new Error("Fantasyland optimizer requires exactly 20 cards.");
  }

  const startedAt = performance.now();
  const timeLimitMs = options.timeLimitMs ?? 4200;
  const deadlineMs = startedAt + timeLimitMs;
  const incumbentTotal = options.incumbentTotal ?? 0;
  const fastMode = Boolean(options.fastMode);
  const continuationIndex =
    Number.isFinite(Number(options.continuationIndex)) &&
    Number(options.continuationIndex) > 0
      ? Math.floor(Number(options.continuationIndex))
      : 0;
  const requestedSeed = Number(options.seed ?? 20260701) >>> 0;
  const random = mulberry32(
    (requestedSeed ^ Math.imul(continuationIndex, 0x9e3779b9)) >>> 0,
  );
  const expectedDealKey = stateDealKey(cardIds);
  const evaluator = createFastStateEvaluator(cardIds);
  const initialStates = (options.initialPlacements ?? [])
    .map((placement) => placementToState(placement, expectedDealKey))
    .filter(Boolean);
  const candidates = allCombinations4(cardIds);
  const startBuildBudgetMs = fastMode ? Math.min(2500, Math.max(500, timeLimitMs * 0.18)) : timeLimitMs;
  const startDeadlineMs = Math.min(deadlineMs, startedAt + startBuildBudgetMs);
  const structuredStarts =
    continuationIndex > 0
      ? []
      : makeStructuredStarts(
          cardIds,
          candidates,
          startDeadlineMs,
          fastMode
            ? {
                lineCandidateLimit: 50,
                cornerCandidateLimit: 28,
                discardCandidateLimit: 120,
                cornerEdgeSpecLimit: 520,
                topCandidateLimit: 28,
                maxStarts: 620,
              }
            : {},
        );
  const starts = rankStartStates(
    [
      ...initialStates,
      ...structuredStarts,
      ...(initialStates.length === 0 && continuationIndex > 0
        ? [shuffle(cardIds, random)]
        : []),
    ],
    evaluator,
  );
  const solutions = new Map();
  let attempts = 0;
  const structuredPasses = options.structuredPasses ?? (fastMode ? 70 : 90);
  const randomAnnealIterations = options.randomAnnealIterations ?? (fastMode ? 3200 : 4800);
  const randomPasses = options.randomPasses ?? (fastMode ? 48 : 70);
  const structuredDeadlineMs = Math.min(
    deadlineMs,
    continuationIndex > 0
      ? startedAt
      : startedAt + timeLimitMs * (fastMode ? 0.58 : 0.64),
  );
  const annealingPortfolio = [];

  starts.slice(0, 6).forEach((state) => {
    addSolution(solutions, state.state, state.score, "baseline");
    annealingPortfolio.push([...state.state]);
    attempts += 1;
  });

  for (const start of starts) {
    if (performance.now() >= structuredDeadlineMs) break;
    const improved = improveBySwaps(
      start.state,
      evaluator,
      structuredPasses,
      null,
      structuredDeadlineMs,
    );
    addSolution(solutions, improved.state, improved.score, "structured");
    if (annealingPortfolio.length < 24) annealingPortfolio.push([...improved.state]);
    attempts += 1;
  }

  while (performance.now() < deadlineMs) {
    const portfolioRoll = random();
    const initialState =
      portfolioRoll < 0.45 || annealingPortfolio.length === 0
        ? shuffle(cardIds, random)
        : [...annealingPortfolio[Math.floor(random() * annealingPortfolio.length)]];
    if (portfolioRoll >= 0.8) {
      const perturbations = 3 + Math.floor(random() * 5);
      for (let index = 0; index < perturbations; index += 1) {
        const first = Math.floor(random() * initialState.length);
        let second = Math.floor(random() * initialState.length);
        if (second === first) second = (second + 1) % initialState.length;
        [initialState[first], initialState[second]] = [
          initialState[second],
          initialState[first],
        ];
      }
    }
    const annealed = anneal(
      initialState,
      evaluator,
      random,
      randomAnnealIterations,
      null,
      deadlineMs,
    );
    const improved = improveBySwaps(
      annealed.state,
      evaluator,
      randomPasses,
      null,
      deadlineMs,
    );
    addSolution(solutions, improved.state, improved.score, "random");
    if (annealingPortfolio.length < 36) annealingPortfolio.push([...improved.state]);
    attempts += 1;
  }

  const ranked = [...solutions.values()].sort((a, b) => compareScores(b.score, a.score));
  const bestByHandCount = Array.from({ length: 11 }, (_, handCount) => {
    const solution = ranked.find((item) => item.score.handCount === handCount);
    const upperBound = theoreticalMaxTotalForHandCount(handCount);
    const boundedByIncumbent = upperBound <= incumbentTotal;
    return solution
      ? {
          handCount,
          total: solution.score.total,
          base: solution.score.base,
          qualityHandCount: solution.score.qualityHandCount,
          source: solution.source,
          upperBound,
          status: "found",
        }
      : {
          handCount,
          total: null,
          base: null,
          qualityHandCount: null,
          source: null,
          upperBound,
          status: boundedByIncumbent ? "bounded" : "not-found",
        };
  }).reverse();

  return {
    best: ranked[0] ?? null,
    solutions: ranked.slice(0, options.maxSolutions ?? 24),
    bestByHandCount,
    attempts,
    candidateEvaluations: evaluator.candidateEvaluations,
    elapsedMs: performance.now() - startedAt,
    candidateCount: candidates.length,
    incumbentTotal,
    continuationIndex,
    searchOrder:
      continuationIndex > 0
        ? "A continuation pass keeps prior leaders, skips the already-run structural opening, and follows fresh annealing trajectories; final ranking still uses actual money."
        : "A mixed portfolio reserves time for structured starts and longer annealing trajectories; fast incremental line scoring lets the search evaluate more placements while final ranking still uses actual money.",
  };
}

export const __heuristicTestHooks = {
  createFastStateEvaluator,
};
