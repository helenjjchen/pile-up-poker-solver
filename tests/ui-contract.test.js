import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const css = readFileSync(`${root}/styles.css`, "utf8");
const html = readFileSync(`${root}/index.html`, "utf8");
const proHtml = readFileSync(`${root}/pro.html`, "utf8");
const app = readFileSync(`${root}/src/app.js`, "utf8");
const proApp = readFileSync(`${root}/src/proApp.js`, "utf8");
const modeBoot = readFileSync(`${root}/src/modeBoot.js`, "utf8");
const solutionPortfolio = readFileSync(
  `${root}/src/solutionPortfolio.js`,
  "utf8",
);
const solutionProfiles = readFileSync(
  `${root}/src/solutionProfiles.js`,
  "utf8",
);

function ruleBody(selectorPattern) {
  const matches = [...css.matchAll(new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`, "gs"))];
  assert.ok(matches.length, `Expected CSS rule matching ${selectorPattern}`);
  return matches.at(-1)[1];
}

const rootTokens = ruleBody(":root");
for (const token of [
  "--accent",
  "--accent-soft",
  "--accent-ink",
  "--success",
  "--success-ink",
  "--focus-ring",
  "--card-hairline",
  "--joker",
]) {
  assert.match(rootTokens, new RegExp(`${token}:`), `Missing semantic token ${token}`);
}
for (const [token, value] of Object.entries({
  "--accent": "#ffc000",
  "--blue": "#5dbafc",
  "--green": "#98b389",
  "--red": "#ffaaac",
  "--orange": "#fac16c",
  "--joker": "#d199fc",
  "--radius-card": "8px",
})) {
  assert.match(rootTokens, new RegExp(`${token}:\\s*${value}`), `${token} should match gameplay`);
}
assert.doesNotMatch(css, /--yellow|--surface-warm|rgba\(255,\s*191,\s*24|#fff7db|#fffdf5/i);

const appShell = [...css.matchAll(/\.app-shell\s*\{([^}]*)\}/gs)][0][1];
assert.match(appShell, /width:\s*min\(1140px,\s*100%\)/);
assert.match(appShell, /padding-inline:\s*24px/);

const sharedCards = ruleBody("\\.card-button,\\s*\\.playing-card");
assert.match(sharedCards, /border:\s*1px solid var\(--card-hairline\)/);

const selectedCard = ruleBody("\\.card-button\\.is-selected");
assert.match(selectedCard, /border-width:\s*2px/);
assert.match(selectedCard, /border-color:\s*var\(--accent\)/);
assert.match(selectedCard, /background:\s*var\(--accent-soft\)/);
assert.doesNotMatch(selectedCard, /outline|box-shadow/);

const playingCard = ruleBody("\\.playing-card");
assert.match(playingCard, /border-width:\s*1px/);
assert.match(playingCard, /border-color:\s*var\(--card-hairline\)/);

const boardArea = ruleBody("\\.board-area");
assert.match(boardArea, /--score-rule:\s*3px/);
assert.match(boardArea, /--score-bar-offset:\s*2px/);
assert.match(boardArea, /--frame-arm:\s*9px/);
assert.match(boardArea, /inline-size:\s*min\(100%,\s*640px,\s*max\(520px,\s*calc\(74dvh - 281px\)\)\)/);

const scoreStripLabels = ruleBody("\\.score-strip span");
assert.match(scoreStripLabels, /font-size:\s*0\.74rem/);
assert.match(scoreStripLabels, /white-space:\s*nowrap/);
assert.doesNotMatch(css, /#resultModeLabel\s*\{/);

const cornerFrame = ruleBody("\\.board-grid::before");
assert.match(cornerFrame, /display:\s*none/);
assert.match(cornerFrame, /var\(--score-gap\) \+ var\(--score-rule\)/);
assert.match(cornerFrame, /var\(--score-gap\) \+ var\(--score-bar-offset\) \+ var\(--score-rule\)/);
assert.match(cornerFrame, /background:\s*var\(--accent\)/);

const activeCornerFrame = ruleBody("\\.board-grid\\.has-corner-hand::before");
assert.match(activeCornerFrame, /display:\s*block/);

const horizontalRules = ruleBody("\\.column-line::before,\\s*\\.discard-line::before");
assert.match(horizontalRules, /top:\s*var\(--score-bar-offset\)/);
assert.match(horizontalRules, /height:\s*var\(--score-rule\)/);
assert.match(horizontalRules, /background:\s*var\(--accent\)/);

const horizontalLabels = ruleBody("\\.column-line,\\s*\\.discard-line");
assert.match(horizontalLabels, /align-content:\s*start/);

assert.match(html, /styles\.css\?v=design-system-58/);
assert.match(html, /src\/modeBoot\.js\?v=mode-shell-8/);
assert.match(modeBoot, /\.\/app\.js\?v=solver-cache-49/);
assert.match(modeBoot, /\.\/proApp\.js\?v=pro-solver-17/);
assert.match(
  modeBoot,
  /deepSearchOption\.value = isPro \? "45000" : "30000"/,
);
assert.match(
  modeBoot,
  /deepSearchOption\.textContent = isPro \? "Deep · 45s" : "Deep · 30s"/,
);
assert.match(app, /screenshotRecognizer\.js\?v=screenshot-recognizer-31/);
assert.match(proApp, /screenshotRecognizer\.js\?v=screenshot-recognizer-31/);
assert.match(app, /recognizerFeedback\.js\?v=recognizer-feedback-1/);
assert.match(proApp, /recognizerFeedback\.js\?v=recognizer-feedback-1/);
assert.match(app, /solutionPortfolio\.js\?v=solution-portfolio-1/);
assert.match(proApp, /solutionPortfolio\.js\?v=solution-portfolio-1/);
assert.match(app, /solutionProfiles\.js\?v=solution-profiles-2/);
assert.match(proApp, /solutionProfiles\.js\?v=solution-profiles-2/);
assert.match(html, /id="normalModeLink" href="\.\/index\.html"/);
assert.match(html, /id="proModeLink" href="\.\/index\.html\?mode=pro"/);
assert.match(proHtml, /window\.location\.replace\("\.\/index\.html\?mode=pro"\)/);
assert.match(proHtml, /http-equiv="refresh" content="0; url=\.\/index\.html\?mode=pro"/);
assert.doesNotMatch(proHtml, /class="app-shell"/);
assert.match(modeBoot, /document\.body\.classList\.toggle\("pro-page", isPro\)/);
assert.match(modeBoot, /normalModeLink\.setAttribute\("aria-current", "page"\)/);
assert.match(modeBoot, /proModeLink\.setAttribute\("aria-current", "page"\)/);
assert.match(modeBoot, /normalModeLink\.removeAttribute\("aria-current"\)/);
assert.match(modeBoot, /proModeLink\.removeAttribute\("aria-current"\)/);
assert.match(modeBoot, /boardArea\.classList\.toggle\("pro-board-area", isPro\)/);
assert.match(html, /class="bucket-panel mode-only mode-normal"/);
assert.match(html, /class="proof-panel mode-only mode-pro" hidden/);
assert.match(ruleBody("\\.mode-only\\[hidden\\]"), /display:\s*none !important/);
assert.match(html, /id="optimizeButton" disabled/);
assert.match(
  app,
  /renderSelectionState\(\);\s*renderEmptyResult\(\);\s*await loadSeededBestKnown\(\);/,
  "Normal should paint its shared shell before asynchronous cache hydration, matching Pro startup",
);
assert.doesNotMatch(html, /data-reference-board=/);
assert.doesNotMatch(html, /Load reference/);
assert.match(html, /id="attemptScreenshot" type="file" accept="image\/\*"/);
assert.match(html, /id="confirmAttemptReviewButton"/);
assert.doesNotMatch(html, /id="optimizerTimer" aria-live=/);
assert.match(proApp, /const DEAL_SIZE = 30;/);
assert.match(proApp, /const GRID_SIZE = 25;/);
assert.match(proApp, /const DISCARD_SIZE = 5;/);
assert.match(proApp, /const selected = new Set\(\[JOKER_ID\]\);/);
assert.match(proApp, /recognizeProFantasylandScreenshot/);
assert.match(proApp, /window\.location\.protocol === "file:"/);
assert.match(proApp, /solveCooperatively\(cardIds, options, onProgress\)/);
assert.match(proApp, /activeSearchCancel/);
assert.match(proApp, /status === "progress"/);
assert.match(proApp, /function normalizeProSolution\(solution, requestedCardIds\)/);
assert.match(
  proApp,
  /let attemptScreenshotExpectedScore = null;/,
  "Pro should persist the trusted screenshot score while cards are corrected",
);
assert.match(
  proApp,
  /function attemptScreenshotScoreMismatch\(\)[\s\S]*proDisplayedScoreMismatch\([\s\S]*attemptScreenshotExpectedScore/,
  "Pro should use the shared screenshot-score checksum policy",
);
assert.match(
  proApp,
  /function currentScreenshotScoreMismatch\(\) \{\s*return attemptIsActiveInput\(\) \? attemptScreenshotScoreMismatch\(\) : null;/,
  "Pro should scope an uploaded checksum to the active attempt",
);
assert.match(proApp, /setAttemptReview\(recognized\.review\)/);
assert.match(proApp, /let recognitionRequestId = 0;/);
assert.match(proApp, /if \(requestId !== recognitionRequestId\) return;/);
assert.match(proApp, /let searchGeneration = 0;/);
assert.match(proApp, /function finishTimer\(label = "Done"\)/);
assert.match(proApp, /timerOutcome = "Stopped"/);
assert.match(proApp, /attemptPreview\.classList\.toggle\(\s*"is-compact"/);
assert.match(proApp, /joker-suit suit-hearts/);
assert.match(proApp, /card-center-rank" aria-hidden="true">★/);
assert.match(ruleBody("\\.joker-suits"), /font-size:\s*clamp\(0\.78rem,\s*21cqi,\s*1\.5rem\)/);
assert.match(ruleBody("\\.joker-card \\.card-center-rank"), /color:\s*var\(--joker\)/);
const reviewSelect = ruleBody("\\.attempt-slot\\.is-review select");
assert.match(reviewSelect, /border:\s*2px solid var\(--accent\)/);
assert.match(reviewSelect, /background:\s*var\(--accent-soft\)/);
assert.match(reviewSelect, /box-shadow:\s*none/);

const screenshotHandler = app.match(
  /async function handleAttemptScreenshotChange\(\) \{([\s\S]*?)\n\}\n\nfunction clearAttempt/,
)?.[1];
assert.ok(screenshotHandler, "Expected screenshot upload handler");
assert.ok(
  screenshotHandler.indexOf("if (recognized.warning)") <
    screenshotHandler.indexOf("if (!validation.valid)"),
  "Recognition warnings must be surfaced even when 20 unique cards form a structurally valid attempt",
);
const mismatchGuard = app.match(
  /function screenshotScoreMismatch\(recognized\) \{([\s\S]*?)\n\}\n\nfunction renderAttemptSummary/,
)?.[1];
assert.ok(mismatchGuard, "Expected screenshot score mismatch guard");
assert.doesNotMatch(
  mismatchGuard,
  /recognized\.complete/,
  "A complete card read must still be checked against a trusted screenshot score",
);
assert.match(
  app,
  /let attemptScreenshotExpectedScore = null;/,
  "Trusted screenshot score should persist while the user corrects cards",
);
assert.match(
  app,
  /function attemptScreenshotScoreMismatch\(\)[\s\S]*attemptScreenshotExpectedScore[\s\S]*attemptGridCards[\s\S]*attemptDiscardCards/,
  "Screenshot score mismatch should be recomputed from the current manual edits",
);
assert.match(
  app,
  /function currentScreenshotScoreMismatch\(\) \{\s*return attemptIsActiveInput\(\) \? attemptScreenshotScoreMismatch\(\) : null;/,
  "Normal should scope an uploaded checksum to the active attempt",
);
const normalCanOptimize = app.match(
  /function canOptimizeCurrentInputs\(\) \{([\s\S]*?)\n\}/,
)?.[1];
assert.ok(normalCanOptimize);
assert.match(normalCanOptimize, /if \(attemptIsActiveInput\(validation\)\) return true;/);
assert.doesNotMatch(normalCanOptimize, /attemptScreenshotScoreMismatch|attemptReviewCount/);
assert.match(app, /let recognitionRequestId = 0;/);
assert.match(app, /if \(requestId !== recognitionRequestId\) return;/);
assert.match(app, /let optimizerRunning = false;/);
assert.match(app, /const dealCards = selectedCards\(\);/);
assert.match(app, /attemptPreview\.classList\.toggle\(\s*"is-compact"/);
assert.match(app, /Improved the uploaded layout by/);
assert.match(proApp, /Improved the uploaded layout by/);
assert.match(solutionPortfolio, /export function pinnedSolutionPortfolio/);
assert.match(solutionPortfolio, /\[\.\.\.pinnedCandidates, \.\.\.candidates\]/);
assert.match(
  proApp,
  /prepareSolverResult\(progress, incumbent, dealCards, attempt\)/,
  "Pro progress results should retain the uploaded grid as a visible candidate",
);
assert.match(
  proApp,
  /prepareSolverResult\(result, incumbent, dealCards, attempt\)/,
  "Pro final results should retain the uploaded grid as a visible candidate",
);
assert.match(
  proApp,
  /playerAttemptKey: placementKey\(normalizedAttempt\)/,
);
assert.match(
  proApp,
  /solverResultRejected:[\s\S]*solverCandidates\.length > 0 && normalizedSolverCandidates\.length === 0/,
  "A valid pinned upload must not mask a wrong-deal Pro solver payload",
);
assert.match(
  proApp,
  /if \(!latestResult\.best \|\| latestResult\.solverResultRejected\)/,
);
assert.match(solutionProfiles, /export function groupSolutionsByOutcome/);
assert.match(solutionProfiles, /export function uniqueSolutionsByOutcomeProfile/);
assert.match(solutionProfiles, /\["full-house", "full house", "full houses"\]/);
assert.match(
  proApp,
  /function groupedSolutions\(\) \{\s*return groupSolutionsByOutcome\(latestResult\?\.solutions \?\? \[\]\);\s*\}/,
);
assert.match(
  proApp,
  /function renderSolutionGroups\(\)[\s\S]*className = "variant-details"[\s\S]*scoringHandSummary/,
  "Pro should use the same grouped outcome and variant controls as Normal",
);
assert.match(
  proApp,
  /keyOf: solutionOutcomeProfileKey/,
  "Pro's visible portfolio should collapse equivalent scoring profiles before applying its cap",
);
assert.match(proApp, /isPlayerAttemptGroup[\s\S]* · Your grid/);
assert.match(
  app,
  /playerAttemptKey: solutionPlacementKey\(attemptSolution\)/,
);
assert.match(
  app,
  /const groups = pinnedSolutionPortfolio\([\s\S]*maxSolutions: 12/,
  "Normal should retain the player's outcome group even below its visible cutoff",
);
assert.match(
  app,
  /latestResult = mergeAttemptIntoResult\(\s*resultFromBestKnown\(bestKnown, \{ exact: true \}\),\s*attemptSolution,/,
  "Normal's certified-result shortcut should still retain the player's grid",
);
assert.match(
  app,
  /activeSolutionIndex =\s*playerAttemptIndex \?\? activeVariant\?\.indexes\[0\] \?\? group\.indexes\[0\]/,
  "A Normal pill labeled Your grid should reopen the exact player placement",
);
for (const modeApp of [app, proApp]) {
  assert.match(modeApp, /"Your Grid"/);
  assert.match(modeApp, /" · Your grid"/);
  assert.match(
    modeApp,
    /const searchHistoryByDeal = new Map\(\);/,
    "both modes should retain same-deal search history for repeat optimization",
  );
  assert.match(
    modeApp,
    /continuationIndex/,
    "both modes should advance repeat searches onto a fresh deterministic stream",
  );
}
assert.match(app, /initialPlacements:\s*\[[\s\S]*?searchHistory\?\.solutions/);
assert.match(proApp, /priorSolutions:\s*searchHistory\?\.solutions \?\? \[\]/);

const normalOptimizeInputs = app.match(
  /async function optimizeCurrentInputs\(\) \{([\s\S]*?)\n\}/,
)?.[1];
assert.ok(normalOptimizeInputs);
assert.match(normalOptimizeInputs, /attemptIsActiveInput\(validation\)/);
assert.doesNotMatch(normalOptimizeInputs, /currentScreenshotScoreMismatch|attemptReviewCount/);

const normalOptimizeAttempt = app.match(
  /async function optimizeAttemptCards\(\) \{([\s\S]*?)\n\}\n\nasync function optimizeCurrentInputs/,
)?.[1];
assert.ok(normalOptimizeAttempt);
assert.doesNotMatch(normalOptimizeAttempt, /currentScreenshotScoreMismatch|attemptReviewCount/);

const proSelectionState = proApp.match(
  /function renderSelectionState\(\) \{([\s\S]*?)\n\}\n\nfunction handAnnotationLabel/,
)?.[1];
assert.ok(proSelectionState);
const proOptimizeDisabled = proSelectionState.match(
  /optimizeButton\.disabled =([\s\S]*?);/,
)?.[1];
assert.ok(proOptimizeDisabled);
assert.doesNotMatch(proOptimizeDisabled, /scoreMismatch|reviewCount/);
assert.match(
  proApp,
  /async function optimize\(\) \{\s*if \(searchInProgress \|\| recognitionInProgress\) return;/,
);
assert.match(app, /This is only a warning; Optimize will use the cards shown above\./);
assert.match(proApp, /This is only a warning; Optimize will use the cards shown above\./);
assert.match(app, /Cards confirmed\. The screenshot score differs, but Optimize will use these cards\./);
assert.match(proApp, /Cards confirmed\. The screenshot score differs, but Optimize will use these cards\./);
for (const modeApp of [app, proApp]) {
  assert.match(modeApp, /let attemptImportedCardKey = null;/);
  assert.match(modeApp, /let attemptWasEdited = false;/);
  assert.match(
    modeApp,
    /attemptImportedCardKey === attemptCardKey\(\s*attemptGridCards,\s*attemptDiscardCards,/,
    "Cards Look Right should distinguish a no-edit confirmation from a corrected board",
  );
  assert.match(
    modeApp,
    /reportNoEditReviewConfirmation\(\{/,
    "both modes should emit structured feedback for an over-sensitive review warning",
  );
  assert.match(
    modeApp,
    /Cards confirmed without edits\. Marked as an over-sensitive recognizer warning\./,
  );
}

const proClearAttempt = proApp.match(
  /function clearAttempt\(\) \{([\s\S]*?)\n\}\n\nfunction confirmAttemptReview/,
)?.[1];
assert.ok(proClearAttempt);
assert.doesNotMatch(proClearAttempt, /selected\.clear\(\)/);

console.log("UI contract tests passed.");
