# Pile-Up Poker Solver Context And Execution Plan

## Game Model

Pile-Up Poker uses a 36-card deck: ranks `6 7 8 9 10 J Q K A` across four suits.

There are 16 board cells in a 4x4 grid and 4 discard cards. The 9 grid hands are:

- 4 rows
- 4 columns
- 1 corner hand made from the four corner cells

The discard hand scores only when all 9 grid hands score. If it scores, it is the 10th hand.

## Hand Values

Card order within a hand does not matter. Rank value does not affect payout inside a hand category, so three 8s and three 10s both score `$125`.

| Hand | Base | Quality |
| --- | ---: | :---: |
| Straight flush | `$450` | yes |
| 4 of a kind | `$325` | yes |
| Straight | `$180` | yes |
| 3 of a kind | `$125` | yes |
| Flush | `$80` | no |
| 2 pair | `$60` | no |
| Pair | `$5` | no |
| No hand | `$0` | no |

Bonuses:

- Corner hand: `base * 2`
- Discard hand, when eligible: `base * 3`

Score multiplier by number of scoring hands:

| Scoring hands | Multiplier |
| ---: | ---: |
| 0 or 1 | `x1` |
| 2 or 3 | `x2` |
| 4 or 5 | `x3` |
| 6 or 7 | `x4` |
| 8 or 9 | `x5` |
| 10 | `x6` |

Total score:

```text
grid_winnings_before_multiplier = sum(row bases) + sum(column bases) + 2 * corner_base
discard_winnings_before_multiplier = all_9_grid_hands_score ? 3 * discard_hand_base : 0
scoring_hands = count(scoring grid hands) + (discard_winnings_before_multiplier > 0 ? 1 : 0)
total = (grid_winnings_before_multiplier + discard_winnings_before_multiplier) * multiplier(scoring_hands)
```

The Fantasyland screenshot example validates this formula:

```text
grid base = 180 + 180 + 80 + 450 + 5 + 5 + 125 + 180 + (450 * 2) = 2105
discard = 125 * 3 = 375
total = (2105 + 375) * 6 = 14880
```

Important: `$14880` was the original personal-best screenshot layout, not a proven optimum. The solver later found and certified a `$15270` optimum for the same 20-card sample.

## Confirmed Rules And Notes

- Straights are 4 consecutive ranks in the 36-card rank order. Ace is high only: `J Q K A` is a straight, while `A 6 7 8` is not.
- The discard scores money only when all 9 grid hands score.
- Fantasyland unlock requires all 10 hands to score, with at least 5 quality hands and one of those quality hands in discard.
- A quality discard hand does not count for Fantasyland unlock unless the discard hand is money-scoring.
- Fantasyland cannot be unlocked from a Fantasyland-mode deal.
- If only 0 or 1 hands score, the score multiplier is `x1`.
- If a hand satisfies straight flush, score it as straight flush only, not as a separate straight and flush.

## Fantasyland Optimizer

Input:

- Any 20 distinct cards from the 36-card deck.

Decision variables:

- Assign 16 of the 20 cards to the 4x4 grid.
- Assign the remaining 4 cards to discard.

Objective:

```text
maximize score(grid, discard)
```

Equivalent placements:

- Board rotations and reflections preserve row/column/corner scoring.
- Discard card order is irrelevant.
- Store a canonical placement key across the full 32 scoring-preserving board transforms plus sorted discard cards so equivalent placements can be folded together. The transform group includes transpose plus independent swaps of edge rows, inner rows, edge columns, and inner columns.

V0 implementation target:

