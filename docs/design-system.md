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
6. Normal and Pro are sibling versions of the same product. Shared components and behavior should change together;
   mode-specific differences should come from game rules or explicitly documented product needs.

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
- At phone widths, the outer shell also uses the shared `12px` spacing token.

## Header

- The header has no divider line between it and the workspace.
- The title is a single shared `.topbar h1` component using `--header-title-size`; do not style it through a
  mode-specific selector or an unscoped page-heading override. Root text scaling is fixed at `100%` so switching
  game content cannot trigger different browser text inflation.
- A shared Normal/Pro segmented switch sits beneath the title. The active version is visually filled and exposed
  with `aria-current="page"`; both pages use the same header treatment.
- Normal and Pro render from the same canonical `index.html` shell; Pro is selected with `?mode=pro`, while
  `pro.html` exists only as a compatibility redirect. Keep both switch targets on that one document path so browser
  zoom, viewport state, shared markup, and responsive behavior cannot drift between separate files.
- The workspace owns the single `24px` interval below the header; do not add a second bottom interval to the header.
- Above `460px`, the total lives in the title row, is vertically centered with the title, and is aligned to the
  right. The mode switch remains on the separate row beneath them.
- Below `700px`, the shared title scales fluidly instead of jumping to a compact size. It stays at the desktop size
  around tablet widths and shrinks only as the title row actually needs room.
- At `460px` and below, the total moves beneath the title, spans the full available width, and remains right-aligned.
- Do not left-align the total when the header stacks.
- Reserve a stable scrollbar gutter so switching between modes cannot nudge the centered shell horizontally.

## Nested surfaces

- Screenshot import, manual picker, and grid-attempt sections use `12px` padding and `12px` internal gaps.
- Screenshot import stays ahead of manual entry in both versions. A clean upload collapses the manual picker and
  detected-card editor so Search and Optimize remain nearby, and its preview compresses to a short thumbnail;
  uncertain reads or score mismatches keep the full preview and editor open and highlight only the cards that need
  attention.
- The screenshot's displayed score and hand count are treated as a checksum. The longer dollar total is the primary
  OCR checksum; use the smaller hand count only when no trusted total was read. A mismatch remains visible as an
  advisory warning, but it never disables Optimize for a complete, duplicate-free deal.
- A matching checksum is corroboration, not proof. It may clear a purely visual confidence flag only when every
  unused legal card for that slot would break the displayed total and hand-count tuple. Missing cards, duplicate or
  deck-adjusted reads, and checksum-equivalent alternatives must remain reviewable.
- Uncertain reads stay highlighted and offer a “Cards Look Right” confirmation. Confirmation clears the highlights
  without rewriting the screenshot checksum, but it is not required to optimize; the user's decision to run a valid
  deal always overrides recognizer uncertainty. If the user confirms without changing any imported card, treat that
  as an over-sensitive recognizer warning: acknowledge it in the status line and emit privacy-safe local feedback
  metadata only. Do not include the screenshot, filename, or card identities, and do not transmit anything.
- A card marked for review uses one `2px` accent border and the accent-soft background. Do not stack a review shadow
  outside the card's suit border.
- Manual deal picking and detected-card correction are disclosures with the same heading typography, padding, and
  open/closed indicator in both versions.
- Score summary cards use `12px` padding and `12px` gaps.
- Diagnostics content and its nested status cards use `12px` padding and gaps.
- Secondary sections may use `16px` padding when they contain a denser grid, such as the hand-count bucket panel.
- Similar boxes in the same row should share padding, radius, minimum height, and label alignment.

## Typography

- Score-strip labels all use the same `0.74rem` size, weight, letter spacing, and capitalization.
- Dynamic labels such as “Best Found,” “Best Possible,” and “Grid Attempt” must not receive a smaller one-off style.
- Desktop score-strip labels remain on one line.
- Values use tabular numerals where appropriate.
- Multipliers use the multiplication symbol (`×`) in both versions.
- Muted metadata is visually secondary but must remain legible.

## Board and cards

- The board area is height-aware but stays between `520px` and `640px` when horizontal space permits.
- Pro uses the same board component with five rows, five columns, and five discard cards. The outer corner frame and
  corner-hand score annotation communicate a scoring corners-plus-center hand; do not add a separate accent outline
  around the center card.
- Normal and Pro picker cards use identical dimensions and typography. The Pro joker occupies one ordinary deck-grid
  cell, uses the four existing suit colors at the standard corner-suit size, and shows the gameplay Joker's purple
  on its center star.
- Board cards inherit the same rank and suit typography in both versions. Pro may change only the grid count, gaps,
  discard rail, and card aspect needed to fit five cards per line.
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

## Search feedback

- Both versions default to the deep `30s` search. Quick `3s` and balanced `10s` remain explicit choices.
- Optimize is resumable for the current page session. Repeating it for the same deal keeps prior leaders, advances
  to a fresh deterministic search stream, and skips the structural opening portfolio already completed on the first
  pass. Changing modes or deals uses that deal's own history; a certified Normal optimum still loads immediately.
- Normal and Pro share the same grouped result controls. One pill represents a tied outcome with the same total,
  hand count, and quality count. Different hand-type profiles for that outcome appear as scoring-way variants;
  rotated, row-switched, column-switched, or otherwise equivalent placements do not receive separate pills or
  duplicate variants.
- A player placement is always retained as the search floor and remains visible as a comparison after optimization.
  Label that selectable result “Your grid” in both versions. It counts toward the visible result limit (12 Normal
  outcome groups or 8 Pro outcome groups); when it would otherwise fall below that limit, replace the lowest unpinned
  result instead of hiding the player's board.
- Search status uses plain outcome language: current best, elapsed time, and the dollar difference from an uploaded
  placement when one exists.
- Pro is an anytime heuristic: it displays improving placements during the selected budget and lets the player stop
  early while keeping the strongest placement already found.
- Search timers are visual feedback, not live regions. The concise status line announces meaningful improvements and
  final outcomes without reading a sub-second timer on every update.

## Reference viewport checklist

Use this checklist whenever visual browser testing is authorized.

### Laptop: 1280 × 800 or 1440 × 900

- The desktop layout is centered.
- The Normal/Pro switch is visible and the active version is clear.
- “Grid Attempt” or “Best Found” remains one line and matches the other score labels.
- The board is not smaller than `520px` unless the result panel itself is narrower.
- The four grid rows, discard stack, and hand annotations remain legible.
- On Pro, all five grid rows and five discard cards remain legible; vertical scrolling is acceptable because the
  larger board must retain the documented board-size floor.
- Primary panel and nested-box insets are visibly consistent.
- After a clean screenshot upload, the correction editor is collapsed and Optimize remains easy to reach.

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
- The Normal/Pro switch spans the title area without colliding with the total.
- Successful imports do not leave the full manual deck and every correction field expanded above Optimize.

## Change checklist

Before completing a UI change:

- Check the change in both Normal and Pro wherever the component or behavior is shared.
- If the change is mode-specific, record why and confirm it does not create an accidental inconsistency in the other
  mode.
- Check whether a shared token or component rule can solve it.
- Check the same component with short and long dynamic text.
- Check alignment when hand names wrap.
- Check that card corner labels have room.
- Check that a width fix did not create a height problem, and vice versa.
- Update this document and `tests/design-contract.test.js` together when changing a contract.
