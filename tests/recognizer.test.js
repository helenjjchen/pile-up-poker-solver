import assert from "node:assert/strict";

import { __recognizerTestHooks } from "../src/screenshotRecognizer.js";

const { classifyRank, classifyScoreDigit, displayedScoreRects, displayedScoreTotalFromDigits, resolveDeckConflicts } =
  __recognizerTestHooks;

const rankShapes = {
  "6": {
    width: 18,
    height: 26,
    pixelCount: 187,
    componentCount: 1,
    components: [{ size: 187, x: 0.455, y: 0.484, width: 1, height: 1 }],
    holes: [{ size: 118, x: 0.477, y: 0.667 }],
    left: 74,
    middleX: 46,
    right: 67,
    top: 55,
    middleY: 76,
    bottom: 56,
  },
  "7": {
    width: 17,
    height: 26,
    pixelCount: 115,
    componentCount: 1,
    components: [{ size: 115, x: 0.522, y: 0.32, width: 1, height: 1 }],
    holes: [],
    left: 23,
    middleX: 58,
    right: 34,
    top: 67,
    middleY: 26,
    bottom: 22,
  },
  "8": {
    width: 18,
    height: 26,
    pixelCount: 198,
    componentCount: 1,
    components: [{ size: 198, x: 0.464, y: 0.491, width: 1, height: 1 }],
    holes: [
      { size: 102, x: 0.457, y: 0.707 },
      { size: 81, x: 0.451, y: 0.241 },
    ],
    left: 77,
    middleX: 46,
    right: 75,
    top: 62,
    middleY: 74,
    bottom: 62,
  },
  "9": {
    width: 17,
    height: 26,
    pixelCount: 176,
    componentCount: 1,
    components: [{ size: 176, x: 0.492, y: 0.483, width: 1, height: 1 }],
    holes: [{ size: 116, x: 0.441, y: 0.294 }],
    left: 62,
    middleX: 49,
    right: 65,
    top: 56,
    middleY: 70,
    bottom: 50,
  },
  "10": {
    width: 29,
    height: 26,
    pixelCount: 219,
    componentCount: 2,
    components: [
      { size: 162, x: 0.671, y: 0.5, width: 0.621, height: 1 },
      { size: 57, x: 0.111, y: 0.447, width: 0.172, height: 0.962 },
    ],
    holes: [{ size: 210, x: 0.671, y: 0.486 }],
    left: 57,
    middleX: 81,
    right: 81,
    top: 80,
    middleY: 64,
    bottom: 75,
  },
  J: {
    width: 24,
    height: 38,
    pixelCount: 102,
    componentCount: 1,
    components: [{ size: 94, x: 0.523, y: 0.733, width: 0.542, height: 0.658 }],
    holes: [],
    left: 16,
    middleX: 71,
    right: 15,
    top: 8,
    middleY: 33,
    bottom: 61,
  },
  Q: {
    width: 25,
    height: 30,
    pixelCount: 197,
    componentCount: 1,
    components: [{ size: 197, x: 0.529, y: 0.453, width: 1, height: 1 }],
    holes: [{ size: 310, x: 0.483, y: 0.412 }],
    left: 68,
    middleX: 39,
    right: 90,
    top: 75,
    middleY: 56,
    bottom: 66,
  },
  K: {
    width: 18,
    height: 25,
    pixelCount: 211,
    componentCount: 1,
    components: [{ size: 211, x: 0.328, y: 0.494, width: 1, height: 1 }],
    holes: [],
    left: 113,
    middleX: 60,
    right: 38,
    top: 73,
    middleY: 66,
    bottom: 72,
  },
  A: {
    width: 21,
    height: 25,
    pixelCount: 172,
    componentCount: 1,
    components: [{ size: 172, x: 0.505, y: 0.515, width: 1, height: 1 }],
    holes: [{ size: 52, x: 0.509, y: 0.464 }],
    left: 43,
    middleX: 69,
    right: 60,
    top: 50,
    middleY: 59,
    bottom: 63,
  },
};

for (const [rank, shape] of Object.entries(rankShapes)) {
  assert.equal(classifyRank(shape).rank, rank, `expected ${rank}`);
}

