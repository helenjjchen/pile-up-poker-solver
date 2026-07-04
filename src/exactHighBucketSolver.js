import {
  compareScores,
  multiplierForHandCount,
  scoreHand,
  scorePlacement,
  theoreticalMaxTotalForHandCount,
} from "./scoring.js";
import { canonicalPlacementKey } from "./symmetry.js";

const MASK_COUNT = 1 << 20;
const ALL_MASK_20 = MASK_COUNT - 1;
const PERMUTATIONS_4 = buildPermutations4();

function buildPermutations4() {
  const result = [];
  const used = Array(4).fill(false);
  const current = [];

  function visit() {
    if (current.length === 4) {
      result.push([...current]);
      return;
    }
    for (let index = 0; index < 4; index += 1) {
      if (used[index]) continue;
      used[index] = true;
      current.push(index);
      visit();
      current.pop();
      used[index] = false;
    }
  }

  visit();
  return result;
}

function indexesFromMask(mask) {
  const indexes = [];
  for (let index = 0; index < 20; index += 1) {
    if (mask & (1 << index)) indexes.push(index);
  }
  return indexes;
}

function lowestBitIndex(mask) {
  return Math.clz32(mask & -mask) ^ 31;
}

function combinations4(length, callback) {
  for (let a = 0; a < length - 3; a += 1) {
    for (let b = a + 1; b < length - 2; b += 1) {
      for (let c = b + 1; c < length - 1; c += 1) {
        for (let d = c + 1; d < length; d += 1) {
          callback((1 << a) | (1 << b) | (1 << c) | (1 << d), [a, b, c, d]);
        }
      }
    }
  }
}

function fourCardSubmasks(mask, callback) {
  const indexes = indexesFromMask(mask);
  for (let a = 0; a < indexes.length - 3; a += 1) {
    for (let b = a + 1; b < indexes.length - 2; b += 1) {
      for (let c = b + 1; c < indexes.length - 1; c += 1) {
        for (let d = c + 1; d < indexes.length; d += 1) {
          callback((1 << indexes[a]) | (1 << indexes[b]) | (1 << indexes[c]) | (1 << indexes[d]));
        }
      }
    }
  }
}

function buildMetadata(cardIds) {
  const values = new Int16Array(MASK_COUNT);
  const positives = [];
  const allDiscards = [];

  combinations4(cardIds.length, (mask, indexes) => {
    const cards = indexes.map((index) => cardIds[index]);
    const value = scoreHand(cards).base;
    values[mask] = value;
    allDiscards.push({ mask, value });
    if (value > 0) positives.push({ mask, value });
  });

  const byValueThenMask = (a, b) => {
    if (a.value !== b.value) return b.value - a.value;
    return a.mask - b.mask;
  };
  positives.sort(byValueThenMask);
  allDiscards.sort(byValueThenMask);

  return { values, positives, allDiscards };
}

function rowBits(rowMask) {
  return indexesFromMask(rowMask).map((index) => 1 << index);
}

function scoreFromParts(gridBase, gridHandCount, discardBonus = 0) {
  const discardScores = gridHandCount === 9 && discardBonus > 0;
  const handCount = gridHandCount + (discardScores ? 1 : 0);
  const base = gridBase + (discardScores ? discardBonus : 0);
  const multiplier = multiplierForHandCount(handCount);
  return {
    total: base * multiplier,
    base,
    multiplier,
    handCount,
  };
}

function addSolution(solutions, placement) {
  if (!placement) return;
  const key = canonicalPlacementKey(placement.grid, placement.discard);
  const existing = solutions.get(key);
  if (!existing || compareScores(placement.score, existing.score) > 0) {
    solutions.set(key, { ...placement, key });
  }
}