- Exact hand scoring and score breakdown.
- Card picker for the 36-card deck.
- Fantasyland optimizer over a 20-card input.
- Display the best placement found plus distinct tied or near-tied placements.
- Show score, winnings before multiplier, multiplier, hand count, quality hand count, and line breakdown.
- Search 10-hand starts first, then 9-hand starts, then lower hand-count starts, and report best-found score by hand-count bucket.
- Persist best-known placements by canonical/equivalent 20-card deal key. Seed known records from `data/best-known-fantasyland.json`; update browser-local records when a search finds a better score, and reuse the strongest saved lower bound for equivalent deals by translating the placement onto the selected cards.
- When the app is served by `server.mjs`, run compiled C++ exact chunks through `/api/exact-high-chunk` before falling back to the slower JS exact pass. On static hosts such as GitHub Pages, run that browser exact fallback in a module Web Worker so proof chunks do not freeze the UI. Card order is canonicalized before the native call, so safe resume progress can also be stored by canonical/equivalent deal key.
- Persist native exact high-bucket, 3+/4-row low-bucket, and 0/1/2-row low-bucket progress in browser local storage. Timed-out chunks advance only through fully completed discard candidates plus fully completed row partitions inside the current discard candidate; the currently evaluating row partition is retried on the next run so the proof cache remains conservative.
- Run an exact browser-side 8/9/10-hand certification pass after the fast heuristic incumbent. If that exact pass exhausts and the incumbent beats the theoretical 7-or-fewer-hand ceiling of `$14400`, the UI may label the result "Best Possible".
- If the high-bucket pass exhausts but the score is not above `$14400`, continue into the native 3+/4-row low-bucket pass. Because any board can be transposed, once every orientation with at least 3 scoring rows is exhausted, any best score above the two-or-fewer-row ceiling of `$8100` can also be certified.
- If needed, run the native final exact 0/1/2-row low-region certifier with at most 2 scoring columns. Once high buckets, 3+/4-row buckets, and this final region are all exhausted, the result can be certified regardless of score.

Solver path:

- Start with an anytime local-search optimizer for a usable browser V0.
- Keep scorer and placement representation pure and deterministic.
- Current browser path combines the heuristic with native C++ exact chunks when the Node server is available, otherwise Web Worker JS exact fallbacks. The native high-bucket, 3+/4-row low-bucket, and 0/1/2-row low-bucket chunks can resume within a long-running discard candidate by skipping row partitions that were already completed in prior chunks. The proof space is represented end to end; arbitrary-hand certification now depends on continuing resumable chunks until all relevant buckets are exhausted or bounded below the incumbent.
- Later replace or augment the search engine with a certified exact solver. Good candidates are a branch-and-bound line assignment solver, a compiled CP-SAT/ILP backend, or a WASM module loaded by the existing Web Worker contract.

## Normal Mode Money Optimizer

Normal mode is a sequential decision problem.

State after round `t`:

- Locked grid cells from previous rounds.
- Discard pile from previous rounds.
- Current 5-card deal, if inside a round.
- Remaining unknown deck.

Action in a round:

- Choose 1 of the 5 current cards to discard.
- Place the other 4 cards in empty grid cells.
- Cards from previous rounds cannot move.
- Cards from the current round may move until the round is committed.

Objective variants:

```text
known future deal analysis:
maximize final score subject to the actual four 5-card rounds

live strategy EV:
maximize E[final score | locked state, current deal, remaining deck distribution]

best/worst potential:
min and max final score over all possible future deals from the remaining deck
```

Value function sketch:

```text
V(state) =
  if final round complete:
    score(grid, discard)
  if current deal known:
    max_action V(apply_action(state, action))
  if waiting for future deal:
    expectation or min/max over all 5-card deals from remaining deck
```

The full first-round chance node has `C(31, 5) = 169911` possible next deals after the first deal, so pruning, memoization, and action compression will matter.

## Normal Mode Fantasyland-Likelihood Optimizer

This uses the same sequential state/action structure as the money optimizer, but the objective changes.

Primary objective:

```text
maximize P(all_10_hands_score and quality_hands >= 5 and discard_has_quality_hand)
```

Where `discard_has_quality_hand` means the discard hand is a scoring quality hand. A quality-shaped discard does not count unless all 9 grid hands score and the discard scores as the 10th hand.

Potential tie-breakers:

- Maximize expected score.
- Maximize expected quality-hand count.
- Maximize probability of all 10 hands scoring when quality odds are tied.
- Prefer strategies that preserve high-upside future outs.

Fantasyland unlock condition:

