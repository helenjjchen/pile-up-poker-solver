import {
  CARD_BY_ID,
  DECK,
  SAMPLE_FANTASYLAND_DEAL,
  SUIT_META,
  canonicalizeDeal,
  canonicalDealKey,
  cardLabel,
  sortCardIds,
  translatePlacementToDeal,
} from "./cards.js";
import { solveFantasylandExactHighBuckets } from "./exactHighBucketSolver.js?v=exact-cache-4";
import { solveFantasylandHeuristic } from "./heuristicSolver.js?v=exact-cache-4";
import { compareScores, scorePlacement, theoreticalMaxTotalForHandCount } from "./scoring.js";

const selected = new Set();
let latestResult = null;
let activeSolutionIndex = 0;
let seededBestKnown = new Map();
let sharedBestKnown = new Map();
let localBestKnown = new Map();
let exactProofStatuses = new Map();
let optimizerTimerInterval = null;
let optimizerTimerStartedAt = 0;
let optimizerTimerBudget = 0;
let optimizerTimerPhase = "Working";

const deckGrid = document.querySelector("#deckGrid");
const selectedCount = document.querySelector("#selectedCount");
const optimizeButton = document.querySelector("#optimizeButton");
const clearButton = document.querySelector("#clearButton");
const loadSampleButton = document.querySelector("#loadSampleButton");
const searchDepth = document.querySelector("#searchDepth");
const statusLine = document.querySelector("#statusLine");
const optimizerTimer = document.querySelector("#optimizerTimer");
const optimizerTimerText = document.querySelector("#optimizerTimerText");
const topScore = document.querySelector("#topScore");
const resultModeLabel = document.querySelector("#resultModeLabel");
const resultTotal = document.querySelector("#resultTotal");
const resultBase = document.querySelector("#resultBase");
const resultHands = document.querySelector("#resultHands");
const resultMultiplier = document.querySelector("#resultMultiplier");
const resultQuality = document.querySelector("#resultQuality");
const bestKnownSummary = document.querySelector("#bestKnownSummary");
const showBestKnownButton = document.querySelector("#showBestKnownButton");
const proofSummary = document.querySelector("#proofSummary");
const boardGrid = document.querySelector("#boardGrid");
const discardCards = document.querySelector("#discardCards");
const solutionsRow = document.querySelector("#solutionsRow");
const bucketList = document.querySelector("#bucketList");
const breakdownList = document.querySelector("#breakdownList");
const runtimeInfo = document.querySelector("#runtimeInfo");
const BEST_KNOWN_STORAGE_KEY = "pile-up-poker.best-known-fantasyland.v2";
const LEGACY_BEST_KNOWN_STORAGE_KEY = "pile-up-poker.best-known-fantasyland.v1";
const EXACT_PROGRESS_STORAGE_KEY = "pile-up-poker.exact-progress.v2";

function money(value) {
  return `$${value.toLocaleString()}`;
}

function formatDuration(ms) {
  return `${Math.max(0, ms / 1000).toFixed(1)}s`;
}

function dealKey(cardIds) {
  return sortCardIds(cardIds).join(" ");
}

function selectedCards() {
  return sortCardIds([...selected]);
}

function searchBudgetLabel() {
  const seconds = Math.round(Number(searchDepth.value) / 1000);
  const selectedOption = searchDepth.selectedOptions?.[0]?.textContent?.split("·")[0]?.trim() ?? "Search";
  const heuristicSeconds = Math.round((Math.max(750, Math.floor(Number(searchDepth.value) * 0.45)) / 1000) * 10) / 10;
  const exactSeconds = Math.round(((Number(searchDepth.value) - Math.max(750, Math.floor(Number(searchDepth.value) * 0.45))) / 1000) * 10) / 10;
  return `${selectedOption}: ${seconds}s total (${heuristicSeconds}s search + ${exactSeconds}s proof)`;
}

function renderOptimizerTimer() {
  if (!optimizerTimerStartedAt) return;
  const elapsed = performance.now() - optimizerTimerStartedAt;
  optimizerTimerText.textContent = `${optimizerTimerPhase} · ${formatDuration(elapsed)} / ${formatDuration(optimizerTimerBudget)}`;
}

function startOptimizerTimer(totalMs, phase = "Working") {
  window.clearInterval(optimizerTimerInterval);
  optimizerTimerStartedAt = performance.now();
  optimizerTimerBudget = totalMs;
  optimizerTimerPhase = phase;
  optimizerTimer.classList.remove("is-hidden");
  optimizerTimer.classList.add("is-running");
  renderOptimizerTimer();
  optimizerTimerInterval = window.setInterval(renderOptimizerTimer, 200);
}

function setOptimizerTimerPhase(phase) {
  optimizerTimerPhase = phase;
  renderOptimizerTimer();
}

function finishOptimizerTimer(label = "Done") {
  if (!optimizerTimerStartedAt) return;
  window.clearInterval(optimizerTimerInterval);
  optimizerTimerInterval = null;
  const elapsed = performance.now() - optimizerTimerStartedAt;
  optimizerTimer.classList.remove("is-running");
  optimizerTimerText.textContent = `${label} in ${formatDuration(elapsed)}`;
  optimizerTimerStartedAt = 0;
}