class ExactHighBucketSearch {
  constructor(cardIds, options = {}) {
    this.cardIds = cardIds;
    this.metadata = buildMetadata(cardIds);
    this.startedAt = performance.now();
    this.timeLimitMs = options.timeLimitMs ?? 5000;
    this.minGridHandCount = options.minGridHandCount ?? 8;
    this.maxGridHandCount = options.maxGridHandCount ?? 9;
    this.maxColumnHandCount = options.maxColumnHandCount ?? 4;
    this.includeFourPositiveRows = options.includeFourPositiveRows ?? true;
    this.includeThreePositiveRows = Boolean(options.includeThreePositiveRows);
    this.includeTwoOrFewerPositiveRows = Boolean(options.includeTwoOrFewerPositiveRows);
    this.sourceLabel = options.sourceLabel ?? "exact geometry";
    this.best = options.incumbentSolution
      ? {
          total: options.incumbentSolution.score.total,
          base: options.incumbentSolution.score.base,
          handCount: options.incumbentSolution.score.handCount,
          gridHandCount: options.incumbentSolution.score.gridHandCount,
          placement: options.incumbentSolution,
        }
      : {
          total: options.incumbentTotal ?? 0,
          base: 0,
          handCount: 0,
          gridHandCount: 0,
          placement: null,
        };
    this.rowMasks = Array(4).fill(0);
    this.colMasks = Array(4).fill(0);
    this.rowPartitions = 0;
    this.threeRowPartitions = 0;
    this.lowRowPartitions = 0;
    this.columnPartitions = 0;
    this.discardsChecked = 0;
    this.threeRowDiscardsChecked = 0;
    this.lowRowDiscardsChecked = 0;
    this.exhaustedFourRowSearch = false;
    this.exhaustedThreeRowSearch = false;
    this.exhaustedLowRowSearch = false;
    this.timedOut = false;
    this.solutionMap = new Map();
    if (options.incumbentSolution) addSolution(this.solutionMap, options.incumbentSolution);
  }

  overTime() {
    if (this.timeLimitMs <= 0) return false;
    if (performance.now() - this.startedAt > this.timeLimitMs) {
      this.timedOut = true;
      return true;
    }
    return false;
  }

  rowCandidates(remaining) {
    const lowBit = 1 << lowestBitIndex(remaining);
    return this.metadata.positives
      .filter((candidate) => (candidate.mask & lowBit) !== 0 && (candidate.mask & ~remaining) === 0)
      .map((candidate) => candidate.mask);
  }

  optimisticRowValue(candidates, remaining, needed) {
    let total = 0;
    let count = 0;
    for (const candidate of candidates) {
      if ((candidate & ~remaining) !== 0) continue;
      total += this.metadata.values[candidate];
      count += 1;
      if (count === needed) return total;
    }
    return -1;
  }

  cornerUpperBoundForRows() {
    let best = 0;
    const pairsByRow = this.rowMasks.map((rowMask) => {
      const bits = rowBits(rowMask);
      const pairs = [];
      for (let first = 0; first < 3; first += 1) {
        for (let second = first + 1; second < 4; second += 1) {
          pairs.push(bits[first] | bits[second]);
        }
      }
      return pairs;
    });

    for (let rowA = 0; rowA < 3; rowA += 1) {
      for (let rowB = rowA + 1; rowB < 4; rowB += 1) {
        for (const firstPair of pairsByRow[rowA]) {
          for (const secondPair of pairsByRow[rowB]) {
            best = Math.max(best, this.metadata.values[firstPair | secondPair]);
          }
        }
      }
    }

    return best;
  }

  bestCornerForCells(cells, allowScoringCorner = true) {
    let bestValue = 0;
    let bestRows = [0, 1];
    let bestCols = [0, 1];
    let bestMask = 0;

    for (let rowA = 0; rowA < 3; rowA += 1) {
      for (let rowB = rowA + 1; rowB < 4; rowB += 1) {
        for (let colA = 0; colA < 3; colA += 1) {
          for (let colB = colA + 1; colB < 4; colB += 1) {
            const mask = cells[rowA][colA] | cells[rowA][colB] | cells[rowB][colA] | cells[rowB][colB];
            const value = this.metadata.values[mask];
            if (!allowScoringCorner && value === 0) {
              return { value: 0, rows: [rowA, rowB], cols: [colA, colB], mask };
            }
            if (value > bestValue) {
              bestValue = value;
              bestRows = [rowA, rowB];
              bestCols = [colA, colB];
              bestMask = mask;
            }
          }
        }
      }
    }

    if (!allowScoringCorner) return null;
    return { value: bestValue, rows: bestRows, cols: bestCols, mask: bestMask };
  }

