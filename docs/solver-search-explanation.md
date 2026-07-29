# Fantasyland Solver Search Explanation

This note explains how the solver gets from an impossible raw placement space to a
practical best-found or certified-optimal result.

The short version:

1. The ideal search space starts at `20!`, or `C(20, 4) * 16!` if discard order is
   ignored.
2. Board symmetry can divide the exact placement space by `32`, but the result is
   still far too large to enumerate directly.
3. The implemented solver does not place cards one slot at a time. It scores every
   possible 4-card chunk once, then searches combinations of row, column, corner,
   and discard chunks.
4. The fast heuristic pass finds a strong lower bound quickly.
5. The exact/proof pass searches high-value buckets first and prunes anything whose
   optimistic maximum cannot beat the current best.

## 1. Raw and Symmetry-Reduced Ideal Space

If every slot is distinct, there are:

```text
20! = 2,432,902,008,176,640,000
```

That overcounts discard order. The 4 discard cards are a set, not an ordered row.

```text
20! / 4!
= C(20, 4) * 16!
= 101,370,917,007,360,000
```

The 4x4 scoring board has clean global symmetries:

```text
swap outer rows: 2
swap inner rows: 2
swap outer columns: 2
swap inner columns: 2
transpose rows/columns: 2

2 * 2 * 2 * 2 * 2 = 32
```

So the ideal canonical placement count is:

```text
C(20, 4) * 16! / 32
= 3,167,841,156,480,000
```

That is still much too large.

## 2. Row-Chunk View of the Same Ideal Space

After discard is chosen, 16 cards remain for the board.

If we choose the 4 row chunks in order:

```text
C(16, 4) * C(12, 4) * C(8, 4) * C(4, 4)
= 63,063,000
```

But if we only care about the unordered set of 4 row chunks, every partition was
counted `4!` times:

```text
unordered row partitions
= C(16, 4) * C(12, 4) * C(8, 4) * C(4, 4) / 4!
= 2,627,625
```

The same expression in factorial form is:

```text
16! / ((4!)^4 * 4!)
```

Why:

```text
16!      arrange all board cards
(4!)^4   ignore order inside each 4-card row chunk
4!       ignore order among the 4 row chunks
```

We still care about row order eventually, because rows interact with columns and
corners. The trick is that we do not have to decide row labels first. We can pick
the unordered row chunks, then add the remaining geometry later.

Once the 4 row chunks are chosen, use the first row as the column reference:

```text
row 1: c1 c2 c3 c4
```

The other 3 rows each have `4!` ways to align under those columns:

```text
(4!)^3 = 24^3 = 13,824
```

We do not multiply by `4!` for the first row because permuting the first row just
renames the columns.

After rows and columns are aligned, the corner hand is chosen by selecting 2 rows
and 2 columns:

```text
C(4, 2) * C(4, 2)
= 6 * 6
= 36
```

Visual example:

```text
        C1   C2   C3   C4
R1      X    .    .    X
R2      .    .    .    .
R3      .    .    .    .
R4      X    .    .    X
```

Here the corner hand uses rows `R1` and `R4`, and columns `C1` and `C4`.

This chunk representation is another coordinate system for the same ideal space,
not a magic fixed-factor reduction by itself:

```text
unordered row partitions * column alignments * corner choices / transpose
= 2,627,625 * 13,824 * 36 / 2
= 653,837,184,000
= 16! / 32
```

Then multiply by discard choices:

```text
C(20, 4) * 16! / 32
```

The reason this representation matters is not that it reduces the exact ideal
count on its own. It makes pruning possible.

## 3. What the Solver Scores

The scoring system only depends on 10 possible 4-card hands:

```text
4 rows
4 columns
1 corner hand, worth x2
1 discard hand, worth x3, but only if all 9 grid hands score
```

So for a 20-card deal, the solver can precompute every possible 4-card chunk:

```text
C(20, 4) = 4,845
```

Each chunk gets a base value:

```text
straight flush: 450
four of a kind: 325
straight: 180
three of a kind: 125
flush: 80
two pair: 60
pair: 5
no hand: 0
```

This happens in the exact/proof solver metadata. The heuristic solver keeps the
positive chunks for structural seeding and also caches the score of all 4,845
chunks for fast move evaluation.

## 4. Fast Heuristic Pass

The fast pass is designed to find a very good answer quickly. It is not a proof by
itself.

It does this:

1. Generate all scoring 4-card chunks.
2. Build promising complete starting placements:
   - sorted cards
   - reverse-sorted cards
   - suit-sorted cards
   - strong chunks placed into rows, columns, corners, or discard
   - strong corner plus discard combinations
   - strong edge/corner structures