- All 10 hands score.
- At least 5 scoring hands are quality hands.
- The scoring discard hand is one of the quality hands.

## Analytics Questions

Fantasyland:

- Best possible 20-card deal and placement.
- Worst possible 20-card deal by optimized score.
- Distribution across all `C(36, 20) = 7307872110` possible 20-card deals.
- Percentile rank for a record such as `$19230`.
- Count and characterize deals where the best 9-or-fewer-hand solution beats the best 10-hand solution.
- For each deal, compare best score by hand-count bucket so we can see when multiplier-chasing is or is not optimal.

Precompute feasibility note:

- Raw 20-card deals: `7307872110`.
- Canonical representatives under global suit relabeling plus rank translation: `297965960`.
- This is much smaller than raw deals but still far too large for per-deal exact proof at the current sample runtime.
- At even 1 hour per canonical deal, full exact precompute would be roughly `298M` CPU-hours, or about `34000` CPU-years.
- Compact storage is plausible only if the computation exists: scores alone are hundreds of MB for canonical reps; score plus placement is several GB in a packed binary table, and much larger in JSON/hash-map form.
- A more realistic analytics path is a canonical cache for solved/notable deals plus Monte Carlo or stratified sampling, then targeted exact jobs for records, weird buckets, and blog-post examples. The app's browser-local best-known cache now follows this shape: every search can improve the saved lower bound for the whole canonical deal family, not only the exact selected card IDs.

Normal mode:

- Expected value for a full deal under optimal money play.
- Overall distribution under optimal play.
- Best strategy signatures and whether corner straight flush is actually dominant.
- Most money possible without qualifying for Fantasyland.
- Least money possible while still qualifying for Fantasyland.

## Analytics Findings So Far

These are useful context for the eventual analytics writeup, but should be labeled carefully until exact proofs exist.

- The loose 10-hand theoretical ceiling is `$35100`: 8 normal grid straight flushes, a corner straight flush at `x2`, and a discard straight flush at `x3`, all multiplied by `x6`.
- That `$35100` ceiling is not physically reachable. If every row and every column were a straight flush, row suits and column suits would force all 16 board cards to be the same suit, but the deck has only 9 cards of each suit.
- Best verified physically reachable full-deck Fantasyland construction found so far: `$27420`. This is a construction, not yet a full global proof.

```text
Board:
7H 8H 9H 10H
7C 8C 9C 10C
7D 8D 9D 10D
7S 8S 9S 10S

Discard:
JS QS KS AS

Rows:    4 straight flushes = 4 * $450 = $1800
Columns: 4 four-of-kinds    = 4 * $325 = $1300
Corners: two pair x2        = $60 * 2  = $120
Discard: straight flush x3  = $450 * 3 = $1350
Before multiplier: $4570
Total: $4570 * 6 = $27420
```

- Best verified construction found so far with a straight flush in the corners: `$27300`. This is also best-found, not proven optimal.

```text
Board:
10S 9H 9C 9S
KS  7H 7C 7S
QS  6H 6C 6S
JS  8H 8C 8S

Discard:
10C JC QC KC

Rows:    4 three-of-kinds   = 4 * $125 = $500
Columns: 4 straight flushes = 4 * $450 = $1800
Corners: straight flush x2  = $450 * 2 = $900
Discard: straight flush x3  = $450 * 3 = $1350
Before multiplier: $4550
Total: $4550 * 6 = $27300
```

- The corner-straight-flush construction is `$120` below the `$27420` construction. The corner upgrade from two pair to straight flush is worth `+$780` before multiplier, but the best-found structure gives up `$800` across the row/column hands, netting `-$20` before multiplier, or `-$120` after the `x6` multiplier.
- This suggests corner straight flush is not automatically dominant for the global full-deck maximum, even though it is extremely valuable and likely important in many deal-specific optimizations.

## Edge Cases