function resetOptimizerTimer() {
  window.clearInterval(optimizerTimerInterval);
  optimizerTimerInterval = null;
  optimizerTimerStartedAt = 0;
  optimizerTimer.classList.add("is-hidden");
  optimizerTimer.classList.remove("is-running");
  optimizerTimerText.textContent = "Idle";
}

function canonicalOrderedCards(cardIds) {
  return canonicalizeDeal(cardIds).tokens.map((token) => token.cardId);
}

function readExactProgress() {
  try {
    const raw = window.localStorage.getItem(EXACT_PROGRESS_STORAGE_KEY);
    if (!raw) return new Map();
    return new Map(Object.entries(JSON.parse(raw)));
  } catch {
    return new Map();
  }
}

function writeExactProgress(records) {
  window.localStorage.setItem(EXACT_PROGRESS_STORAGE_KEY, JSON.stringify(Object.fromEntries(records)));
}

function exactProgressForCurrentDeal() {
  if (selected.size !== 20) return null;
  return readExactProgress().get(canonicalDealKey(selectedCards())) ?? null;
}

function saveExactProgressForCurrentDeal(patch) {
  if (selected.size !== 20) return null;
  const records = readExactProgress();
  const key = canonicalDealKey(selectedCards());
  const previous = records.get(key) ?? {};
  const next = {
    ...previous,
    ...patch,
    canonicalDealKey: key,
    updatedAt: new Date().toISOString(),
  };
  records.set(key, next);
  writeExactProgress(records);
  return next;
}

function normalizeBestKnownRecord(record, sourceFallback = "saved") {
  if (!record?.grid || !record?.discard || record.grid.length !== 16 || record.discard.length !== 4) return null;
  const deal = record.deal ? sortCardIds(record.deal) : sortCardIds([...record.grid, ...record.discard]);
  const canonicalKey = record.canonicalDealKey ?? canonicalDealKey(deal);
  const score = scorePlacement(record.grid, record.discard);
  return {
    id: record.id ?? `${canonicalKey}-${score.total}`,
    dealKey: record.dealKey ?? dealKey(deal),
    canonicalDealKey: canonicalKey,
    deal,
    grid: [...record.grid],
    discard: [...record.discard],
    score,
    source: record.source ?? sourceFallback,
    foundAt: record.foundAt ?? new Date().toISOString(),
    notes: record.notes ?? "",
  };
}

function rememberBestKnownRecord(records, record) {
  if (!record) return;
  const key = record.canonicalDealKey;
  const existing = records.get(key);
  if (!existing || compareScores(record.score, existing.score) > 0) {
    records.set(key, record);
  }
}

function serializeBestKnownRecord(record) {
  return {
    id: record.id,
    dealKey: record.dealKey,
    canonicalDealKey: record.canonicalDealKey,
    deal: record.deal,
    grid: record.grid,
    discard: record.discard,
    score: {
      total: record.score.total,
      beforeMultiplier: record.score.base,
      hands: record.score.handCount,
      multiplier: record.score.multiplier,
      qualityHands: record.score.qualityHandCount,
    },
    source: record.source,
    foundAt: record.foundAt,
    notes: record.notes,
  };
}

function readLocalBestKnown() {
  const records = new Map();
  const readStorageValue = (storageKey) => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      Object.values(parsed).forEach((record) => {
        rememberBestKnownRecord(records, normalizeBestKnownRecord(record, "browser-local"));
      });
    } catch {
      // Ignore corrupt cache entries so a bad legacy value cannot hide newer saved records.
    }
  };

  readStorageValue(LEGACY_BEST_KNOWN_STORAGE_KEY);
  readStorageValue(BEST_KNOWN_STORAGE_KEY);
  return records;
}

function writeLocalBestKnown() {
  const serializable = Object.fromEntries(
    [...localBestKnown.entries()].map(([key, record]) => [key, serializeBestKnownRecord(record)]),
  );
  window.localStorage.setItem(BEST_KNOWN_STORAGE_KEY, JSON.stringify(serializable));
}

async function loadBestKnownFile(path, sourceFallback) {
  const records = new Map();
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) return records;
    const data = await response.json();
    (data.records ?? []).forEach((record) => {
      rememberBestKnownRecord(records, normalizeBestKnownRecord(record, sourceFallback));
    });
  } catch {
    return records;
  }
  return records;
}

async function persistBestKnownRecordToServer(record) {
  try {
    const response = await fetch("./api/local-best-known", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ record: serializeBestKnownRecord(record) }),
    });
    if (!response.ok) return;
    const data = await response.json();
    const savedRecord = normalizeBestKnownRecord(data.record, "local-file");
    rememberBestKnownRecord(sharedBestKnown, savedRecord);
    renderBestKnownPanel();
    renderProofPanel();
  } catch {
    // Static hosts and file:// cannot write repo data. Browser-local saving still works.
  }
}

function syncBrowserLocalBestKnownToServer() {
  for (const record of localBestKnown.values()) {
    const sharedRecord = sharedBestKnown.get(record.canonicalDealKey);
    if (!sharedRecord || compareScores(record.score, sharedRecord.score) > 0) {
      persistBestKnownRecordToServer(record);
    }
  }
}

async function loadSeededBestKnown() {
  localBestKnown = readLocalBestKnown();
  seededBestKnown = await loadBestKnownFile("./data/best-known-fantasyland.json", "repo-seeded");
  sharedBestKnown = await loadBestKnownFile("./data/local-best-known-fantasyland.json", "local-file");
  syncBrowserLocalBestKnownToServer();
}

