# Pile-Up Poker Solver contributor instructions

## UI work

Before changing layout, spacing, typography, cards, score annotations, or responsive behavior, read
`docs/design-system.md`.

Treat the documented values as product contracts, not suggestions:

- Use the shared 4/8/12/16/24px spacing scale. Do not introduce nearby one-off values when a token fits.
- Primary panels use 24px padding on desktop. Nested boxes use 12px. Mobile panels use 12px.
- Related labels use the same typography. Do not add selector-specific font sizing for dynamic labels such as
  “Best Found” or “Grid Attempt.”
- Keep score-strip labels on one line at supported desktop widths.
- Keep the desktop canvas centered and capped at 1140px. Extra viewport width becomes outer gutter.
- The header has no divider rule and contributes no extra bottom gap; the workspace owns the single 24px interval
  below it. Keep the total right-aligned beside the title above 460px; at 460px and below, place it beneath the title
  at full width while preserving right alignment.
- Preserve a useful board size: 520px minimum and 640px maximum when space permits.
- Keep the full board legible on a standard laptop viewport; do not solve vertical fit by shrinking the board below
  its documented floor.
- Playing cards use an 8px radius. Check that corner ranks and suits have clear space.
- Hand values beneath horizontal scoring bars align from the top so wrapped hand names do not shift neighboring
  scores.

Prefer changing a shared token or component rule over adding an ID-specific exception.

## Required validation for UI changes

- Update `docs/design-system.md` when an intentional design decision changes.
- Update `tests/design-contract.test.js` when a documented contract changes.
- Run the complete test suite.
- Review the laptop, wide-desktop, and mobile checklist in `docs/design-system.md`.
- Do not claim visual browser verification unless it was actually performed.