- Multiple optimal placements can be equivalent by rotation/reflection.
- Multiple placements can have the same score but different quality-hand counts or future usefulness in normal mode.
- The saved best-known score is a lower bound for a maximization problem. A certified exact solver should separately report an upper bound and only mark optimal when the bounds meet.
- Pair-only hands are low value but can be important because they move the hand-count multiplier.
- A discard hand is ignored for money unless all 9 grid hands score.
- If all 9 grid hands score but discard is no hand, the result is 9 hands and multiplier `x5`.
- Screenshot parsing will need to handle Puzzmo card art, tilted hand cards, partial card visibility, suit colors, and low-contrast faded discards.
- Normal-mode screenshots may not reveal the round in which a locked card was placed, so replay comparison needs either round screenshots or manually entered deal order.
- The app should keep line labels stable even when a board symmetry is folded for deduplication.

## Build Phases

1. Foundation
   - Static browser app.
   - Card model, hand scorer, placement scorer.
   - Context doc and tests for known examples.

2. Fantasyland V0
   - 20-card picker.
   - Optimizer runner.
   - Best placement view and score breakdown.
   - Distinct solution dedupe by board symmetry.

3. Fantasyland V1
   - Screenshot upload and card recognition.
   - Compare user placement against optimizer output.
   - Show percent of best score and score gap.

4. Normal Money V0
   - Round-by-round card entry.
   - Locked board state.
   - Conditional optimizer for known current deal.
   - Min/max/EV summaries for future rounds.

5. Normal Fantasyland V0
   - Full unlock-probability objective: all 10 hands, 5+ quality hands, scoring quality discard.
   - Strategy comparison against money objective.
   - Explicit reporting of whether a line of play improves quality odds, all-10-hands odds, or both.

6. Analytics Engine
   - Batch enumerator or sampler.
   - Exact solver integration for certification.
   - Distribution and record-percentile reports.

## Exact Certification Workstream

Current direction:

- Keep the browser UI interactive and honest: it shows best-known/best-found placements by default, and only marks a deal proven when either `data/exact-proof-status.json` has a completed exact proof for that deal, browser-local native high-bucket progress has exhausted all high buckets with an incumbent above the 7-or-fewer-hand ceiling, browser-local high plus 3+/4-row low-bucket progress has exhausted with an incumbent above the 0/1/2-row ceiling, or all three native proof buckets have exhausted.
- Run exact certification offline.
- Use the compiled high-bucket geometry search in `tools/exact_fantasyland_10.cpp` via `tools/run_exact_10_chunks.py` for resumable discard chunks.
- Native exact search now caches row candidates and four-card submasks per mask, avoids temporary row-pair allocations in the corner bound, and uses tighter row/column optimistic bounds for lower proof buckets.
- The `--high-buckets` mode searches every 8-, 9-, and 10-hand placement. This is enough to certify the current `$15270` sample incumbent because 7-or-fewer hands have a theoretical maximum of `$14400`.
- The `--three-plus-low` mode searches the next lower proof bucket: all orientations with at least 3 scoring rows and at most 7 scoring grid hands. If this exhausts with an incumbent above `$8100`, the final 0/1/2-row region cannot beat it.
- The `--low-two` mode searches the final 0/1/2-row region with at most 2 scoring columns. If this exhausts after the other two buckets, the deal is certified regardless of score.
- Persist exact run chunks in `data/exact-high-runs.jsonl`.
- Rebuild app-visible proof status with `tools/summarize_exact_10_log.py`, which writes `data/exact-proof-status.json`.
- Mark a deal as proven only when every relevant bucket has either been exhausted or bounded below the saved best-known score.
- For the full-deck global maximum, use `tools/prove_global_max.py`. The proof target is to show no all-9-grid-hand board can reach `$3225` before discard. Since discard can add at most `$1350`, this would prove the `$27420` construction globally optimal. Current CP-SAT encodings can express this target but have returned `UNKNOWN` on short runs, so stronger decomposition is still needed.

Current sample proof checkpoint:

```text
Best known: $15270
Scope: 8-or-more-hand buckets
Status: proven optimal for this sample deal
Completed discard candidates: 4845 / 4845
Completed range: 0-4844
Timeouts: none
Result: no 8-, 9-, or 10-hand placement beats $15270; 7-or-fewer hands are bounded below $15270.
```
