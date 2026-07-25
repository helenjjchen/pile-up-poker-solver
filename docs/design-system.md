# Pile-Up Poker Solver design system

This document records the approved visual rules for the solver. It exists to keep future changes cohesive and to
prevent local fixes from creating inconsistent spacing, typography, or sizing elsewhere.

## Design principles

1. The board is the primary visual object. Supporting controls should not make it tiny or visually secondary.
2. Related information should look related. Labels with the same role use the same size, weight, spacing, and
   alignment.
3. Layout width is intentional. Once the two-panel desktop layout reaches its preferred width, additional viewport
   width becomes centered outer gutter rather than wider panels.
4. Use a small spacing vocabulary. Avoid visually indistinguishable one-off measurements.
5. Responsive changes should preserve hierarchy and legibility rather than merely fitting everything by shrinking it.

## Spacing scale

| Token | Value | Typical use |
| --- | ---: | --- |
| `--space-1` | 4px | Tight text relationships and small offsets |
| `--space-2` | 8px | Compact gaps |
| `--space-3` | 12px | Nested-box padding and standard component gaps |
| `--space-4` | 16px | Section separation |
| `--space-5` | 24px | Primary-panel padding and major layout gaps |

Use these tokens before introducing a literal spacing value.

## Layout contract

- The complete desktop shell is centered and capped at `1140px`.
- The shell has `24px` left and right padding.
- The two desktop columns are a `360px` deal panel and a flexible result panel, separated by `24px`.
- At `1140px` viewport width and below, the workspace becomes a single column.
- Extra width on larger screens becomes outer gutter. It must not increase either panel indefinitely.
- Primary desktop panels use `24px` padding.
- At phone widths, primary panels use `12px` padding.

## Header

- The header has no divider line between it and the workspace.
- The workspace owns the single `24px` interval below the header; do not add a second bottom interval to the header.
- Above `460px`, the total remains on the same row as the title and is aligned to the right.
- Between `700px` and `460px`, the header uses its compact title, gap, and total sizing to preserve that row.
- At `460px` and below, the total moves beneath the title, spans the full available width, and remains right-aligned.
- Do not left-align the total when the header stacks.

## Nested surfaces

- Screenshot import, manual picker, and grid-attempt sections use `12px` padding and `12px` internal gaps.
- Score summary cards use `12px` padding and `12px` gaps.
- Diagnostics content and its nested status cards use `12px` padding and gaps.
- Secondary sections may use `16px` padding when they contain a denser grid, such as the hand-count bucket panel.
- Similar boxes in the same row should share padding, radius, minimum height, and label alignment.

## Typography

- Score-strip labels all use the same `0.74rem` size, weight, letter spacing, and capitalization.
- Dynamic labels such as “Best Found,” “Best Possible,” and “Grid Attempt” must not receive a smaller one-off style.
- Desktop score-strip labels remain on one line.
- Values use tabular numerals where appropriate.
- Muted metadata is visually secondary but must remain legible.

## Board and cards

- The board area is height-aware but stays between `520px` and `640px` when horizontal space permits.
- The board should remain large enough to read at a glance while fitting a standard laptop viewport as closely as
  practical.
- Never reduce the board floor to solve a surrounding spacing issue. Audit header, panel, and section spacing first.
- Discard cards, grid cards, annotations, and scoring rails should remain visually proportional.
- Playing cards use an `8px` radius.
- Corner rank and suit labels must have clear space and must not appear pinched by the card radius.
- Horizontal hand annotations align from the top after their scoring bar. A wrapped hand name must not move the first
  line of a neighboring annotation.

## Score strip

- Desktop uses five equal columns.
- All five summary cards share the same padding and minimum height.
- “Best Found,” “Best Possible,” and “Grid Attempt” use the same typography as “Base Score,” “Hands,” “Multiplier,”
  and “Quality.”
- Below the result-panel compact breakpoint, the strip may switch to two columns, with the primary score spanning the
  full row.

## Reference viewport checklist

Use this checklist whenever visual browser testing is authorized.

### Laptop: 1280 × 800 or 1440 × 900

- The desktop layout is centered.
- “Grid Attempt” or “Best Found” remains one line and matches the other score labels.
- The board is not smaller than `520px` unless the result panel itself is narrower.
- The four grid rows, discard stack, and hand annotations remain legible.
- Primary panel and nested-box insets are visibly consistent.

### Wide desktop: 1920 × 1080

- The shell remains capped at `1140px`.
- Additional width appears as balanced outer gutters.
- Panels and score cards do not stretch beyond their intended widths.
- The board may grow to `640px`, but no larger.

### Mobile: 390 × 844

- The workspace is a single column.
- Primary panels use `12px` padding.
- The total spans the full header width beneath the title and remains right-aligned.
- The score strip uses its compact layout without label collisions.
- Controls remain touchable and no horizontal page scrolling is introduced.

## Change checklist

Before completing a UI change:

- Check whether a shared token or component rule can solve it.
- Check the same component with short and long dynamic text.
- Check alignment when hand names wrap.
- Check that card corner labels have room.
- Check that a width fix did not create a height problem, and vice versa.
- Update this document and `tests/design-contract.test.js` together when changing a contract.
