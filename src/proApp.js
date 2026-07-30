import {
  JOKER_ID,
  PRO_CARD_BY_ID,
  PRO_DECK,
  SUIT_META,
  proCardLabel,
  sortProCardIds,
} from "./proCards.js";
import {
  createProHeuristicSession,
  finishProHeuristicSession,
  stepProHeuristicSession,
} from "./proHeuristicSolver.js?v=pro-search-7";
import { compareProScores, scoreProPlacement } from "./proScoring.js";
import {
  formatScoringWayCount,
  formatWayCount,
  groupSolutionsByOutcome,
  scoringHandSummary,
  solutionOutcomeProfileKey,
} from "./solutionProfiles.js?v=solution-profiles-2";
import {
  proDisplayedScoreMismatch,
  recognizeProFantasylandScreenshot,
} from "./screenshotRecognizer.js?v=screenshot-recognizer-32";
import {
  attemptCardKey,
  reportNoEditReviewConfirmation,
} from "./recognizerFeedback.js?v=recognizer-feedback-1";
import {
  pinnedSolutionPortfolio,
  solutionPlacementKey,
} from "./solutionPortfolio.js?v=solution-portfolio-1";

const DEAL_SIZE = 30;
const GRID_SIZE = 25;
const DISCARD_SIZE = 5;
const STORAGE_KEY = "pile-up-poker.best-known-pro.v1";

const selected = new Set([JOKER_ID]);
const attemptGridCards = Array(GRID_SIZE).fill("");
const attemptDiscardCards = Array(DISCARD_SIZE).fill("");
const attemptReview = {
  grid: Array(GRID_SIZE).fill(false),
  discard: Array(DISCARD_SIZE).fill(false),
};
let latestResult = null;
let activeSolutionIndex = 0;
let workerRequestId = 0;
let timerInterval = null;
let timerStartedAt = 0;
let timerBudget = 0;
let attemptPreviewUrl = null;
let attemptScreenshotExpectedScore = null;
let selectedSource = "manual";
let activeSearchCancel = null;
let recognitionRequestId = 0;
let recognitionInProgress = false;
let searchGeneration = 0;
let searchInProgress = false;
let attemptImportedCardKey = null;
let attemptWasEdited = false;
const searchHistoryByDeal = new Map();

const deckGrid = document.querySelector("#deckGrid");
const selectedCount = document.querySelector("#selectedCount");
const manualPickerHint = document.querySelector("#manualPickerHint");
const manualPickerDetails = document.querySelector("#manualPickerDetails");
const gridAttemptDetails = document.querySelector("#gridAttemptDetails");
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
const confirmAttemptReviewButton = document.querySelector("#confirmAttemptReviewButton");
const topScore = document.querySelector("#topScore");
const resultModeLabel = document.querySelector("#resultModeLabel");
const resultTotal = document.querySelector("#resultTotal");
const resultBase = document.querySelector("#resultBase");
const resultHands = document.querySelector("#resultHands");
const resultMultiplier = document.querySelector("#resultMultiplier");
const resultQuality = document.querySelector("#resultQuality");
const boardGrid = document.querySelector("#boardGrid");
const discardCards = document.querySelector("#discardCards");
const rowAnnotations = document.querySelector("#rowAnnotations");
const columnAnnotations = document.querySelector("#columnAnnotations");
const cornerAnnotation = document.querySelector("#cornerAnnotation");
const discardAnnotation = document.querySelector("#discardAnnotation");
const solutionsRow = document.querySelector("#solutionsRow");
const runtimeInfo = document.querySelector("#runtimeInfo");
const searchSummary = document.querySelector("#searchSummary");

function money(value) {
  return `$${Number(value).toLocaleString()}`;
}

function dealKey(cardIds) {
  return sortProCardIds(cardIds).join(" ");
}

function normalizeProSolution(solution, requestedCardIds) {
  if (!solution?.grid || !solution?.discard) return null;
  const grid = [...solution.grid];
  const discard = [...solution.discard];
  const cards = [...grid, ...discard];
  if (
    grid.length !== GRID_SIZE ||
    discard.length !== DISCARD_SIZE ||
    cards.length !== DEAL_SIZE ||
    new Set(cards).size !== DEAL_SIZE ||
    !cards.includes(JOKER_ID) ||
    cards.some((cardId) => !PRO_CARD_BY_ID[cardId]) ||
    dealKey(cards) !== dealKey(requestedCardIds)
  ) {
    return null;
  }
  return {
    ...solution,
    grid,
    discard,
    score: scoreProPlacement(grid, discard),
  };
}

function selectedCards() {
  return sortProCardIds([...selected]);
}

function attemptCards() {
  return [...attemptGridCards, ...attemptDiscardCards].filter(Boolean);
}

function resetAttemptReview() {
  attemptReview.grid.fill(false);
  attemptReview.discard.fill(false);
}

function setAttemptReview(review = {}) {
  resetAttemptReview();
  (review.grid ?? []).forEach((needsReview, index) => {
    if (index < attemptReview.grid.length) attemptReview.grid[index] = Boolean(needsReview);
  });
  (review.discard ?? []).forEach((needsReview, index) => {
    if (index < attemptReview.discard.length) attemptReview.discard[index] = Boolean(needsReview);
  });
}

function attemptReviewCount() {
  return [...attemptReview.grid, ...attemptReview.discard].filter(Boolean).length;
}

function flagLowestConfidenceSlots(confidenceBySlot, count = 3) {
  const entries = [
    ...(confidenceBySlot?.grid ?? []).map((confidence, index) => ({
      zone: "grid",
      index,
      confidence,
    })),
    ...(confidenceBySlot?.discard ?? []).map((confidence, index) => ({
      zone: "discard",
      index,
      confidence,
    })),
  ].sort((first, second) => first.confidence - second.confidence);
  entries.slice(0, count).forEach(({ zone, index }) => {
    attemptReview[zone][index] = true;
  });
}

