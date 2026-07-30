# Pile-Up Poker Solver product context

This is the current product and engineering context for the Fantasyland solver. Historical implementation phases
have been removed; the codebase now supports both Normal and Pro in production.

## Product scope

The app solves a complete Fantasyland deal:

- The player selects cards manually or imports a supported game screenshot.
- An imported grid/discard is scored immediately and becomes the search floor.
- Optimize searches for a stronger placement without ever hiding or replacing the player's exact layout.
- Results are ordered by dollars first, then hand count and quality count, and grouped into meaningful scoring-way
  variants.

Sequential round-by-round play, expected-value strategy over unknown future deals, and a shared server-side cache are
not part of the current production scope.

## Shared shell

Normal and Pro are modes of the same `index.html` document. `src/modeBoot.js` reads `?mode=pro`, applies the mode
state, and loads `src/app.js` or `src/proApp.js`. `pro.html` is only a redirect for saved links.

Shared product contracts:

- one header, mode switch, total placement, panel hierarchy, and responsive behavior;
- one screenshot-import and correction flow;
- one advisory recognition model: uncertainty never disables Optimize for a valid deal;
- one result-grouping model, including a protected “Your grid” result;
- Deep as the default (`30s` Normal, `45s` Pro), with Quick (`3s`) and Balanced (`10s`) alternatives;
- same-deal repeat runs retain leaders and use a new continuation stream.

Visual details and viewport checks are normative in [design-system.md](./design-system.md).

## Game rules

### Normal

- Deck: ranks `6 7 8 9 10 J Q K A` in four suits (`36` cards).
- Deal: `20` distinct cards.
- Placement: `16` cards in a `4×4` grid and `4` in discard.
- Grid hands: four rows, four columns, and the four corners (`9` total).
- The corner hand is worth `×2`.
- Discard is worth `×3` only when all nine grid hands score.
- Straights contain four consecutive ranks; ace is high only.

### Pro

- Deck: the standard `52` cards plus one joker.
- Deal: `30` distinct cards and always includes the joker.
- Placement: `25` cards in a `5×5` grid and `5` in discard.
- Grid hands: five rows, five columns, and four corners plus the center (`11` total).
- The corners-plus-center hand is worth `×2`.
- Discard is worth `×3` only when all eleven grid hands score.
- Straights contain five cards.
- Full houses score.
- The joker becomes the best legal card separately for every hand it touches. It may represent different cards in
  intersecting hands.
- Four of a kind plus joker remains four of a kind; there is no five-of-a-kind category.

### Hand values

| Hand | Base | Quality |
| --- | ---: | :---: |
| Straight flush | `$450` | yes |
| Four of a kind | `$325` | yes |
| Full house (Pro only) | `$230` | yes |
| Straight | `$180` | yes |
| Three of a kind | `$125` | yes |
| Flush | `$80` | no |
| Two pair | `$60` | no |
| Pair | `$5` | no |
| No hand | `$0` | no |

Normal multipliers are `×1` for 0–1 hands, `×2` for 2–3, `×3` for 4–5, `×4` for 6–7, `×5` for 8–9, and `×6`
for all 10. Pro uses `×1` for 0–3, `×2` for 4–5, `×3` for 6–7, `×4` for 8–9, `×5` for 10–11, and `×6` for all
12.

The source of truth is `src/scoring.js` for Normal and `src/proScoring.js` for Pro.

## Screenshot recognition

`src/screenshotRecognizer.js` is a game-specific visual recognizer, not a generic full-screen OCR engine. It:

1. locates the board, discard, and tray regions from game geometry and suit-colored borders;
2. aligns each card locally so small screenshot shifts do not move the sampling windows;
3. classifies suits from the game's palette and ranks from normalized glyph templates, using independent
   color-guided and fixed crops for weak or tilted Pro discard reads;
4. recognizes the joker from its multi-suit face;
5. reads the displayed dollar total and hand count from restricted scoreboard regions;
6. validates the proposed cards by rescoring the full placement.

The dollar total is the primary checksum. Its Pro parser removes a thousands comma that JPEG antialiasing sometimes
joins to the preceding digit before classifying that digit. Hand count is secondary and discarded when it forms an impossible
score/hand tuple. A checksum match may clear a visual-confidence flag only when every unused legal alternative for
that slot would break the checksum. Duplicate/missing cards and checksum-equivalent alternatives remain reviewable.

“Cards Look Right” is a user override, not a scoring gate. If it is clicked without any card edits, the app treats
the warning as likely over-sensitive and emits a local `pileup:recognizer-feedback` event containing only mode,
review count, and mismatch presence. It never includes the screenshot, filename, or card identities.

Every recognition fix belongs in a labelled fixture test. Current fixtures cover Normal and Pro, light/dark
screenshots, cropped screenshots, shifts, tilted tray cards, face cards, joker, score OCR, and hand-count OCR.