async function loadExactProofStatuses() {
  try {
    const response = await fetch("./data/exact-proof-status.json", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    exactProofStatuses = new Map(
      (data.records ?? []).map((record) => {
        const normalized = {
          ...record,
          canonicalDealKey: record.canonicalDealKey ?? (record.deal ? canonicalDealKey(record.deal) : null),
        };
        return [normalized.dealKey, normalized];
      }),
    );
  } catch {
    exactProofStatuses = new Map();
  }
}

function adaptBestKnownRecordToCurrentDeal(record) {
  if (!record || selected.size !== 20) return null;
  const currentDeal = selectedCards();
  const currentRawKey = dealKey(currentDeal);
  if (record.dealKey === currentRawKey) return record;
  if (record.canonicalDealKey !== canonicalDealKey(currentDeal)) return null;

  const translated = translatePlacementToDeal(record.grid, record.discard, currentDeal);
  if (!translated) return null;

  return normalizeBestKnownRecord(
    {
      ...record,
      id: `${record.id}-canonical-${currentRawKey}`,
      dealKey: currentRawKey,
      deal: currentDeal,
      grid: translated.grid,
      discard: translated.discard,
      source: `${record.source} canonical`,
      notes: `${record.notes} Translated from canonical-equivalent deal ${record.dealKey}.`,
    },
    record.source,
  );
}

function bestKnownForCurrentDeal() {
  if (selected.size !== 20) return null;
  const candidates = [...localBestKnown.values(), ...sharedBestKnown.values(), ...seededBestKnown.values()]
    .map(adaptBestKnownRecordToCurrentDeal)
    .filter(Boolean)
    .sort((a, b) => compareScores(b.score, a.score));
  return candidates[0] ?? null;
}

function exactProofForCurrentDeal() {
  if (selected.size !== 20) return null;
  const currentDeal = selectedCards();
  const rawProof = exactProofStatuses.get(dealKey(currentDeal));
  if (rawProof) return rawProof;

  const canonicalKey = canonicalDealKey(currentDeal);
  const seededProof = [...exactProofStatuses.values()].find((record) => record.canonicalDealKey === canonicalKey);
  if (seededProof) return seededProof;

  const progress = exactProgressForCurrentDeal();
  if (!progress?.highCompletedDiscards && !progress?.highExhausted && progress?.highLastChunkChecked === undefined) {
    return null;
  }

  const bestKnown = bestKnownForCurrentDeal();
  const bestKnownTotal = bestKnown?.score.total ?? 0;
  const highCandidateDiscards = Number(progress.highCandidateDiscards ?? 0);
  const highCompletedDiscards = Number(progress.highCompletedDiscards ?? 0);
  const highProvesOptimum = progress.highExhausted && bestKnownTotal > theoreticalMaxTotalForHandCount(7);

  return {
    status: highProvesOptimum ? "proven" : progress.highExhausted ? "high-complete" : "running",
    scope: highProvesOptimum ? "Local high buckets" : "Local exact high buckets",
    completedDiscards: highCompletedDiscards,
    totalCandidateDiscards: highCandidateDiscards,
    bestKnownTotal,
    canonicalDealKey: canonicalKey,
  };
}

function saveBestKnownSolution(solution, source = "browser-local") {
  if (!solution || selected.size !== 20) return false;
  const rawKey = dealKey([...selected]);
  const canonicalKey = canonicalDealKey(selectedCards());
  const record = normalizeBestKnownRecord(
    {
      id: `${canonicalKey}-${solution.score.total}`,
      dealKey: rawKey,
      canonicalDealKey: canonicalKey,
      deal: selectedCards(),
      grid: solution.grid,
      discard: solution.discard,
      source,
      foundAt: new Date().toISOString(),
      notes: "Best known placement found in this browser session. Not certified optimal.",
    },
    source,
  );
  if (!record) return false;

  const existingLocal = localBestKnown.get(canonicalKey);
  const existingBest = bestKnownForCurrentDeal();
  const existingShared = sharedBestKnown.get(canonicalKey);
  const shouldPersistToFile = !existingShared || compareScores(record.score, existingShared.score) > 0;

  if (existingBest && compareScores(record.score, existingBest.score) <= 0) {
    if (compareScores(record.score, existingBest.score) === 0 && shouldPersistToFile) {
      persistBestKnownRecordToServer(record);
    }
    return false;
  }

  if (!existingLocal || compareScores(record.score, existingLocal.score) > 0) {
    localBestKnown.set(canonicalKey, record);
    writeLocalBestKnown();
    if (shouldPersistToFile) persistBestKnownRecordToServer(record);
    return true;
  }
  return false;
}

function resultFromBestKnown(record, options = {}) {
  const solution = {
    grid: record.grid,
    discard: record.discard,
    score: record.score,
    source: record.source,
    key: `best-known-${record.dealKey}`,
  };
  return {
    best: solution,
    solutions: [solution],
    bestByHandCount: Array.from({ length: 11 }, (_, index) => {
      const handCount = 10 - index;
      return handCount === record.score.handCount
        ? {
            handCount,
            total: record.score.total,
            base: record.score.base,
            qualityHandCount: record.score.qualityHandCount,
            source: record.source,
            upperBound: theoreticalMaxTotalForHandCount(handCount),
            status: "found",
          }
        : {
            handCount,
            total: null,
            base: null,
            qualityHandCount: null,
            source: null,
            upperBound: theoreticalMaxTotalForHandCount(handCount),
            status: "not-found",
          };
    }),
    attempts: 0,
    elapsedMs: 0,
    candidateCount: 0,
    searchOrder: "saved best-known placement",
    isBestKnownView: true,
    exact: Boolean(options.exact),
  };
}

function mergeBestKnownIntoResult(result, record) {
  if (!result?.best || !record) return result;

  const savedSolution = {
    grid: record.grid,
    discard: record.discard,
    score: record.score,
    source: record.source,
    key: `best-known-${record.dealKey}`,
  };
  const existingSolutions = result.solutions ?? [];
  const mergedSolutions = [savedSolution, ...existingSolutions]
    .sort((a, b) => compareScores(b.score, a.score))
    .filter((solution, index, solutions) => solutions.findIndex((item) => item.key === solution.key) === index);

  const bestByHandCount = result.bestByHandCount.map((bucket) => {
    if (bucket.handCount !== savedSolution.score.handCount) return bucket;
    if (bucket.total !== null && bucket.total >= savedSolution.score.total) return bucket;
    return {
      handCount: bucket.handCount,
      total: savedSolution.score.total,
      base: savedSolution.score.base,
      qualityHandCount: savedSolution.score.qualityHandCount,
      source: savedSolution.source,
      upperBound: bucket.upperBound,
      status: "found",
    };
  });

  return {
    ...result,
    best: mergedSolutions[0],
    solutions: mergedSolutions.slice(0, 24),
    bestByHandCount,
    usedSavedLowerBound: compareScores(savedSolution.score, result.best.score) > 0,
  };
}

function mergeSolverResults(primary, exactHigh) {
  if (!exactHigh?.best) return primary;

  const mergedSolutions = [...(primary.solutions ?? []), ...(exactHigh.solutions ?? [])]
    .sort((a, b) => compareScores(b.score, a.score))
    .filter((solution, index, solutions) => solutions.findIndex((item) => item.key === solution.key) === index);

  const bucketByHandCount = new Map((primary.bestByHandCount ?? []).map((bucket) => [bucket.handCount, bucket]));
  for (const bucket of exactHigh.bestByHandCount ?? []) {
    const existing = bucketByHandCount.get(bucket.handCount);
    if (!existing) {
      bucketByHandCount.set(bucket.handCount, bucket);
      continue;
    }
    if (bucket.total !== null && (existing.total === null || bucket.total > existing.total)) {
      bucketByHandCount.set(bucket.handCount, bucket);
      continue;
    }
    if (bucket.status === "proven" || bucket.status === "bounded") {
      bucketByHandCount.set(bucket.handCount, {
        ...existing,
        status: existing.total !== null ? bucket.status : bucket.status,
      });
    }
  }

  return {
    ...primary,
    best: mergedSolutions[0] ?? primary.best,
    solutions: mergedSolutions.slice(0, 24),
    bestByHandCount: [...bucketByHandCount.values()].sort((a, b) => b.handCount - a.handCount),
    attempts: (primary.attempts ?? 0) + (exactHigh.attempts ?? 0),
    elapsedMs: (primary.elapsedMs ?? 0) + (exactHigh.elapsedMs ?? 0),
    candidateCount: Math.max(primary.candidateCount ?? 0, exactHigh.candidateCount ?? 0),
    exact: exactHigh.exact,
    exhaustedHighBuckets: exactHigh.exhaustedHighBuckets,
    exhaustedThreePlusRows: exactHigh.exhaustedThreePlusRows,
    exhaustedLowRows: exactHigh.exhaustedLowRows,
    highBucketsCovered: exactHigh.highBucketsCovered,
    threePlusRowsCovered: exactHigh.threePlusRowsCovered,
    lowTwoRowCeiling: exactHigh.lowTwoRowCeiling,
    exactTimedOut: exactHigh.timedOut,
    exactCheckedDiscards: exactHigh.checkedDiscards,
    exactCheckedThreeRowDiscards: exactHigh.checkedThreeRowDiscards,
    exactCheckedLowRowDiscards: exactHigh.checkedLowRowDiscards,
    exactRowPartitions: exactHigh.rowPartitions,
    exactThreeRowPartitions: exactHigh.threeRowPartitions,
    exactLowRowPartitions: exactHigh.lowRowPartitions,
    exactColumnPartitions: exactHigh.columnPartitions,
    nativeHighProgress: exactHigh.nativeHighProgress ?? primary.nativeHighProgress,
    searchOrder: `${primary.searchOrder} Exact high-bucket pass: ${exactHigh.searchOrder}`,
  };
}

function bucketSummariesForBest(best, exhausted, provenOptimal) {
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

function uniqueSortedSolutions(solutions) {
  return solutions
    .filter(Boolean)
    .sort((a, b) => compareScores(b.score, a.score))
    .filter((solution, index, allSolutions) => allSolutions.findIndex((item) => item.key === solution.key) === index);
}

function nativePlacementFromPayload(payload) {
  if (
    !payload?.hasNewPlacement ||
    !Array.isArray(payload.grid) ||
    !Array.isArray(payload.discardCards) ||
    payload.grid.length !== 16 ||
    payload.discardCards.length !== 4
  ) {
    return null;
  }

  const score = scorePlacement(payload.grid, payload.discardCards);
  return {
    grid: payload.grid,
    discard: payload.discardCards,
    score,
    source: "native exact high-bucket",
    key: `native-exact-${payload.grid.join(" ")}|${payload.discardCards.join(" ")}`,
  };
}

function nativeExactHighResult({
  best,
  solutions,
  elapsedMs,
  attempts,
  candidateCount,
  checkedDiscards,
  exhaustedHighBuckets,
  timedOut,
  searchOrder,
  nativeHighProgress,
}) {
  const provenOptimal =
    Boolean(best) && exhaustedHighBuckets && best.score.total > theoreticalMaxTotalForHandCount(7);

  return {
    best,
    solutions: uniqueSortedSolutions(solutions).slice(0, 24),
    bestByHandCount: bucketSummariesForBest(best, exhaustedHighBuckets, provenOptimal),
    attempts,
    elapsedMs,
    candidateCount,
    exact: provenOptimal,
    exhaustedHighBuckets,
    exhaustedThreePlusRows: false,
    exhaustedLowRows: false,
    highBucketsCovered: exhaustedHighBuckets,
    threePlusRowsCovered: false,
    lowTwoRowCeiling: theoreticalMaxTotalForHandCount(5),
    timedOut,
    checkedDiscards,
    checkedThreeRowDiscards: 0,
    checkedLowRowDiscards: 0,
    rowPartitions: Number(nativeHighProgress?.rowPartitions ?? 0),
    threeRowPartitions: 0,
    lowRowPartitions: 0,
    columnPartitions: Number(nativeHighProgress?.columnPartitions ?? 0),
    nativeHighProgress,
    searchOrder,
  };
}

async function solveFantasylandExactHighNative(cardIds, incumbentSolution, timeLimitMs) {
  if (timeLimitMs < 200) return null;

  const previousProgress = exactProgressForCurrentDeal();
  const previousCandidateCount = Number(previousProgress?.highCandidateDiscards ?? 0);
  const previousCompleted = Number(previousProgress?.highCompletedDiscards ?? 0);

  if (previousProgress?.highExhausted) {
    return nativeExactHighResult({
      best: incumbentSolution,
      solutions: [incumbentSolution],
      elapsedMs: 0,
      attempts: 0,
      candidateCount: previousCandidateCount,
      checkedDiscards: previousCompleted,
      exhaustedHighBuckets: true,
      timedOut: false,
      nativeHighProgress: {
        completedDiscards: previousCompleted,
        candidateDiscards: previousCandidateCount,
        exhausted: true,
        advanced: false,
      },
      searchOrder: `Native exact high-bucket proof loaded from local progress (${previousCompleted}/${previousCandidateCount} discard candidates checked).`,
    });
  }

  const skipDiscards = Math.max(0, previousCompleted);
  const seconds = Math.max(0.2, Math.min(timeLimitMs / 1000, 30));
  const startedAt = performance.now();

  let payload;
  try {
    const response = await fetch("/api/exact-high-chunk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cards: canonicalOrderedCards(cardIds),
        seconds,
        incumbent: incumbentSolution?.score.total ?? 0,
        skipDiscards,
        discardLimit: 0,
      }),
    });
    if (!response.ok) return null;
    payload = await response.json();
    if (payload?.error) return null;
  } catch {
    return null;
  }

  const elapsedMs = performance.now() - startedAt;
  const candidateCount = Number(payload.candidateDiscards ?? previousCandidateCount);
  const checkedThisChunk = Number(payload.discardsChecked ?? 0);
  const safeCompletedThisChunk = payload.timedOut ? Math.max(0, checkedThisChunk - 1) : checkedThisChunk;
  const completedDiscards = candidateCount
    ? Math.min(candidateCount, skipDiscards + safeCompletedThisChunk)
    : skipDiscards + safeCompletedThisChunk;
  const exhaustedHighBuckets = Boolean(candidateCount && !payload.timedOut && completedDiscards >= candidateCount);
  const nativePlacement = nativePlacementFromPayload(payload);
  if (nativePlacement) saveBestKnownSolution(nativePlacement, "native exact high-bucket");

  const progress = saveExactProgressForCurrentDeal({
    highCandidateDiscards: candidateCount,
    highCompletedDiscards: completedDiscards,
    highExhausted: exhaustedHighBuckets,
    highLastChunkStart: skipDiscards,
    highLastChunkChecked: checkedThisChunk,
    highLastChunkTimedOut: Boolean(payload.timedOut),
    highLastBestTotal: nativePlacement?.score.total ?? incumbentSolution?.score.total ?? 0,
  });

  const solutions = uniqueSortedSolutions([incumbentSolution, nativePlacement]);
  const best = solutions[0] ?? incumbentSolution ?? null;

  return nativeExactHighResult({
    best,
    solutions,
    elapsedMs,
    attempts: Number(payload.rowPartitions ?? 0) + Number(payload.columnPartitions ?? 0),
    candidateCount,
    checkedDiscards: completedDiscards,
    exhaustedHighBuckets,
    timedOut: Boolean(payload.timedOut),
    nativeHighProgress: {
      ...progress,
      completedDiscards,
      candidateDiscards: candidateCount,
      exhausted: exhaustedHighBuckets,
      advanced: completedDiscards > skipDiscards,
      rowPartitions: Number(payload.rowPartitions ?? 0),
      columnPartitions: Number(payload.columnPartitions ?? 0),
    },
    searchOrder: `Native exact high-bucket chunk checked ${checkedThisChunk.toLocaleString()} discard candidate${checkedThisChunk === 1 ? "" : "s"} from offset ${skipDiscards.toLocaleString()}; local progress is ${completedDiscards.toLocaleString()}/${candidateCount.toLocaleString()}.`,
  });
}

