#!/usr/bin/env python3
"""Bucketed exact Fantasyland solver using compact table constraints."""

from __future__ import annotations

import argparse
import itertools
import json
import math
import time
from dataclasses import dataclass

from ortools.sat.python import cp_model


RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"]
RANK_INDEX = {rank: index for index, rank in enumerate(RANKS)}
SUIT_LABEL = {"H": "♥", "S": "♠", "C": "♣", "D": "♦"}

SAMPLE_FANTASYLAND_DEAL = [
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
    {"key": "discard", "label": "Discard", "indices": [16, 17, 18, 19], "bonus": 3},
]


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


def split_card(card: str) -> tuple[str, str]:
    return card[:-1], card[-1]


def score_hand(cards: tuple[str, str, str, str] | list[str]) -> Hand:
    ranks = [split_card(card)[0] for card in cards]
    suits = [split_card(card)[1] for card in cards]
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
    if counts[0] == 2 and counts[1] == 2:
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


def card_label(card: str) -> str:
    rank, suit = split_card(card)
    return f"{rank}{SUIT_LABEL[suit]}"


def build_table(cards: list[str], bonus: int, include_zero: bool = True) -> list[list[int]]:
    rows = []
    for ordered_indexes in itertools.permutations(range(len(cards)), 4):
      hand = score_hand(tuple(cards[index] for index in ordered_indexes))
      if include_zero or hand.base > 0:
        rows.append(
            [
                *ordered_indexes,
                hand.base * bonus,
                1 if hand.base > 0 else 0,
                1 if hand.quality else 0,
            ]
        )
    return rows


def score_placement(cards: list[str], slots: list[int]) -> dict:
    grid = [cards[index] for index in slots[:16]]
    discard = [cards[index] for index in slots[16:]]
    lines = []
    for line in LINE_DEFINITIONS[:9]:
        line_cards = [cards[slots[index]] for index in line["indices"]]
        hand = score_hand(line_cards)
        lines.append(
            {
                "label": line["label"],
                "cards": line_cards,
                "hand": hand.label,
                "value": hand.base * line["bonus"],
                "scores": hand.base > 0,
                "quality": hand.quality,
            }
        )
    grid_hands = sum(1 for line in lines if line["scores"])
    discard_hand = score_hand(discard)
    discard_scores = grid_hands == 9 and discard_hand.base > 0
    base = sum(line["value"] for line in lines) + (discard_hand.base * 3 if discard_scores else 0)
    hand_count = grid_hands + (1 if discard_scores else 0)
    return {
        "total": base * multiplier(hand_count),
        "baseWinnings": base,
        "multiplier": multiplier(hand_count),
        "handCount": hand_count,
        "qualityHandCount": sum(1 for line in lines if line["scores"] and line["quality"])
        + (1 if discard_scores and discard_hand.quality else 0),
        "grid": grid,
        "discard": discard,
        "lines": lines,
        "discardLine": {
            "label": "Discard",
            "cards": discard,
            "hand": discard_hand.label,
            "value": discard_hand.base * 3 if discard_scores else 0,
            "scores": discard_scores,
            "quality": discard_hand.quality,
        },
    }


def scenario_name(grid_hand_count: int, discard_positive: bool) -> str:
    if grid_hand_count == 9 and discard_positive:
        return "10 hands"
    return f"{grid_hand_count} grid hands"


