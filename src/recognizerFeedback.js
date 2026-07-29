export function attemptCardKey(grid, discard) {
  return [...grid, ...discard].join("|");
}

export function reportNoEditReviewConfirmation({
  mode,
  reviewCount,
  scoreMismatch,
}) {
  const detail = Object.freeze({
    kind: "cards-confirmed-without-edits",
    mode,
    reviewCount,
    scoreMismatch: Boolean(scoreMismatch),
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("pileup:recognizer-feedback", { detail }),
    );
  }

  return detail;
}
