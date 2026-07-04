#!/usr/bin/env python3
"""Proof helper for the full-deck Fantasyland maximum.

This script targets the global question: across any 20 cards chosen from the
36-card deck, can any Fantasyland placement beat the verified $27,420
construction?

The key reduction is:

- A 9-or-fewer-hand score cannot beat $27,420 by the loose value ceiling.
- Any 10-hand score has total = (grid_base + discard_bonus) * 6.
- discard_bonus <= 450 * 3 = 1350.
- Beating $27,420 requires grid_base + discard_bonus > 4570.
- Therefore, a sufficient proof is INFEASIBLE(grid_base >= 3225) over all
  4x4 grids with all 9 grid hands scoring.

If every corner-hand case is infeasible at grid_base >= 3225, the verified
$27,420 construction is globally optimal.
"""

from __future__ import annotations

import argparse
import json
import math
import time
from dataclasses import dataclass
from itertools import permutations
from functools import lru_cache
from typing import Iterable

from ortools.sat.python import cp_model


RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"]
SUITS = ["H", "S", "C", "D"]
RANK_INDEX = {rank: index for index, rank in enumerate(RANKS)}
SUIT_LABEL = {"H": "♥", "S": "♠", "C": "♣", "D": "♦"}

DECK = [f"{rank}{suit}" for rank in RANKS for suit in SUITS]

LINE_DEFINITIONS = [
    {"key": "row-1", "label": "Row 1", "indices": [0, 1, 2, 3], "bonus": 1},
    {"key": "row-2", "label": "Row 2", "indices": [4, 5, 6, 7], "bonus": 1},
    {"key": "row-3", "label": "Row 3", "indices": [8, 9, 10, 11], "bonus": 1},
    {"key": "row-4", "label": "Row 4", "indices": [12, 13, 14, 15], "bonus": 1},
    {"key": "col-1", "label": "Column 1", "indices": [0, 4, 8, 12], "bonus": 1},
    {"key": "col-2", "label": "Column 2", "indices": [1, 5, 9, 13], "bonus": 1},
    {"key": "col-3", "label": "Column 3", "indices": [2, 6, 10, 14], "bonus": 1},
    {"key": "col-4", "label": "Column 4", "indices": [3, 7, 11, 15], "bonus": 1},
    {"key": "corners", "label": "Corners", "indices": [0, 3, 12, 15], "bonus": 2},
]

CORNER_KEYS = ["straight-flush", "four-kind", "straight", "three-kind", "flush", "two-pair", "pair"]


@dataclass(frozen=True)
class Hand:
    key: str
    label: str
    base: int
    quality: bool


HANDS = {
    "straight-flush": Hand("straight-flush", "Straight flush", 450, True),
    "four-kind": Hand("four-kind", "4 of a kind", 325, True),
    "straight": Hand("straight", "Straight", 180, True),
    "three-kind": Hand("three-kind", "3 of a kind", 125, True),
    "flush": Hand("flush", "Flush", 80, False),
    "two-pair": Hand("two-pair", "2 pair", 60, False),
    "pair": Hand("pair", "Pair", 5, False),
    "no-hand": Hand("no-hand", "No hand", 0, False),
}


BEST_KNOWN_GRID = [
    "7H",
    "8H",
    "9H",
    "10H",
    "7C",
    "8C",
    "9C",
    "10C",
    "7D",
    "8D",
    "9D",
    "10D",
    "7S",
    "8S",
    "9S",
    "10S",
]
BEST_KNOWN_DISCARD = ["JS", "QS", "KS", "AS"]


def split_card(card: str) -> tuple[str, str]:
    return card[:-1], card[-1]


def card_label(card: str) -> str:
    rank, suit = split_card(card)
    return f"{rank}{SUIT_LABEL[suit]}"


def score_hand(cards: Iterable[str]) -> Hand:
    card_list = list(cards)
    ranks = [split_card(card)[0] for card in card_list]
    suits = [split_card(card)[1] for card in card_list]
    counts = sorted((ranks.count(rank) for rank in set(ranks)), reverse=True)
    rank_indexes = sorted(RANK_INDEX[rank] for rank in set(ranks))
    is_flush = len(set(suits)) == 1
    is_straight = (
        len(rank_indexes) == 4
        and rank_indexes[-1] - rank_indexes[0] == 3
        and all(rank_indexes[index] == rank_indexes[0] + index for index in range(4))
    )

    if is_straight and is_flush:
        return HANDS["straight-flush"]
    if counts[0] == 4:
        return HANDS["four-kind"]
    if is_straight:
        return HANDS["straight"]
    if counts[0] == 3:
        return HANDS["three-kind"]
    if is_flush:
        return HANDS["flush"]
    if counts[0] == 2 and len(counts) > 1 and counts[1] == 2:
        return HANDS["two-pair"]
    if counts[0] == 2:
        return HANDS["pair"]
    return HANDS["no-hand"]


