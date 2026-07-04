# Pile-Up Poker Solver

A browser-based solver workspace for Puzzmo's Pile-Up Poker.

Current build:

- Fantasyland card picker for the 36-card deck.
- Exact hand and placement scoring.
- Fantasyland optimizer with symmetry-deduped solution results, a fast heuristic incumbent, a resumable native exact 8/9/10-hand pass, JS exact fallback passes for lower buckets, and a final 0/1/2-row low-region certifier.
- The UI reports "Best Possible" only when a saved/offline proof or the browser exact pass certifies the optimum; otherwise it reports "Best Found".
- Score breakdown for rows, columns, corners, and discard.
- Best-known result tracking per canonical/equivalent 20-card deal family, seeded from `data/best-known-fantasyland.json` and updated in browser local storage when a run finds a better placement.
- Exact proof-status tracking from offline C++ solver chunks plus browser-local resumable high-bucket progress from the local Node server.
- HiGHS MIP and OR-Tools CP-SAT exact-model scaffolding for future certification work.

Planning context lives in [docs/context-and-plan.md](./docs/context-and-plan.md).

## Run

```bash
pnpm dev
```

Then open:

```text
http://127.0.0.1:5173/
```

Use `server.mjs`/`pnpm dev` rather than a plain static file server. The app still loads statically, but the native exact-search chunk endpoint lives at `/api/exact-high-chunk`.

## Test

```bash
pnpm test
```

## GitHub Pages

This repo is set up for GitHub Pages with `.github/workflows/pages.yml`. After pushing to GitHub:

1. Open the repository on GitHub.
2. Go to Settings -> Pages.
3. Set Source to "GitHub Actions".
4. Push to `main` or run the "Deploy GitHub Pages" workflow manually.

The deployed Pages app is static. It can read committed data from `data/*.json` and save browser-local results in the visitor's localStorage. It cannot call the local C++ exact solver API or write new best-known placements back to the repo. For file-backed local persistence, run `pnpm dev` and use `http://127.0.0.1:5173/`.

## Exact Solver Experiment

```bash
python3 -m pip install -r requirements.txt
python3 tools/exact_fantasyland.py --sample --ten-hands-only --time-limit 90 --pretty
```

The faster experimental high-bucket certifier is compiled C++ and can run in resumable discard chunks:

```bash
python3 tools/run_exact_10_chunks.py --sample --incumbent 15270 --high-buckets --start-skip 0 --chunks 5000 --discard-limit 1 --seconds-per-chunk 60 --progress-every 100
python3 tools/summarize_exact_10_log.py --sample --incumbent 15270 --high-buckets
```

The broad `--high-buckets` mode searches every 8-, 9-, and 10-hand placement. Seven or fewer scoring hands cannot beat the current `$15,270` incumbent because their theoretical maximum is `$14,400`. The sample proof is complete in `data/exact-high-runs.jsonl`, summarized for the app in `data/exact-proof-status.json`.

The global full-deck maximum proof helper targets the current `$27,420` best-known construction:

```bash
python3 tools/prove_global_max.py --mode verify-known
python3 tools/prove_global_max.py --split-corners --threshold 3225 --time-limit 300 --encoding bool
```

Why `$3,225`: 9-or-fewer hands cannot beat `$27,420`, and a 10-hand placement can add at most `$1,350` from discard. Proving that no 9-hand grid can reach `$3,225` before discard would certify `$27,420` as the global optimum. The current CP-SAT encodings are proof scaffolding and may return `UNKNOWN`; stronger decomposition is still needed for a complete certificate.

## Notes

The UI optimizer is an anytime search plus a native exact high-bucket pass when served by `server.mjs`. The scorer is exact. For the screenshot sample, `$14,880` is not optimal; `$15,270` is certified optimal for that sample deal by the offline high-bucket proof.

For maximization, the saved "best known" score is a lower bound on the true optimum. Browser-local records are stored by canonical deal key, so equivalent deals can reuse the strongest known lower bound with the placement translated onto the selected cards. The native high-bucket pass also stores safe resume progress by canonical deal key; timed-out chunks redo the in-progress discard candidate rather than skipping unproved work. The exact passes cover the full proof space in phases: 8/9/10 hands, then 3+/4-row low buckets, then 0/1/2-row low buckets. The app still labels a result "Best Found" whenever those proof phases time out, so the remaining V0 work is making the exact proof path fast enough to exhaust reliably for arbitrary user-selected deals.

Browser-local cache keys:

- `pile-up-poker.best-known-fantasyland.v2`: best-known grid/discard placements and scores by canonical deal key.
- `pile-up-poker.exact-progress.v2`: resumable native high-bucket proof progress by canonical deal key.

Repo-backed local data:

- `data/local-best-known-fantasyland.json`: best-known placements saved by the local Node server at `/api/local-best-known`.

These caches are origin-specific. `http://127.0.0.1:5173/` and `file:///.../index.html` do not share browser local storage, and only the `http://127.0.0.1:5173/` Node server path can use the native exact solver API or write to `data/local-best-known-fantasyland.json`.
