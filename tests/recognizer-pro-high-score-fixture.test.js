import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { recognizeProFantasylandImageData } from "../src/screenshotRecognizer.js";
import { pngImageData } from "./pngImageData.js";

const expectedGrid = [
  "6S", "2S", "3S", "4S", "JK",
  "8C", "QC", "3C", "4C", "QH",
  "8D", "JS", "7S", "9D", "10C",
  "2H", "2D", "3D", "4H", "JH",
  "8S", "6D", "7C", "5D", "9S",
];
const expectedDiscard = ["KH", "KD", "AH", "AC", "AS"];
const imageData = pngImageData(
  readFileSync(
    new URL("./fixtures/pileup-pro-high-score-18450.png", import.meta.url),
  ),
);
const recognized = recognizeProFantasylandImageData(imageData);

assert.deepEqual(recognized.grid, expectedGrid);
assert.deepEqual(recognized.discard, expectedDiscard);
assert.deepEqual(recognized.displayedScore, { handCount: 12, total: 18450 });
assert.equal(recognized.scoreValidated, true);
assert.equal(recognized.complete, true);
assert.equal(recognized.warning, "");
assert.equal(recognized.review.grid.some(Boolean), false);
assert.equal(recognized.review.discard.some(Boolean), false);

console.log("Pro high-score recognizer fixture test passed");