## Optimizer architecture

Both solvers are deterministic for an explicit attempt budget and validate every returned placement against the
requested deal.

### Shared anytime strategy

- Start from a portfolio rather than one preferred board theory.
- Include rank-oriented, suit/sequence-oriented, corner-compatible, discard-oriented, mixed, and unrestricted
  layouts.
- Cache hand evaluations and, after a swap, rescore only touched rows, columns, corner, or discard.
- Combine greedy refinement with longer annealing trajectories that can cross temporarily worse states.
- Keep structurally distinct leaders and stream improving incumbents to the UI.
- Interleave unused structural starts with fresh, coordinated perturbations of the current leader so a first pass
  exploits a strong basin without abandoning the deal-wide portfolio.
- On repeat Optimize clicks, reuse prior leaders, skip the already-completed deterministic opening, perturb elites,
  and advance a deal-specific continuation seed.

Structural families are search priorities, never correctness assumptions. Four-suit layouts can be excellent but do
not monopolize the search; unrestricted restarts remain in every deal portfolio.

### Normal

`src/heuristicSolver.js` finds a strong incumbent quickly. Normal can then use the exact bucket engine in
`src/exactHighBucketSolver.js`, the browser worker fallback, or the native C++ endpoint exposed by `server.mjs`.
Exact progress is resumable by canonical deal key. A result is labelled “Best Possible” only when the relevant proof
buckets are exhausted or safely bounded beneath the incumbent.

The certified sample remains `$15,270`.

### Pro

`src/proHeuristicSolver.js` searches the much larger `30`-card placement problem cooperatively in a Web Worker. It
precomputes promising five-card structures, caches encountered five-card hand scores, uses incremental touched-line
evaluation, and refines multiple diverse leaders. Pro is best-found, not certified exact.

Regression contracts include:

- the supplied `$25,560` board is scored exactly and appears in the quality seed portfolio;
- the mixed rank/suit QA deal reaches at least `$25,140` from scratch;
- the `$22,200` structural benchmark remains discoverable;
- reference deals remain deterministic at their explicit attempt budgets;
- continuation runs never move the displayed best backward.

More detail is in [solver-search-explanation.md](./solver-search-explanation.md).

## Result equivalence and persistence

Normal canonicalizes scoring-preserving board transforms and discard order. Result pills are grouped by total, hand
count, and quality count; variants preserve materially different hand-type profiles while rotations, row/column
switches, suit-only differences, and irrelevant kickers are folded where valid.

The player's exact placement is pinned even if an equivalent solver result exists. Normal shows up to 12 outcome
groups and Pro up to 8.

Persistence:

- Normal best-known browser cache: `pile-up-poker.best-known-fantasyland.v3`
- Normal exact progress: `pile-up-poker.exact-progress.v2`
- Pro best-known browser cache: `pile-up-poker.best-known-pro.v1`
- Local Normal repo cache: `data/local-best-known-fantasyland.json`

Browser caches are origin-specific. Production does not write to the repository.

## Key files

| Area | Files |
| --- | --- |
| Shared document and styles | `index.html`, `styles.css`, `src/modeBoot.js` |
| Normal UI/search | `src/app.js`, `src/heuristicSolver.js`, `src/exactHighBucketSolver.js` |
| Pro UI/search | `src/proApp.js`, `src/proHeuristicSolver.js`, `src/proHeuristicWorker.js` |
| Rules/scoring | `src/cards.js`, `src/scoring.js`, `src/proCards.js`, `src/proScoring.js` |
| Recognition | `src/screenshotRecognizer.js`, glyph-template modules, `src/recognizerFeedback.js` |
| Results/cache | `src/solutionProfiles.js`, `src/solutionPortfolio.js`, `src/layoutEquivalence.js`, `src/bestKnownCache.js` |
| Local server/exact tools | `server.mjs`, `tools/` |
| Contracts | `tests/`, `docs/design-system.md` |

## Release contract

GitHub Pages is the production host. `.github/workflows/pages.yml` runs the complete suite, runs
`tools/build-pages.mjs`, and deploys `dist/` on every push to `main`.

The build contains only the static runtime and the three JSON files read by Normal. It intentionally omits tests,
fixtures, development tools, native binaries, and raw exact-search logs. The deployment contract is enforced by
`tests/deployment-contract.test.js`.

## Next candidates

- Add fixture coverage before expanding recognition to a new game layout or font.
- Consider a small score-validating backend only if shared cross-user best-known results become a product goal.
- Continue improving Pro with deal-agnostic search families and regression deals; do not tune exclusively to one
  screenshot.
- Continue Normal proof work through the existing resumable exact/WASM contract rather than adding another
  disconnected solver path.
