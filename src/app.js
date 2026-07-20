import {
  CARD_BY_ID,
  DECK,
  SUIT_META,
  canonicalizeDeal,
  canonicalDealKey,
  cardLabel,
  sortCardIds,
  translatePlacementToDeal,
} from "./cards.js";
import { solveFantasylandExactHighBuckets } from "./exactHighBucketSolver.js?v=solver-equivalence-3";
import { solveFantasylandHeuristic } from "./heuristicSolver.js?v=solver-fast-1";
import { uniqueSolutionsByPlacement } from "./layoutEquivalence.js?v=layout-equivalence-3";
import { compareScores, scorePlacement, theoreticalMaxTotalForHandCount } from "./scoring.js";
import { recognizeFantasylandScreenshot } from "./screenshotRecognizer.js?v=screenshot-recognizer-19";

const selected = new Set();
const attemptGridCards = Array(16).fill("");
const attemptDiscardCards = Array(4).fill("");
let latestResult = null;
let activeSolutionIndex = 0;
let seededBestKnown = new Map();
let sharedBestKnown = new Map();
let localBestKnown = new Map();
let exactProofStatuses = new Map();
let exactWorker = null;
let heuristicWorker = null;
let exactWorkerRequestId = 0;
let heuristicWorkerRequestId = 0;
let exactWorkerUnavailable = false;
let heuristicWorkerUnavailable = false;
let optimizerTimerInterval = null;
let optimizerTimerStartedAt = 0;
let optimizerTimerBudget = 0;
let optimizerTimerPhase = "Working";
let attemptPreviewUrl = null;
let selectedSource = "manual";

const deckGrid = document.querySelector("#deckGrid");
const selectedCount = document.querySelector("#selectedCount");
const optimizeButton = document.querySelector("#optimizeButton");
const clearButton = document.querySelector("#clearButton");
const searchDepth = document.querySelector("#searchDepth");
const statusLine = document.querySelector("#statusLine");
const optimizerTimer = document.querySelector("#optimizerTimer");
const optimizerTimerText = document.querySelector("#optimizerTimerText");
const attemptScoreBadge = document.querySelector("#attemptScoreBadge");
const attemptScreenshot = document.querySelector("#attemptScreenshot");
const attemptPreview = document.querySelector("#attemptPreview");
const attemptGridSlots = document.querySelector("#attemptGridSlots");
const attemptDiscardSlots = document.querySelector("#attemptDiscardSlots");
const attemptSummary = document.querySelector("#attemptSummary");
const clearAttemptButton = document.querySelector("#clearAttemptButton");
const manualPickerDetails = document.querySelector("#manualPickerDetails");
const manualPickerHint = document.querySelector("#manualPickerHint");
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
const rowAnnotations = document.querySelector("#rowAnnotations");
const columnAnnotations = document.querySelector("#columnAnnotations");
const cornerAnnotation = document.querySelector("#cornerAnnotation");
const discardAnnotation = document.querySelector("#discardAnnotation");
const solutionsRow = document.querySelector("#solutionsRow");
const bucketList = document.querySelector("#bucketList");
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
  const heuristicSeconds = Math.round((Math.max(750, Math.floor(Number(searchDepth.value) * 0.8)) / 1000) * 10) / 10;
  const exactSeconds = Math.round(((Number(searchDepth.value) - Math.max(750, Math.floor(Number(searchDepth.value) * 0.8))) / 1000) * 10) / 10;
  return `${selectedOption}: ${seconds}s total (${heuristicSeconds}s search + ${exactSeconds}s proof)`;
}

function allDeckCardIds() {
  return DECK.map((card) => card.id);
}

function attemptCards() {
  return [...attemptGridCards, ...attemptDiscardCards].filter(Boolean);
}

function attemptValidation() {
  const cards = attemptCards();
  const filledSlots = cards.length;
  const uniqueCardCount = new Set(cards).size;
  const hasDuplicates = uniqueCardCount !== filledSlots;
  const complete = filledSlots === 20 && attemptGridCards.every(Boolean) && attemptDiscardCards.every(Boolean);
  const valid = complete && !hasDuplicates;
  const selectedDealKey = selected.size === 20 ? dealKey(selectedCards()) : null;
  const attemptDealKey = valid ? dealKey(cards) : null;
  const matchesSelectedDeal = Boolean(valid && selectedDealKey && attemptDealKey === selectedDealKey);
  const score = valid ? scorePlacement(attemptGridCards, attemptDiscardCards) : null;

  return {
    cards,
    filledSlots,
    hasDuplicates,
    complete,
    valid,
    selectedDealKey,
    attemptDealKey,
    matchesSelectedDeal,
    score,
  };
}

function currentAttemptSolution(options = {}) {
  const validation = attemptValidation();
  if (!validation.valid) return null;
  if (options.requireSelectedMatch && !validation.matchesSelectedDeal) return null;

  return {
    grid: [...attemptGridCards],
    discard: [...attemptDiscardCards],
    score: validation.score,
    source: "grid attempt",
    key: `player-attempt-${validation.attemptDealKey}`,
  };
}

function setAttemptCards(grid, discard) {
  attemptGridCards.splice(0, attemptGridCards.length, ...grid);
  attemptDiscardCards.splice(0, attemptDiscardCards.length, ...discard);
}

function selectAttemptCardsAsDeal() {
  const validation = attemptValidation();
  if (!validation.valid) return false;
  selected.clear();
  validation.cards.forEach((cardId) => selected.add(cardId));
  selectedSource = "attempt";
  return true;
}

function canOptimizeCurrentInputs() {
  return selected.size === 20 || attemptValidation().valid;
}

function selectFilledAttemptCardsAsDeal() {
  const validation = attemptValidation();
  if (validation.filledSlots === 0 || validation.hasDuplicates) return false;
  selected.clear();
  validation.cards.forEach((cardId) => selected.add(cardId));
  selectedSource = "attempt";
  return true;
}

function attemptResultFromSolution(solution) {
  return {
    best: solution,
    solutions: [solution],
    bestByHandCount: bucketSummariesForBest(solution, false, false),
    attempts: 0,
    elapsedMs: 0,
    candidateCount: 0,
    searchOrder: "grid attempt",
    isAttemptView: true,
    exact: false,
  };
}

function showAttemptPlacement() {
  const solution = currentAttemptSolution({ requireSelectedMatch: true });
  if (!solution) return false;
  latestResult = attemptResultFromSolution(solution);
  activeSolutionIndex = 0;
  renderResult();
  return true;
}

function attemptOptionGroups() {
  const chosenCards = selectedCards();
  const chosen = new Set(chosenCards);
  const restOfDeck = allDeckCardIds().filter((cardId) => !chosen.has(cardId));
  return [
    { label: chosenCards.length ? "Chosen cards" : "No cards chosen yet", cards: chosenCards },
    { label: chosenCards.length ? "Rest of deck" : "All cards", cards: restOfDeck },
  ].filter((group) => group.cards.length > 0);
}

function renderAttemptOption(cardId, currentCardId, usedCards) {
  const selectedAttr = cardId === currentCardId ? " selected" : "";
  const disabledAttr = usedCards.has(cardId) && cardId !== currentCardId ? " disabled" : "";
  return `<option value="${cardId}"${selectedAttr}${disabledAttr}>${cardLabel(cardId)}</option>`;
}

function renderAttemptOptionGroup(group, currentCardId, usedCards) {
  return `
    <option class="attempt-option-group" value="" disabled>${group.label}</option>
    ${group.cards.map((cardId) => renderAttemptOption(cardId, currentCardId, usedCards)).join("")}
  `;
}