def solve_scenario(
    cards: list[str],
    grid_hand_count: int,
    discard_positive: bool,
    time_limit: float,
    workers: int,
    min_total: int | None = None,
) -> dict:
    started = time.time()
    model = cp_model.CpModel()
    slots = [model.new_int_var(0, 19, f"slot_{index}") for index in range(20)]
    model.add_all_different(slots)

    values = []
    positives = []
    qualities = []
    for line_index, line in enumerate(LINE_DEFINITIONS):
        value = model.new_int_var(0, 1350, f"value_{line_index}")
        positive = model.new_bool_var(f"positive_{line_index}")
        quality = model.new_bool_var(f"quality_{line_index}")
        table = build_table(cards, line["bonus"])
        model.add_allowed_assignments(
            [*[slots[index] for index in line["indices"]], value, positive, quality],
            table,
        )
        values.append(value)
        positives.append(positive)
        qualities.append(quality)

    model.add(sum(positives[:9]) == grid_hand_count)
    if grid_hand_count == 9:
        model.add(positives[9] == (1 if discard_positive else 0))
    else:
        model.add(positives[9] == 0)

    score_multiplier = multiplier(10 if grid_hand_count == 9 and discard_positive else grid_hand_count)
    active_values = values[:9] + ([values[9]] if grid_hand_count == 9 and discard_positive else [])
    objective = sum(active_values) * score_multiplier
    if min_total is None:
        model.maximize(objective)
    else:
        model.add(objective >= min_total)

    # Break easy board symmetries without changing the optimum.
    model.add(slots[0] < slots[3])
    model.add(slots[0] < slots[12])

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_search_workers = workers
    solver.parameters.random_seed = 20260701
    solver.parameters.log_search_progress = False
    status = solver.solve(model)
    status_name = solver.status_name(status)

    result = {
        "scenario": {"gridHandCount": grid_hand_count, "discardPositive": discard_positive},
        "label": scenario_name(grid_hand_count, discard_positive),
        "status": status_name,
        "objective": math.floor(solver.objective_value) if min_total is None and status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
        "bestBound": math.ceil(solver.best_objective_bound) if min_total is None and status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
        "minTotal": min_total,
        "elapsedSeconds": time.time() - started,
    }
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        placement = [solver.value(slot) for slot in slots]
        result["score"] = score_placement(cards, placement)
        result["grid"] = result["score"]["grid"]
        result["discard"] = result["score"]["discard"]
    return result


def solve(cards: list[str], time_limit: float, workers: int, buckets: list[int], min_total: int | None = None) -> dict:
    scenarios = []
    for bucket in buckets:
        if bucket == 10:
            scenarios.append((9, True))
        elif bucket == 9:
            scenarios.append((9, False))
        else:
            scenarios.append((bucket, False))

    results = [
        solve_scenario(cards, grid_count, discard_positive, time_limit, workers, min_total)
        for grid_count, discard_positive in scenarios
    ]
    feasible = [result for result in results if result.get("score")]
    best = max(feasible, key=lambda result: result["score"]["total"], default=None)
    proven = all(result["status"] in ("OPTIMAL", "INFEASIBLE") for result in results)
    bound = max((result["bestBound"] for result in results if result["bestBound"] is not None), default=None)
    if min_total is not None:
        any_better = any(result["status"] in ("OPTIMAL", "FEASIBLE") for result in results)
        proven_none = all(result["status"] == "INFEASIBLE" for result in results)
        return {
            "best": best,
            "minTotal": min_total,
            "anyMeetsThreshold": any_better,
            "provenNoThresholdSolution": proven_none,
            "buckets": results,
        }
    return {"best": best, "proven": proven, "globalBound": bound, "buckets": results}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("cards", nargs="*")
    parser.add_argument("--sample", action="store_true")
    parser.add_argument("--time-limit", type=float, default=30)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--buckets", default="10,9,8,7,6,5,4,3,2,1,0")
    parser.add_argument("--min-total", type=int, help="Feasibility mode: search for any solution with total >= this score.")
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()

    cards = SAMPLE_FANTASYLAND_DEAL if args.sample else args.cards
    if len(cards) != 20:
        raise SystemExit("Provide exactly 20 cards or --sample.")

    buckets = [int(part) for part in args.buckets.split(",") if part.strip()]
    result = solve(cards, args.time_limit, args.workers, buckets, args.min_total)
    if args.pretty and result["best"]:
        best = result["best"]
        print(f"Best: ${best['score']['total']:,} ({best['label']}, {best['status']})")
        print(f"Bound: ${result['globalBound']:,} | proven={result['proven']}")
        for row in range(4):
            print(" ".join(f"{card_label(card):>4}" for card in best["grid"][row * 4 : row * 4 + 4]))
        print("Discard:", " ".join(card_label(card) for card in best["discard"]))
        print(json.dumps([{k: bucket[k] for k in ("label", "status", "objective", "bestBound", "elapsedSeconds")} for bucket in result["buckets"]], indent=2))
    elif args.pretty and args.min_total is not None:
        print(f"Threshold: ${args.min_total:,}")
        print(f"Any solution meeting threshold: {result['anyMeetsThreshold']}")
        print(f"Proven none: {result['provenNoThresholdSolution']}")
        print(
            json.dumps(
                [
                    {k: bucket[k] for k in ("label", "status", "minTotal", "elapsedSeconds")}
                    for bucket in result["buckets"]
                ],
                indent=2,
            )
        )
    else:
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