function attemptValidation() {
  const cards = attemptCards();
  const complete = cards.length === DEAL_SIZE && attemptGridCards.every(Boolean) && attemptDiscardCards.every(Boolean);
  const unique = new Set(cards).size === cards.length;
  const score = complete && unique ? scoreProPlacement(attemptGridCards, attemptDiscardCards) : null;
  return {
    cards,
    complete,
    unique,
    valid: complete && unique,
    score,
    matchesSelected: complete && unique && selected.size === DEAL_SIZE && dealKey(cards) === dealKey(selectedCards()),
  };
}

function attemptScreenshotScoreMismatch() {
  if (!attemptScreenshotExpectedScore) return null;
  const validation = attemptValidation();
  if (!validation.valid) return null;
  return proDisplayedScoreMismatch(
    validation.score,
    attemptScreenshotExpectedScore,
  );
}

function attemptIsActiveInput(validation = attemptValidation()) {
  return validation.valid && (selectedSource === "attempt" || selected.size !== DEAL_SIZE);
}

function currentScreenshotScoreMismatch() {
  return attemptIsActiveInput() ? attemptScreenshotScoreMismatch() : null;
}

function currentAttemptSolution() {
  const validation = attemptValidation();
  if (!validation.valid) return null;
  return {
    grid: [...attemptGridCards],
    discard: [...attemptDiscardCards],
    score: validation.score,
    source: "Grid attempt",
  };
}

function savedRecords() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function savedForCurrentDeal() {
  if (selected.size !== DEAL_SIZE) return null;
  const cards = selectedCards();
  return normalizeProSolution(savedRecords()[dealKey(cards)], cards);
}

function saveSolution(solution) {
  if (!solution) return;
  const requestedCards = [...(solution.grid ?? []), ...(solution.discard ?? [])];
  const normalized = normalizeProSolution(solution, requestedCards);
  if (!normalized) return;
  const records = savedRecords();
  const key = dealKey(requestedCards);
  const previous = records[key];
  const normalizedPrevious = normalizeProSolution(previous, requestedCards);
  if (!normalizedPrevious || compareProScores(normalized.score, normalizedPrevious.score) > 0) {
    records[key] = normalized;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {
      // Direct file previews may block storage. The result remains usable for
      // the current session even when persistence is unavailable.
    }
  }
}

function renderCardContent(cardId) {
  const card = PRO_CARD_BY_ID[cardId];
  if (card.joker) {
    return `
      <span class="joker-suits" aria-hidden="true">
        <span class="joker-suit suit-hearts">♥</span>
        <span class="joker-suit suit-spades">♠</span>
        <span class="joker-suit suit-clubs">♣</span>
        <span class="joker-suit suit-diamonds">♦</span>
      </span>
      <span class="card-center-rank" aria-hidden="true">★</span>
    `;
  }
  const suit = SUIT_META[card.suit];
  return `
    <span class="card-corner-rank">${card.rank}</span>
    <span class="card-corner-suit" aria-hidden="true">${suit.label}</span>
    <span class="card-center-rank" aria-hidden="true">${card.rank}</span>
  `;
}

function renderPlayingCard(cardId) {
  if (!cardId) return '<div class="playing-card empty" aria-hidden="true"></div>';
  const card = PRO_CARD_BY_ID[cardId];
  if (card.joker) {
    return `
      <div class="playing-card joker-card" role="img" aria-label="Joker">
        ${renderCardContent(cardId)}
      </div>
    `;
  }
  const suit = SUIT_META[card.suit];
  return `
    <div class="playing-card ${suit.colorClass}" role="img" aria-label="${card.rank} of ${suit.name}">
      ${renderCardContent(cardId)}
    </div>
  `;
}

function renderDeck() {
  deckGrid.innerHTML = "";
  for (const card of PRO_DECK) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.cardId = card.id;
    button.className = `card-button ${card.joker ? "joker-card joker-card-button is-required" : SUIT_META[card.suit].colorClass}`;
    button.setAttribute("aria-label", card.joker ? "Joker" : `${card.rank} of ${SUIT_META[card.suit].name}`);
    button.setAttribute("aria-pressed", selected.has(card.id) ? "true" : "false");
    button.innerHTML = renderCardContent(card.id);
    if (selected.has(card.id)) button.classList.add("is-selected");
    if (
      card.joker ||
      searchInProgress ||
      recognitionInProgress ||
      (!selected.has(card.id) && selected.size >= DEAL_SIZE)
    ) {
      button.disabled = true;
    }
    button.addEventListener("click", () => toggleCard(card.id));
    deckGrid.append(button);
  }
}

function renderAttemptSelect(zone, index, currentCardId) {
  const used = new Set(attemptCards());
  const options = PRO_DECK.map((card) => {
    const selectedAttribute = card.id === currentCardId ? " selected" : "";
    const disabledAttribute = used.has(card.id) && card.id !== currentCardId ? " disabled" : "";
    return `<option value="${card.id}"${selectedAttribute}${disabledAttribute}>${proCardLabel(card.id)}</option>`;
  }).join("");
  const card = currentCardId ? PRO_CARD_BY_ID[currentCardId] : null;
  const colorClass = card && !card.joker ? SUIT_META[card.suit].colorClass : "";
  const label = zone === "grid" ? `${Math.floor(index / 5) + 1}.${(index % 5) + 1}` : `D${index + 1}`;
  const needsReview = attemptReview[zone][index];
  const disabledAttribute = searchInProgress || recognitionInProgress ? " disabled" : "";
  const reviewAttributes = needsReview
    ? ' aria-invalid="true" aria-describedby="attemptSummary"'
    : "";
  return `
    <label class="attempt-slot${needsReview ? " is-review" : ""}">
      <span>${label}${needsReview ? "<em>Review</em>" : ""}</span>
      <select class="${colorClass}" data-attempt-zone="${zone}" data-attempt-index="${index}" aria-label="${zone} card ${index + 1}"${reviewAttributes}${disabledAttribute}>
        <option value="">--</option>
        ${options}
      </select>
    </label>
  `;
}