function renderMiniCardContent(cardId) {
  const card = CARD_BY_ID[cardId];
  const suit = SUIT_META[card.suit];
  return `
    <span class="card-rank ${suit.colorClass}">${card.rank}</span>
    <span class="card-suit ${suit.colorClass}">${suit.label}</span>
  `;
}

function renderPlayingCard(cardId) {
  if (!cardId) return '<div class="playing-card empty"></div>';
  const card = CARD_BY_ID[cardId];
  const suit = SUIT_META[card.suit];
  return `
    <div class="playing-card">
      <div class="corner ${suit.colorClass}">
        <span>${card.rank}</span>
        <span>${suit.label}</span>
      </div>
      <span class="big-rank ${suit.colorClass}">${card.rank}</span>
    </div>
  `;
}

function renderDeck() {
  deckGrid.innerHTML = "";
  for (const card of DECK) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card-button";
    button.dataset.cardId = card.id;
    button.setAttribute("aria-pressed", selected.has(card.id) ? "true" : "false");
    button.innerHTML = renderMiniCardContent(card.id);
    if (selected.has(card.id)) button.classList.add("is-selected");
    if (!selected.has(card.id) && selected.size >= 20) button.disabled = true;
    button.addEventListener("click", () => toggleCard(card.id));
    deckGrid.append(button);
  }
}

