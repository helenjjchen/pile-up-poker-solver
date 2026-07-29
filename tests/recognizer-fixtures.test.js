import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  recognizeFantasylandImageData,
  recognizeProFantasylandImageData,
} from "../src/screenshotRecognizer.js";
import { scoreProPlacement } from "../src/proScoring.js";
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
  {
    file: "pileup-iphone-club-discard-partial.png",
    total: 14370,
    grid: ["8S", "6H", "7C", "9H", "7H", "AD", "7D", "9D", "9S", "QH", "8C", "9C", "10D", "QS", "KH", "JH"],
    discard: ["KC", "QC", "AC", "JC"],
  },
  {
    file: "pileup-iphone-club-discard-15870.png",
    total: 15870,
    grid: ["8S", "9H", "7H", "10D", "7D", "9C", "6H", "8C", "QS", "AD", "KH", "JH", "7C", "9S", "QH", "9D"],
    discard: ["KC", "QC", "AC", "JC"],
  },
];

for (const fixture of fixtures) {
  const imageData = pngImageData(readFileSync(new URL(`./fixtures/${fixture.file}`, import.meta.url)));
  const recognized = recognizeFantasylandImageData(imageData);
  assert.deepEqual(recognized.grid, fixture.grid, `${fixture.file}: grid cards`);
  assert.deepEqual(recognized.discard, fixture.discard, `${fixture.file}: discard cards`);
  assert.equal(recognized.displayedScore.total, fixture.total, `${fixture.file}: displayed score`);
  assert.equal(recognized.displayedScore.handCount, 10, `${fixture.file}: displayed hand count`);
  assert.equal(
    "scoreValidatedCorrections" in recognized,
    false,
    `${fixture.file}: score OCR must never rewrite recognized cards`,
  );
  assert.equal(
    recognized.scoreValidated,
    true,
    `${fixture.file}: the displayed total should independently validate the cards`,
  );
  assert.equal(recognized.complete, true, `${fixture.file}: recognition should be complete`);
  assert.equal(recognized.warning, "", `${fixture.file}: recognition should not need manual correction`);
}

const proFixtures = [
  {
    file: "pileup-pro-reference-a.png",
    total: 23040,
    handCount: 12,
    grid: ["8S", "5H", "6S", "7D", "9S", "8C", "10H", "6D", "7H", "9D", "JC", "10C", "JK", "KC", "QC", "JH", "6C", "6H", "4S", "QH", "JS", "10D", "AC", "KD", "QS"],
    discard: ["2H", "2C", "2S", "2D", "3D"],
  },
  {
    file: "pileup-pro-reference-b.png",
    total: 1830,
    handCount: 7,
    grid: ["JK", "2C", "2S", "3S", "4D", "4S", "6C", "6S", "7S", "8H", "8C", "8D", "8S", "9H", "9D", "9S", "10H", "JH", "JD", "QC", "KH", "KC", "AC", "AD", "AS"],
    discard: ["3D", "3H", "3C", "4H", "2D"],
  },
  {
    file: "pileup-pro-dark-19110.png",
    total: 19110,
    handCount: 12,
    grid: [
      "8S", "8D", "8C", "JD", "6S",
      "6C", "AC", "2S", "2C", "2D",
      "10H", "8H", "JK", "JH", "9H",
      "9S", "AD", "KC", "KH", "9D",
      "7S", "AS", "4D", "4H", "4S",
    ],
    discard: ["3D", "3H", "3C", "3S", "QC"],
    expectedReview: {
      grid: [4],
      discard: [],
    },
  },
  {
    file: "pileup-pro-cropped-25560.png",
    total: 25560,
    handCount: 12,
    grid: [
      "8S", "10H", "JH", "9H", "7S",
      "3H", "4H", "6H", "5H", "7H",
      "3S", "4C", "6S", "5C", "2S",
      "6C", "4D", "6D", "AC", "7D",
      "10S", "QS", "JS", "AS", "JK",
    ],
    discard: ["9D", "10D", "JD", "QD", "KD"],
  },
  {
    file: "pileup-pro-cropped-3210.png",
    total: 3210,
    handCount: 6,
    grid: [
      "2H", "4H", "6H", "9H", "10H",
      "JH", "QH", "AH", "2C", "4C",
      "5C", "6C", "7C", "8C", "9C",
      "10C", "JC", "QC", "KC", "AC",
      "5S", "6S", "8S", "JS", "QS",
    ],
    discard: ["JK", "AS", "6D", "8D", "AD"],
  },
];