function renderAttemptEditor() {
  attemptGridSlots.innerHTML = attemptGridCards
    .map((cardId, index) => renderAttemptSelect("grid", index, cardId))
    .join("");
  attemptDiscardSlots.innerHTML = attemptDiscardCards
    .map((cardId, index) => renderAttemptSelect("discard", index, cardId))
    .join("");
  renderAttemptSummary();
}

function renderAttemptSummary() {
  const validation = attemptValidation();
  const reviewCount = attemptReviewCount();
  attemptSummary.classList.remove("is-good", "is-warning");
  confirmAttemptReviewButton.classList.toggle("is-hidden", reviewCount === 0);
  confirmAttemptReviewButton.disabled = searchInProgress || recognitionInProgress;
  if (validation.cards.length === 0) {
    attemptScoreBadge.textContent = "Optional";
    attemptSummary.textContent =
      "Optional baseline: add a player grid here, or upload a screenshot to fill it automatically.";
    return;
  }
  if (!validation.unique) {
    attemptScoreBadge.textContent = `${validation.cards.length}/30`;
    attemptSummary.textContent = "Duplicate cards in the attempt. Each card can only appear once.";
    attemptSummary.classList.add("is-warning");
    return;
  }
  if (!validation.complete) {
    attemptScoreBadge.textContent = `${validation.cards.length}/30`;
    attemptSummary.textContent = `Add ${DEAL_SIZE - validation.cards.length} more cards to finish this board.`;
    return;
  }
  attemptScoreBadge.textContent = money(validation.score.total);
  const mismatch = attemptScreenshotScoreMismatch();
  if (mismatch) {
    const expectedParts = [
      Number.isFinite(mismatch.expected.total) ? money(mismatch.expected.total) : null,
      Number.isFinite(mismatch.expected.handCount)
        ? `${mismatch.expected.handCount} hands`
        : null,
    ].filter(Boolean);
    attemptSummary.textContent =
      `Detected cards score ${money(validation.score.total)} with ${validation.score.handCount} hands, ` +
      `but the screenshot shows ${expectedParts.join(" and ")}. ` +
      (attemptIsActiveInput(validation)
        ? "This is only a warning; Optimize will use the cards shown above."
        : "The separately selected manual deal is unaffected.");
    attemptSummary.classList.add("is-warning");
    return;
  }
  const baseText =
    `${money(validation.score.total)} · ${validation.score.handCount} hands · ` +
    `${validation.score.qualityHandCount} quality`;
  if (reviewCount) {
    attemptSummary.textContent =
      `${baseText}. Check ${reviewCount} highlighted card${reviewCount === 1 ? "" : "s"}. ` +
      `Choose “Cards Look Right” to clear the highlights, or Optimize anyway.`;
    attemptSummary.classList.add("is-warning");
    return;
  }

  if (selected.size === DEAL_SIZE && !validation.matchesSelected) {
    attemptSummary.textContent = `${baseText}. Optimize will use this grid attempt and update the selected deal.`;
    return;
  }

  const resultMatchesAttempt =
    latestResult?.best &&
    dealKey([...latestResult.best.grid, ...latestResult.best.discard]) === dealKey(validation.cards);
  const bestScore =
    latestResult?.isAttemptView || !resultMatchesAttempt
      ? null
      : latestResult?.best?.score ?? null;
  if (!bestScore) {
    attemptSummary.textContent = `${baseText}. Optimize will keep this as the starting floor.`;
    attemptSummary.classList.add("is-good");
    return;
  }

  const difference = bestScore.total - validation.score.total;
  if (difference > 0) {
    attemptSummary.textContent = `${baseText}. Best found is +${money(difference)} higher.`;
  } else if (difference === 0) {
    attemptSummary.textContent = `${baseText}. This matches the best found score.`;
    attemptSummary.classList.add("is-good");
  } else {
    attemptSummary.textContent = `${baseText}. This is above the saved result and remains the starting floor.`;
    attemptSummary.classList.add("is-good");
  }
}

function selectAttemptAsDeal() {
  const validation = attemptValidation();
  if (!validation.valid) return false;
  selected.clear();
  validation.cards.forEach((cardId) => selected.add(cardId));
  selectedSource = "attempt";
  return true;
}

function selectFilledAttemptCardsAsDeal() {
  const cards = attemptCards();
  if (new Set(cards).size !== cards.length) return false;
  selected.clear();
  selected.add(JOKER_ID);
  cards.forEach((cardId) => selected.add(cardId));
  selectedSource = "attempt";
  return true;
}

function handleAttemptSlotChange(event) {
  if (searchInProgress || recognitionInProgress) return;
  const select = event.target.closest("select[data-attempt-zone]");
  if (!select) return;
  const index = Number(select.dataset.attemptIndex);
  if (select.dataset.attemptZone === "grid") {
    if (attemptGridCards[index] !== select.value) attemptWasEdited = true;
    attemptGridCards[index] = select.value;
    attemptReview.grid[index] = false;
  } else {
    if (attemptDiscardCards[index] !== select.value) attemptWasEdited = true;
    attemptDiscardCards[index] = select.value;
    attemptReview.discard[index] = false;
  }
  const validation = attemptValidation();
  if (validation.valid) selectAttemptAsDeal();
  else if (selectedSource === "attempt" && validation.unique) selectFilledAttemptCardsAsDeal();
  latestResult = null;
  activeSolutionIndex = 0;
  renderSelectionState();
}