function renderSelectionState() {
  selectedCount.textContent = `${selected.size}/20`;
  optimizeButton.disabled = selected.size !== 20;
  if (selected.size === 20) {
    const bestKnown = bestKnownForCurrentDeal();
    const proof = exactProofForCurrentDeal();
    if (proof?.status === "proven" && bestKnown?.score.total === proof.bestKnownTotal) {
      statusLine.textContent = "Certified optimum available.";
    } else if (bestKnown) {
      statusLine.textContent = "Saved lower bound available for this deal family.";
    } else {
      statusLine.textContent = latestResult ? "Ready." : "Ready to optimize.";
    }
  } else {
    statusLine.textContent = `Select ${20 - selected.size} more card${20 - selected.size === 1 ? "" : "s"}.`;
  }
  renderDeck();
  renderBestKnownPanel();
  renderProofPanel();
}

function toggleCard(cardId) {
  latestResult = null;
  activeSolutionIndex = 0;
  resetOptimizerTimer();
  if (selected.has(cardId)) selected.delete(cardId);
  else if (selected.size < 20) selected.add(cardId);
  renderSelectionState();
}

function clearSelection() {
  selected.clear();
  latestResult = null;
  activeSolutionIndex = 0;
  resetOptimizerTimer();
  renderSelectionState();
  renderEmptyResult();
}