def multiplier(hand_count: int) -> int:
    if hand_count >= 10:
        return 6
    if hand_count >= 8:
        return 5
    if hand_count >= 6:
        return 4
    if hand_count >= 4:
        return 3
    if hand_count >= 2:
        return 2
    return 1


def score_grid(grid: list[str]) -> dict:
    lines = []
    for line in LINE_DEFINITIONS:
        cards = [grid[index] for index in line["indices"]]
        hand = score_hand(cards)
        lines.append(
            {
                **line,
                "cards": cards,
                "hand": hand,
                "value": hand.base * line["bonus"],
                "scores": hand.base > 0,
            }
        )
    return {
        "base": sum(line["value"] for line in lines),
        "handCount": sum(1 for line in lines if line["scores"]),
        "lines": lines,
    }


def score_placement(grid: list[str], discard: list[str]) -> dict:
    grid_score = score_grid(grid)
    discard_hand = score_hand(discard)
    discard_scores = grid_score["handCount"] == 9 and discard_hand.base > 0
    discard_bonus = discard_hand.base * 3 if discard_scores else 0
    hand_count = grid_score["handCount"] + (1 if discard_scores else 0)
    base = grid_score["base"] + discard_bonus
    return {
        "total": base * multiplier(hand_count),
        "base": base,
        "gridBase": grid_score["base"],
        "discardBonus": discard_bonus,
        "handCount": hand_count,
        "multiplier": multiplier(hand_count),
        "grid": grid,
        "discard": discard,
        "lines": grid_score["lines"],
        "discardHand": discard_hand,
        "discardScores": discard_scores,
    }


def theoretical_total_ceiling(hand_count: int) -> int:
    if hand_count >= 10:
        base = 8 * HANDS["straight-flush"].base + 2 * HANDS["straight-flush"].base
        base += 3 * HANDS["straight-flush"].base
    else:
        grid_hands = min(hand_count, 9)
        base = 2 * HANDS["straight-flush"].base
        base += max(0, grid_hands - 1) * HANDS["straight-flush"].base
    return base * multiplier(hand_count)


def build_ordered_positive_table(bonus: int, corner_key: str | None = None) -> list[list[int]]:
    rows = []
    for ordered_indexes in permutations(range(len(DECK)), 4):
        hand = score_hand(DECK[index] for index in ordered_indexes)
        if hand.base == 0:
            continue
        if corner_key is not None and hand.key != corner_key:
            continue
        rows.append([*ordered_indexes, hand.base * bonus])
    return rows


@lru_cache(maxsize=16)
def cached_ordered_positive_table(bonus: int, corner_key: str | None = None) -> tuple[tuple[int, ...], ...]:
    return tuple(tuple(row) for row in build_ordered_positive_table(bonus, corner_key))


@lru_cache(maxsize=1)
def positive_candidates() -> tuple[tuple[tuple[int, int, int, int], int, str], ...]:
    candidates = []
    for ordered_indexes in permutations(range(len(DECK)), 4):
        if sorted(ordered_indexes) != list(ordered_indexes):
            continue
        hand = score_hand(DECK[index] for index in ordered_indexes)
        if hand.base > 0:
            candidates.append((ordered_indexes, hand.base, hand.key))
    return tuple(candidates)


@lru_cache(maxsize=16)
def candidate_indexes_for_key(corner_key: str | None = None) -> tuple[int, ...]:
    candidates = positive_candidates()
    return tuple(index for index, candidate in enumerate(candidates) if corner_key is None or candidate[2] == corner_key)


@lru_cache(maxsize=16)
def candidate_indexes_by_card(corner_key: str | None = None) -> tuple[tuple[int, ...], ...]:
    selected = candidate_indexes_for_key(corner_key)
    by_card = [[] for _ in DECK]
    candidates = positive_candidates()
    for candidate_index in selected:
        indexes, _base, _key = candidates[candidate_index]
        for card_index in indexes:
            by_card[card_index].append(candidate_index)
    return tuple(tuple(indexes) for indexes in by_card)


