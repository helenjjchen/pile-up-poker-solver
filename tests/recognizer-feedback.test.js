import assert from "node:assert/strict";

import {
  attemptCardKey,
  reportNoEditReviewConfirmation,
} from "../src/recognizerFeedback.js";

assert.equal(
  attemptCardKey(["AS", "KS"], ["QS"]),
  "AS|KS|QS",
  "the imported-card fingerprint should preserve slot order",
);

assert.deepEqual(
  reportNoEditReviewConfirmation({
    mode: "pro",
    reviewCount: 3,
    scoreMismatch: { totalMismatch: true },
  }),
  {
    kind: "cards-confirmed-without-edits",
    mode: "pro",
    reviewCount: 3,
    scoreMismatch: true,
  },
  "a no-edit confirmation should become structured recognizer feedback without card data",
);

console.log("recognizer feedback tests passed");