3. Rank starting boards by hand count first, then by score.
4. Reserve separate portions of the clock for two complementary search lanes:
   - structured starts that quickly exploit recognizable hand geometry
   - longer annealing trajectories that can escape those structures
5. Improve promising starts by pairwise swaps:
   - try swapping every pair of slots
   - keep the best improving swap
   - repeat until no swap helps or the pass limit is hit
6. Run a portfolio of randomized/annealed searches until the time budget expires:
   - fresh random boards provide broad exploration
   - strong structured boards provide productive restarts
   - perturbed elite boards search nearby alternatives without restarting from zero
7. Store only the best structurally distinct solutions.

The fast move evaluator is the main throughput improvement shared with Pro. Normal
precomputes every possible 4-card hand once; Pro caches the 5-card hands it actually
encounters. After a swap, each solver recalculates only the touched row, column,
corner, or discard hand instead of rebuilding and rescoring every hand on the board.
Pro applies the same shortcut during its final one-swap refinement. Full scoring is
still run before a solution is returned, so the optimization changes search speed
rather than scoring semantics.

Longer trajectories matter because a high-value board is often separated from
another high-value board by temporarily worse swaps. A short greedy or annealing
run repeatedly gets trapped in the same local maximum. The mixed portfolio spends
enough consecutive moves on a candidate to cross those valleys while retaining
independent restarts so one structural theory cannot monopolize the search.

The shared strategy deliberately does not assume that a four-suit board, a rank
core, or any other one family is always best. Pro has additional 5-card seed
families because its hand geometry is different; Normal keeps its 4-card
corner/discard/edge seeds. The transferable contract is diversified structural
seeds plus unrestricted search, not a deal-specific layout.

This pass gives the exact solver an incumbent lower bound:

```text
we already know at least this score is achievable
```

A strong incumbent is extremely valuable because it lets the exact solver prune
more branches.

### Repeat Optimize runs

Search history is tracked separately for each exact deal during the current page
session. A second click on Optimize does not replay the first pass:

1. The strongest distinct layouts from prior passes become the new lower bound and
   restart portfolio.
2. The expensive deterministic structural opening is skipped because it was already
   completed on pass one.
3. A pass-specific deterministic seed selects fresh annealing trajectories.
4. Pro adds newly perturbed versions of prior leaders plus fresh random restarts.
5. Normal's exact bucket search also resumes its saved bucket offsets, so proof work
   continues rather than restarting the current bucket from the beginning.

The solver intentionally avoids retaining a giant exact set of every transient board:
millions of full placement keys would consume memory and be expensive to transfer
between workers. Instead, pass partitioning prevents deliberate trajectory replay,
while retaining prior leaders ensures a later pass can never lower the displayed best.

## 5. Exact/Proof Bucket Search

The exact bucket search follows the 4-card chunk structure more directly.

### Step 1: Score all chunks

For the selected 20 cards:

```text
C(20, 4) = 4,845
```

The solver stores:

```text
value[chunk]
all discard candidates, sorted by value
positive scoring chunks, sorted by value
```

### Step 2: Choose a discard candidate

The exact pass iterates discard candidates in descending hand value.

So yes, high-scoring discard chunks are tried first.

Important caveat: the solver does not assume the best discard hand is globally
best. Discard only scores if all 9 grid hands score. A high-value discard with a
weak grid can lose to a lower-value discard that enables a much better grid.

The ordering is a search priority, not a correctness assumption.

### Step 3: Search row partitions

For a fixed discard, 16 cards remain on the board.

The solver recursively chooses row chunks from the remaining cards.

To avoid counting the same unordered row partition repeatedly, each next row must
contain the lowest-index remaining card. This is the code version of dividing by
row-order duplicates.

Example:

```text
remaining cards: a b c d e f ...

next row must contain a
```

That means the partition `{A, B, C, D}` is not separately searched as:

```text
A, B, C, D
B, A, C, D
C, D, A, B
...
```

It gets one canonical row-partition path.

For the high-bucket proof pass, the initial row search focuses on scoring rows.
That covers high-hand-count boards because if a board has 8 or 9 scoring grid
hands, either the rows or the columns can be treated as the scoring-row side after
transpose symmetry.

Lower-bucket proof phases handle cases with fewer positive rows.

### Step 4: Prune row branches

Before finishing a branch, the solver computes an optimistic maximum:

```text
current row value
+ best possible remaining rows
+ best possible columns
+ best possible corner
+ possible discard bonus
```

If even that fantasy upper bound cannot beat the incumbent, the branch is skipped.

This is one of the biggest practical wins.

### Step 5: Try column alignments

Once 4 row chunks are selected, the solver aligns them into columns.