def solve_grid_threshold_bool(args: argparse.Namespace, corner_key: str | None = None) -> dict:
    started = time.time()
    model = cp_model.CpModel()
    x = [
        [model.new_bool_var(f"x_{slot_index}_{card_index}") for card_index in range(len(DECK))]
        for slot_index in range(16)
    ]

    for slot_index in range(16):
        model.add_exactly_one(x[slot_index][card_index] for card_index in range(len(DECK)))
    for card_index in range(len(DECK)):
        model.add_at_most_one(x[slot_index][card_index] for slot_index in range(16))

    hearts = [index for index, card in enumerate(DECK) if split_card(card)[1] == "H"]
    model.add_exactly_one(x[0][card_index] for card_index in hearts)

    candidates = positive_candidates()
    normal_candidate_indexes = candidate_indexes_for_key(None)
    normal_by_card = candidate_indexes_by_card(None)
    corner_candidate_indexes = candidate_indexes_for_key(corner_key)
    corner_by_card = candidate_indexes_by_card(corner_key)
    objective_terms = []

    for line in LINE_DEFINITIONS:
        is_corner = line["key"] == "corners"
        selected_candidates = corner_candidate_indexes if is_corner else normal_candidate_indexes
        by_card = corner_by_card if is_corner else normal_by_card
        z = {
            candidate_index: model.new_bool_var(f"z_{line['key']}_{candidate_index}")
            for candidate_index in selected_candidates
        }
        model.add_exactly_one(z.values())
        for card_index in range(len(DECK)):
            containing = [z[candidate_index] for candidate_index in by_card[card_index] if candidate_index in z]
            model.add(sum(x[slot_index][card_index] for slot_index in line["indices"]) == sum(containing))
        for candidate_index, z_var in z.items():
            _indexes, base, _key = candidates[candidate_index]
            objective_terms.append(z_var * base * line["bonus"])

    grid_base = sum(objective_terms)
    if args.mode == "grid-max":
        model.maximize(grid_base)
    else:
        model.add(grid_base >= args.threshold)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = args.time_limit
    solver.parameters.num_search_workers = args.workers
    solver.parameters.random_seed = args.seed
    solver.parameters.log_search_progress = args.log_search
    status = solver.solve(model)
    elapsed = time.time() - started
    status_name = solver.status_name(status)

    result = {
        "mode": args.mode,
        "encoding": "bool",
        "cornerKey": corner_key,
        "threshold": args.threshold,
        "status": status_name,
        "elapsedSeconds": elapsed,
        "wallTime": solver.wall_time,
    }

    if args.mode == "grid-max" and status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        result["objective"] = math.floor(solver.objective_value)
        result["bestBound"] = math.ceil(solver.best_objective_bound)

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        grid = []
        for slot_index in range(16):
            for card_index in range(len(DECK)):
                if solver.boolean_value(x[slot_index][card_index]):
                    grid.append(DECK[card_index])
                    break
        result["grid"] = grid
        result["gridScore"] = score_grid(grid)

    return result


def solve_grid_threshold(args: argparse.Namespace, corner_key: str | None = None) -> dict:
    if args.encoding == "bool":
        return solve_grid_threshold_bool(args, corner_key)

    started = time.time()
    model = cp_model.CpModel()
    slot_domain = cp_model.Domain.FromValues(range(len(DECK)))
    slots = [model.new_int_var_from_domain(slot_domain, f"slot_{index}") for index in range(16)]
    model.add_all_different(slots)

    # Suit relabeling is score-preserving, so any witness can be renamed until
    # the top-left card is hearts.
    hearts = [index for index, card in enumerate(DECK) if split_card(card)[1] == "H"]
    model.add_allowed_assignments([slots[0]], [[index] for index in hearts])

    normal_table = cached_ordered_positive_table(1)
    corner_table = cached_ordered_positive_table(2, corner_key)
    values = []
    for line in LINE_DEFINITIONS:
        value = model.new_int_var(0, 900, f"value_{line['key']}")
        table = corner_table if line["key"] == "corners" else normal_table
        model.add_allowed_assignments([*[slots[index] for index in line["indices"]], value], table)
        values.append(value)

    grid_base = sum(values)
    if args.mode == "grid-max":
        model.maximize(grid_base)
    else:
        model.add(grid_base >= args.threshold)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = args.time_limit
    solver.parameters.num_search_workers = args.workers
    solver.parameters.random_seed = args.seed
    solver.parameters.log_search_progress = args.log_search
    status = solver.solve(model)
    elapsed = time.time() - started
    status_name = solver.status_name(status)

    result = {
        "mode": args.mode,
        "encoding": "table",
        "cornerKey": corner_key,
        "threshold": args.threshold,
        "status": status_name,
        "elapsedSeconds": elapsed,
        "wallTime": solver.wall_time,
    }

    if args.mode == "grid-max" and status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        result["objective"] = math.floor(solver.objective_value)
        result["bestBound"] = math.ceil(solver.best_objective_bound)

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        grid = [DECK[solver.value(slot)] for slot in slots]
        result["grid"] = grid
        result["gridScore"] = score_grid(grid)

    return result