function loadSample() {
  selected.clear();
  SAMPLE_FANTASYLAND_DEAL.forEach((cardId) => selected.add(cardId));
  latestResult = null;
  activeSolutionIndex = 0;
  resetOptimizerTimer();
  renderSelectionState();
  renderEmptyResult();
}

function renderEmptyResult() {
  topScore.textContent = "$0";
  resultModeLabel.textContent = "Best Found";
  resultTotal.textContent = "$0";
  resultBase.textContent = "$0";
  resultHands.textContent = "0";
  resultMultiplier.textContent = "x1";
  resultQuality.textContent = "0";
  runtimeInfo.textContent = "Not run";
  boardGrid.innerHTML = Array.from({ length: 16 }, () => renderPlayingCard(null)).join("");
  discardCards.innerHTML = Array.from({ length: 4 }, () => renderPlayingCard(null)).join("");
  solutionsRow.innerHTML = "";
  bucketList.innerHTML = "";
  breakdownList.innerHTML = "";
  renderBestKnownPanel();
  renderProofPanel();
}

function renderBestKnownPanel() {
  const record = bestKnownForCurrentDeal();
  if (!record) {
    bestKnownSummary.textContent = selected.size === 20 ? "No saved placement for these cards" : "Select 20 cards";
    showBestKnownButton.disabled = true;
    return;
  }

  bestKnownSummary.textContent = `${money(record.score.total)} · ${record.score.handCount} hands · ${record.score.qualityHandCount} quality · ${record.source}`;
  showBestKnownButton.disabled = false;
}