function setAttemptCards(grid, discard) {
  attemptGridCards.splice(0, GRID_SIZE, ...grid);
  attemptDiscardCards.splice(0, DISCARD_SIZE, ...discard);
}

async function handleAttemptScreenshotChange() {
  if (searchInProgress) {
    attemptScreenshot.value = "";
    return;
  }
  const requestId = ++recognitionRequestId;
  recognitionInProgress = true;
  attemptScreenshotExpectedScore = null;
  attemptImportedCardKey = null;
  attemptWasEdited = false;
  resetAttemptReview();
  attemptPreview.classList.remove("is-compact");
  if (attemptPreviewUrl) {
    URL.revokeObjectURL(attemptPreviewUrl);
    attemptPreviewUrl = null;
  }

  const file = attemptScreenshot.files?.[0];
  if (!file) {
    recognitionInProgress = false;
    attemptPreview.hidden = true;
    attemptPreview.removeAttribute("src");
    gridAttemptDetails.open = true;
    renderAttemptSummary();
    return;
  }

  attemptPreviewUrl = URL.createObjectURL(file);
  attemptPreview.src = attemptPreviewUrl;
  attemptPreview.hidden = false;
  attemptScoreBadge.textContent = "Reading...";
  optimizeButton.disabled = true;
  attemptSummary.classList.remove("is-good", "is-warning");
  attemptSummary.textContent = "Reading Pro screenshot cards...";

  try {
    const recognized = await recognizeProFantasylandScreenshot(file);
    if (requestId !== recognitionRequestId) return;
    recognitionInProgress = false;
    const displayedScore = recognized.displayedScore ?? {};
    attemptScreenshotExpectedScore =
      Number.isFinite(displayedScore.total) ||
      Number.isFinite(displayedScore.handCount)
        ? { ...displayedScore }
        : null;
    setAttemptCards(recognized.grid, recognized.discard);
    attemptImportedCardKey = attemptCardKey(
      attemptGridCards,
      attemptDiscardCards,
    );
    setAttemptReview(recognized.review);
    selectFilledAttemptCardsAsDeal();
    latestResult = null;
    activeSolutionIndex = 0;
    const mismatch = attemptScreenshotScoreMismatch();
    if (mismatch && attemptReviewCount() === 0) {
      flagLowestConfidenceSlots(recognized.confidenceBySlot);
    }
    renderSelectionState();
    if (selected.size > 1) manualPickerDetails.open = false;

    const validation = attemptValidation();
    gridAttemptDetails.open = Boolean(
      recognized.warning ||
      attemptReviewCount() ||
      mismatch ||
      !validation.valid
    );
    attemptPreview.classList.toggle(
      "is-compact",
      Boolean(
        validation.valid &&
        !recognized.warning &&
        attemptReviewCount() === 0 &&
        !mismatch
      ),
    );
    if (validation.valid && !mismatch) {
      const solution = currentAttemptSolution();
      latestResult = {
        best: solution,
        solutions: [solution],
        elapsedMs: 0,
        attempts: 0,
        isAttemptView: true,
      };
      renderResult();
      statusLine.textContent = `Loaded Pro grid attempt: ${money(validation.score.total)}.`;
    }

    if (recognized.warning && !recognized.scoreMismatch) {
      attemptSummary.textContent = recognized.warning;
      attemptSummary.classList.add("is-warning");
    } else {
      renderAttemptSummary();
    }
  } catch (error) {
    if (requestId !== recognitionRequestId) return;
    recognitionInProgress = false;
    attemptPreview.classList.remove("is-compact");
    gridAttemptDetails.open = true;
    renderAttemptEditor();
    attemptSummary.textContent =
      error instanceof Error ? error.message : "Could not read Pro screenshot cards.";
    attemptSummary.classList.add("is-warning");
  }
}

function clearAttempt() {
  if (searchInProgress) return;
  recognitionRequestId += 1;
  recognitionInProgress = false;
  attemptGridCards.fill("");
  attemptDiscardCards.fill("");
  resetAttemptReview();
  if (attemptPreviewUrl) {
    URL.revokeObjectURL(attemptPreviewUrl);
    attemptPreviewUrl = null;
  }
  attemptScreenshot.value = "";
  attemptScreenshotExpectedScore = null;
  attemptImportedCardKey = null;
  attemptWasEdited = false;
  attemptPreview.hidden = true;
  attemptPreview.classList.remove("is-compact");
  attemptPreview.removeAttribute("src");
  selectedSource = "manual";
  if (latestResult?.isAttemptView) {
    latestResult = null;
  }
  gridAttemptDetails.open = true;
  manualPickerDetails.open = true;
  renderSelectionState();
  if (!latestResult) renderEmptyResult();
}

function confirmAttemptReview() {
  const reviewCount = attemptReviewCount();
  if (searchInProgress || recognitionInProgress || reviewCount === 0) return;
  const scoreMismatch = currentScreenshotScoreMismatch();
  const confirmedWithoutEdits =
    attemptImportedCardKey !== null &&
    !attemptWasEdited &&
    attemptImportedCardKey === attemptCardKey(
      attemptGridCards,
      attemptDiscardCards,
    );
  resetAttemptReview();
  renderSelectionState();
  if (confirmedWithoutEdits) {
    reportNoEditReviewConfirmation({
      mode: "pro",
      reviewCount,
      scoreMismatch,
    });
    statusLine.textContent = scoreMismatch
      ? "Cards confirmed without edits. Marked as an over-sensitive recognizer warning; Optimize will use these cards."
      : "Cards confirmed without edits. Marked as an over-sensitive recognizer warning.";
    return;
  }
  statusLine.textContent = scoreMismatch
    ? "Cards confirmed. The screenshot score differs, but Optimize will use these cards."
    : "Cards confirmed. Ready to optimize.";
}