function renderAttemptSelect(zone, index, currentCardId) {
  const usedCards = new Set(attemptCards());
  const label = zone === "grid" ? `${Math.floor(index / 4) + 1}.${(index % 4) + 1}` : `D${index + 1}`;
  const suitClass = currentCardId ? SUIT_META[CARD_BY_ID[currentCardId].suit].colorClass : "";
  const options = [
    '<option value="">--</option>',
    ...attemptOptionGroups().map((group) => renderAttemptOptionGroup(group, currentCardId, usedCards)),
  ].join("");

  return `
    <label class="attempt-slot">
      <span>${label}</span>
      <select class="${suitClass}" data-attempt-zone="${zone}" data-attempt-index="${index}" aria-label="${zone} card ${index + 1}">
        ${options}
      </select>
    </label>
  `;
}

function renderAttemptEditor() {
  attemptDiscardSlots.innerHTML = attemptDiscardCards
    .map((cardId, index) => renderAttemptSelect("discard", index, cardId))
    .join("");
  attemptGridSlots.innerHTML = attemptGridCards
    .map((cardId, index) => renderAttemptSelect("grid", index, cardId))
    .join("");
  renderAttemptSummary();
}

function screenshotScoreMismatch(recognized) {
  // The score text is optional OCR, while the card recognizer has a dedicated
  // per-card confidence model and deck validation. A complete card read must
  // never be rejected because a decorative payout label was mistaken for a
  // displayed total (for example, "$8,222"). Only use score OCR as a hint
  // when the card read itself already needs manual review.
  if (!recognized?.displayedScore || recognized.complete) return null;
  const score = scorePlacement(recognized.grid, recognized.discard);
  const expected = recognized.displayedScore;
  const mismatches = [];
  if (Number.isFinite(expected.total) && expected.total !== score.total) {
    mismatches.push(`expected ${money(expected.total)}, got ${money(score.total)}`);
  }
  if (Number.isFinite(expected.handCount) && expected.handCount !== score.handCount) {
    mismatches.push(`expected ${expected.handCount} hands, got ${score.handCount}`);
  }
  return mismatches.length ? mismatches.join("; ") : null;
}

function renderAttemptSummary() {
  const validation = attemptValidation();
  attemptSummary.classList.remove("is-good", "is-warning");
  optimizeButton.disabled = !canOptimizeCurrentInputs();

  if (validation.filledSlots === 0) {
    attemptScoreBadge.textContent = "Optional";
    attemptSummary.textContent =
      "Optional baseline: add a player grid here, or upload a screenshot to fill it automatically.";
    return;
  }

  if (validation.hasDuplicates) {
    attemptScoreBadge.textContent = `${validation.filledSlots}/20`;
    attemptSummary.textContent = "Duplicate cards in the attempt. Each card can only appear once.";
    attemptSummary.classList.add("is-warning");
    return;
  }

  if (!validation.complete) {
    attemptScoreBadge.textContent = `${validation.filledSlots}/20`;
    const remaining = 20 - validation.filledSlots;
    attemptSummary.textContent =
      selected.size === 20
        ? "Grid attempt incomplete. Optimize will use the selected 20 cards unless you finish this grid."
        : `Add ${remaining} more card${remaining === 1 ? "" : "s"} to complete the grid attempt.`;
    return;
  }

  attemptScoreBadge.textContent = money(validation.score.total);
  const baseText = `${money(validation.score.total)} · ${validation.score.handCount} hands · ${validation.score.qualityHandCount} quality`;
  if (selected.size === 20 && !validation.matchesSelectedDeal) {
    attemptSummary.textContent = `${baseText}. Optimize will use this grid attempt and update the selected deal.`;
    return;
  }

  const isAttemptOnlyResult =
    latestResult?.isAttemptView || latestResult?.searchOrder === "grid attempt" || latestResult?.searchOrder === "player attempt";
  if (selected.size !== 20) {
    attemptSummary.textContent = `${baseText}. Optimize will use these grid cards as the deal.`;
    return;
  }

  const bestScore = isAttemptOnlyResult ? null : latestResult?.best?.score ?? null;
  if (!bestScore) {
    attemptSummary.textContent = `${baseText}. Review grid/discard, then Optimize will search from this grid as a lower bound.`;
    return;
  }

  const diff = bestScore.total - validation.score.total;
  if (diff > 0) {
    const higherSolutions = (latestResult.solutions ?? []).filter((solution) => solution.score.total > validation.score.total);
    const higherOutcomes = new Set(higherSolutions.map(solutionOutcomeKey)).size;
    attemptSummary.textContent = `${baseText}. Current best found is +${money(diff)} higher across ${higherOutcomes} found outcome${higherOutcomes === 1 ? "" : "s"}.`;
    attemptSummary.classList.add("is-warning");
    return;
  }

  if (diff === 0) {
    attemptSummary.textContent = `${baseText}. This matches the current best found score.`;
    attemptSummary.classList.add("is-good");
    return;
  }

  attemptSummary.textContent = `${baseText}. Grid attempt is above the current saved/search result and will be kept as the floor.`;
  attemptSummary.classList.add("is-good");
}

function handleAttemptSlotChange(event) {
  const select = event.target.closest("select[data-attempt-zone]");
  if (!select) return;
  const index = Number(select.dataset.attemptIndex);
  if (select.dataset.attemptZone === "grid") {
    attemptGridCards[index] = select.value;
  } else {
    attemptDiscardCards[index] = select.value;
  }
  const validation = attemptValidation();
  if (validation.valid) {
    selectAttemptCardsAsDeal();
  } else if (selectedSource === "attempt" && !validation.hasDuplicates) {
    selectFilledAttemptCardsAsDeal();
  }
  renderSelectionState();
}

async function handleAttemptScreenshotChange() {
  if (attemptPreviewUrl) {
    URL.revokeObjectURL(attemptPreviewUrl);
    attemptPreviewUrl = null;
  }

  const file = attemptScreenshot.files?.[0];
  if (!file) {
    attemptPreview.hidden = true;
    attemptPreview.removeAttribute("src");
    renderAttemptSummary();
    return;
  }

  attemptPreviewUrl = URL.createObjectURL(file);
  attemptPreview.src = attemptPreviewUrl;
  attemptPreview.hidden = false;
  attemptScoreBadge.textContent = "Reading...";
  attemptSummary.classList.remove("is-good", "is-warning");
  attemptSummary.textContent = "Reading screenshot cards...";

  try {
    const recognized = await recognizeFantasylandScreenshot(file);
    setAttemptCards(recognized.grid, recognized.discard);
    const validation = attemptValidation();
    if (!validation.hasDuplicates) selectFilledAttemptCardsAsDeal();
    renderSelectionState();
    if (selectedSource === "attempt" && selected.size > 0) {
      manualPickerDetails.open = false;
    }
    const mismatch = screenshotScoreMismatch(recognized);
    if (mismatch) {
      attemptSummary.textContent = `Detected cards do not match the screenshot score (${mismatch}). Please adjust them.`;
      attemptSummary.classList.add("is-warning");
      return;
    }
    if (!validation.valid) {
      renderAttemptSummary();
      if (recognized.warning) {
        attemptSummary.textContent = recognized.warning;
        attemptSummary.classList.add("is-warning");
      }
      return;
    }
    activeSolutionIndex = 0;
    resetOptimizerTimer();
    showAttemptPlacement();
    statusLine.textContent = `Loaded grid attempt from screenshot: ${money(validation.score.total)}.`;
  } catch (error) {
    renderAttemptEditor();
    attemptSummary.textContent = error instanceof Error ? error.message : "Could not read screenshot cards.";
    attemptSummary.classList.add("is-warning");
  }
}

