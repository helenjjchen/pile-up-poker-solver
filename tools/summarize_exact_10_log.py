#!/usr/bin/env python3
"""Summarize resumable exact 10-hand Fantasyland proof chunks."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from itertools import combinations
from math import comb
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SAMPLE = [
    "9S",
    "QC",
    "JH",
    "10S",
    "JC",
    "AD",
    "KD",
    "QD",
    "QH",
    "6H",
    "KH",
    "9H",
    "QS",
    "AS",
    "KS",
    "JS",
    "7H",
    "7S",
    "7C",
    "6C",
]
RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"]
SUITS = ["H", "S", "C", "D"]
SUIT_ORDER = {suit: index for index, suit in enumerate(SUITS)}
RANK_ORDER = {rank: index for index, rank in enumerate(RANKS)}


def parse_card(card: str) -> tuple[str, str]:
    return card[:-1], card[-1]


def sort_cards(cards: list[str]) -> list[str]:
    return sorted(cards, key=lambda card: (RANK_ORDER[parse_card(card)[0]], SUIT_ORDER[parse_card(card)[1]]))


def deal_key(cards: list[str]) -> str:
    return " ".join(sort_cards(cards))


def hand_value(cards: tuple[str, ...]) -> int:
    ranks: dict[str, int] = {}
    suits: dict[str, int] = {}
    indexes = []
    for card in cards:
        rank, suit = parse_card(card)
        ranks[rank] = ranks.get(rank, 0) + 1
        suits[suit] = suits.get(suit, 0) + 1
        indexes.append(RANK_ORDER[rank])

    counts = sorted(ranks.values(), reverse=True)
    unique = sorted(set(indexes))
    is_flush = len(suits) == 1
    is_straight = len(unique) == 4 and unique[-1] - unique[0] == 3

    if is_straight and is_flush:
        return 450
    if counts[0] == 4:
        return 325
    if is_straight:
        return 180
    if counts[0] == 3:
        return 125
    if is_flush:
        return 80
    if counts[0] == 2 and len(counts) > 1 and counts[1] == 2:
        return 60
    if counts[0] == 2:
        return 5
    return 0


def positive_discard_count(cards: list[str]) -> int:
    return sum(1 for hand in combinations(cards, 4) if hand_value(hand) > 0)


def read_log(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def merge_ranges(values: set[int]) -> list[list[int]]:
    if not values:
        return []
    ranges = []
    sorted_values = sorted(values)
    start = previous = sorted_values[0]
    for value in sorted_values[1:]:
        if value == previous + 1:
            previous = value
            continue
        ranges.append([start, previous])
        start = previous = value
    ranges.append([start, previous])
    return ranges


def contiguous_checked_prefix(values: set[int]) -> int:
    cursor = 0
    while cursor in values:
        cursor += 1
    return cursor


def summarize(cards: list[str], log_path: Path, incumbent: int, high_buckets: bool) -> dict:
    rows = read_log(log_path)
    completed: set[int] = set()
    timed_out = set()
    exhausted_seen = False
    best = incumbent

    for row in rows:
        skip = int(row.get("skipDiscards", 0))
        checked = int(row.get("discardsChecked", 0))
        best = max(best, int(row.get("bestAcrossRun", row.get("bestTotal", 0))))
        if row.get("timedOut"):
            timed_out.add(skip)
            continue
        if checked > 0:
            completed.update(range(skip, skip + checked))
        exhausted_seen = exhausted_seen or bool(row.get("exhaustedSearchBucket", row.get("exhausted10HandBucket")))

    total_discards = comb(len(cards), 4) if high_buckets else positive_discard_count(cards)
    checked_prefix = contiguous_checked_prefix(completed)
    search_proven = exhausted_seen or checked_prefix >= total_discards
    status = "proven" if search_proven else "in-progress"
    scope = "8-or-more-hand buckets" if high_buckets else "10-hand bucket only"
    notes = (
        "This covers every 8-, 9-, and 10-hand placement. Seven or fewer hands cannot beat the incumbent "
        "because their theoretical maximum is 14400."
        if high_buckets
        else "This certifies only the 10-hand search bucket. The full deal is optimal only after "
        "9-hand and lower buckets are also exhausted or safely bounded below the incumbent."
    )

    return {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "records": [
            {
                "dealKey": deal_key(cards),
                "deal": sort_cards(cards),
                "bestKnownTotal": best,
                "incumbentTotal": incumbent,
                "status": status,
                "scope": scope,
                "totalCandidateDiscards": total_discards,
                "totalPositiveDiscards": positive_discard_count(cards),
                "completedDiscards": len(completed),
                "contiguousCompletedDiscards": checked_prefix,
                "completedRanges": merge_ranges(completed),
                "timedOutStarts": sorted(timed_out),
                "exhausted10HandBucket": search_proven and not high_buckets,
                "exhaustedSearchBucket": search_proven,
                "logEntries": len(rows),
                "logPath": str(log_path.relative_to(ROOT)),
                "notes": notes,
            }
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("cards", nargs="*", help="20 cards, unless --sample is used")
    parser.add_argument("--sample", action="store_true")
    parser.add_argument("--incumbent", type=int, default=15270)
    parser.add_argument("--log", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "exact-proof-status.json")
    parser.add_argument("--high-buckets", action="store_true")
    args = parser.parse_args()

    if args.log is None:
        args.log = ROOT / "data" / ("exact-high-runs.jsonl" if args.high_buckets else "exact-10hand-runs.jsonl")

    cards = SAMPLE if args.sample else args.cards
    if len(cards) != 20:
        raise SystemExit("Provide 20 cards or --sample.")

    summary = summarize(cards, args.log, args.incumbent, args.high_buckets)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary["records"][0], indent=2))


if __name__ == "__main__":
    main()