function toggleCard(cardId) {
  if (searchInProgress || recognitionInProgress) return;
  if (cardId === JOKER_ID) return;
  latestResult = null;
  activeSolutionIndex = 0;
  selectedSource = "manual";
  manualPickerDetails.open = true;
  if (selected.has(cardId)) selected.delete(cardId);
  else if (selected.size < DEAL_SIZE) selected.add(cardId);
  renderSelectionState();
  if (!latestResult) renderEmptyResult();
}

function clearSelection() {
  if (searchInProgress || recognitionInProgress) return;
  selected.clear();
  selected.add(JOKER_ID);
  latestResult = null;
  activeSolutionIndex = 0;
  selectedSource = "manual";
  manualPickerDetails.open = true;
  renderSelectionState();
  if (!latestResult) renderEmptyResult();
}

function renderSelectionState() {
  const validation = attemptValidation();
  const scoreMismatch = currentScreenshotScoreMismatch();
  const canUseAttempt = attemptIsActiveInput(validation);
  const canUseManual = selected.size === DEAL_SIZE;
  const reviewCount = canUseAttempt ? attemptReviewCount() : 0;
  const optimizingAttempt = canUseAttempt;
  const saved = canUseManual ? savedForCurrentDeal() : null;
  if (!latestResult && saved) {
    latestResult = {
      best: saved,
      solutions: [saved],
      elapsedMs: 0,
      attempts: 0,
      isSavedView: true,
    };
    activeSolutionIndex = 0;
  }
  selectedCount.textContent = `${selected.size}/${DEAL_SIZE}`;
  manualPickerHint.textContent =
    selected.size === DEAL_SIZE
      ? selectedSource === "attempt"
        ? "30/30 auto-selected"
        : "30/30 selected"
      : `Choose ${DEAL_SIZE - selected.size} more`;
  attemptScreenshot.disabled = searchInProgress;
  clearAttemptButton.disabled = searchInProgress;
  searchDepth.disabled = searchInProgress;
  optimizeButton.disabled =
    searchInProgress ||
    recognitionInProgress ||
    (!canUseAttempt && !canUseManual);
  statusLine.textContent =
    optimizingAttempt
      ? scoreMismatch
        ? reviewCount > 0
          ? "Screenshot score differs. Review the highlighted cards, or Optimize anyway."
          : "Cards confirmed. The screenshot score differs, but Optimize will use these cards."
        : reviewCount
        ? `Review ${reviewCount} highlighted card${reviewCount === 1 ? "" : "s"}, or Optimize anyway.`
        : "Uploaded deal ready to optimize."
      : selected.size === DEAL_SIZE
      ? saved
        ? "Showing the saved Pro best; Optimize can keep searching."
        : "Manual deal ready to optimize."
      : canUseAttempt
        ? "Grid attempt is ready to optimize."
        : `Select ${DEAL_SIZE - selected.size} more card${DEAL_SIZE - selected.size === 1 ? "" : "s"}.`;
  renderDeck();
  renderAttemptEditor();
  if (latestResult?.isSavedView) renderResult();
}

function handAnnotationLabel(hand) {
  if (hand.key === "straight-flush") return "STR. FLUSH";
  if (hand.key === "four-kind") return "4 OF A KIND";
  if (hand.key === "three-kind") return "3 OF A KIND";
  return hand.shortLabel.toUpperCase();
}

function lineAmountLabel(hand, value, bonus = 1) {
  const quality = hand.quality ? "★" : "";
  return bonus > 1 ? `${money(hand.base)} × ${bonus}${quality}` : `${money(value)}${quality}`;
}

function renderLineAnnotation(line, className) {
  if (!line?.scores) return `<div class="line-annotation ${className} is-empty"></div>`;
  const jokerTitle = line.hand.jokerAs ? `; Joker as ${proCardLabel(line.hand.jokerAs)}` : "";
  return `
    <div class="line-annotation ${className}" title="${line.label}: ${line.hand.label}${jokerTitle}">
      <strong>${lineAmountLabel(line.hand, line.value, line.bonus)}</strong>
      <span>${handAnnotationLabel(line.hand)}</span>
    </div>
  `;
}

function renderBoardAnnotations(score) {
  const rows = score.lines.filter((line) => line.type === "row");
  const columns = score.lines.filter((line) => line.type === "column");
  const corner = score.lines.find((line) => line.type === "corner");
  boardGrid.classList.toggle("has-corner-hand", Boolean(corner?.scores));
  rowAnnotations.innerHTML = rows.map((line) => renderLineAnnotation(line, "row-line")).join("");
  columnAnnotations.innerHTML = columns.map((line) => renderLineAnnotation(line, "column-line")).join("");
  cornerAnnotation.className = `line-annotation corner-line${corner?.scores ? "" : " is-empty"}`;
  cornerAnnotation.innerHTML = corner?.scores
    ? `<strong>${lineAmountLabel(corner.hand, corner.value, 2)}</strong><span>${handAnnotationLabel(corner.hand)}</span>`
    : "";

  if (score.discardHand.base === 0) {
    discardAnnotation.className = "line-annotation discard-line is-empty";
    discardAnnotation.innerHTML = "";
  } else if (!score.discardScores) {
    discardAnnotation.className = "line-annotation discard-line is-muted";
    discardAnnotation.innerHTML = `<strong>Not scored</strong><span>${handAnnotationLabel(score.discardHand)}</span>`;
    discardAnnotation.title = "Discard only scores when all 11 grid hands score";
  } else {
    discardAnnotation.className = "line-annotation discard-line";
    discardAnnotation.innerHTML =
      `<strong>${lineAmountLabel(score.discardHand, score.discardValue, 3)}</strong>` +
      `<span>${handAnnotationLabel(score.discardHand)}</span>`;
  }
}