function renderProofPanel() {
  const proof = exactProofForCurrentDeal();
  if (!proof) {
    proofSummary.textContent = selected.size === 20 ? "No proof run for these cards yet" : "Select 20 cards";
    return;
  }

  if (proof.status === "proven") {
    proofSummary.textContent = `${proof.scope} proven: checked ${proof.completedDiscards}/${proof.totalCandidateDiscards} discard candidates. Best known ${money(proof.bestKnownTotal)}.`;
    return;
  }

  if (proof.status === "high-complete") {
    proofSummary.textContent = `${proof.scope} complete: checked ${proof.completedDiscards}/${proof.totalCandidateDiscards} high-bucket discard candidates. Lower buckets still need proof because best known is ${money(proof.bestKnownTotal)}.`;
    return;
  }

  proofSummary.textContent = `${proof.scope} proof running: checked ${proof.completedDiscards}/${proof.totalCandidateDiscards} discard candidates. No score above ${money(proof.bestKnownTotal)} found yet.`;
}

function activeSolution() {
  return latestResult?.solutions?.[activeSolutionIndex] ?? latestResult?.best ?? null;
}

function renderResult() {
  const solution = activeSolution();
  if (!solution) {
    renderEmptyResult();
    return;
  }

  const { score } = solution;
  topScore.textContent = money(score.total);
  resultTotal.textContent = money(score.total);
  resultBase.textContent = money(score.base);
  resultHands.textContent = String(score.handCount);
  resultMultiplier.textContent = `x${score.multiplier}`;
  resultQuality.textContent = String(score.qualityHandCount);
  runtimeInfo.textContent = latestResult.isBestKnownView
    ? latestResult.exact
      ? "Certified saved placement"
      : "Saved best-known placement"
    : latestResult.exact
      ? `Certified optimal · ${Math.round(latestResult.elapsedMs).toLocaleString()} ms`
      : `${Math.round(latestResult.elapsedMs).toLocaleString()} ms · ${latestResult.attempts.toLocaleString()} searches`;
  resultModeLabel.textContent = latestResult.exact ? "Best Possible" : "Best Found";

  boardGrid.innerHTML = solution.grid.map((cardId) => renderPlayingCard(cardId)).join("");
  discardCards.innerHTML = solution.discard.map((cardId) => renderPlayingCard(cardId)).join("");

  solutionsRow.innerHTML = "";
  latestResult.solutions.slice(0, 12).forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `solution-pill${index === activeSolutionIndex ? " is-active" : ""}`;
    button.innerHTML = `${money(item.score.total)}<span>${item.score.handCount} hands · ${item.score.qualityHandCount} quality</span>`;
    button.addEventListener("click", () => {
      activeSolutionIndex = index;
      renderResult();
    });
    solutionsRow.append(button);
  });

  bucketList.innerHTML = latestResult.bestByHandCount
    .map((bucket) => {
      const hasScore = bucket.total !== null;
      const statusText = hasScore
        ? `${money(bucket.total)} · ${bucket.qualityHandCount} quality${bucket.status === "proven" ? " · proven" : ""}`
        : bucket.status === "bounded"
          ? `Bounded by global ceiling ${money(bucket.upperBound)}`
          : `Not found · global ceiling ${money(bucket.upperBound)}`;
      return `
        <div class="bucket-item${hasScore ? " has-score" : ""}">
          <strong>${bucket.handCount} hand${bucket.handCount === 1 ? "" : "s"}</strong>
          <span>${statusText}</span>
        </div>
      `;
    })
    .join("");

  const discardLabel = score.discardScores ? score.discardHand.shortLabel : "Not scored";
  const discardValue = score.discardScores ? money(score.discardValue) : "$0";
  const rows = [
    ...score.lines.map((line) => ({
      label: line.label,
      cards: line.cards.map(cardLabel).join(" "),
      hand: line.hand.shortLabel,
      value: money(line.value),
      scores: line.scores,
    })),
    {
      label: "Discard",
      cards: solution.discard.map(cardLabel).join(" "),
      hand: discardLabel,
      value: discardValue,
      scores: score.discardScores,
    },
  ];

  breakdownList.innerHTML = rows
    .map(
      (row) => `
        <div class="breakdown-row">
          <div class="breakdown-label">${row.label}</div>
          <div class="line-cards">${row.cards}</div>
          <div class="breakdown-hand">${row.hand}</div>
          <div class="breakdown-value">${row.value}</div>
        </div>
      `,
    )
    .join("");
  renderBestKnownPanel();
  renderProofPanel();
}

