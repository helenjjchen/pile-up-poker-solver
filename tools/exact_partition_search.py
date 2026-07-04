#!/usr/bin/env python3
"""Puzzle-specific Fantasyland search by hand-count bucket.

This is currently exact for the searched discard candidates and row/column
partitions it visits. It is designed as the next step toward a certifying
solver because it uses the actual board geometry instead of a generic slot MIP.
"""

from __future__ import annotations

import argparse
import itertools
import json
import time
from functools import lru_cache

from exact_fantasyland import SAMPLE_FANTASYLAND_DEAL, card_label, multiplier, score_hand, score_placement


def popcount(value: int) -> int:
    return value.bit_count()


def mask_from_indexes(indexes: tuple[int, ...]) -> int:
    mask = 0
    for index in indexes:
        mask |= 1 << index
    return mask


def indexes_from_mask(mask: int) -> tuple[int, ...]:
    return tuple(index for index in range(20) if mask & (1 << index))


def build_hand_maps(cards: list[str]) -> tuple[dict[int, object], dict[int, int], list[int]]:
    hands = {}
    values = {}
    positives = []
    for indexes in itertools.combinations(range(len(cards)), 4):
        mask = mask_from_indexes(indexes)
        hand = score_hand([cards[index] for index in indexes])
        hands[mask] = hand
        values[mask] = hand.base
        if hand.base > 0:
            positives.append(mask)
    positives.sort(key=lambda mask: (-values[mask], mask))
    return hands, values, positives


def partition_positive_masks(board_mask: int, positive_masks: list[int], values: dict[int, int]):
    eligible = [mask for mask in positive_masks if mask & ~board_mask == 0]
    eligible_set = set(eligible)
    eligible.sort()
    for first_index, first in enumerate(eligible):
        rem1 = board_mask ^ first
        if popcount(rem1) != 12:
            continue
        for second in eligible[first_index + 1 :]:
            if second & ~rem1:
                continue
            rem2 = rem1 ^ second
            if popcount(rem2) != 8:
                continue
            for third in eligible:
                if third <= second:
                    continue
                if third & ~rem2:
                    continue
                fourth = rem2 ^ third
                if fourth > third and fourth in eligible_set:
                    partition = (first, second, third, fourth)
                    yield partition, sum(values[mask] for mask in partition)


def crossing_masks_for_rows(row_partition: tuple[int, int, int, int], positive_masks: list[int], board_mask: int):
    rows = row_partition
    result = []
    for mask in positive_masks:
        if mask & ~board_mask:
            continue
        if all(popcount(mask & row) == 1 for row in rows):
            result.append(mask)
    return result


def column_partitions_for_rows(row_partition: tuple[int, int, int, int], positive_masks: list[int], board_mask: int):
    crossing = crossing_masks_for_rows(row_partition, positive_masks, board_mask)
    crossing_set = set(crossing)
    crossing.sort()
    for first_index, first in enumerate(crossing):
        rem1 = board_mask ^ first
        for second in crossing[first_index + 1 :]:
            if second & ~rem1:
                continue
            rem2 = rem1 ^ second
            for third in crossing:
                if third <= second:
                    continue
                if third & ~rem2:
                    continue
                fourth = rem2 ^ third
                if fourth > third and fourth in crossing_set:
                    yield (first, second, third, fourth)


@lru_cache(maxsize=None)
def corner_mask_for(row_a: int, row_b: int, col_a: int, col_b: int) -> int:
    return (row_a & col_a) | (row_a & col_b) | (row_b & col_a) | (row_b & col_b)


def best_corner(rows: tuple[int, int, int, int], cols: tuple[int, int, int, int], values: dict[int, int]):
    best = (0, None, None, None)
    for row_pair in itertools.combinations(range(4), 2):
        for col_pair in itertools.combinations(range(4), 2):
            mask = corner_mask_for(rows[row_pair[0]], rows[row_pair[1]], cols[col_pair[0]], cols[col_pair[1]])
            value = values.get(mask, 0)
            if value > best[0]:
                best = (value, mask, row_pair, col_pair)
    return best


