#!/usr/bin/env python3
"""Exact Fantasyland solver for a 20-card Pile-Up Poker deal."""

from __future__ import annotations

import argparse
import itertools
import json
import math
import time
from dataclasses import dataclass

from ortools.sat.python import cp_model


RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"]
SUITS = ["H", "S", "C", "D"]
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
]
DISCARD_SLOTS = [16, 17, 18, 19]
ALL_LINES = LINE_DEFINITIONS + [
    {"key": "discard", "label": "Discard", "indices": DISCARD_SLOTS, "bonus": 3}
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


def card_label(card: str) -> str:
    rank, suit = split_card(card)
    return f"{rank}{SUIT_LABEL[suit]}"


def score_hand(cards: list[str] | tuple[str, ...]) -> Hand:
    ranks = [split_card(card)[0] for card in cards]
    suits = [split_card(card)[1] for card in cards]
    rank_counts = sorted([ranks.count(rank) for rank in set(ranks)], reverse=True)
    rank_indexes = sorted(RANK_INDEX[rank] for rank in set(ranks))
    is_flush = len(set(suits)) == 1
    is_straight = (
        len(rank_indexes) == 4
        and rank_indexes[-1] - rank_indexes[0] == 3
        and all(rank_indexes[index] == rank_indexes[0] + index for index in range(4))
    )

    if is_straight and is_flush:
        return HANDS["straight-flush"]
    if rank_counts[0] == 4:
        return HANDS["four-kind"]
    if is_straight:
        return HANDS["straight"]
    if rank_counts[0] == 3:
        return HANDS["three-kind"]
    if is_flush:
        return HANDS["flush"]
    if rank_counts[0] == 2 and rank_counts[1] == 2:
        return HANDS["two-pair"]
    if rank_counts[0] == 2:
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


def score_placement(grid: list[str], discard: list[str]) -> dict:
    lines = []
    for line in LINE_DEFINITIONS:
        cards = [grid[index] for index in line["indices"]]
        hand = score_hand(cards)
        lines.append(
            {
                **line,
                "cards": cards,
                "hand": hand,
                "scores": hand.base > 0,
                "value": hand.base * line["bonus"],
            }
        )

    grid_hand_count = sum(1 for line in lines if line["scores"])
    grid_base = sum(line["value"] for line in lines)
    discard_hand = score_hand(discard)
    discard_scores = grid_hand_count == 9 and discard_hand.base > 0
    discard_value = discard_hand.base * 3 if discard_scores else 0
    hand_count = grid_hand_count + (1 if discard_scores else 0)
    score_multiplier = multiplier(hand_count)
    base_winnings = grid_base + discard_value

    return {
        "total": base_winnings * score_multiplier,
        "baseWinnings": base_winnings,
        "multiplier": score_multiplier,
        "handCount": hand_count,
        "qualityHandCount": sum(1 for line in lines if line["scores"] and line["hand"].quality)
        + (1 if discard_scores and discard_hand.quality else 0),
        "lines": [
            {
                "label": line["label"],
                "cards": line["cards"],
                "hand": line["hand"].label,
                "value": line["value"],
            }
            for line in lines
        ],
        "discard": {
            "cards": discard,
            "hand": discard_hand.label,
            "scores": discard_scores,
            "value": discard_value,
        },
    }


def build_candidates(cards: list[str]) -> list[dict]:
    candidates = []
    for indexes in itertools.combinations(range(len(cards)), 4):
        hand = score_hand([cards[index] for index in indexes])
        if hand.base > 0:
            candidates.append(
                {
                    "indexes": indexes,
                    "cards": [cards[index] for index in indexes],
                    "hand": hand,
                }
            )
    return candidates


def build_scenarios() -> list[dict]:
    scenarios = [{"grid_hand_count": count, "discard_positive": False} for count in range(9)]
    scenarios.append({"grid_hand_count": 9, "discard_positive": False})
    scenarios.append({"grid_hand_count": 9, "discard_positive": True})
    return scenarios


def solve_scenario(cards: list[str], scenario: dict, time_limit: float, workers: int) -> dict:
    started = time.time()
    model = cp_model.CpModel()
    candidates = build_candidates(cards)

    x = [
        [model.new_bool_var(f"x_{card_index}_{slot_index}") for slot_index in range(20)]
        for card_index in range(20)
    ]

    for card_index in range(20):
        model.add_exactly_one(x[card_index][slot_index] for slot_index in range(20))
    for slot_index in range(20):
        model.add_exactly_one(x[card_index][slot_index] for card_index in range(20))

    line_card = []
    for line_index, line in enumerate(ALL_LINES):
        line_card.append([])
        for card_index in range(20):
            var = model.new_bool_var(f"line_{line_index}_card_{card_index}")
            model.add(sum(x[card_index][slot_index] for slot_index in line["indices"]) == var)
            line_card[line_index].append(var)

    z = []
    for line_index, _line in enumerate(ALL_LINES):
        z.append([])
        for candidate_index, candidate in enumerate(candidates):
            var = model.new_bool_var(f"z_{line_index}_{candidate_index}")
            candidate_line_cards = [line_card[line_index][card_index] for card_index in candidate["indexes"]]
            model.add_bool_and(candidate_line_cards).only_enforce_if(var)
            model.add_bool_or([card.Not() for card in candidate_line_cards] + [var])
            z[line_index].append(var)
        model.add(sum(z[line_index]) <= 1)

    grid_positive = sum(z[line_index][candidate_index] for line_index in range(9) for candidate_index in range(len(candidates)))
    model.add(grid_positive == scenario["grid_hand_count"])

    if scenario["grid_hand_count"] == 9:
        model.add(sum(z[9]) == (1 if scenario["discard_positive"] else 0))

    score_multiplier = (
        multiplier(10)
        if scenario["grid_hand_count"] == 9 and scenario["discard_positive"]
        else multiplier(scenario["grid_hand_count"])
    )

    objective_terms = []
    for line_index, line in enumerate(ALL_LINES):
        if line_index == 9 and not (scenario["grid_hand_count"] == 9 and scenario["discard_positive"]):
            continue
        for candidate_index, candidate in enumerate(candidates):
            objective_terms.append(
                z[line_index][candidate_index] * candidate["hand"].base * line["bonus"] * score_multiplier
            )

    model.maximize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_search_workers = workers
    solver.parameters.random_seed = 20260701
    solver.parameters.log_search_progress = False
    status = solver.solve(model)
    status_name = solver.status_name(status)

    result = {
        "scenario": scenario,
        "status": status_name,
        "objective": math.floor(solver.objective_value) if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
        "bestBound": math.ceil(solver.best_objective_bound) if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
        "elapsedSeconds": time.time() - started,
    }

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        slots = [None] * 20
        for card_index, card in enumerate(cards):
            for slot_index in range(20):
                if solver.boolean_value(x[card_index][slot_index]):
                    slots[slot_index] = card
        grid = slots[:16]
        discard = slots[16:]
        result["grid"] = grid
        result["discard"] = discard
        result["score"] = score_placement(grid, discard)

    return result


def solve(cards: list[str], time_limit: float, workers: int, only_ten_hands: bool) -> dict:
    scenarios = [{"grid_hand_count": 9, "discard_positive": True}] if only_ten_hands else build_scenarios()
    results = [solve_scenario(cards, scenario, time_limit, workers) for scenario in scenarios]
    feasible_results = [result for result in results if result.get("score")]
    best = max(feasible_results, key=lambda result: result["score"]["total"], default=None)
    global_bound = max(
        (result["bestBound"] for result in results if result["bestBound"] is not None),
        default=None,
    )
    proven = all(result["status"] in ("OPTIMAL", "INFEASIBLE") for result in results)
    return {"best": best, "globalBound": global_bound, "proven": proven, "scenarios": results}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("cards", nargs="*", help="20 card ids, e.g. 9S QC JH ...")
    parser.add_argument("--sample", action="store_true", help="Use the screenshot sample deal")
    parser.add_argument("--time-limit", type=float, default=30.0, help="Seconds per scenario")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--ten-hands-only", action="store_true")
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()

    cards = SAMPLE_FANTASYLAND_DEAL if args.sample else args.cards
    if len(cards) != 20:
        raise SystemExit("Provide exactly 20 cards or use --sample.")

    result = solve(cards, args.time_limit, args.workers, args.ten_hands_only)
    if args.pretty and result["best"]:
        best = result["best"]
        print(f"Best: ${best['score']['total']:,}")
        print(
            f"Status: {best['status']} | bound ${result['globalBound']:,} | proven={result['proven']}"
        )
        for row in range(4):
            print(" ".join(f"{card_label(card):>4}" for card in best["grid"][row * 4 : row * 4 + 4]))
        print("Discard:", " ".join(card_label(card) for card in best["discard"]))
        print(json.dumps([{k: r[k] for k in ('scenario', 'status', 'objective', 'bestBound', 'elapsedSeconds')} for r in result["scenarios"]], indent=2))
    else:
        print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