function clearAttempt() {
  attemptGridCards.fill("");
  attemptDiscardCards.fill("");
  if (attemptPreviewUrl) {
    URL.revokeObjectURL(attemptPreviewUrl);
    attemptPreviewUrl = null;
  }
  attemptScreenshot.value = "";
  attemptPreview.hidden = true;
  attemptPreview.removeAttribute("src");
  selectedSource = "manual";
  manualPickerDetails.open = true;
  renderSelectionState();
}

async function optimizeAttemptCards() {
  const validation = attemptValidation();
  if (!validation.valid) return;
  selectAttemptCardsAsDeal();
  activeSolutionIndex = 0;
  resetOptimizerTimer();
  renderSelectionState();
  showAttemptPlacement();
  await optimize();
}

async function optimizeCurrentInputs() {
  if (attemptValidation().valid) {
    await optimizeAttemptCards();
    return;
  }
  await optimize();
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
  const hasHighProgress =
    progress?.highCompletedDiscards || progress?.highExhausted || progress?.highLastChunkChecked !== undefined;
  const hasThreePlusProgress =
    progress?.threePlusCompletedDiscards ||
    progress?.threePlusExhausted ||
    progress?.threePlusLastChunkChecked !== undefined;
  const hasLowProgress =
    progress?.lowCompletedDiscards || progress?.lowExhausted || progress?.lowLastChunkChecked !== undefined;
  if (!hasHighProgress && !hasThreePlusProgress && !hasLowProgress) {
    return null;
  }

  const bestKnown = bestKnownForCurrentDeal();
  const bestKnownTotal = bestKnown?.score.total ?? 0;
  const highCandidateDiscards = Number(progress.highCandidateDiscards ?? 0);
  const highCompletedDiscards = Number(progress.highCompletedDiscards ?? 0);
  const highCurrentDiscardRows = Number(progress.highCurrentDiscardRows ?? 0);
  const highProvesOptimum = progress.highExhausted && bestKnownTotal > theoreticalMaxTotalForHandCount(7);
  const threePlusCandidateDiscards = Number(progress.threePlusCandidateDiscards ?? 0);
  const threePlusCompletedDiscards = Number(progress.threePlusCompletedDiscards ?? 0);
  const threePlusCurrentDiscardRows = Number(progress.threePlusCurrentDiscardRows ?? 0);
  const threePlusProvesOptimum =
    progress.highExhausted && progress.threePlusExhausted && bestKnownTotal > theoreticalMaxTotalForHandCount(5);
  const lowCandidateDiscards = Number(progress.lowCandidateDiscards ?? 0);
  const lowCompletedDiscards = Number(progress.lowCompletedDiscards ?? 0);
  const lowCurrentDiscardRows = Number(progress.lowCurrentDiscardRows ?? 0);
  const lowProvesOptimum = progress.highExhausted && progress.threePlusExhausted && progress.lowExhausted;

  if (lowProvesOptimum) {
    return {
      status: "proven",
      scope: "Local full exact search",
      completedDiscards: lowCompletedDiscards,
      totalCandidateDiscards: lowCandidateDiscards,
      currentDiscardRows: 0,
      bestKnownTotal,
      canonicalDealKey: canonicalKey,
    };
  }

  if (threePlusProvesOptimum) {
    return {
      status: "proven",
      scope: "Local high + 3+ lower buckets",
      completedDiscards: threePlusCompletedDiscards,
      totalCandidateDiscards: threePlusCandidateDiscards,
      currentDiscardRows: 0,
      bestKnownTotal,
      canonicalDealKey: canonicalKey,
    };
  }

  if (hasLowProgress) {
    return {
      status: progress.lowExhausted ? "low-complete" : "running",
      scope: "Local exact 0-2 row lower bucket",
      completedDiscards: lowCompletedDiscards,
      totalCandidateDiscards: lowCandidateDiscards,
      currentDiscardRows: lowCurrentDiscardRows,
      bestKnownTotal,
      canonicalDealKey: canonicalKey,
    };
  }

  if (hasThreePlusProgress) {
    return {
      status: progress.threePlusExhausted ? "three-plus-complete" : "running",
      scope: "Local exact 3+ lower bucket",
      completedDiscards: threePlusCompletedDiscards,
      totalCandidateDiscards: threePlusCandidateDiscards,
      currentDiscardRows: threePlusCurrentDiscardRows,
      bestKnownTotal,
      canonicalDealKey: canonicalKey,
    };
  }

  return {
    status: highProvesOptimum ? "proven" : progress.highExhausted ? "high-complete" : "running",
    scope: highProvesOptimum ? "Local high buckets" : "Local exact high buckets",
    completedDiscards: highCompletedDiscards,
    totalCandidateDiscards: highCandidateDiscards,
    currentDiscardRows: highCurrentDiscardRows,
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
  const mergedSolutions = uniqueSolutionsByPlacement(
    [savedSolution, ...existingSolutions].sort((a, b) => compareScores(b.score, a.score)),
  );

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

function mergeAttemptIntoResult(result, attemptSolution) {
  if (!attemptSolution) return result;

  if (!result?.best) {
    return {
      best: attemptSolution,
      solutions: [attemptSolution],
      bestByHandCount: bucketSummariesForBest(attemptSolution, false, false),
      attempts: 0,
      elapsedMs: 0,
      candidateCount: 0,
      incumbentTotal: attemptSolution.score.total,
      searchOrder: "grid attempt lower bound",
      usedAttemptLowerBound: true,
    };
  }

  const existingSolutions = result.solutions ?? [];
  const mergedSolutions = uniqueSolutionsByPlacement(
    [attemptSolution, ...existingSolutions].sort((a, b) => compareScores(b.score, a.score)),
  );

  const bestByHandCount = result.bestByHandCount.map((bucket) => {
    if (bucket.handCount !== attemptSolution.score.handCount) return bucket;
    if (bucket.total !== null && bucket.total >= attemptSolution.score.total) return bucket;
    return {
      handCount: bucket.handCount,
      total: attemptSolution.score.total,
      base: attemptSolution.score.base,
      qualityHandCount: attemptSolution.score.qualityHandCount,
      source: attemptSolution.source,
      upperBound: bucket.upperBound,
      status: "found",
    };
  });

  return {
    ...result,
    best: mergedSolutions[0],
    solutions: mergedSolutions.slice(0, 24),
    bestByHandCount,
    incumbentTotal: Math.max(result.incumbentTotal ?? 0, attemptSolution.score.total),
    usedAttemptLowerBound: compareScores(attemptSolution.score, result.best.score) > 0,
  };
}

function mergeSolverResults(primary, exactHigh) {
  if (!exactHigh?.best) return primary;

  const mergedSolutions = uniqueSolutionsByPlacement(
    [...(primary.solutions ?? []), ...(exactHigh.solutions ?? [])].sort((a, b) => compareScores(b.score, a.score)),
  );

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
    nativeThreePlusProgress: exactHigh.nativeThreePlusProgress ?? primary.nativeThreePlusProgress,
    nativeLowProgress: exactHigh.nativeLowProgress ?? primary.nativeLowProgress,
    searchOrder: `${primary.searchOrder} Exact pass: ${exactHigh.searchOrder}`,
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
  return uniqueSolutionsByPlacement(solutions.filter(Boolean).sort((a, b) => compareScores(b.score, a.score)));
}

function getExactWorker() {
  if (exactWorkerUnavailable || typeof Worker === "undefined") return null;
  if (exactWorker) return exactWorker;

  try {
    exactWorker = new Worker(new URL("./exactSolverWorker.js?v=solver-equivalence-3", import.meta.url), { type: "module" });
  } catch {
    exactWorkerUnavailable = true;
    exactWorker = null;
  }

  return exactWorker;
}

function resetExactWorker() {
  if (exactWorker) {
    exactWorker.terminate();
  }
  exactWorker = null;
}

function getHeuristicWorker() {
  if (heuristicWorkerUnavailable || typeof Worker === "undefined") return null;
  if (heuristicWorker) return heuristicWorker;

  try {
    heuristicWorker = new Worker(new URL("./heuristicSolverWorker.js?v=solver-fast-1", import.meta.url), { type: "module" });
  } catch {
    heuristicWorkerUnavailable = true;
    heuristicWorker = null;
  }

  return heuristicWorker;
}

function resetHeuristicWorker() {
  if (heuristicWorker) {
    heuristicWorker.terminate();
  }
  heuristicWorker = null;
}

async function solveFantasylandHeuristicInWorker(cardIds, options) {
  const worker = getHeuristicWorker();
  if (!worker) return { status: "unavailable" };

  const id = String((heuristicWorkerRequestId += 1));
  const timeoutMs = Math.max(1500, Number(options.timeLimitMs ?? 0) + 1500);

  return new Promise((resolve) => {
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
      worker.removeEventListener("messageerror", handleError);
    };

    const finish = (response) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(response);
    };

    const failAndReset = (status) => {
      if (settled) return;
      if (status === "failed") heuristicWorkerUnavailable = true;
      resetHeuristicWorker();
      finish({ status });
    };

    const handleMessage = (event) => {
      const message = event.data ?? {};
      if (message.id !== id) return;
      if (message.ok) {
        finish({ status: "ok", result: message.payload });
      } else {
        failAndReset("failed");
      }
    };

    const handleError = () => failAndReset("failed");
    const timeoutId = window.setTimeout(() => failAndReset("timed-out"), timeoutMs);

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    worker.addEventListener("messageerror", handleError);

    try {
      worker.postMessage({
        id,
        type: "solve-heuristic",
        payload: {
          cardIds,
          options,
        },
      });
    } catch {
      failAndReset("failed");
    }
  });
}

