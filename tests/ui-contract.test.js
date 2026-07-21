import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const css = readFileSync(`${root}/styles.css`, "utf8");
const html = readFileSync(`${root}/index.html`, "utf8");

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
]) {
  assert.match(rootTokens, new RegExp(`${token}:`), `Missing semantic token ${token}`);
}
for (const [token, value] of Object.entries({
  "--accent": "#ffc000",
  "--blue": "#5dbafc",
  "--green": "#98b389",
  "--red": "#ffaaac",
  "--orange": "#fac16c",
})) {
  assert.match(rootTokens, new RegExp(`${token}:\\s*${value}`), `${token} should match gameplay`);
}
assert.doesNotMatch(css, /--yellow|--surface-warm|rgba\(255,\s*191,\s*24|#fff7db|#fffdf5/i);

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
assert.match(boardArea, /inline-size:\s*min\(100%,\s*600px\)/);

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

assert.match(html, /styles\.css\?v=design-system-36/);

console.log("UI contract tests passed.");