def summarize_proof(results: list[dict], threshold: int) -> dict:
    infeasible = all(result["status"] == "INFEASIBLE" for result in results)
    complete = all(result["status"] in ("INFEASIBLE", "OPTIMAL") for result in results)
    best_witness = max(
        (result for result in results if result.get("gridScore")),
        key=lambda result: result["gridScore"]["base"],
        default=None,
    )
    return {
        "threshold": threshold,
        "complete": complete,
        "provenNoGridAtThreshold": infeasible,
        "bestWitnessBase": best_witness["gridScore"]["base"] if best_witness else None,
        "bestWitnessCornerKey": best_witness["cornerKey"] if best_witness else None,
    }


def print_grid(grid: list[str]) -> None:
    for row in range(4):
        print(" ".join(card_label(card) for card in grid[row * 4 : row * 4 + 4]))


def print_result(result: dict) -> None:
    label = result["cornerKey"] or "any corner"
    print(f"{label}: {result['status']} in {result['elapsedSeconds']:.1f}s")
    if result.get("objective") is not None:
        print(f"  objective ${result['objective']:,} | bound ${result['bestBound']:,}")
    if result.get("gridScore"):
        print(f"  witness grid base ${result['gridScore']['base']:,}")
        print_grid(result["grid"])


def run(args: argparse.Namespace) -> dict:
    known = score_placement(BEST_KNOWN_GRID, BEST_KNOWN_DISCARD)
    lower_bucket_ceiling = max(theoretical_total_ceiling(hand_count) for hand_count in range(10))
    proof_setup = {
        "bestKnownTotal": known["total"],
        "bestKnownBase": known["base"],
        "bestKnownGridBase": known["gridBase"],
        "bestKnownDiscardBonus": known["discardBonus"],
        "lowerHandCountCeiling": lower_bucket_ceiling,
        "gridThresholdToBeat": args.threshold,
        "notes": [
            "If all grid-threshold cases are INFEASIBLE, $27,420 is globally optimal.",
            "9-or-fewer hands are bounded by the loose theoretical ceiling.",
        ],
    }

    if args.mode == "verify-known":
        return {"proofSetup": proof_setup, "knownScore": known}

    corner_keys = CORNER_KEYS if args.split_corners else [args.corner_key]
    results = [solve_grid_threshold(args, corner_key) for corner_key in corner_keys]
    return {
        "proofSetup": proof_setup,
        "summary": summarize_proof(results, args.threshold),
        "cases": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["verify-known", "grid-threshold", "grid-max"], default="grid-threshold")
    parser.add_argument("--threshold", type=int, default=3225)
    parser.add_argument("--corner-key", choices=CORNER_KEYS)
    parser.add_argument("--split-corners", action="store_true")
    parser.add_argument("--time-limit", type=float, default=60)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--seed", type=int, default=20260702)
    parser.add_argument("--encoding", choices=["bool", "table"], default="bool")
    parser.add_argument("--log-search", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    result = run(args)
    if args.json:
        print(json.dumps(result, indent=2, default=str))
        return

    setup = result["proofSetup"]
    print(f"Best known: ${setup['bestKnownTotal']:,}")
    print(f"9-or-fewer-hand ceiling: ${setup['lowerHandCountCeiling']:,}")
    print(f"Grid threshold needed to beat best known: ${setup['gridThresholdToBeat']:,}")
    if args.mode == "verify-known":
        print_grid(result["knownScore"]["grid"])
        print("Discard:", " ".join(card_label(card) for card in result["knownScore"]["discard"]))
        return

    for case in result["cases"]:
        print_result(case)
    summary = result["summary"]
    print(
        "Summary:",
        "proven" if summary["provenNoGridAtThreshold"] else "not proven",
        f"| complete={summary['complete']}",
    )


if __name__ == "__main__":
    main()
