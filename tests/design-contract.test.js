import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const css = readFileSync(`${root}/styles.css`, "utf8");
const agents = readFileSync(`${root}/AGENTS.md`, "utf8");
const designSystem = readFileSync(`${root}/docs/design-system.md`, "utf8");
const html = readFileSync(`${root}/index.html`, "utf8");
const proHtml = readFileSync(`${root}/pro.html`, "utf8");
const favicon = readFileSync(`${root}/favicon.svg`, "utf8");

function ruleBodies(selectorPattern) {
  const matches = [...css.matchAll(new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`, "gs"))];
  assert.ok(matches.length, `Expected CSS rule matching ${selectorPattern}`);
  return matches.map((match) => match[1]);
}

function firstRuleBody(selectorPattern) {
  return ruleBodies(selectorPattern)[0];
}

function bodyMatching(selectorPattern, bodyPattern) {
  const body = ruleBodies(selectorPattern).find((candidate) => bodyPattern.test(candidate));
  assert.ok(body, `Expected ${selectorPattern} rule matching ${bodyPattern}`);
  return body;
}

const rootTokens = firstRuleBody(":root");
for (const [token, value] of Object.entries({
  "--space-1": "4px",
  "--space-2": "8px",
  "--space-3": "12px",
  "--space-4": "16px",
  "--space-5": "24px",
  "--header-title-size": "2.15rem",
  "--radius-card": "8px",
  "--joker": "#d199fc",
})) {
  assert.match(rootTokens, new RegExp(`${token}:\\s*${value}`), `${token} changed without updating the design contract`);
}

const appShell = firstRuleBody("\\.app-shell");
assert.match(appShell, /width:\s*min\(1140px,\s*100%\)/);
assert.match(appShell, /padding-inline:\s*24px/);

const workspace = firstRuleBody("\\.workspace");
assert.match(workspace, /grid-template-columns:\s*360px minmax\(0,\s*1fr\)/);
assert.match(workspace, /gap:\s*var\(--space-5\)/);

const topbar = firstRuleBody("\\.topbar");
const topbarTitleRow = firstRuleBody("\\.topbar-title-row");
const topbarScore = firstRuleBody("\\.topbar-score");
const htmlElement = firstRuleBody("html");
assert.match(htmlElement, /scrollbar-gutter:\s*stable/);
assert.match(htmlElement, /-webkit-text-size-adjust:\s*100%/);
assert.match(htmlElement, /text-size-adjust:\s*100%/);
assert.doesNotMatch(topbar, /border-bottom/);
assert.match(topbar, /padding:\s*var\(--space-2\) 0 0/);
assert.match(topbarTitleRow, /display:\s*flex/);
assert.match(topbarTitleRow, /align-items:\s*center/);
assert.match(topbarTitleRow, /justify-content:\s*space-between/);
assert.match(topbarScore, /text-align:\s*right/);
const topbarTitle = firstRuleBody("\\.topbar h1");
assert.match(topbarTitle, /font-size:\s*var\(--header-title-size\)/);
assert.match(css, /\.mode-switch a\[aria-current="page"\]/);
assert.doesNotMatch(
  css,
  /\.pro-page\s+(?:\.app-shell|\.topbar(?:\b|-)|\.mode-switch|\.topbar-score|h1|\.picker-panel|\.screenshot-panel|\.manual-picker-panel)\b/,
  "Pro must not rescale or restyle the shared shell",
);
assert.match(
  html,
  /<div class="topbar-title-row">\s*<h1>Pile-Up Poker Solver<\/h1>\s*<div class="topbar-score"[^>]*>\$0<\/div>\s*<\/div>\s*<nav class="mode-switch"/,
);
assert.match(html, /id="normalModeLink" href="\.\/index\.html"/);
assert.match(html, /id="proModeLink" href="\.\/index\.html\?mode=pro"/);
assert.match(html, /href="\.\/favicon\.svg\?v=brand-2"/);
assert.match(proHtml, /href="\.\/favicon\.svg\?v=brand-2"/);
assert.match(favicon, /<rect[^>]*fill="#ffc000"/);
assert.match(favicon, /stroke="#181b29"/);
assert.match(favicon, /fill="#d199fc"/);
assert.match(proHtml, /window\.location\.replace\("\.\/index\.html\?mode=pro"\)/);
assert.doesNotMatch(proHtml, /class="topbar"/);
assert.match(html, /<details class="grid-attempt-panel" id="gridAttemptDetails"[\s\S]*?<summary/);
assert.match(
  html,
  /<option id="deepSearchOption" value="30000" selected>Deep · 30s<\/option>/,
);
assert.match(
  css,
  /@media \(max-width:\s*460px\)[\s\S]*?\.topbar-title-row\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/,
);
assert.match(
  css,
  /@media \(max-width:\s*460px\)[\s\S]*?\.topbar-score\s*\{[^}]*width:\s*100%;[^}]*text-align:\s*right;/,
);
assert.match(
  css,
  /@media \(max-width:\s*700px\)[\s\S]*?\.topbar h1\s*\{[^}]*font-size:\s*clamp\(1\.85rem,\s*6\.4vw,\s*2\.15rem\);/,
);
assert.doesNotMatch(css, /@media \(max-width:\s*700px\)[\s\S]*?\.topbar h1\s*\{[^}]*font-size:\s*1\.65rem/);

const pickerPanel = bodyMatching("\\.picker-panel", /align-self:/);
const resultPanel = bodyMatching("\\.result-panel", /container:\s*result/);
assert.match(pickerPanel, /padding:\s*var\(--space-5\)/);
assert.match(resultPanel, /padding:\s*var\(--space-5\)/);

const nestedPanels = firstRuleBody(
  "\\.screenshot-panel,\\s*\\.manual-picker-panel,\\s*\\.grid-attempt-panel",
);
assert.match(nestedPanels, /gap:\s*var\(--space-3\)/);
assert.match(nestedPanels, /padding:\s*var\(--space-3\)/);
assert.match(nestedPanels, /margin-top:\s*var\(--space-4\)/);
const collapsedInputPanels = firstRuleBody(
  "\\.manual-picker-panel:not\\(\\[open\\]\\),\\s*\\.grid-attempt-panel:not\\(\\[open\\]\\)",
);
assert.match(collapsedInputPanels, /gap:\s*0/);
assert.match(collapsedInputPanels, /padding-block:\s*var\(--space-2\)/);
const collapsedInputSummaries = firstRuleBody(
  "\\.manual-picker-panel:not\\(\\[open\\]\\) summary,\\s*\\.grid-attempt-panel:not\\(\\[open\\]\\) > summary",
);
assert.match(collapsedInputSummaries, /min-height:\s*32px/);
assert.match(firstRuleBody("\\.attempt-preview\\.is-compact"), /max-height:\s*112px/);
const reviewSelect = firstRuleBody("\\.attempt-slot\\.is-review select");
assert.match(reviewSelect, /border:\s*2px solid var\(--accent\)/);
assert.match(reviewSelect, /background:\s*var\(--accent-soft\)/);
assert.match(reviewSelect, /box-shadow:\s*none/);
assert.match(html, /id="confirmAttemptReviewButton"/);

const scoreStrip = firstRuleBody("\\.score-strip");
assert.match(scoreStrip, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
assert.match(scoreStrip, /gap:\s*var\(--space-3\)/);

const scoreLabels = bodyMatching("\\.score-strip span", /font-size:/);
assert.match(scoreLabels, /font-size:\s*0\.74rem/);
assert.match(scoreLabels, /white-space:\s*nowrap/);
assert.doesNotMatch(css, /#resultModeLabel\s*\{/);

assert.doesNotMatch(css, /font-weight:\s*(?:750|850|900)/, "Use the documented shared weight hierarchy");
assert.match(firstRuleBody("\\.attempt-summary"), /font-weight:\s*400/);
assert.match(firstRuleBody("\\.scoring-explainer p"), /font-weight:\s*400/);
assert.match(bodyMatching("\\.diagnostic-value", /font-weight:/), /font-weight:\s*400/);
assert.match(
  firstRuleBody("\\.diagnostics-panel summary,\\s*\\.scoring-explainer summary"),
  /font-weight:\s*700/,
);
assert.match(firstRuleBody("\\.section-heading \\.section-meta"), /font-weight:\s*500/);
assert.match(
  html,
  /<summary id="scoringExplainerTitle">What counts as a scoring way\?<\/summary>/,
);
assert.doesNotMatch(html, /Pro rules and scoring/i);
assert.match(
  html,
  /<div class="diagnostics-mode-stack mode-only mode-pro" hidden>[\s\S]*?<span class="diagnostic-label">Search Status<\/span>/,
);

const boardArea = firstRuleBody("\\.board-area");
assert.match(boardArea, /inline-size:\s*min\(100%,\s*640px,\s*max\(520px,/);
assert.match(boardArea, /padding:\s*var\(--space-3\) 0/);
assert.match(css, /\.pro-page \.pro-board-area\s*\{[^}]*--grid-gap:/s);
assert.match(css, /\.pro-page \.board-grid\s*\{[^}]*repeat\(5,/s);
assert.match(css, /\.pro-page \.row-annotations\s*\{[^}]*repeat\(5,/s);
assert.match(css, /\.pro-page \.column-annotations\s*\{[^}]*repeat\(5,/s);
assert.doesNotMatch(
  css,
  /\.pro-page \.board-grid(?:\.has-corner-hand)?::after/,
  "Pro should not draw a separate accent box over the center card",
);
assert.doesNotMatch(
  css,
  /\.pro-page \.playing-card [^{]+\{[^}]*font-size:/s,
  "Normal and Pro board cards must share the same typography",
);

const horizontalLabels = firstRuleBody("\\.column-line,\\s*\\.discard-line");
assert.match(horizontalLabels, /align-content:\s*start/);
const cornerLabel = firstRuleBody("\\.corner-line");
assert.match(
  cornerLabel,
  /margin:\s*var\(--space-2\) 0 0 calc\(-1 \* var\(--frame-offset\)\)/,
);

assert.match(
  css,
  /@media \(max-width:\s*1140px\)[\s\S]*?\.workspace\s*\{\s*grid-template-columns:\s*1fr;/,
);
assert.match(
  css,
  /@media \(max-width:\s*560px\)[\s\S]*?\.picker-panel,\s*\.result-panel\s*\{\s*padding:\s*var\(--space-3\);/,
);
assert.match(
  css,
  /@media \(max-width:\s*560px\)[\s\S]*?\.app-shell\s*\{\s*padding:\s*var\(--space-3\);/,
);
assert.match(firstRuleBody("\\.solution-group"), /flex:\s*0 0 186px/);
assert.doesNotMatch(
  css,
  /\.pro-page \.solutions-row \.solution-pill\s*\{[^}]*flex:/s,
  "Normal and Pro should share the grouped solution component",
);

assert.match(agents, /docs\/design-system\.md/);
assert.match(agents, /tests\/design-contract\.test\.js/);
assert.match(agents, /Normal and Pro are two versions of the same product/);
assert.match(agents, /Review both Normal and Pro/);
assert.match(designSystem, /Normal and Pro are sibling versions of the same product/);
assert.match(designSystem, /Check the change in both Normal and Pro/);
assert.match(designSystem, /total lives in the title row, is vertically centered with the title/);
assert.match(designSystem, /shared title scales fluidly instead of jumping to a compact size/);
assert.match(designSystem, /stable scrollbar gutter/);
assert.match(designSystem, /same canonical `index\.html` shell/);
assert.match(designSystem, /shared favicon uses the universal yellow accent/);
assert.match(designSystem, /browser[\s\S]*zoom, viewport state, shared markup, and responsive behavior cannot drift/);
assert.match(designSystem, /Board cards inherit the same rank and suit typography in both versions/);
assert.match(
  designSystem,
  /outer corner frame[\s\S]*do not add a separate accent outline[\s\S]*around the center card/,
);
assert.match(designSystem, /gameplay Joker's purple/);
assert.match(designSystem, /corner-hand annotation reserves an `8px` top offset/);
assert.match(designSystem, /A clean upload collapses the manual picker/);
assert.match(designSystem, /preview compresses to a short thumbnail/);
assert.match(designSystem, /“Cards Look Right” confirmation/);
assert.match(designSystem, /dollar total is the primary/);
assert.match(designSystem, /every[\s\S]*unused legal card for that slot would break/);
assert.match(designSystem, /confirms without changing any imported card/);
assert.match(designSystem, /Do not include the screenshot, filename, or card identities/);
assert.match(designSystem, /never disables Optimize for a complete, duplicate-free deal/);
assert.match(
  designSystem,
  /user's decision to run a valid[\s\S]*deal always overrides recognizer uncertainty/,
);
assert.match(designSystem, /one `2px` accent border/);
assert.match(designSystem, /use `8px` vertical padding and a `32px` summary floor/);
assert.match(designSystem, /Do not use `850` or `900` weights/);
assert.match(designSystem, /Both modes label the scoring-structure explainer “What counts as a scoring way\?”/);
assert.match(designSystem, /Normal and Pro diagnostics use the same status-card structure and typography/);
assert.match(designSystem, /Pro is an anytime heuristic/);
assert.match(
  designSystem,
  /Normal and Pro share the same grouped result controls[\s\S]*rotated, row-switched, column-switched[\s\S]*do not receive separate pills or[\s\S]*duplicate variants/,
);
assert.match(
  designSystem,
  /Label that selectable result “Your grid” in both versions[\s\S]*replace the lowest unpinned[\s\S]*instead of hiding the player's board/,
);
assert.match(designSystem, /1280 × 800/);
assert.match(designSystem, /1920 × 1080/);
assert.match(designSystem, /390 × 844/);

console.log("Design contract tests passed.");