  materializeGrid(rows, cols, corner) {
    const rowOrder = [
      corner.rows[0],
      ...[0, 1, 2, 3].filter((index) => !corner.rows.includes(index)),
      corner.rows[1],
    ];
    const colOrder = [
      corner.cols[0],
      ...[0, 1, 2, 3].filter((index) => !corner.cols.includes(index)),
      corner.cols[1],
    ];
    const grid = [];

    for (const rowIndex of rowOrder) {
      for (const colIndex of colOrder) {
        const cell = rows[rowIndex] & cols[colIndex];
        grid.push(this.cardIds[lowestBitIndex(cell)]);
      }
    }

    return grid;
  }

  maybeRecordBest(rowValue, colValue, corner, discardBonus, discardMask, columnHandCount, rowHandCount) {
    const gridHandCount = rowHandCount + columnHandCount + (corner.value > 0 ? 1 : 0);
    if (gridHandCount < this.minGridHandCount) return;
    if (gridHandCount > this.maxGridHandCount) return;
    const gridBase = rowValue + colValue + corner.value * 2;
    const parts = scoreFromParts(gridBase, gridHandCount, discardBonus);
    if (parts.total <= this.best.total) return;

    const discard = indexesFromMask(discardMask).map((index) => this.cardIds[index]);
    const grid = this.materializeGrid(this.rowMasks, this.colMasks, corner);
    const score = scorePlacement(grid, discard);
    if (score.total !== parts.total) return;

    const placement = {
      grid,
      discard,
      score,
      source: this.sourceLabel,
    };
    this.best = {
      total: score.total,
      base: score.base,
      handCount: score.handCount,
      gridHandCount: score.gridHandCount,
      placement,
    };
    addSolution(this.solutionMap, placement);
  }

  evaluateColumnsByPermutation(rowValue, discardBonus, discardMask, rowHandCount) {
    const rowCellBits = this.rowMasks.map(rowBits);
    const cornerUpper = this.cornerUpperBoundForRows();

    let optimisticColumns = 0;
    for (let col0 = 0; col0 < 4; col0 += 1) {
      let bestForColumn = 0;
      for (let col1 = 0; col1 < 4; col1 += 1) {
        for (let col2 = 0; col2 < 4; col2 += 1) {
          for (let col3 = 0; col3 < 4; col3 += 1) {
            const mask = rowCellBits[0][col0] | rowCellBits[1][col1] | rowCellBits[2][col2] | rowCellBits[3][col3];
            bestForColumn = Math.max(bestForColumn, this.metadata.values[mask]);
          }
        }
      }
      optimisticColumns += bestForColumn;
    }

    const optimisticBaseHandCount = rowHandCount + 4;
    const optimisticCornerUpper = optimisticBaseHandCount < this.maxGridHandCount ? cornerUpper : 0;
    const optimisticGridBase = rowValue + optimisticColumns + optimisticCornerUpper * 2;
    const optimisticGridHandCount = optimisticBaseHandCount + (optimisticCornerUpper > 0 ? 1 : 0);
    if (optimisticGridHandCount < this.minGridHandCount) return;
    const optimisticTotal = scoreFromParts(
      optimisticGridBase,
      Math.min(optimisticGridHandCount, this.maxGridHandCount),
      discardBonus,
    ).total;
    if (optimisticTotal <= this.best.total) return;

    for (const p1 of PERMUTATIONS_4) {
      if (this.overTime()) return;
      for (const p2 of PERMUTATIONS_4) {
        for (const p3 of PERMUTATIONS_4) {
          const cells = [
            rowCellBits[0],
            [rowCellBits[1][p1[0]], rowCellBits[1][p1[1]], rowCellBits[1][p1[2]], rowCellBits[1][p1[3]]],
            [rowCellBits[2][p2[0]], rowCellBits[2][p2[1]], rowCellBits[2][p2[2]], rowCellBits[2][p2[3]]],
            [rowCellBits[3][p3[0]], rowCellBits[3][p3[1]], rowCellBits[3][p3[2]], rowCellBits[3][p3[3]]],
          ];

          let colValue = 0;
          let columnHandCount = 0;
          for (let col = 0; col < 4; col += 1) {
            const mask = cells[0][col] | cells[1][col] | cells[2][col] | cells[3][col];
            this.colMasks[col] = mask;
            const value = this.metadata.values[mask];
            if (value > 0) columnHandCount += 1;
            colValue += value;
          }
          if (columnHandCount > this.maxColumnHandCount) continue;
          const baseGridHandCount = rowHandCount + columnHandCount;
          if (baseGridHandCount > this.maxGridHandCount) continue;
          const candidateCornerUpper = baseGridHandCount < this.maxGridHandCount ? cornerUpper : 0;
          const upperGridHandCount = baseGridHandCount + (candidateCornerUpper > 0 ? 1 : 0);
          if (upperGridHandCount < this.minGridHandCount) continue;
          this.columnPartitions += 1;

          const candidateUpper = scoreFromParts(
            rowValue + colValue + candidateCornerUpper * 2,
            Math.min(upperGridHandCount, this.maxGridHandCount),
            discardBonus,
          ).total;
          if (candidateUpper <= this.best.total) continue;

          const corner = this.bestCornerForCells(cells, baseGridHandCount < this.maxGridHandCount);
          if (!corner) continue;
          this.maybeRecordBest(rowValue, colValue, corner, discardBonus, discardMask, columnHandCount, rowHandCount);
        }
      }
    }
  }