async function solveFantasylandHeuristicResponsive(cardIds, options) {
  const workerResponse = await solveFantasylandHeuristicInWorker(cardIds, options);
  if (workerResponse.status === "ok") return workerResponse.result;

  const fallbackBudget = Math.min(Number(options.timeLimitMs ?? 0), 2500);
  const result = solveFantasylandHeuristic(cardIds, {
    ...options,
    timeLimitMs: fallbackBudget,
    maxSolutions: Math.min(Number(options.maxSolutions ?? 12), 12),
    fastMode: true,
  });
  return {
    ...result,
    workerFallback: workerResponse.status,
    searchOrder: `${result.searchOrder} Engine: short main-thread fallback because the heuristic worker was ${workerResponse.status}.`,
  };
}

async function solveFantasylandExactInWorker(cardIds, options) {
  const worker = getExactWorker();
  if (!worker) return { status: "unavailable" };

  const id = String((exactWorkerRequestId += 1));
  const timeoutMs = Math.max(1500, Number(options.timeLimitMs ?? 0) + 1500);

  return new Promise((resolve) => {
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
      worker.removeEventListener("messageerror", handleError);
    };

    const finish = (response) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(response);
    };

    const failAndReset = (status) => {
      if (settled) return;
      if (status === "failed") exactWorkerUnavailable = true;
      resetExactWorker();
      finish({ status });
    };

    const handleMessage = (event) => {
      const message = event.data ?? {};
      if (message.id !== id) return;
      if (message.ok) {
        finish({ status: "ok", result: message.payload });
      } else {
        failAndReset("failed");
      }
    };

    const handleError = () => failAndReset("failed");
    const timeoutId = window.setTimeout(() => failAndReset("timed-out"), timeoutMs);

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    worker.addEventListener("messageerror", handleError);

    try {
      worker.postMessage({
        id,
        type: "solve-exact",
        payload: {
          cardIds,
          options,
          preferWasm: true,
        },
      });
    } catch {
      failAndReset("failed");
    }
  });
}

async function solveFantasylandExactBucket(cardIds, options) {
  const workerResponse = await solveFantasylandExactInWorker(cardIds, options);
  if (workerResponse.status === "ok") return workerResponse.result;
  if (!options.allowSynchronousFallback) return null;
  if (workerResponse.status === "timed-out") return null;

  return solveFantasylandExactHighBuckets(cardIds, options);
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
    source:
      payload.mode === "low-two"
        ? "native exact 0-2 row low-bucket"
        : payload.mode === "three-plus-low"
          ? "native exact 3+ low-bucket"
          : "native exact high-bucket",
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
  const previousOpenRows = Number(previousProgress?.highCurrentDiscardRows ?? 0);

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
        currentDiscardRows: 0,
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
        skipRows: previousOpenRows,
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
  const fullyCheckedThisChunk = Number(
    payload.fullyCheckedDiscards ?? (payload.timedOut ? Math.max(0, checkedThisChunk - 1) : checkedThisChunk),
  );
  const completedDiscards = candidateCount
    ? Math.min(candidateCount, skipDiscards + fullyCheckedThisChunk)
    : skipDiscards + fullyCheckedThisChunk;
  const openRowsThisChunk = Number(payload.openDiscardRowsCompleted ?? 0);
  const currentDiscardRows =
    completedDiscards >= candidateCount || (!payload.timedOut && !payload.rowLimitHit)
      ? 0
      : fullyCheckedThisChunk > 0
        ? openRowsThisChunk
        : previousOpenRows + openRowsThisChunk;
  const exhaustedHighBuckets = Boolean(
    candidateCount && !payload.timedOut && !payload.rowLimitHit && completedDiscards >= candidateCount,
  );
  const nativePlacement = nativePlacementFromPayload(payload);
  if (nativePlacement) saveBestKnownSolution(nativePlacement, "native exact high-bucket");

  const progress = saveExactProgressForCurrentDeal({
    highCandidateDiscards: candidateCount,
    highCompletedDiscards: completedDiscards,
    highCurrentDiscardRows: currentDiscardRows,
    highExhausted: exhaustedHighBuckets,
    highLastChunkStart: skipDiscards,
    highLastChunkRowStart: previousOpenRows,
    highLastChunkChecked: checkedThisChunk,
    highLastChunkFullyChecked: fullyCheckedThisChunk,
    highLastChunkRowsCompleted: openRowsThisChunk,
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
      currentDiscardRows,
      candidateDiscards: candidateCount,
      exhausted: exhaustedHighBuckets,
      advanced: completedDiscards > skipDiscards || currentDiscardRows > previousOpenRows,
      rowPartitions: Number(payload.rowPartitions ?? 0),
      columnPartitions: Number(payload.columnPartitions ?? 0),
    },
    searchOrder: `Native exact high-bucket chunk checked ${checkedThisChunk.toLocaleString()} discard candidate${checkedThisChunk === 1 ? "" : "s"} from offset ${skipDiscards.toLocaleString()} and row offset ${previousOpenRows.toLocaleString()}; local progress is ${completedDiscards.toLocaleString()}/${candidateCount.toLocaleString()} discards plus ${currentDiscardRows.toLocaleString()} rows on the current discard.`,
  });
}