def materialize_grid(cards: list[str], rows: tuple[int, int, int, int], cols: tuple[int, int, int, int], corner_choice):
    _corner_value, _corner_mask, row_pair, col_pair = corner_choice
    row_order = [row_pair[0], *[index for index in range(4) if index not in row_pair], row_pair[1]]
    col_order = [col_pair[0], *[index for index in range(4) if index not in col_pair], col_pair[1]]
    ordered_rows = [rows[index] for index in row_order]
    ordered_cols = [cols[index] for index in col_order]
    grid = []
    for row in ordered_rows:
        for col in ordered_cols:
            cell = row & col
            grid.append(cards[indexes_from_mask(cell)[0]])
    return grid


def search_10_hands(cards: list[str], seconds: float, discard_limit: int | None = None):
    started = time.time()
    all_mask = (1 << len(cards)) - 1
    _hands, values, positives = build_hand_maps(cards)
    discards = [mask for mask in positives]
    discards.sort(key=lambda mask: (-values[mask], mask))
    if discard_limit is not None:
        discards = discards[:discard_limit]

    best = None
    checked_discards = 0
    checked_row_partitions = 0
    checked_column_partitions = 0

    for discard in discards:
        if time.time() - started > seconds:
            break
        checked_discards += 1
        board_mask = all_mask ^ discard
        discard_bonus = values[discard] * 3

        for rows, row_value in partition_positive_masks(board_mask, positives, values):
            checked_row_partitions += 1
            if time.time() - started > seconds:
                break
            # Cheap ceiling for this row partition.
            if best and (row_value + 8 * 450 + 900 + discard_bonus) * 6 <= best["score"]["total"]:
                continue
            for cols in column_partitions_for_rows(rows, positives, board_mask):
                checked_column_partitions += 1
                col_value = sum(values[mask] for mask in cols)
                corner = best_corner(rows, cols, values)
                if corner[0] == 0:
                    continue
                base = row_value + col_value + corner[0] * 2 + discard_bonus
                total = base * 6
                if best and total <= best["score"]["total"]:
                    continue
                grid = materialize_grid(cards, rows, cols, corner)
                discard_cards = [cards[index] for index in indexes_from_mask(discard)]
                score = score_placement(grid, discard_cards)
                if score["total"] != total:
                    raise RuntimeError(f"score mismatch: expected {total}, got {score['total']}")
                best = {
                    "grid": grid,
                    "discard": discard_cards,
                    "score": score,
                    "discardMask": discard,
                    "rowMasks": rows,
                    "columnMasks": cols,
                    "cornerMask": corner[1],
                }

    return {
        "best": best,
        "elapsedSeconds": time.time() - started,
        "checkedDiscards": checked_discards,
        "checkedRowPartitions": checked_row_partitions,
        "checkedColumnPartitions": checked_column_partitions,
        "exhausted": checked_discards == len(discards),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("cards", nargs="*")
    parser.add_argument("--sample", action="store_true")
    parser.add_argument("--seconds", type=float, default=30)
    parser.add_argument("--discard-limit", type=int)
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()

    cards = SAMPLE_FANTASYLAND_DEAL if args.sample else args.cards
    if len(cards) != 20:
        raise SystemExit("Provide exactly 20 cards or --sample.")

    result = search_10_hands(cards, args.seconds, args.discard_limit)
    if args.pretty and result["best"]:
        best = result["best"]
        print(f"Best 10-hand found: ${best['score']['total']:,}")
        for row in range(4):
            print(" ".join(f"{card_label(card):>4}" for card in best["grid"][row * 4 : row * 4 + 4]))
        print("Discard:", " ".join(card_label(card) for card in best["discard"]))
        print(json.dumps({key: value for key, value in result.items() if key != "best"}, indent=2))
    else:
        print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