function renderEmptyResult() {
  topScore.textContent = "$0";
  resultModeLabel.textContent = "Best Found";
  resultTotal.textContent = "$0";
  resultBase.textContent = "$0";
  resultHands.textContent = "0";
  resultMultiplier.textContent = "×1";
  resultQuality.textContent = "0";
  runtimeInfo.textContent = "Not run";
  searchSummary.textContent = "No search run yet";
  boardGrid.innerHTML = Array.from({ length: GRID_SIZE }, () => renderPlayingCard(null)).join("");
  discardCards.innerHTML = Array.from({ length: DISCARD_SIZE }, () => renderPlayingCard(null)).join("");
  boardGrid.classList.remove("has-corner-hand");
  rowAnnotations.innerHTML = Array.from({ length: 5 }, () => renderLineAnnotation(null, "row-line")).join("");
  columnAnnotations.innerHTML = Array.from({ length: 5 }, () => renderLineAnnotation(null, "column-line")).join("");
  cornerAnnotation.className = "line-annotation corner-line is-empty";
  cornerAnnotation.innerHTML = "";
  discardAnnotation.className = "line-annotation discard-line is-empty";
  discardAnnotation.innerHTML = "";
  solutionsRow.innerHTML = "";
  solutionsRow.classList.remove("has-layout-drawer");
}

function activeSolution() {
  return latestResult?.solutions?.[activeSolutionIndex] ?? latestResult?.best ?? null;
}

function groupedSolutions() {
  return groupSolutionsByOutcome(latestResult?.solutions ?? []);
}