function nativeExactThreePlusResult({
  best,
  solutions,
  elapsedMs,
  attempts,
  candidateCount,
  checkedDiscards,
  exhaustedThreePlusRows,
  timedOut,
  searchOrder,
  nativeThreePlusProgress,
}) {
  const lowTwoRowCeiling = theoreticalMaxTotalForHandCount(5);
  const provenOptimal = Boolean(best) && exhaustedThreePlusRows && best.score.total > lowTwoRowCeiling;

  return {
    best,
    solutions: uniqueSortedSolutions(solutions).slice(0, 24),
    bestByHandCount: bucketSummariesForBest(best, exhaustedThreePlusRows, provenOptimal),
    attempts,
    elapsedMs,
    candidateCount,
    exact: provenOptimal,
    exhaustedHighBuckets: true,
    exhaustedThreePlusRows,
    exhaustedLowRows: false,
    highBucketsCovered: true,
    threePlusRowsCovered: exhaustedThreePlusRows,
    lowTwoRowCeiling,
    timedOut,
    checkedDiscards: candidateCount,
    checkedThreeRowDiscards: checkedDiscards,
    checkedLowRowDiscards: 0,
    rowPartitions: 0,
    threeRowPartitions: Number(nativeThreePlusProgress?.rowPartitions ?? 0),
    lowRowPartitions: 0,
    columnPartitions: Number(nativeThreePlusProgress?.columnPartitions ?? 0),
    nativeThreePlusProgress,
    searchOrder,
  };
}

