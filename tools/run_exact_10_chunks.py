#!/usr/bin/env python3
"""Run the compiled exact 10-hand Fantasyland solver in resumable chunks."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tools" / "exact_fantasyland_10.cpp"
BINARY = ROOT / "tools" / "bin" / "exact_fantasyland_10"


def compile_solver() -> None:
    BINARY.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["clang++", "-std=c++20", "-O3", str(SOURCE), "-o", str(BINARY)],
        cwd=ROOT,
        check=True,
    )


def run_chunk(args: argparse.Namespace, skip: int) -> dict:
    command = [
        str(BINARY),
        "--seconds",
        str(args.seconds_per_chunk),
        "--incumbent",
        str(args.incumbent),
        "--skip-discards",
        str(skip),
        "--discard-limit",
        str(args.discard_limit),
    ]
    if args.sample:
        command.append("--sample")
    else:
        command.extend(args.cards)
    if args.high_buckets:
        command.append("--high-buckets")

    completed = subprocess.run(command, cwd=ROOT, check=True, text=True, capture_output=True)
    return json.loads(completed.stdout)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("cards", nargs="*", help="20 cards, unless --sample is used")
    parser.add_argument("--sample", action="store_true")
    parser.add_argument("--incumbent", type=int, default=0)
    parser.add_argument("--start-skip", type=int, default=0)
    parser.add_argument("--chunks", type=int, default=1)
    parser.add_argument("--discard-limit", type=int, default=1)
    parser.add_argument("--seconds-per-chunk", type=float, default=60)
    parser.add_argument("--log", type=Path)
    parser.add_argument("--high-buckets", action="store_true")
    parser.add_argument("--no-compile", action="store_true")
    parser.add_argument("--progress-every", type=int, default=1)
    args = parser.parse_args()

    if not args.sample and len(args.cards) != 20:
        raise SystemExit("Provide 20 cards or --sample.")
    if args.log is None:
        args.log = ROOT / "data" / ("exact-high-runs.jsonl" if args.high_buckets else "exact-10hand-runs.jsonl")

    if not args.no_compile:
        compile_solver()

    args.log.parent.mkdir(parents=True, exist_ok=True)
    best = args.incumbent
    with args.log.open("a", encoding="utf-8") as handle:
        for chunk_index in range(args.chunks):
            skip = args.start_skip + chunk_index * args.discard_limit
            result = run_chunk(args, skip)
            best = max(best, result["bestTotal"])
            result["chunkIndex"] = chunk_index
            result["bestAcrossRun"] = best
            handle.write(json.dumps(result, sort_keys=True) + "\n")
            handle.flush()
            should_print = (
                args.progress_every <= 1
                or chunk_index % args.progress_every == 0
                or result.get("hasNewPlacement")
                or result.get("timedOut")
                or result.get("exhaustedSearchBucket")
                or result.get("exhausted10HandBucket")
            )
            if should_print:
                print(json.dumps(result, indent=2))
            if result.get("exhaustedSearchBucket") or result.get("exhausted10HandBucket"):
                break


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        sys.stderr.write(error.stdout or "")
        sys.stderr.write(error.stderr or "")
        raise