function renderSolutionGroups() {
  const allGroups = groupedSolutions();
  const pinnedGroup = latestResult?.playerAttemptKey
    ? allGroups.find((group) =>
        group.solutions.some(
          (solution) => placementKey(solution) === latestResult.playerAttemptKey,
        ),
      )
    : null;
  const groups = pinnedSolutionPortfolio(
    allGroups,
    pinnedGroup ? [pinnedGroup] : [],
    {
      compare: (first, second) =>
        compareProScores(second.representative.score, first.representative.score),
      keyOf: (group) => group.key,
      maxSolutions: 8,
    },
  );
  solutionsRow.classList.toggle(
    "has-layout-drawer",
    groups.some((group) => group.variants.length > 1),
  );
  solutionsRow.innerHTML = "";

  groups.forEach((group) => {
    const activeInGroup = group.indexes.includes(activeSolutionIndex);
    const activeVariant = group.variants.find((variant) =>
      variant.indexes.includes(activeSolutionIndex),
    );
    const playerAttemptIndex = group.indexes.find(
      (index) =>
        placementKey(latestResult.solutions[index]) ===
        latestResult.playerAttemptKey,
    );
    const isPlayerAttemptGroup = playerAttemptIndex !== undefined;
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
    button.innerHTML =
      `${money(group.representative.score.total)}` +
      `<span>${group.representative.score.handCount} hands · ` +
      `${group.representative.score.qualityHandCount} quality · ` +
      `${formatWayCount(wayCount)}` +
      `${isPlayerAttemptGroup ? " · Your grid" : ""}</span>`;
    button.addEventListener("click", () => {
      activeSolutionIndex =
        playerAttemptIndex ?? activeVariant?.indexes[0] ?? group.indexes[0];
      renderResult();
    });
    groupElement.append(button);

    if (wayCount > 1) {
      const details = document.createElement("details");
      details.className = "variant-details";
      if (activeInGroup) details.open = true;

      const summary = document.createElement("summary");
      summary.textContent = formatScoringWayCount(wayCount);
      summary.title =
        "Different scoring structures with the same total, hand count, and quality count.";
      details.append(summary);

      const variantList = document.createElement("div");
      variantList.className = "variant-list";
      group.variants.forEach((variant) => {
        const solution = variant.representative;
        const solutionIndex = variant.indexes[0];
        const variantButton = document.createElement("button");
        variantButton.type = "button";
        variantButton.className =
          `variant-button${variant.indexes.includes(activeSolutionIndex) ? " is-active" : ""}`;
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

function renderResult(options = {}) {
  const solution = activeSolution();
  if (!solution) {
    renderEmptyResult();
    return;
  }
  const score = solution.score;
  const isPlayerAttempt =
    Boolean(latestResult.playerAttemptKey) &&
    placementKey(solution) === latestResult.playerAttemptKey;
  topScore.textContent = money(score.total);
  resultModeLabel.textContent = latestResult.isAttemptView
    ? "Grid Attempt"
    : isPlayerAttempt
      ? "Your Grid"
    : latestResult.isSavedView
      ? "Saved Best"
      : "Best Found";
  resultTotal.textContent = money(score.total);
  resultBase.textContent = money(score.base);
  resultHands.textContent = String(score.handCount);
  resultMultiplier.textContent = `×${score.multiplier}`;
  resultQuality.textContent = String(score.qualityHandCount);
  boardGrid.innerHTML = solution.grid.map(renderPlayingCard).join("");
  discardCards.innerHTML = solution.discard.map(renderPlayingCard).join("");
  renderBoardAnnotations(score);
  runtimeInfo.textContent = latestResult.isAttemptView
    ? "Player placement"
    : isPlayerAttempt
      ? "Your uploaded placement"
    : latestResult.isSavedView
      ? "Saved placement"
    : `${Math.round(latestResult.elapsedMs).toLocaleString()} ms · ${latestResult.attempts.toLocaleString()} candidates`;
  searchSummary.textContent = latestResult.isAttemptView
    ? "This placement has not been optimized yet."
    : isPlayerAttempt
      ? "Your original grid is pinned here for comparison with the solver's alternatives."
    : latestResult.isSavedView
      ? "Validated saved result for this exact deal."
    : latestResult.refinementExhausted
      ? "Heuristic result, checked against every single-card swap from the final placement."
      : "Heuristic result: a strong lower bound, not a proof of the mathematical optimum.";
  renderSolutionGroups();
  if (!options.skipAttemptSummary) renderAttemptSummary();
}

function renderTimer() {
  const elapsed = performance.now() - timerStartedAt;
  optimizerTimerText.textContent = `Searching · ${(elapsed / 1000).toFixed(1)}s / ${(timerBudget / 1000).toFixed(1)}s`;
}

function startTimer(budget) {
  window.clearInterval(timerInterval);
  timerBudget = budget;
  timerStartedAt = performance.now();
  optimizerTimer.classList.remove("is-hidden");
  optimizerTimer.classList.add("is-running");
  renderTimer();
  timerInterval = window.setInterval(renderTimer, 200);
}

function finishTimer(label = "Done") {
  window.clearInterval(timerInterval);
  timerInterval = null;
  optimizerTimer.classList.remove("is-running");
  optimizerTimerText.textContent =
    `${label} in ${((performance.now() - timerStartedAt) / 1000).toFixed(1)}s`;
  timerStartedAt = 0;
}

function nextAnimationFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

function prepareSolverResult(result, incumbent, requestedCardIds, pinnedAttempt = null) {
  const solverCandidates = [...(result?.solutions ?? [])];
  if (result?.best) solverCandidates.push(result.best);
  const normalizedSolverCandidates = solverCandidates
    .map((solution) => normalizeProSolution(solution, requestedCardIds))
    .filter(Boolean);
  const normalizedIncumbent = normalizeProSolution(incumbent, requestedCardIds);
  const normalizedCandidates = [
    ...normalizedSolverCandidates,
    ...(normalizedIncumbent ? [normalizedIncumbent] : []),
  ];
  const normalizedAttempt = normalizeProSolution(pinnedAttempt, requestedCardIds);
  const solutions = pinnedSolutionPortfolio(
    normalizedCandidates,
    normalizedAttempt ? [normalizedAttempt] : [],
    {
      compare: (first, second) => compareProScores(second.score, first.score),
      keyOf: solutionOutcomeProfileKey,
      maxSolutions: 8,
    },
  );
  return {
    ...result,
    best: solutions[0] ?? null,
    solutions,
    playerAttemptKey: placementKey(normalizedAttempt),
    solverResultRejected:
      solverCandidates.length > 0 && normalizedSolverCandidates.length === 0,
    isAttemptView: false,
  };
}

function placementKey(solution) {
  return solutionPlacementKey(solution);
}

async function solveCooperatively(cardIds, options, onProgress) {
  const session = createProHeuristicSession(cardIds, options);
  let cancelled = false;
  let lastPostedAt = 0;
  let lastPostedScore = -Infinity;
  activeSearchCancel = () => {
    cancelled = true;
  };
  while (!cancelled && !stepProHeuristicSession(session, 14)) {
    const now = performance.now();
    const bestScore = session.best?.score?.total ?? -Infinity;
    if (bestScore > lastPostedScore || now - lastPostedAt >= 300) {
      lastPostedAt = now;
      lastPostedScore = bestScore;
      onProgress?.(finishProHeuristicSession(session));
    }
    await nextAnimationFrame();
  }
  const result = finishProHeuristicSession(session);
  if (cancelled) result.stopped = true;
  return result;
}

function solveInWorker(cardIds, options, onProgress) {
  return new Promise((resolve, reject) => {
    if (typeof Worker === "undefined" || window.location.protocol === "file:") {
      solveCooperatively(cardIds, options, onProgress).then(resolve, reject);
      return;
    }

    let worker;
    try {
      worker = new Worker(new URL("./proHeuristicWorker.js?v=pro-solver-11", import.meta.url), {
        type: "module",
      });
    } catch {
      solveCooperatively(cardIds, options, onProgress).then(resolve, reject);
      return;
    }

    const id = ++workerRequestId;
    let settled = false;
    let latestProgress = null;
    let stopRequested = false;
    activeSearchCancel = () => {
      if (settled) return;
      if (!latestProgress) {
        stopRequested = true;
        return;
      }
      settled = true;
      worker.terminate();
      resolve({ ...latestProgress, stopped: true });
    };
    worker.addEventListener("message", (event) => {
      if (event.data?.id !== id || settled) return;
      if (event.data.status === "progress") {
        latestProgress = event.data.result;
        onProgress?.(latestProgress);
        if (stopRequested) {
          settled = true;
          worker.terminate();
          resolve({ ...latestProgress, stopped: true });
        }
        return;
      }
      settled = true;
      worker.terminate();
      if (event.data.status === "ok") {
        resolve(stopRequested ? { ...event.data.result, stopped: true } : event.data.result);
      }
      else reject(new Error(event.data.error ?? "Pro solver failed."));
    });
    worker.addEventListener("error", () => {
      if (settled) return;
      settled = true;
      worker.terminate();
      solveCooperatively(cardIds, options, onProgress).then(resolve, reject);
    });
    worker.postMessage({ id, cardIds, options });
  });
}

async function optimize() {
  if (searchInProgress || recognitionInProgress) return;
  const validation = attemptValidation();
  if (validation.valid && (selectedSource === "attempt" || selected.size !== DEAL_SIZE)) {
    selectAttemptAsDeal();
  }
  if (selected.size !== DEAL_SIZE) return;
  const budget = Number(searchDepth.value);
  const dealCards = selectedCards();
  const currentDealKey = dealKey(dealCards);
  const searchHistory = searchHistoryByDeal.get(currentDealKey);
  const continuationIndex = searchHistory?.passes ?? 0;
  const saved = savedForCurrentDeal();
  const attempt =
    validation.valid && dealKey(validation.cards) === dealKey(dealCards)
      ? currentAttemptSolution()
      : null;
  const incumbent = [saved, attempt, searchHistory?.best]
    .filter(Boolean)
    .sort((first, second) => compareProScores(second.score, first.score))[0] ?? null;

  const generation = ++searchGeneration;
  recognitionRequestId += 1;
  searchInProgress = true;
  let timerOutcome = "Done";
  let lastAnnouncedAt = 0;
  let lastAnnouncedTotal = -Infinity;
  renderSelectionState();
  clearButton.disabled = true;
  optimizeButton.disabled = false;
  optimizeButton.textContent = "Stop & keep best";
  statusLine.textContent =
    continuationIndex > 0
      ? `Continuing Pro search pass ${continuationIndex + 1} from prior leaders with new trajectories.`
      : "Searching Pro placements; the best board will update as it improves.";
  startTimer(budget);
  try {
    const onProgress = (progress) => {
      if (generation !== searchGeneration) return;
      const activeKey = placementKey(
        latestResult?.solutions?.[activeSolutionIndex] ?? latestResult?.best,
      );
      latestResult = prepareSolverResult(progress, incumbent, dealCards, attempt);
      if (!latestResult.best) return;
      const preservedIndex = latestResult.solutions.findIndex(
        (solution) => placementKey(solution) === activeKey,
      );
      activeSolutionIndex = preservedIndex >= 0 ? preservedIndex : 0;
      renderResult({ skipAttemptSummary: true });
      const now = performance.now();
      const bestTotal = latestResult.best.score.total;
      if (
        bestTotal > lastAnnouncedTotal &&
        (lastAnnouncedTotal === -Infinity || now - lastAnnouncedAt >= 1000)
      ) {
        lastAnnouncedAt = now;
        lastAnnouncedTotal = bestTotal;
        statusLine.textContent =
          `Searching… best so far ${money(bestTotal)} ` +
          `with ${latestResult.best.score.handCount} hands.`;
      }
    };
    const result = await solveInWorker(
      dealCards,
      {
        timeLimitMs: budget,
        maxSolutions: 8,
        incumbent,
        priorSolutions: searchHistory?.solutions ?? [],
        continuationIndex,
      },
      onProgress,
    );
    if (generation !== searchGeneration) return;
    latestResult = prepareSolverResult(result, incumbent, dealCards, attempt);
    if (!latestResult.best || latestResult.solverResultRejected) {
      throw new Error("The Pro solver returned a placement for the wrong deal.");
    }
    activeSolutionIndex = 0;
    const continuedSolutions = latestResult.solutions.slice(0, 16);
    searchHistoryByDeal.set(currentDealKey, {
      passes: continuationIndex + 1,
      best: continuedSolutions[0] ?? latestResult.best,
      solutions: continuedSolutions,
    });
    saveSolution(latestResult.best);
    renderResult();
    const uploadedDifference = attempt
      ? latestResult.best.score.total - attempt.score.total
      : null;
    const improvement =
      uploadedDifference > 0
        ? ` Improved the uploaded layout by ${money(uploadedDifference)}.`
        : uploadedDifference === 0
          ? " It matches the uploaded layout."
          : "";
    statusLine.textContent =
      `${continuationIndex > 0 ? `Continuation pass ${continuationIndex + 1} · ` : ""}` +
      `${result.stopped ? "Search stopped" : "Best found"}: ` +
      `${money(latestResult.best.score.total)} with ${latestResult.best.score.handCount} hands.${improvement}`;
    if (result.stopped) timerOutcome = "Stopped";
  } catch (error) {
    if (generation !== searchGeneration) return;
    timerOutcome = "Failed";
    statusLine.textContent = error instanceof Error ? error.message : "Pro solver failed.";
  } finally {
    if (generation !== searchGeneration) return;
    const completedStatus = statusLine.textContent;
    finishTimer(timerOutcome);
    searchInProgress = false;
    activeSearchCancel = null;
    clearButton.disabled = false;
    optimizeButton.textContent = "Optimize";
    renderSelectionState();
    statusLine.textContent = completedStatus;
  }
}

optimizeButton.addEventListener("click", () => {
  if (activeSearchCancel) {
    optimizeButton.disabled = true;
    optimizeButton.textContent = "Stopping…";
    statusLine.textContent = "Stopping after the current candidate; keeping the best board found.";
    activeSearchCancel();
    return;
  }
  if (searchInProgress) return;
  optimize();
});
clearButton.addEventListener("click", clearSelection);
clearAttemptButton.addEventListener("click", clearAttempt);
confirmAttemptReviewButton.addEventListener("click", confirmAttemptReview);
attemptScreenshot.addEventListener("change", handleAttemptScreenshotChange);
attemptGridSlots.addEventListener("change", handleAttemptSlotChange);
attemptDiscardSlots.addEventListener("change", handleAttemptSlotChange);

renderSelectionState();
renderEmptyResult();