  searchRows(remaining, depth, rowValue, discardBonus, discardMask) {
    if (this.overTime()) return;
    if (depth === 4) {
      if (remaining !== 0) return;
      this.rowPartitions += 1;
      this.evaluateColumnsByPermutation(rowValue, discardBonus, discardMask, 4);
      return;
    }

    const candidates = this.rowCandidates(remaining);
    const optimistic = this.optimisticRowValue(candidates, remaining, 4 - depth);
    if (optimistic < 0) return;
    const optimisticGridBase = rowValue + optimistic + 3600 + 900;
    const optimisticGridHandCount = 4 + 4 + 1;
    const optimisticTotal = scoreFromParts(
      optimisticGridBase,
      Math.min(optimisticGridHandCount, this.maxGridHandCount),
      discardBonus,
    ).total;
    if (optimisticTotal <= this.best.total) return;

    for (const candidate of candidates) {
      this.rowMasks[depth] = candidate;
      this.searchRows(remaining ^ candidate, depth + 1, rowValue + this.metadata.values[candidate], discardBonus, discardMask);
      if (this.timedOut) return;
    }
  }

  searchThreePositiveRows(remaining, depth, rowValue, discardBonus, discardMask, deadRowMask) {
    if (this.overTime()) return;
    if (depth === 3) {
      if (remaining !== 0) return;
      this.rowMasks[3] = deadRowMask;
      this.threeRowPartitions += 1;
      this.evaluateColumnsByPermutation(rowValue, discardBonus, discardMask, 3);
      return;
    }

    const candidates = this.rowCandidates(remaining);
    const optimistic = this.optimisticRowValue(candidates, remaining, 3 - depth);
    if (optimistic < 0) return;
    const optimisticGridBase = rowValue + optimistic + 1800 + 900;
    const optimisticGridHandCount = 3 + 4 + 1;
    const optimisticTotal = scoreFromParts(
      optimisticGridBase,
      Math.min(optimisticGridHandCount, this.maxGridHandCount),
      discardBonus,
    ).total;
    if (optimisticTotal <= this.best.total) return;

    for (const candidate of candidates) {
      this.rowMasks[depth] = candidate;
      this.searchThreePositiveRows(
        remaining ^ candidate,
        depth + 1,
        rowValue + this.metadata.values[candidate],
        discardBonus,
        discardMask,
        deadRowMask,
      );
      if (this.timedOut) return;
    }
  }