for (const fixture of proFixtures) {
  const imageData = pngImageData(
    readFileSync(new URL(`./fixtures/${fixture.file}`, import.meta.url)),
  );
  const recognized = recognizeProFantasylandImageData(imageData);
  assert.deepEqual(recognized.grid, fixture.grid, `${fixture.file}: grid cards`);
  assert.deepEqual(recognized.discard, fixture.discard, `${fixture.file}: discard cards`);
  assert.equal(recognized.displayedScore.total, fixture.total, `${fixture.file}: displayed score`);
  assert.equal(
    recognized.displayedScore.handCount,
    fixture.handCount,
    `${fixture.file}: displayed hand count`,
  );
  assert.equal(recognized.scoreValidated, true, `${fixture.file}: score should validate the cards`);
  if (fixture.expectedReview) {
    const reviewedGrid = recognized.review.grid.flatMap((needsReview, index) =>
      needsReview ? [index] : [],
    );
    const reviewedDiscard = recognized.review.discard.flatMap((needsReview, index) =>
      needsReview ? [index] : [],
    );
    assert.deepEqual(reviewedGrid, fixture.expectedReview.grid);
    assert.deepEqual(reviewedDiscard, fixture.expectedReview.discard);
    assert.equal(recognized.complete, false);
    assert.match(recognized.warning, /few need review/);
  } else {
    assert.equal(recognized.complete, true, `${fixture.file}: recognition should be complete`);
    assert.equal(recognized.warning, "", `${fixture.file}: recognition should not need manual correction`);
  }
  assert.equal(recognized.scoreMismatch, null, `${fixture.file}: score checksum should match`);
}

const proDarkFixture = proFixtures[2];
const checksumCollisionGrid = [...proDarkFixture.grid];
checksumCollisionGrid[4] = "5S";
const checksumCollision = scoreProPlacement(
  checksumCollisionGrid,
  proDarkFixture.discard,
);
assert.equal(
  checksumCollision.total,
  19110,
  "the displayed total cannot distinguish the dark fixture's 6S from an unused 5S",
);
assert.equal(checksumCollision.handCount, 12);

const proReferenceA = pngImageData(
  readFileSync(new URL("./fixtures/pileup-pro-reference-a.png", import.meta.url)),
);
const proReferenceAFixture = proFixtures[0];
const shiftedData = new Uint8ClampedArray(proReferenceA.data.length);
for (let y = 0; y < proReferenceA.height; y += 1) {
  for (let x = 0; x < proReferenceA.width; x += 1) {
    const sourceX = Math.min(proReferenceA.width - 1, x + 2);
    const sourceY = Math.min(proReferenceA.height - 1, y + 4);
    const sourceIndex = (sourceY * proReferenceA.width + sourceX) * 4;
    const targetIndex = (y * proReferenceA.width + x) * 4;
    shiftedData.set(proReferenceA.data.slice(sourceIndex, sourceIndex + 4), targetIndex);
  }
}
const shiftedRecognition = recognizeProFantasylandImageData({
  width: proReferenceA.width,
  height: proReferenceA.height,
  data: shiftedData,
});
assert.deepEqual(
  shiftedRecognition.grid,
  proReferenceAFixture.grid,
  "Pro recognition should realign every grid card after a small screenshot shift",
);
assert.deepEqual(
  shiftedRecognition.discard,
  proReferenceAFixture.discard,
  "Pro recognition should realign every discard card after a small screenshot shift",
);
assert.equal(
  shiftedRecognition.displayedScore.total,
  23040,
  "the Pro screenshot checksum should stay aligned with the board",
);
assert.equal(shiftedRecognition.displayedScore.handCount, 12);
assert.equal(shiftedRecognition.complete, true);
assert.equal(shiftedRecognition.warning, "");
assert.equal(shiftedRecognition.scoreMismatch, null);

function adjustBrightness(imageData, factor) {
  const data = new Uint8ClampedArray(imageData.data);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] *= factor;
    data[offset + 1] *= factor;
    data[offset + 2] *= factor;
  }
  return { width: imageData.width, height: imageData.height, data };
}

const slightlyDarkRecognition = recognizeProFantasylandImageData(
  adjustBrightness(proReferenceA, 0.9),
);
assert.equal(
  slightlyDarkRecognition.discard[0],
  "AH",
  "the brightness regression fixture should exercise the known 2/A ambiguity",
);
assert.equal(
  slightlyDarkRecognition.complete,
  false,
  "a checksum-breaking card read must never be reported as complete",
);
assert.equal(slightlyDarkRecognition.scoreMismatch.totalMismatch, true);
assert.equal(slightlyDarkRecognition.scoreMismatch.actual.total, 19440);
assert.equal(slightlyDarkRecognition.scoreMismatch.expected.total, 23040);
assert.equal(
  slightlyDarkRecognition.review.discard[0],
  true,
  "checksum analysis should highlight the discard card that can restore the displayed score",
);
assert.match(slightlyDarkRecognition.warning, /do not match the screenshot score/);

const darkRecognition = recognizeProFantasylandImageData(
  adjustBrightness(proReferenceA, 0.72),
);
assert.deepEqual(darkRecognition.grid, proReferenceAFixture.grid);
assert.deepEqual(darkRecognition.discard, proReferenceAFixture.discard);
assert.equal(darkRecognition.displayedScore.total, 23040);
assert.equal(
  darkRecognition.displayedScore.handCount,
  null,
  "an impossible $23,040 / 1-hand OCR pair should discard the hand-count read",
);
assert.equal(
  darkRecognition.scoreMismatch,
  null,
  "discarding the impossible hand count should avoid a false checksum mismatch",
);

console.log("recognizer fixture tests passed");
