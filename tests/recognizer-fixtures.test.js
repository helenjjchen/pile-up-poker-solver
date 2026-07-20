import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { recognizeFantasylandImageData } from "../src/screenshotRecognizer.js";
import { pngImageData } from "./pngImageData.js";

const fixtures = [
  {
    file: "pileup-iphone-2026-07-19.png",
    total: 17520,
    grid: ["6C", "10S", "6S", "8C", "8H", "10H", "6H", "7H", "9D", "7D", "AD", "10D", "7C", "KC", "AC", "9C"],
    discard: ["JS", "KS", "QS", "AS"],
  },
  {
    file: "pileup-iphone-light.png",
    total: 14880,
    grid: ["9S", "QC", "JH", "10S", "JC", "AD", "KD", "QD", "QH", "6H", "KH", "9H", "QS", "AS", "KS", "JS"],
    discard: ["7H", "7S", "7C", "6C"],
  },
  {
    file: "pileup-iphone-dark.png",
    total: 19110,
    grid: ["KS", "JC", "AH", "QS", "QD", "8D", "AD", "6D", "10H", "10C", "AC", "6H", "JS", "9D", "8H", "10S"],
    discard: ["9S", "8S", "7S", "6S"],
  },
  {
    file: "pileup-cropped-board.png",
    total: 8790,
    grid: ["10D", "6D", "6H", "JS", "9C", "AS", "7D", "9S", "JH", "QC", "KH", "10S", "9H", "6S", "7C", "8C"],
    discard: ["JC", "QD", "KD", "AD"],
  },
  {
    file: "pileup-iphone-compact.png",
    total: 11790,
    grid: ["JH", "9C", "8D", "10D", "KH", "6C", "KD", "JS", "6H", "8S", "7D", "9S", "9H", "7S", "6D", "8H"],
    discard: ["JC", "QD", "KS", "AC"],
  },
];

for (const fixture of fixtures) {
  const imageData = pngImageData(readFileSync(new URL(`./fixtures/${fixture.file}`, import.meta.url)));
  const recognized = recognizeFantasylandImageData(imageData);
  assert.deepEqual(recognized.grid, fixture.grid, `${fixture.file}: grid cards`);
  assert.deepEqual(recognized.discard, fixture.discard, `${fixture.file}: discard cards`);
  assert.equal(recognized.displayedScore.total, fixture.total, `${fixture.file}: displayed score`);
  assert.equal(recognized.complete, true, `${fixture.file}: recognition should be complete`);
  assert.equal(recognized.warning, "", `${fixture.file}: recognition should not need manual correction`);
}

console.log("recognizer fixture tests passed");
