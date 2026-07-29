# Pile-Up Poker Solver

A browser-based Fantasyland solver for Puzzmo's Pile-Up Poker and Pile-Up Poker Pro.

Normal and Pro are two modes of one product. Both render from `index.html`, share the same navigation, screenshot
import, deal editor, attempt comparison, search controls, result portfolio, board renderer, and responsive design.
Use `?mode=pro` for Pro; `pro.html` is a compatibility redirect for older links.

## What is implemented

| | Normal | Pro |
| --- | --- | --- |
| Deal | 20 cards from the 36-card `6`–`A` deck | 30 cards from all 52 cards plus the required joker |
| Placement | 4×4 grid + 4 discard | 5×5 grid + 5 discard |
| Hands | 4 rows, 4 columns, 4 corners | 5 rows, 5 columns, 4 corners + center |
| Search | Anytime heuristic plus resumable exact proof buckets | Anytime heuristic with structural and unrestricted search lanes |
| Joker | — | Independently wild in every hand it touches |

The app also includes:

- Exact scoring and per-line score explanations for both modes.
- Screenshot recognition for supported Pile-Up Poker phone layouts, including dark/light themes, cropped boards,
  shifted screenshots, tilted tray cards, Pro face cards, and the joker.
- Screenshot score/hand-count checksum validation. Recognition uncertainty is advisory and never blocks Optimize for
  a complete, duplicate-free deal.
- A player-entered or recognized layout as a protected search floor, with an explicit “Your grid” result.
- Grouped results that collapse equivalent rotations/switches while preserving genuinely different scoring-way
  variants.
- Deep search by default. Repeated Optimize runs keep prior leaders and advance to a fresh deterministic search
  stream for the same deal.
- Browser-local best-known results. Normal can additionally read/write the repo-backed local cache and run native
  exact chunks when served by the local Node server.

The recognizer runs entirely in the browser. Uploaded images and card identities are not transmitted. Confirming
“Cards Look Right” without edits emits only a local, privacy-safe UI event so over-sensitive warnings can be
diagnosed during development.

## Run

Requires a current Node.js release.

```bash
pnpm dev
```

Open `http://127.0.0.1:5173/`. Use the local server instead of opening `file://` when working on Normal's native
exact-search chunks or repo-backed best-known cache.

## Test and build

```bash
pnpm test
pnpm build:pages
```

`pnpm test` covers Normal and Pro scoring, optimizer regression deals, screenshot fixtures, recognition feedback,
solution grouping, the shared design/UI contracts, and the production bundle contract.

The Pro regression suite includes the supplied `$25,560` layout and requires the mixed rank/suit QA deal to reach at
least `$25,140` from scratch. Recognition fixtures live in `tests/fixtures/`; every corrected screenshot should be
added there before recognition logic changes.

`pnpm build:pages` creates `dist/` with only the static runtime:

- `index.html`, `pro.html`, `styles.css`, `favicon.svg`, and `.nojekyll`
- executable `src/` modules
- the three JSON files the Normal runtime reads

Tests, tools, fixture images, native binaries, and multi-megabyte exact-search logs are intentionally excluded.

## Production

`.github/workflows/pages.yml` is the production pipeline. A push to `main`:

1. runs the complete test suite;
2. builds the explicit `dist/` bundle;
3. deploys that artifact to GitHub Pages.

The deployed app is static. It can run both browser heuristics, store browser-local records, and run Normal's Web
Worker exact fallback. It cannot call the local native-solver API or write new records into the repository.

## Normal exact-search tools

Normal retains the compiled C++ bucket certifier and Python orchestration tools for offline proofs:

```bash
pnpm compile:exact
python3 tools/run_exact_10_chunks.py --sample --incumbent 15270 --high-buckets --chunks 5000 --seconds-per-chunk 60
python3 tools/summarize_exact_10_log.py --sample --incumbent 15270 --high-buckets
```

The sample `$15,270` result is certified. Proof progress is summarized into `data/exact-proof-status.json`; raw
JSONL logs are development artifacts and are not deployed. The optional future WASM contract is documented in
`src/wasm/README.md`.

## Project documentation

- [Product context and architecture](./docs/context-and-plan.md)
- [Design system and visual QA contract](./docs/design-system.md)
- [Optimizer search explanation](./docs/solver-search-explanation.md)
