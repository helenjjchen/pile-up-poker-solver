import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { sortProCardIds } from "../src/proCards.js";
import { recognizeProFantasylandImageData } from "../src/screenshotRecognizer.js";
import { pngImageData } from "./pngImageData.js";

const fixtures = [
  {
    file: "pileup-pro-same-deal-105.png",
    total: 105,
    handCount: null,
    grid: [
      "4C", "8D", "6D", "9H", "3S",
      "9C", "5H", "7C", "10H", "AH",
      "3H", "KD", "8S", "3D", "6S",
      "2H", "7D", "6C", "JC", "QH",
      "7S", "5D", "KS", "JK", "8H",
    ],
    discard: ["5S", "5C", "2D", "2S", "AC"],
  },
  {
    file: "pileup-pro-same-deal-12150.png",
    total: 12150,
    handCount: 12,
    grid: [
      "4C", "2H", "3S", "6D", "5C",
      "7S", "2D", "2S", "5H", "KD",
      "5D", "3H", "JK", "5S", "6S",
      "8S", "7D", "3D", "8H", "8D",
      "7C", "9H", "AH", "9C", "6C",
    ],
    discard: ["JC", "QH", "10H", "KS", "AC"],
  },
  {
    file: "pileup-pro-same-deal-19530.png",
    total: 19530,
    handCount: 12,
    grid: [
      "4C", "2H", "3S", "AH", "5C",
      "3H", "2D", "2S", "8D", "KS",
      "6D", "7D", "JK", "3D", "5D",
      "5H", "9C", "6S", "8S", "7S",
      "7C", "9H", "5S", "8H", "6C",
    ],
    discard: ["JC", "QH", "10H", "KD", "AC"],
  },
  {
    file: "pileup-pro-same-deal-20550.png",
    total: 20550,
    handCount: 12,
    grid: [
      "4C", "AH", "3S", "2H", "5C",
      "3H", "3D", "2S", "2D", "KS",
      "7D", "6D", "JK", "8D", "5D",
      "7S", "9C", "6S", "8S", "5H",
      "7C", "9H", "5S", "8H", "6C",
    ],
    discard: ["JC", "QH", "10H", "KD", "AC"],
  },
  {
    file: "pileup-pro-same-deal-21630.png",
    total: 21630,
    handCount: 12,
    grid: [
      "2S", "2D", "KS", "3D", "3S",
      "6D", "4C", "8H", "7D", "5D",
      "2H", "AH", "JK", "3H", "5H",
      "6C", "9C", "8D", "7C", "5C",
      "6S", "9H", "8S", "7S", "5S",
    ],
    discard: ["JC", "QH", "10H", "KD", "AC"],
  },
];

const expectedDeal = sortProCardIds([
  ...fixtures[0].grid,
  ...fixtures[0].discard,
]);

for (const fixture of fixtures) {
  assert.deepEqual(
    sortProCardIds([...fixture.grid, ...fixture.discard]),
    expectedDeal,
    `${fixture.file}: screenshots should contain the same deal`,
  );
  const imageData = pngImageData(
    readFileSync(new URL(`./fixtures/${fixture.file}`, import.meta.url)),
  );
  const recognized = recognizeProFantasylandImageData(imageData);
  assert.deepEqual(recognized.grid, fixture.grid, `${fixture.file}: grid cards`);
  assert.deepEqual(
    recognized.discard,
    fixture.discard,
    `${fixture.file}: discard cards`,
  );
  assert.deepEqual(
    recognized.displayedScore,
    { handCount: fixture.handCount, total: fixture.total },
    `${fixture.file}: displayed score`,
  );
  assert.equal(recognized.scoreValidated, true, `${fixture.file}: score checksum`);
  assert.equal(recognized.complete, true, `${fixture.file}: complete recognition`);
  assert.equal(recognized.warning, "", `${fixture.file}: no review warning`);
  assert.equal(recognized.review.grid.some(Boolean), false);
  assert.equal(recognized.review.discard.some(Boolean), false);
}

console.log("same-deal Pro recognizer fixture tests passed");
