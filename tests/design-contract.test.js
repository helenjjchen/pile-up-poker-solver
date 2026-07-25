import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const css = readFileSync(`${root}/styles.css`, "utf8");
const agents = readFileSync(`${root}/AGENTS.md`, "utf8");
const designSystem = readFileSync(`${root}/docs/design-system.md`, "utf8");

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
  "--radius-card": "8px",
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
const topbarScore = firstRuleBody("\\.topbar-score");
assert.doesNotMatch(topbar, /border-bottom/);
assert.match(topbar, /padding:\s*var\(--space-2\) 0 0/);
assert.match(topbarScore, /text-align:\s*right/);
assert.match(
  css,
  /@media \(max-width:\s*460px\)[\s\S]*?\.topbar\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/,
);
assert.match(
  css,
  /@media \(max-width:\s*460px\)[\s\S]*?\.topbar-score\s*\{[^}]*width:\s*100%;[^}]*text-align:\s*right;/,
);

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

const scoreStrip = firstRuleBody("\\.score-strip");
assert.match(scoreStrip, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
assert.match(scoreStrip, /gap:\s*var\(--space-3\)/);

const scoreLabels = bodyMatching("\\.score-strip span", /font-size:/);
assert.match(scoreLabels, /font-size:\s*0\.74rem/);
assert.match(scoreLabels, /white-space:\s*nowrap/);
assert.doesNotMatch(css, /#resultModeLabel\s*\{/);

const boardArea = firstRuleBody("\\.board-area");
assert.match(boardArea, /inline-size:\s*min\(100%,\s*640px,\s*max\(520px,/);
assert.match(boardArea, /padding:\s*var\(--space-3\) 0/);

const horizontalLabels = firstRuleBody("\\.column-line,\\s*\\.discard-line");
assert.match(horizontalLabels, /align-content:\s*start/);

assert.match(
  css,
  /@media \(max-width:\s*1140px\)[\s\S]*?\.workspace\s*\{\s*grid-template-columns:\s*1fr;/,
);
assert.match(
  css,
  /@media \(max-width:\s*560px\)[\s\S]*?\.picker-panel,\s*\.result-panel\s*\{\s*padding:\s*var\(--space-3\);/,
);

assert.match(agents, /docs\/design-system\.md/);
assert.match(agents, /tests\/design-contract\.test\.js/);
assert.match(designSystem, /1280 × 800/);
assert.match(designSystem, /1920 × 1080/);
assert.match(designSystem, /390 × 844/);

console.log("Design contract tests passed.");