async function optimize() {
  if (selected.size !== 20) return;

  resetOptimizerTimer();
  optimizeButton.disabled = true;
  optimizeButton.textContent = "Optimizing...";
  loadSampleButton.disabled = true;
  clearButton.disabled = true;
  const bestKnown = bestKnownForCurrentDeal();
  const proof = exactProofForCurrentDeal();
  const hasCertifiedPlacement =
    bestKnown && proof?.status === "proven" && proof.bestKnownTotal === bestKnown.score.total;

  if (hasCertifiedPlacement) {
    latestResult = resultFromBestKnown(bestKnown, { exact: true });
    activeSolutionIndex = 0;
    statusLine.textContent = `Certified optimum loaded instantly: ${money(bestKnown.score.total)}.`;
    renderResult();
    optimizeButton.disabled = selected.size !== 20;
    optimizeButton.textContent = "Optimize";
    loadSampleButton.disabled = false;
    clearButton.disabled = false;
    return;
  }

  const timeBudget = Number(searchDepth.value);
  startOptimizerTimer(timeBudget, "Starting");
  statusLine.textContent = bestKnown
    ? `Optimizing from saved lower bound. ${searchBudgetLabel()}.`
    : `Optimizing. ${searchBudgetLabel()}.`;

  await new Promise((resolve) => window.setTimeout(resolve, 30));

  try {
    const heuristicBudget = Math.max(750, Math.floor(timeBudget * 0.45));
    const exactBudget = Math.max(0, timeBudget - heuristicBudget);
    setOptimizerTimerPhase("Heuristic search");
    latestResult = solveFantasylandHeuristic(selectedCards(), {
      timeLimitMs: heuristicBudget,
      maxSolutions: 24,
      incumbentTotal: bestKnown?.score.total ?? 0,
    });
    latestResult = mergeBestKnownIntoResult(latestResult, bestKnown);
    const exactStartedAt = performance.now();
    setOptimizerTimerPhase("Exact proof");
    let exactHighResult = await solveFantasylandExactHighNative(selectedCards(), latestResult.best, exactBudget);
    if (!exactHighResult) {
      exactHighResult = solveFantasylandExactHighBuckets(selectedCards(), {
        timeLimitMs: exactBudget,
        maxSolutions: 24,
        incumbentSolution: latestResult.best,
        sourceLabel: "exact high-bucket",
      });
    }
    latestResult = mergeSolverResults(latestResult, exactHighResult);
    let remainingExactBudget = exactHighResult.exhaustedHighBuckets
      ? Math.max(0, exactBudget - (performance.now() - exactStartedAt))
      : 0;
    if (!latestResult.exact && remainingExactBudget > 50) {
      setOptimizerTimerPhase("Lower buckets");
      const exactThreePlusResult = solveFantasylandExactHighBuckets(selectedCards(), {
        timeLimitMs: remainingExactBudget,
        maxSolutions: 24,
        minGridHandCount: 0,
        maxGridHandCount: 7,
        includeThreePositiveRows: true,
        highBucketsAlreadyExhausted: true,
        incumbentSolution: latestResult.best,
        sourceLabel: "exact 3+ row low-bucket",
      });
      latestResult = mergeSolverResults(latestResult, exactThreePlusResult);
      remainingExactBudget = exactThreePlusResult.exhaustedThreePlusRows
        ? Math.max(0, exactBudget - (performance.now() - exactStartedAt))
        : 0;
      if (!latestResult.exact && remainingExactBudget > 50) {
        setOptimizerTimerPhase("Final buckets");
        const exactLowRowsResult = solveFantasylandExactHighBuckets(selectedCards(), {
          timeLimitMs: remainingExactBudget,
          maxSolutions: 24,
          minGridHandCount: 0,
          maxGridHandCount: 5,
          maxColumnHandCount: 2,
          includeFourPositiveRows: false,
          includeTwoOrFewerPositiveRows: true,
          highBucketsAlreadyExhausted: true,
          threePlusRowsAlreadyExhausted: true,
          incumbentSolution: latestResult.best,
          sourceLabel: "exact 0-2 row low-bucket",
        });
        latestResult = mergeSolverResults(latestResult, exactLowRowsResult);
      }
    }
    activeSolutionIndex = 0;
    const improvedBestKnown = saveBestKnownSolution(latestResult.best);
    const resultStatus = latestResult.exact
      ? "Certified optimum"
      : latestResult.exhaustedLowRows
        ? "All row-orientation buckets exhausted"
      : latestResult.exhaustedThreePlusRows
        ? `3+ row buckets exhausted; scores at ${money(latestResult.lowTwoRowCeiling)} or below still possible`
      : latestResult.exhaustedHighBuckets
        ? "High buckets exhausted, lower buckets still possible"
        : improvedBestKnown
          ? "New best known saved"
          : latestResult.nativeHighProgress?.advanced
            ? "Exact progress saved"
          : latestResult.nativeHighProgress
            ? "Best known kept; exact chunk will retry the current candidate"
          : latestResult.usedSavedLowerBound
            ? "Saved lower bound kept"
            : "Best found, not proven";
    statusLine.textContent = `${resultStatus}: ${money(latestResult.best.score.total)}. Bucket bounds shown below.`;
    renderResult();
    finishOptimizerTimer(latestResult.exact ? "Certified" : "Done");
  } catch (error) {
    statusLine.textContent = error instanceof Error ? error.message : "Optimizer failed.";
    finishOptimizerTimer("Stopped");
  } finally {
    optimizeButton.disabled = selected.size !== 20;
    optimizeButton.textContent = "Optimize";
    loadSampleButton.disabled = false;
    clearButton.disabled = false;
  }
}

function showBestKnownPlacement() {
  const record = bestKnownForCurrentDeal();
  if (!record) return;
  resetOptimizerTimer();
  const proof = exactProofForCurrentDeal();
  const exact = proof?.status === "proven" && proof.bestKnownTotal === record.score.total;
  latestResult = resultFromBestKnown(record, { exact });
  activeSolutionIndex = 0;
  statusLine.textContent = exact
    ? `Showing certified saved placement: ${money(record.score.total)}.`
    : `Showing saved best-known placement: ${money(record.score.total)}.`;
  renderResult();
}

optimizeButton.addEventListener("click", optimize);
clearButton.addEventListener("click", clearSelection);
loadSampleButton.addEventListener("click", loadSample);
showBestKnownButton.addEventListener("click", showBestKnownPlacement);

await loadSeededBestKnown();
await loadExactProofStatuses();
renderSelectionState();
renderEmptyResult();