  searchOneDeadRow(board, discardBonus, discardMask) {
    fourCardSubmasks(board, (deadRowMask) => {
      if (this.timedOut || this.overTime()) return;
      if (this.metadata.values[deadRowMask] > 0) return;
      const remaining = board ^ deadRowMask;
      this.searchThreePositiveRows(remaining, 0, 0, discardBonus, discardMask, deadRowMask);
    });
  }

  searchLowRows(remaining, depth, rowValue, rowHandCount, discardBonus, discardMask) {
    if (this.overTime()) return;
    if (depth === 4) {
      if (remaining !== 0 || rowHandCount > 2) return;
      this.lowRowPartitions += 1;
      this.evaluateColumnsByPermutation(rowValue, discardBonus, discardMask, rowHandCount);
      return;
    }

    const lowBit = 1 << lowestBitIndex(remaining);
    fourCardSubmasks(remaining, (candidate) => {
      if (this.timedOut || this.overTime()) return;
      if ((candidate & lowBit) === 0) return;
      const value = this.metadata.values[candidate];
      const nextRowHandCount = rowHandCount + (value > 0 ? 1 : 0);
      if (nextRowHandCount > 2) return;
      const rowsLeft = 3 - depth;
      const positiveRowsLeft = 2 - nextRowHandCount;
      const optimisticRowValue = rowValue + value + Math.min(rowsLeft, positiveRowsLeft) * 450;
      const optimisticGridBase = optimisticRowValue + this.maxColumnHandCount * 450 + 900;
      const optimisticGridHandCount = Math.min(
        this.maxGridHandCount,
        nextRowHandCount + this.maxColumnHandCount + 1,
      );
      if (scoreFromParts(optimisticGridBase, optimisticGridHandCount, discardBonus).total <= this.best.total) return;
      this.searchLowRows(remaining ^ candidate, depth + 1, rowValue + value, nextRowHandCount, discardBonus, discardMask);
    });
  }

  solve() {
    if (this.includeFourPositiveRows) {
      for (const discard of this.metadata.allDiscards) {
        if (this.overTime()) break;
        this.discardsChecked += 1;
        const board = ALL_MASK_20 ^ discard.mask;
        const discardBonus = discard.value * 3;
        const absoluteGridUpper = 450 * 8 + 900;
        const absoluteGridHandCount = Math.min(9, this.maxGridHandCount);
        const absoluteTotalUpper = scoreFromParts(absoluteGridUpper, absoluteGridHandCount, discardBonus).total;
        if (absoluteTotalUpper <= this.best.total) continue;
        this.searchRows(board, 0, 0, discardBonus, discard.mask);
      }
      this.exhaustedFourRowSearch =
        !this.timedOut && this.discardsChecked === this.metadata.allDiscards.length;
    } else {
      this.exhaustedFourRowSearch = true;
    }

    if (!this.includeThreePositiveRows || this.timedOut) {
      if (!this.includeTwoOrFewerPositiveRows || this.timedOut) return;
    } else {
      for (const discard of this.metadata.allDiscards) {
        if (this.overTime()) break;
        this.threeRowDiscardsChecked += 1;
        const board = ALL_MASK_20 ^ discard.mask;
        const absoluteGridUpper = 3 * 450 + 4 * 450 + 900;
        const absoluteTotalUpper = scoreFromParts(absoluteGridUpper, Math.min(8, this.maxGridHandCount), 0).total;
        if (absoluteTotalUpper <= this.best.total) continue;
        this.searchOneDeadRow(board, discard.value * 3, discard.mask);
      }
      this.exhaustedThreeRowSearch =
        !this.timedOut && this.threeRowDiscardsChecked === this.metadata.allDiscards.length;
      if (!this.includeTwoOrFewerPositiveRows || this.timedOut) return;
    }

    for (const discard of this.metadata.allDiscards) {
      if (this.overTime()) break;
      this.lowRowDiscardsChecked += 1;
      const board = ALL_MASK_20 ^ discard.mask;
      const absoluteGridUpper = 2 * 450 + this.maxColumnHandCount * 450 + 900;
      const absoluteGridHandCount = Math.min(this.maxGridHandCount, 2 + this.maxColumnHandCount + 1);
      const absoluteTotalUpper = scoreFromParts(absoluteGridUpper, absoluteGridHandCount, 0).total;
      if (absoluteTotalUpper <= this.best.total) continue;
      this.searchLowRows(board, 0, 0, 0, discard.value * 3, discard.mask);
    }
    this.exhaustedLowRowSearch =
      !this.timedOut && this.lowRowDiscardsChecked === this.metadata.allDiscards.length;
  }
}