async function solveFantasylandExactThreePlusNative(cardIds, incumbentSolution, timeLimitMs) {
  if (timeLimitMs < 200) return null;

  const previousProgress = exactProgressForCurrentDeal();
  const previousCandidateCount = Number(previousProgress?.threePlusCandidateDiscards ?? 0);
  const previousCompleted = Number(previousProgress?.threePlusCompletedDiscards ?? 0);
  const previousOpenRows = Number(previousProgress?.threePlusCurrentDiscardRows ?? 0);

  if (previousProgress?.threePlusExhausted) {
    return nativeExactThreePlusResult({
      best: incumbentSolution,
      solutions: [incumbentSolution],
      elapsedMs: 0,
      attempts: 0,
      candidateCount: previousCandidateCount,
      checkedDiscards: previousCompleted,
      exhaustedThreePlusRows: true,
      timedOut: false,
      nativeThreePlusProgress: {
        completedDiscards: previousCompleted,
        currentDiscardRows: 0,
        candidateDiscards: previousCandidateCount,
        exhausted: true,
        advanced: false,
      },
      searchOrder: `Native exact 3+ low-bucket proof loaded from local progress (${previousCompleted}/${previousCandidateCount} discard candidates checked).`,
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
        mode: "three-plus-low",
        cards: canonicalOrderedCards(cardIds),
        seconds,
        incumbent: incumbentSolution?.score.total ?? 0,
        skipDiscards,
        skipRows: previousOpenRows,
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
  const fullyCheckedThisChunk = Number(
    payload.fullyCheckedDiscards ?? (payload.timedOut ? Math.max(0, checkedThisChunk - 1) : checkedThisChunk),
  );
  const completedDiscards = candidateCount
    ? Math.min(candidateCount, skipDiscards + fullyCheckedThisChunk)
    : skipDiscards + fullyCheckedThisChunk;
  const openRowsThisChunk = Number(payload.openDiscardRowsCompleted ?? 0);
  const currentDiscardRows =
    completedDiscards >= candidateCount || (!payload.timedOut && !payload.rowLimitHit)
      ? 0
      : fullyCheckedThisChunk > 0
        ? openRowsThisChunk
        : previousOpenRows + openRowsThisChunk;
  const exhaustedThreePlusRows = Boolean(
    candidateCount && !payload.timedOut && !payload.rowLimitHit && completedDiscards >= candidateCount,
  );
  const nativePlacement = nativePlacementFromPayload(payload);
  if (nativePlacement) saveBestKnownSolution(nativePlacement, nativePlacement.source);

  const progress = saveExactProgressForCurrentDeal({
    threePlusCandidateDiscards: candidateCount,
    threePlusCompletedDiscards: completedDiscards,
    threePlusCurrentDiscardRows: currentDiscardRows,
    threePlusExhausted: exhaustedThreePlusRows,
    threePlusLastChunkStart: skipDiscards,
    threePlusLastChunkRowStart: previousOpenRows,
    threePlusLastChunkChecked: checkedThisChunk,
    threePlusLastChunkFullyChecked: fullyCheckedThisChunk,
    threePlusLastChunkRowsCompleted: openRowsThisChunk,
    threePlusLastChunkTimedOut: Boolean(payload.timedOut),
    threePlusLastBestTotal: nativePlacement?.score.total ?? incumbentSolution?.score.total ?? 0,
  });

  const solutions = uniqueSortedSolutions([incumbentSolution, nativePlacement]);
  const best = solutions[0] ?? incumbentSolution ?? null;

  return nativeExactThreePlusResult({
    best,
    solutions,
    elapsedMs,
    attempts: Number(payload.rowPartitions ?? 0) + Number(payload.columnPartitions ?? 0),
    candidateCount,
    checkedDiscards: completedDiscards,
    exhaustedThreePlusRows,
    timedOut: Boolean(payload.timedOut),
    nativeThreePlusProgress: {
      ...progress,
      completedDiscards,
      currentDiscardRows,
      candidateDiscards: candidateCount,
      exhausted: exhaustedThreePlusRows,
      advanced: completedDiscards > skipDiscards || currentDiscardRows > previousOpenRows,
      rowPartitions: Number(payload.rowPartitions ?? 0),
      columnPartitions: Number(payload.columnPartitions ?? 0),
    },
    searchOrder: `Native exact 3+ low-bucket chunk checked ${checkedThisChunk.toLocaleString()} discard candidate${checkedThisChunk === 1 ? "" : "s"} from offset ${skipDiscards.toLocaleString()} and row offset ${previousOpenRows.toLocaleString()}; local progress is ${completedDiscards.toLocaleString()}/${candidateCount.toLocaleString()} discards plus ${currentDiscardRows.toLocaleString()} rows on the current discard.`,
  });
}

function nativeExactLowResult({
  best,
  solutions,
  elapsedMs,
  attempts,
  candidateCount,
  checkedDiscards,
  exhaustedLowRows,
  timedOut,
  searchOrder,
  nativeLowProgress,
}) {
  return {
    best,
    solutions: uniqueSortedSolutions(solutions).slice(0, 24),
    bestByHandCount: bucketSummariesForBest(best, exhaustedLowRows, exhaustedLowRows),
    attempts,
    elapsedMs,
    candidateCount,
    exact: Boolean(best) && exhaustedLowRows,
    exhaustedHighBuckets: true,
    exhaustedThreePlusRows: true,
    exhaustedLowRows,
    highBucketsCovered: true,
    threePlusRowsCovered: true,
    lowTwoRowCeiling: theoreticalMaxTotalForHandCount(5),
    timedOut,
    checkedDiscards: candidateCount,
    checkedThreeRowDiscards: candidateCount,
    checkedLowRowDiscards: checkedDiscards,
    rowPartitions: 0,
    threeRowPartitions: 0,
    lowRowPartitions: Number(nativeLowProgress?.rowPartitions ?? 0),
    columnPartitions: Number(nativeLowProgress?.columnPartitions ?? 0),
    nativeLowProgress,
    searchOrder,
  };
}

async function solveFantasylandExactLowNative(cardIds, incumbentSolution, timeLimitMs) {
  if (timeLimitMs < 200) return null;

  const previousProgress = exactProgressForCurrentDeal();
  const previousCandidateCount = Number(previousProgress?.lowCandidateDiscards ?? 0);
  const previousCompleted = Number(previousProgress?.lowCompletedDiscards ?? 0);
  const previousOpenRows = Number(previousProgress?.lowCurrentDiscardRows ?? 0);

  if (previousProgress?.lowExhausted) {
    return nativeExactLowResult({
      best: incumbentSolution,
      solutions: [incumbentSolution],
      elapsedMs: 0,
      attempts: 0,
      candidateCount: previousCandidateCount,
      checkedDiscards: previousCompleted,
      exhaustedLowRows: true,
      timedOut: false,
      nativeLowProgress: {
        completedDiscards: previousCompleted,
        currentDiscardRows: 0,
        candidateDiscards: previousCandidateCount,
        exhausted: true,
        advanced: false,
      },
      searchOrder: `Native exact 0-2 row low-bucket proof loaded from local progress (${previousCompleted}/${previousCandidateCount} discard candidates checked).`,
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
        mode: "low-two",
        cards: canonicalOrderedCards(cardIds),
        seconds,
        incumbent: incumbentSolution?.score.total ?? 0,
        skipDiscards,
        skipRows: previousOpenRows,
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
  const fullyCheckedThisChunk = Number(
    payload.fullyCheckedDiscards ?? (payload.timedOut ? Math.max(0, checkedThisChunk - 1) : checkedThisChunk),
  );
  const completedDiscards = candidateCount
    ? Math.min(candidateCount, skipDiscards + fullyCheckedThisChunk)
    : skipDiscards + fullyCheckedThisChunk;
  const openRowsThisChunk = Number(payload.openDiscardRowsCompleted ?? 0);
  const currentDiscardRows =
    completedDiscards >= candidateCount || (!payload.timedOut && !payload.rowLimitHit)
      ? 0
      : fullyCheckedThisChunk > 0
        ? openRowsThisChunk
        : previousOpenRows + openRowsThisChunk;
  const exhaustedLowRows = Boolean(
    candidateCount && !payload.timedOut && !payload.rowLimitHit && completedDiscards >= candidateCount,
  );
  const nativePlacement = nativePlacementFromPayload(payload);
  if (nativePlacement) saveBestKnownSolution(nativePlacement, nativePlacement.source);

  const progress = saveExactProgressForCurrentDeal({
    lowCandidateDiscards: candidateCount,
    lowCompletedDiscards: completedDiscards,
    lowCurrentDiscardRows: currentDiscardRows,
    lowExhausted: exhaustedLowRows,
    lowLastChunkStart: skipDiscards,
    lowLastChunkRowStart: previousOpenRows,
    lowLastChunkChecked: checkedThisChunk,
    lowLastChunkFullyChecked: fullyCheckedThisChunk,
    lowLastChunkRowsCompleted: openRowsThisChunk,
    lowLastChunkTimedOut: Boolean(payload.timedOut),
    lowLastBestTotal: nativePlacement?.score.total ?? incumbentSolution?.score.total ?? 0,
  });

  const solutions = uniqueSortedSolutions([incumbentSolution, nativePlacement]);
  const best = solutions[0] ?? incumbentSolution ?? null;

  return nativeExactLowResult({
    best,
    solutions,
    elapsedMs,
    attempts: Number(payload.rowPartitions ?? 0) + Number(payload.columnPartitions ?? 0),
    candidateCount,
    checkedDiscards: completedDiscards,
    exhaustedLowRows,
    timedOut: Boolean(payload.timedOut),
    nativeLowProgress: {
      ...progress,
      completedDiscards,
      currentDiscardRows,
      candidateDiscards: candidateCount,
      exhausted: exhaustedLowRows,
      advanced: completedDiscards > skipDiscards || currentDiscardRows > previousOpenRows,
      rowPartitions: Number(payload.rowPartitions ?? 0),
      columnPartitions: Number(payload.columnPartitions ?? 0),
    },
    searchOrder: `Native exact 0-2 row low-bucket chunk checked ${checkedThisChunk.toLocaleString()} discard candidate${checkedThisChunk === 1 ? "" : "s"} from offset ${skipDiscards.toLocaleString()} and row offset ${previousOpenRows.toLocaleString()}; local progress is ${completedDiscards.toLocaleString()}/${candidateCount.toLocaleString()} discards plus ${currentDiscardRows.toLocaleString()} rows on the current discard.`,
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

function handAnnotationLabel(hand) {
  if (hand.key === "straight-flush") return "STR. FLUSH";
  if (hand.key === "four-kind") return "4 OF A KIND";
  if (hand.key === "three-kind") return "3 OF A KIND";
  return hand.shortLabel.toUpperCase();
}

function lineAmountLabel(hand, value, bonus = 1) {
  const quality = hand.quality ? "★" : "";
  if (bonus > 1) return `${money(hand.base)} × ${bonus}${quality}`;
  return `${money(value)}${quality}`;
}

function renderLineAnnotation(line, className = "") {
  if (!line?.scores) return `<div class="line-annotation ${className} is-empty"></div>`;
  return `
    <div class="line-annotation ${className}" title="${line.label}: ${line.hand.label}, ${money(line.value)}">
      <strong>${lineAmountLabel(line.hand, line.value, line.bonus)}</strong>
      <span>${handAnnotationLabel(line.hand)}</span>
    </div>
  `;
}

function applyLineAnnotation(element, line, className) {
  element.className = `line-annotation ${className}${line?.scores ? "" : " is-empty"}`;
  element.title = line?.scores ? `${line.label}: ${line.hand.label}, ${money(line.value)}` : "";
  element.innerHTML = line?.scores
    ? `
      <strong>${lineAmountLabel(line.hand, line.value, line.bonus)}</strong>
      <span>${handAnnotationLabel(line.hand)}</span>
    `
    : "";
}

function applyDiscardAnnotation(element, score) {
  if (!score.discardHand || score.discardHand.base === 0) {
    element.className = "line-annotation discard-line is-empty";
    element.title = "";
    element.innerHTML = "";
    return;
  }

  if (!score.discardScores) {
    element.className = "line-annotation discard-line is-muted";
    element.title = "Discard only scores when all 9 grid hands score";
    element.innerHTML = `
      <strong>Not scored</strong>
      <span>${handAnnotationLabel(score.discardHand)}</span>
    `;
    return;
  }

  element.className = "line-annotation discard-line";
  element.title = `Discard: ${score.discardHand.label}, ${money(score.discardValue)}`;
  element.innerHTML = `
    <strong>${lineAmountLabel(score.discardHand, score.discardValue, 3)}</strong>
    <span>${handAnnotationLabel(score.discardHand)}</span>
  `;
}

function renderBoardAnnotations(score) {
  const rows = score.lines.filter((line) => line.type === "row");
  const columns = score.lines.filter((line) => line.type === "column");
  const corner = score.lines.find((line) => line.type === "corner");

  rowAnnotations.innerHTML = rows.map((line) => renderLineAnnotation(line, "row-line")).join("");
  columnAnnotations.innerHTML = columns.map((line) => renderLineAnnotation(line, "column-line")).join("");
  applyLineAnnotation(cornerAnnotation, corner, "corner-line");
  applyDiscardAnnotation(discardAnnotation, score);
}

function renderEmptyBoardAnnotations() {
  rowAnnotations.innerHTML = Array.from({ length: 4 }, () => renderLineAnnotation(null, "row-line")).join("");
  columnAnnotations.innerHTML = Array.from({ length: 4 }, () => renderLineAnnotation(null, "column-line")).join("");
  cornerAnnotation.className = "line-annotation corner-line is-empty";
  cornerAnnotation.innerHTML = "";
  discardAnnotation.className = "line-annotation discard-line is-empty";
  discardAnnotation.innerHTML = "";
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
  const validation = attemptValidation();
  selectedCount.textContent = `${selected.size}/20`;
  if (selectedSource === "attempt" && selected.size > 0) {
    manualPickerHint.textContent = `${selected.size}/20 auto-selected`;
  } else if (selected.size === 20) {
    manualPickerHint.textContent = "20/20 selected";
  } else {
    const remaining = 20 - selected.size;
    manualPickerHint.textContent = `Choose ${remaining} more`;
  }
  optimizeButton.disabled = !canOptimizeCurrentInputs();
  if (validation.valid && (selected.size !== 20 || !validation.matchesSelectedDeal)) {
    statusLine.textContent = "Ready to optimize grid attempt.";
  } else if (selected.size === 20) {
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
  renderAttemptEditor();
}

function toggleCard(cardId) {
  latestResult = null;
  activeSolutionIndex = 0;
  resetOptimizerTimer();
  selectedSource = "manual";
  manualPickerDetails.open = true;
  if (selected.has(cardId)) selected.delete(cardId);
  else if (selected.size < 20) selected.add(cardId);
  renderSelectionState();
}

function clearSelection() {
  selected.clear();
  latestResult = null;
  activeSolutionIndex = 0;
  resetOptimizerTimer();
  selectedSource = "manual";
  manualPickerDetails.open = true;
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
  renderEmptyBoardAnnotations();
  solutionsRow.innerHTML = "";
  solutionsRow.classList.remove("has-layout-drawer");
  bucketList.innerHTML = "";
  renderBestKnownPanel();
  renderProofPanel();
  renderAttemptSummary();
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

  if (proof.status === "three-plus-complete") {
    proofSummary.textContent = `${proof.scope} complete: checked ${proof.completedDiscards}/${proof.totalCandidateDiscards} discard candidates. 0-2-row buckets still need proof because best known is ${money(proof.bestKnownTotal)}.`;
    return;
  }

  if (proof.status === "low-complete") {
    proofSummary.textContent = `${proof.scope} complete: checked ${proof.completedDiscards}/${proof.totalCandidateDiscards} discard candidates. Waiting for high and 3+ lower-bucket proof before certification.`;
    return;
  }

  const rowProgress =
    proof.currentDiscardRows > 0 ? ` plus ${proof.currentDiscardRows.toLocaleString()} row partitions on the current discard` : "";
  proofSummary.textContent = `${proof.scope} proof running: checked ${proof.completedDiscards}/${proof.totalCandidateDiscards} discard candidates${rowProgress}. No score above ${money(proof.bestKnownTotal)} found yet.`;
}

function activeSolution() {
  return latestResult?.solutions?.[activeSolutionIndex] ?? latestResult?.best ?? null;
}

function solutionOutcomeKey(solution) {
  const score = solution.score;
  return [score.total, score.handCount, score.qualityHandCount].join("|");
}

const SCORING_HAND_ORDER = [
  ["straight-flush", "straight flush", "straight flushes"],
  ["four-kind", "quad", "quads"],
  ["straight", "straight", "straights"],
  ["three-kind", "trip", "trips"],
  ["flush", "flush", "flushes"],
  ["two-pair", "two pair", "two pairs"],
  ["pair", "pair", "pairs"],
];

function scoringHandCounts(solution) {
  const counts = new Map();
  const addHand = (hand) => {
    if (!hand || hand.base <= 0) return;
    counts.set(hand.key, (counts.get(hand.key) ?? 0) + 1);
  };

  solution.score.lines.forEach((line) => {
    if (line.scores) addHand(line.hand);
  });
  if (solution.score.discardScores) addHand(solution.score.discardHand);

  return counts;
}

function solutionHandProfileKey(solution) {
  const counts = scoringHandCounts(solution);
  return SCORING_HAND_ORDER.map(([key]) => counts.get(key) ?? 0).join("|");
}

function scoringHandSummary(solution) {
  const counts = scoringHandCounts(solution);
  return SCORING_HAND_ORDER.flatMap(([key, singular, plural]) => {
    const count = counts.get(key) ?? 0;
    if (!count) return [];
    return `${count} ${count === 1 ? singular : plural}`;
  }).join(" · ");
}

function groupedSolutions() {
  const groups = [];
  const byKey = new Map();

  (latestResult?.solutions ?? []).forEach((solution, index) => {
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

function renderSolutionGroups() {
  const groups = groupedSolutions().slice(0, 12);
  solutionsRow.classList.toggle("has-layout-drawer", groups.some((group) => group.variants.length > 1));
  solutionsRow.innerHTML = "";

  groups.forEach((group) => {
    const activeInGroup = group.indexes.includes(activeSolutionIndex);
    const activeVariant = group.variants.find((variant) => variant.indexes.includes(activeSolutionIndex));
    const wayCount = group.variants.length;
    const groupElement = document.createElement("div");
    groupElement.className = `solution-group${activeInGroup ? " is-active" : ""}`;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "solution-pill";
    button.title =
      wayCount === 1
        ? "Show this scoring way"
        : "Show the first scoring way for this tied outcome.";
    button.innerHTML = `${money(group.representative.score.total)}<span>${group.representative.score.handCount} hands · ${group.representative.score.qualityHandCount} quality · ${wayCount} ${wayCount === 1 ? "way" : "ways"}</span>`;
    button.addEventListener("click", () => {
      activeSolutionIndex = activeVariant?.indexes[0] ?? group.indexes[0];
      renderResult();
    });
    groupElement.append(button);

    if (wayCount > 1) {
      const details = document.createElement("details");
      details.className = "variant-details";
      if (activeInGroup) details.open = true;

      const summary = document.createElement("summary");
      summary.textContent = `${wayCount} scoring ways`;
      summary.title =
        "Different scoring structures with the same total, hand count, and quality count.";
      details.append(summary);

      const variantList = document.createElement("div");
      variantList.className = "variant-list";
      group.variants.forEach((variant, variantIndex) => {
        const solution = variant.representative;
        const solutionIndex = variant.indexes[0];
        const variantButton = document.createElement("button");
        variantButton.type = "button";
        variantButton.className = `variant-button${variant.indexes.includes(activeSolutionIndex) ? " is-active" : ""}`;
        variantButton.textContent = scoringHandSummary(solution);
        variantButton.addEventListener("click", () => {
          activeSolutionIndex = solutionIndex;
          renderResult();
        });
        variantList.append(variantButton);
      });
      details.append(variantList);
      groupElement.append(details);
    }

    solutionsRow.append(groupElement);
  });
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
  runtimeInfo.textContent = latestResult.isAttemptView
    ? "Player attempt from screenshot"
    : latestResult.isBestKnownView
    ? latestResult.exact
      ? "Certified saved placement"
      : "Saved best-known placement"
    : latestResult.exact
      ? `Certified optimal · ${Math.round(latestResult.elapsedMs).toLocaleString()} ms`
      : `${Math.round(latestResult.elapsedMs).toLocaleString()} ms · ${latestResult.attempts.toLocaleString()} searches`;
  resultModeLabel.textContent = latestResult.isAttemptView
    ? "Grid Attempt"
    : latestResult.exact
      ? "Best Possible"
      : "Best Found";

  boardGrid.innerHTML = solution.grid.map((cardId) => renderPlayingCard(cardId)).join("");
  discardCards.innerHTML = solution.discard.map((cardId) => renderPlayingCard(cardId)).join("");
  renderBoardAnnotations(score);

  renderSolutionGroups();

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

  renderBestKnownPanel();
  renderProofPanel();
  renderAttemptSummary();
}

async function optimize() {
  if (selected.size !== 20) return;

  resetOptimizerTimer();
  optimizeButton.disabled = true;
  optimizeButton.textContent = "Optimizing...";
  clearButton.disabled = true;
  const bestKnown = bestKnownForCurrentDeal();
  const attemptSolution = currentAttemptSolution({ requireSelectedMatch: true });
  const lowerBoundTotal = Math.max(bestKnown?.score.total ?? 0, attemptSolution?.score.total ?? 0);
  const proof = exactProofForCurrentDeal();
  const hasCertifiedPlacement =
    bestKnown &&
    proof?.status === "proven" &&
    proof.bestKnownTotal === bestKnown.score.total &&
    (!attemptSolution || compareScores(bestKnown.score, attemptSolution.score) >= 0);

  if (hasCertifiedPlacement) {
    latestResult = resultFromBestKnown(bestKnown, { exact: true });
    activeSolutionIndex = 0;
    statusLine.textContent = `Certified optimum loaded instantly: ${money(bestKnown.score.total)}.`;
    renderResult();
    optimizeButton.disabled = !canOptimizeCurrentInputs();
    optimizeButton.textContent = "Optimize";
    clearButton.disabled = false;
    renderAttemptSummary();
    return;
  }

  const timeBudget = Number(searchDepth.value);
  startOptimizerTimer(timeBudget, "Starting");
  const lowerBoundLabel = attemptSolution
    ? `grid attempt ${money(attemptSolution.score.total)}`
    : bestKnown
      ? `saved lower bound ${money(bestKnown.score.total)}`
      : null;
  statusLine.textContent = lowerBoundLabel
    ? `Optimizing from ${lowerBoundLabel}. ${searchBudgetLabel()}.`
    : `Optimizing. ${searchBudgetLabel()}.`;

  await new Promise((resolve) => window.setTimeout(resolve, 30));

  try {
    const heuristicBudget = Math.max(750, Math.floor(timeBudget * 0.8));
    const exactBudget = Math.max(0, timeBudget - heuristicBudget);
    setOptimizerTimerPhase("Heuristic search");
    latestResult = await solveFantasylandHeuristicResponsive(selectedCards(), {
      timeLimitMs: heuristicBudget,
      maxSolutions: 12,
      incumbentTotal: lowerBoundTotal,
      initialPlacements: attemptSolution ? [attemptSolution] : [],
      fastMode: true,
    });
    latestResult = mergeAttemptIntoResult(latestResult, attemptSolution);
    latestResult = mergeBestKnownIntoResult(latestResult, bestKnown);
    const exactStartedAt = performance.now();
    setOptimizerTimerPhase("Exact proof");
    let exactHighResult = await solveFantasylandExactHighNative(selectedCards(), latestResult.best, exactBudget);
    if (!exactHighResult) {
      exactHighResult = await solveFantasylandExactBucket(selectedCards(), {
        timeLimitMs: exactBudget,
        maxSolutions: 24,
        incumbentSolution: latestResult.best,
        sourceLabel: "exact high-bucket",
      });
    }
    latestResult = mergeSolverResults(latestResult, exactHighResult);
    let remainingExactBudget = exactHighResult?.exhaustedHighBuckets
      ? Math.max(0, exactBudget - (performance.now() - exactStartedAt))
      : 0;
    if (!latestResult.exact && remainingExactBudget > 50) {
      setOptimizerTimerPhase("Lower buckets");
      let exactThreePlusResult = await solveFantasylandExactThreePlusNative(
        selectedCards(),
        latestResult.best,
        remainingExactBudget,
      );
      if (!exactThreePlusResult) {
        exactThreePlusResult = await solveFantasylandExactBucket(selectedCards(), {
          timeLimitMs: remainingExactBudget,
          maxSolutions: 24,
          minGridHandCount: 0,
          maxGridHandCount: 7,
          includeThreePositiveRows: true,
          highBucketsAlreadyExhausted: true,
          incumbentSolution: latestResult.best,
          sourceLabel: "exact 3+ row low-bucket",
        });
      }
      latestResult = mergeSolverResults(latestResult, exactThreePlusResult);
      remainingExactBudget = exactThreePlusResult?.exhaustedThreePlusRows
        ? Math.max(0, exactBudget - (performance.now() - exactStartedAt))
        : 0;
      if (!latestResult.exact && remainingExactBudget > 50) {
        setOptimizerTimerPhase("Final buckets");
        let exactLowRowsResult = await solveFantasylandExactLowNative(
          selectedCards(),
          latestResult.best,
          remainingExactBudget,
        );
        if (!exactLowRowsResult) {
          exactLowRowsResult = await solveFantasylandExactBucket(selectedCards(), {
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
        }
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
          : latestResult.nativeLowProgress?.advanced
            ? "Final lower-bucket progress saved"
          : latestResult.nativeThreePlusProgress?.advanced
            ? "3+ lower-bucket progress saved"
          : latestResult.nativeHighProgress?.advanced
            ? "Exact progress saved"
          : latestResult.nativeLowProgress
            ? "Best known kept; final lower-bucket chunk will retry the current candidate"
          : latestResult.nativeThreePlusProgress
            ? "Best known kept; lower-bucket chunk will retry the current candidate"
          : latestResult.nativeHighProgress
            ? "Best known kept; exact chunk will retry the current candidate"
          : latestResult.usedAttemptLowerBound
            ? "Player attempt kept as lower bound"
          : latestResult.usedSavedLowerBound
            ? "Saved lower bound kept"
          : latestResult.workerFallback
            ? "Short fallback search; open localhost for full worker search"
            : "Best found, not proven";
    statusLine.textContent = `${resultStatus}: ${money(latestResult.best.score.total)}. Bucket bounds shown below.`;
    renderResult();
    finishOptimizerTimer(latestResult.exact ? "Certified" : "Done");
  } catch (error) {
    statusLine.textContent = error instanceof Error ? error.message : "Optimizer failed.";
    finishOptimizerTimer("Stopped");
  } finally {
    optimizeButton.disabled = !canOptimizeCurrentInputs();
    optimizeButton.textContent = "Optimize";
    clearButton.disabled = false;
    renderAttemptSummary();
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

optimizeButton.addEventListener("click", optimizeCurrentInputs);
clearButton.addEventListener("click", clearSelection);
showBestKnownButton.addEventListener("click", showBestKnownPlacement);
attemptScreenshot.addEventListener("change", handleAttemptScreenshotChange);
attemptGridSlots.addEventListener("change", handleAttemptSlotChange);
attemptDiscardSlots.addEventListener("change", handleAttemptSlotChange);
clearAttemptButton.addEventListener("click", clearAttempt);

await loadSeededBestKnown();
await loadExactProofStatuses();
renderSelectionState();
renderEmptyResult();