const scoreDigitShapes = {
  "8": {
    width: 10,
    height: 20,
    pixelCount: 95,
    holes: [
      { size: 9, x: 0.256, y: 0.261 },
      { size: 9, x: 0.644, y: 0.661 },
    ],
    left: 29,
    middleX: 45,
    right: 21,
    top: 25,
    middleY: 20,
    bottom: 17,
    upperLeft: 19,
    upperRight: 8,
    lowerLeft: 10,
    lowerRight: 18,
  },
  "7": {
    width: 11,
    height: 17,
    pixelCount: 49,
    holes: [],
    left: 8,
    middleX: 25,
    right: 16,
    top: 25,
    middleY: 7,
    bottom: 5,
    upperLeft: 9,
    upperRight: 21,
    lowerLeft: 5,
    lowerRight: 2,
  },
  "9": {
    width: 12,
    height: 17,
    pixelCount: 74,
    holes: [{ size: 52, x: 0.458, y: 0.265 }],
    left: 24,
    middleX: 17,
    right: 33,
    top: 16,
    middleY: 24,
    bottom: 17,
    upperLeft: 17,
    upperRight: 18,
    lowerLeft: 11,
    lowerRight: 15,
  },
  "0": {
    width: 12,
    height: 17,
    pixelCount: 77,
    holes: [{ size: 94, x: 0.458, y: 0.449 }],
    left: 32,
    middleX: 14,
    right: 31,
    top: 20,
    middleY: 16,
    bottom: 18,
    upperLeft: 19,
    upperRight: 16,
    lowerLeft: 17,
    lowerRight: 15,
  },
};

for (const [digit, shape] of Object.entries(scoreDigitShapes)) {
  assert.equal(classifyScoreDigit(shape), digit, `expected score digit ${digit}`);
}

assert.equal(displayedScoreTotalFromDigits("14880"), 14880);
assert.equal(displayedScoreTotalFromDigits("8790"), 8790);
assert.equal(displayedScoreTotalFromDigits("822272222"), null);
assert.equal(displayedScoreTotalFromDigits("10"), null);
assert.equal(displayedScoreTotalFromDigits("99999"), null);

const conflictingSpades = [
  {
    cardId: "AS",
    rank: "A",
    suit: "S",
    confidence: 0.98,
    alternatives: [{ cardId: "KS", rank: "K", suit: "S", confidence: 0.6 }],
  },
  {
    cardId: "AS",
    rank: "A",
    suit: "S",
    confidence: 0.97,
    alternatives: [{ cardId: "QS", rank: "Q", suit: "S", confidence: 0.93 }],
  },
];
assert.equal(resolveDeckConflicts(conflictingSpades), true);
assert.deepEqual(
  conflictingSpades.map((slot) => slot.cardId),
  ["AS", "QS"],
  "deck-aware assignment should repair a duplicate using the strongest valid alternatives",
);

function scaledGridRects(scale) {
  const base = [
    [80, 100, 180, 250],
    [190, 100, 290, 250],
    [300, 100, 400, 250],
    [410, 100, 510, 250],
  ];
  return Array.from({ length: 4 }, (_, row) =>
    base.map(([left, top, right, bottom]) => ({
      left: left * scale,
      top: (top + row * 160) * scale,
      right: right * scale,
      bottom: (bottom + row * 160) * scale,
    })),
  ).flat();
}

const normalRects = displayedScoreRects({ width: 640, height: 1200 }, { grid: scaledGridRects(1) });
const doubleRects = displayedScoreRects({ width: 1280, height: 2400 }, { grid: scaledGridRects(2) });

function assertApproximatelyEqual(actual, expected) {
  assert.ok(Math.abs(actual - expected) <= 1, `${actual} should be within 1px of ${expected}`);
}

assertApproximatelyEqual(doubleRects.total.left, normalRects.total.left * 2);
assertApproximatelyEqual(doubleRects.total.top, normalRects.total.top * 2);
assertApproximatelyEqual(doubleRects.total.right, normalRects.total.right * 2);
assertApproximatelyEqual(doubleRects.total.bottom, normalRects.total.bottom * 2);

console.log("recognizer tests passed");