function bucketSummaries(best, exhausted, provenOptimal) {
  return Array.from({ length: 11 }, (_, index) => {
    const handCount = 10 - index;
    const upperBound = theoreticalMaxTotalForHandCount(handCount);
    if (best?.score.handCount === handCount) {
      return {
        handCount,
        total: best.score.total,
        base: best.score.base,
        qualityHandCount: best.score.qualityHandCount,
        source: best.source,
        upperBound,
        status: provenOptimal || exhausted ? "proven" : "found",
      };
    }
    return {
      handCount,
      total: null,
      base: null,
      qualityHandCount: null,
      source: null,
      upperBound,
      status:
        provenOptimal || (exhausted && handCount <= 7 && best?.score.total > theoreticalMaxTotalForHandCount(handCount))
          ? "bounded"
          : "not-found",
    };
  });
}

export function solveFantasylandExactHighBuckets(cardIds, options = {}) {
  if (cardIds.length !== 20) {
    throw new Error("Fantasyland exact high-bucket solver requires exactly 20 cards.");
  }

  const search = new ExactHighBucketSearch(cardIds, options);
  search.solve();

  const solutions = [...search.solutionMap.values()].sort((a, b) => compareScores(b.score, a.score));
  const best = search.best.placement ?? solutions[0] ?? null;
  const exhaustedHighBuckets = search.exhaustedFourRowSearch && search.minGridHandCount >= 8;
  const exhaustedThreePlusRows =
    (search.exhaustedFourRowSearch && search.exhaustedThreeRowSearch && search.minGridHandCount <= 0) ||
    Boolean(options.threePlusRowsAlreadyExhausted);
  const exhaustedLowRows = search.exhaustedLowRowSearch && search.includeTwoOrFewerPositiveRows;
  const lowTwoRowCeiling = theoreticalMaxTotalForHandCount(5);
  const highBucketsCovered = exhaustedHighBuckets || Boolean(options.highBucketsAlreadyExhausted);
  const threePlusRowsCovered = exhaustedThreePlusRows || Boolean(options.threePlusRowsAlreadyExhausted);
  const provenOptimal =
    Boolean(best) &&
    highBucketsCovered &&
    (best.score.total > theoreticalMaxTotalForHandCount(7) ||
      (threePlusRowsCovered && (best.score.total > lowTwoRowCeiling || exhaustedLowRows)));

  return {
    best,
    solutions: solutions.slice(0, options.maxSolutions ?? 24),
    bestByHandCount: bucketSummaries(best, exhaustedHighBuckets, provenOptimal),
    attempts: search.rowPartitions + search.threeRowPartitions + search.lowRowPartitions + search.columnPartitions,
    elapsedMs: performance.now() - search.startedAt,
    candidateCount: search.metadata.allDiscards.length,
    exact: provenOptimal,
    exhaustedHighBuckets,
    exhaustedThreePlusRows,
    exhaustedLowRows,
    highBucketsCovered,
    threePlusRowsCovered,
    lowTwoRowCeiling,
    timedOut: search.timedOut,
    checkedDiscards: search.discardsChecked,
    checkedThreeRowDiscards: search.threeRowDiscardsChecked,
    checkedLowRowDiscards: search.lowRowDiscardsChecked,
    rowPartitions: search.rowPartitions,
    threeRowPartitions: search.threeRowPartitions,
    lowRowPartitions: search.lowRowPartitions,
    columnPartitions: search.columnPartitions,
    searchOrder:
      "Exact search over every 8-, 9-, and 10-hand placement first. If exhausted above the 7-hand ceiling, the result is certified optimal.",
  };
}