It fixes the first row as the column reference and permutes the other 3 rows:

```text
(4!)^3 = 13,824
```

For each alignment, the solver can compute the 4 column chunks.

It again prunes using an optimistic column/corner upper bound before doing more
expensive scoring.

### Step 6: Compute the corner choice

For a completed row/column alignment, the solver evaluates the possible corner
hands:

```text
choose 2 rows * choose 2 columns = 36
```

The "best corner" means the corner choice that gives the best score for this fixed
row/column structure and the current bucket constraints.

It does not mean "the prettiest poker hand in isolation."

For example, a two-pair corner can be part of the best board if the rows are
straight flushes and the columns are four-of-a-kinds. The corner may be lower value
than some theoretical alternative, but it can preserve much stronger rows/columns
or unlock the 9th grid hand and therefore discard scoring.

### Step 7: Materialize and score the full placement

When a candidate survives pruning, the solver materializes the actual 4x4 grid:

```text
selected corner rows become outer rows
selected corner columns become outer columns
```

Then it calls the normal scoring function on the real placement. This final score
is the source of truth.

The candidate is recorded if it matches or beats the current best.

## 6. Bucket Order and Certification

The app search budget is split roughly like this:

```text
80% heuristic search
20% exact/proof search
```

The exact proof starts with the most important buckets:

```text
8, 9, and 10 scoring hands
```

Those are searched first because multipliers make hand count extremely important.

If high buckets are exhausted and the current best score is higher than the
theoretical maximum of all lower buckets, the solver can certify the result.

Otherwise it may continue into lower-bucket proof phases:

```text
3+ row lower buckets
0-2 row lower buckets
```

If the time budget expires, progress and the best known result are saved locally.
The next run can continue with that lower bound/progress.

## 7. Ideal vs Implemented

Ideal exhaustive symmetry-aware solver:

```text
choose discard
choose unordered row chunks
choose column alignment
choose corner rows/columns
score
canonicalize by board symmetry
repeat until every canonical placement is checked
```

Implemented solver:

```text
score every 4-card chunk once
find a strong best-known placement quickly with heuristics
search exact buckets starting from high hand counts
anchor row partitions canonically
try column alignments
evaluate corner choices
prune branches whose upper bound cannot beat the incumbent
record structurally distinct best solutions
certify only when enough buckets are exhausted
```

The design choice is intentional: symmetry alone is not enough. The solver gets
speed by treating the game as a compatible-4-card-hands problem instead of a raw
20-slot permutation problem.

## 8. How Pro differs

Pro places 30 cards into 25 board slots and five discard slots. Its hands contain
five cards, and the joker can take a different identity in every intersecting
hand. The Normal exact chunk representation therefore does not transfer directly.
Pro currently uses a best-found anytime search:

1. Build deal-specific five-card metadata for strong rank, suit, straight,
   straight-flush, full-house, four-of-a-kind, discard, and corner-compatible
   structures.
2. Assemble complete starts from several independent structural families plus
   mixed and unrestricted layouts.
3. Keep the user layout, saved best, and earlier-run leaders as protected lower
   bounds.
4. Cache every five-card score encountered. After a swap, recompute only the
   affected rows, columns, corner hand, or discard instead of rescoring all 12
   possible hands.
5. Split the budget between structured refinement and longer annealing lanes.
   Random restarts remain active so rank-heavy or four-suit structures are never
   treated as universally optimal.
6. After every few structural restarts, perturb the current best board and
   launch an independent trajectory from it. This brings the useful behavior
   of a later continuation pass into the first run without abandoning unused
   structural families.
7. Refine multiple distinct leaders at the end, then group equivalent outcomes
   before rendering result pills.

The worker runs this search in short cooperative slices and streams a result only
when it improves or enough time has passed for useful progress feedback. The UI
can stop the worker early without losing the strongest placement already posted.

Repeat Optimize clicks pass earlier leaders back into the worker, skip the
already-completed opening portfolio, perturb those leaders, and select a new
deterministic continuation stream. The solver does not keep an unbounded set of
every visited placement; that would consume more memory than it saves. Instead it
avoids intentional replay through continuation seeds while retaining the best
distinct states that matter.

The current regression portfolio is deliberately varied:

- a `$25,560` suit/sequence-heavy board;
- a mixed rank/suit deal that must reach at least `$25,140`;
- a `$22,200` structural benchmark;
- the mixed screenshot board whose uploaded `$22,260` layout now has a
  first-pass regression target above `$22,980`;
- two earlier reference boards;
- a low-scoring uploaded board used to test that search can escape a weak player
  layout.

These are floors, not deal-specific templates. Any optimization that raises one
floor must preserve the others and must leave unrestricted search in the
portfolio.
