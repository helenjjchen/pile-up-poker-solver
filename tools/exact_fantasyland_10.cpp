#include <algorithm>
#include <array>
#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <optional>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

using Mask = uint32_t;

struct Hand {
  int value;
  bool quality;
  std::string key;
};

struct Candidate {
  Mask mask;
  int value;
};

struct Best {
  int total = 0;
  int base = 0;
  int handCount = 0;
  int gridHandCount = 0;
  bool hasPlacement = false;
  Mask discard = 0;
  std::array<Mask, 4> rows{};
  std::array<Mask, 4> cols{};
  Mask corner = 0;
  std::array<int, 2> cornerRows{};
  std::array<int, 2> cornerCols{};
};

struct ScoreParts {
  int total = 0;
  int base = 0;
  int handCount = 0;
};

int multiplier_for_hand_count(int handCount) {
  if (handCount >= 10) return 6;
  if (handCount >= 8) return 5;
  if (handCount >= 6) return 4;
  if (handCount >= 4) return 3;
  if (handCount >= 2) return 2;
  return 1;
}

ScoreParts score_from_parts(int gridBase, int gridHandCount, int discardBonus) {
  bool discardScores = gridHandCount == 9 && discardBonus > 0;
  int handCount = gridHandCount + (discardScores ? 1 : 0);
  int base = gridBase + (discardScores ? discardBonus : 0);
  return {base * multiplier_for_hand_count(handCount), base, handCount};
}

static const std::vector<std::string> SAMPLE = {
    "9S", "QC", "JH", "10S", "JC", "AD", "KD", "QD", "QH", "6H",
    "KH", "9H", "QS", "AS",  "KS", "JS", "7H", "7S", "7C", "6C"};

int rank_index(const std::string& card) {
  std::string rank = card.substr(0, card.size() - 1);
  if (rank == "6") return 0;
  if (rank == "7") return 1;
  if (rank == "8") return 2;
  if (rank == "9") return 3;
  if (rank == "10") return 4;
  if (rank == "J") return 5;
  if (rank == "Q") return 6;
  if (rank == "K") return 7;
  if (rank == "A") return 8;
  return -100;
}

char suit_of(const std::string& card) { return card.back(); }

int popcount(Mask mask) { return __builtin_popcount(mask); }

int lowest_bit_index(Mask mask) { return __builtin_ctz(mask); }

std::vector<int> indexes_from_mask(Mask mask) {
  std::vector<int> out;
  for (int i = 0; i < 20; ++i) {
    if (mask & (Mask(1) << i)) out.push_back(i);
  }
  return out;
}

Hand score_hand(const std::vector<std::string>& cards, Mask mask) {
  std::array<int, 9> ranks{};
  std::array<int, 256> suits{};
  int uniqueRanks = 0;
  int firstRank = 99;
  int lastRank = -1;
  char firstSuit = 0;
  bool flush = true;

  for (int idx : indexes_from_mask(mask)) {
    int rank = rank_index(cards[idx]);
    if (ranks[rank] == 0) uniqueRanks++;
    ranks[rank]++;
    firstRank = std::min(firstRank, rank);
    lastRank = std::max(lastRank, rank);
    char suit = suit_of(cards[idx]);
    if (!firstSuit) firstSuit = suit;
    if (suit != firstSuit) flush = false;
    suits[static_cast<unsigned char>(suit)]++;
  }

  std::vector<int> counts;
  for (int count : ranks) {
    if (count) counts.push_back(count);
  }
  std::sort(counts.begin(), counts.end(), std::greater<int>());
  bool straight = uniqueRanks == 4 && lastRank - firstRank == 3;

  if (straight && flush) return {450, true, "straight-flush"};
  if (counts[0] == 4) return {325, true, "four-kind"};
  if (straight) return {180, true, "straight"};
  if (counts[0] == 3) return {125, true, "three-kind"};
  if (flush) return {80, false, "flush"};
  if (counts[0] == 2 && counts.size() > 1 && counts[1] == 2) return {60, false, "two-pair"};
  if (counts[0] == 2) return {5, false, "pair"};
  return {0, false, "no-hand"};
}

std::string join_cards(const std::vector<std::string>& cards, Mask mask) {
  std::ostringstream out;
  bool first = true;
  for (int idx : indexes_from_mask(mask)) {
    if (!first) out << " ";
    first = false;
    out << cards[idx];
  }
  return out.str();
}

std::string json_card_array(const std::vector<std::string>& values) {
  std::ostringstream out;
  out << "[";
  for (size_t index = 0; index < values.size(); ++index) {
    if (index) out << ", ";
    out << "\"" << values[index] << "\"";
  }
  out << "]";
  return out.str();
}

struct Solver {
  std::vector<std::string> cards;
  std::array<int, 1 << 20> value{};
  std::vector<Candidate> positives;
  std::vector<Candidate> allDiscards;
  Best best;
  uint64_t rowPartitions = 0;
  uint64_t columnPartitions = 0;
  uint64_t discardsChecked = 0;
  uint64_t fullyCheckedDiscards = 0;
  uint64_t rowPartitionsSkipped = 0;
  uint64_t rowPartitionsCompleted = 0;
  uint64_t currentDiscardRowsCompleted = 0;
  uint64_t openDiscardRowsCompleted = 0;
  std::chrono::steady_clock::time_point started;
  double secondsLimit = 0;
  bool timedOut = false;
  bool rowLimitHit = false;
  int maxDiscards = 0;
  int skipDiscards = 0;
  uint64_t skipRows = 0;
  uint64_t skipRowsRemaining = 0;
  uint64_t maxRows = 0;
  bool highBuckets = false;
  bool threePlusLow = false;
  bool lowTwo = false;
  int minGridHandCount = 0;
  int maxGridHandCount = 9;
  int maxColumnHandCount = 4;

  bool over_time() {
    if (secondsLimit <= 0) return false;
    auto elapsed = std::chrono::duration<double>(std::chrono::steady_clock::now() - started).count();
    if (elapsed > secondsLimit) {
      timedOut = true;
      return true;
    }
    return false;
  }

  std::array<Mask, 4> rowMasks{};
  std::array<Mask, 4> colMasks{};

  std::vector<Mask> row_candidates(Mask remaining) {
    int low = lowest_bit_index(remaining);
    Mask lowBit = Mask(1) << low;
    std::vector<Mask> result;
    for (const auto& candidate : positives) {
      if ((candidate.mask & lowBit) && (candidate.mask & ~remaining) == 0) {
        result.push_back(candidate.mask);
      }
    }
    std::sort(result.begin(), result.end(), [&](Mask a, Mask b) {
      if (value[a] != value[b]) return value[a] > value[b];
      return a < b;
    });
    return result;
  }

  std::array<Mask, 4> rowBits(Mask row) {
    std::array<Mask, 4> bits{};
    int pos = 0;
    for (int idx : indexes_from_mask(row)) bits[pos++] = Mask(1) << idx;
    return bits;
  }

  int best_corner_value_for_cells(const std::array<std::array<Mask, 4>, 4>& cells, std::array<int, 2>& outRows,
                                  std::array<int, 2>& outCols, Mask& outCorner) {
    int bestCorner = 0;
    for (int r1 = 0; r1 < 3; ++r1) {
      for (int r2 = r1 + 1; r2 < 4; ++r2) {
        for (int c1 = 0; c1 < 3; ++c1) {
          for (int c2 = c1 + 1; c2 < 4; ++c2) {
            Mask corner = cells[r1][c1] | cells[r1][c2] | cells[r2][c1] | cells[r2][c2];
            int cornerValue = value[corner];
            if (cornerValue > bestCorner) {
              bestCorner = cornerValue;
              outRows = {r1, r2};
              outCols = {c1, c2};
              outCorner = corner;
            }
          }
        }
      }
    }
    return bestCorner;
  }

  std::optional<int> best_corner_for_cells(const std::array<std::array<Mask, 4>, 4>& cells, bool allowScoringCorner,
                                           std::array<int, 2>& outRows, std::array<int, 2>& outCols,
                                           Mask& outCorner) {
    int bestCorner = 0;
    bool found = false;
    for (int r1 = 0; r1 < 3; ++r1) {
      for (int r2 = r1 + 1; r2 < 4; ++r2) {
        for (int c1 = 0; c1 < 3; ++c1) {
          for (int c2 = c1 + 1; c2 < 4; ++c2) {
            Mask corner = cells[r1][c1] | cells[r1][c2] | cells[r2][c1] | cells[r2][c2];
            int cornerValue = value[corner];
            if (!allowScoringCorner && cornerValue == 0) {
              outRows = {r1, r2};
              outCols = {c1, c2};
              outCorner = corner;
              return 0;
            }
            if (allowScoringCorner && (!found || cornerValue > bestCorner)) {
              found = true;
              bestCorner = cornerValue;
              outRows = {r1, r2};
              outCols = {c1, c2};
              outCorner = corner;
            }
          }
        }
      }
    }
    if (!allowScoringCorner) return std::nullopt;
    return bestCorner;
  }

  int corner_upper_bound_for_rows() {
    int bestCorner = 0;
    std::array<std::vector<Mask>, 4> rowPairs;
    for (int row = 0; row < 4; ++row) {
      auto bits = rowBits(rowMasks[row]);
      for (int a = 0; a < 3; ++a) {
        for (int b = a + 1; b < 4; ++b) {
          rowPairs[row].push_back(bits[a] | bits[b]);
        }
      }
    }

    for (int r1 = 0; r1 < 3; ++r1) {
      for (int r2 = r1 + 1; r2 < 4; ++r2) {
        for (Mask firstPair : rowPairs[r1]) {
          for (Mask secondPair : rowPairs[r2]) {
            bestCorner = std::max(bestCorner, value[firstPair | secondPair]);
          }
        }
      }
    }
    return bestCorner;
  }

  void evaluate_columns_by_permutation(int rowValue, int discardBonus, Mask discard) {
    static const std::array<std::array<int, 4>, 24> perms = [] {
      std::array<std::array<int, 4>, 24> out{};
      std::array<int, 4> p = {0, 1, 2, 3};
      int index = 0;
      do {
        out[index++] = p;
      } while (std::next_permutation(p.begin(), p.end()));
      return out;
    }();

    std::array<std::array<Mask, 4>, 4> rowCellBits{};
    for (int row = 0; row < 4; ++row) rowCellBits[row] = rowBits(rowMasks[row]);

    int cornerUpper = corner_upper_bound_for_rows();
    if (!highBuckets && cornerUpper == 0) return;

    // Upper bound for columns on this row partition: choose the best legal column for each row-0 card
    // without enforcing that rows 1-3 are used exactly once. This is deliberately loose but cheap.
    int optimisticColumns = 0;
    for (int c0 = 0; c0 < 4; ++c0) {
      int bestForColumn = 0;
      for (int c1 = 0; c1 < 4; ++c1)
        for (int c2 = 0; c2 < 4; ++c2)
          for (int c3 = 0; c3 < 4; ++c3) {
            Mask col = rowCellBits[0][c0] | rowCellBits[1][c1] | rowCellBits[2][c2] | rowCellBits[3][c3];
            bestForColumn = std::max(bestForColumn, value[col]);
          }
      if (!highBuckets && bestForColumn == 0) return;
      optimisticColumns += bestForColumn;
    }
    int optimisticGridBase = rowValue + optimisticColumns + cornerUpper * 2;
    int optimisticTotal = highBuckets ? optimisticGridBase * 5 : (optimisticGridBase + discardBonus) * 6;
    if (highBuckets && discardBonus > 0) {
      optimisticTotal = std::max(optimisticTotal, (optimisticGridBase + discardBonus) * 6);
    }
    if (optimisticTotal <= best.total) return;

    for (const auto& p1 : perms) {
      if (over_time()) return;
      for (const auto& p2 : perms) {
        for (const auto& p3 : perms) {
          std::array<std::array<Mask, 4>, 4> cells{};
          cells[0] = rowCellBits[0];
          for (int col = 0; col < 4; ++col) {
            cells[1][col] = rowCellBits[1][p1[col]];
            cells[2][col] = rowCellBits[2][p2[col]];
            cells[3][col] = rowCellBits[3][p3[col]];
          }

          int colValue = 0;
          int columnHandCount = 0;
          for (int col = 0; col < 4; ++col) {
            Mask colMask = cells[0][col] | cells[1][col] | cells[2][col] | cells[3][col];
            colMasks[col] = colMask;
            int colScore = value[colMask];
            if (!highBuckets && colScore == 0) break;
            if (colScore > 0) columnHandCount++;
            colValue += colScore;
          }
          if (!highBuckets && columnHandCount < 4) continue;
          if (highBuckets && columnHandCount < 3) continue;
          if (highBuckets && columnHandCount == 3 && cornerUpper == 0) continue;
          columnPartitions++;
          if (highBuckets) {
            int optimisticGridBase = rowValue + colValue + cornerUpper * 2;
            int optimisticGridHandCount = 4 + columnHandCount + (cornerUpper > 0 ? 1 : 0);
            int optimisticTotal = optimisticGridHandCount >= 8 ? optimisticGridBase * 5 : 0;
            if (optimisticGridHandCount == 9 && discardBonus > 0) {
              optimisticTotal = std::max(optimisticTotal, (optimisticGridBase + discardBonus) * 6);
            }
            if (optimisticTotal <= best.total) continue;
          } else if ((rowValue + colValue + cornerUpper * 2 + discardBonus) * 6 <= best.total) {
            continue;
          }

          std::array<int, 2> cornerRows{};
          std::array<int, 2> cornerCols{};
          Mask corner = 0;
          int cornerValue = best_corner_value_for_cells(cells, cornerRows, cornerCols, corner);
          if (!highBuckets && cornerValue == 0) continue;

          int gridHandCount = 4 + columnHandCount + (cornerValue > 0 ? 1 : 0);
          if (highBuckets && gridHandCount < 8) continue;

          int gridBase = rowValue + colValue + cornerValue * 2;
          int handCount = gridHandCount;
          int base = gridBase;
          int total = base * 5;
          if (!highBuckets || (gridHandCount == 9 && discardBonus > 0)) {
            handCount = gridHandCount + 1;
            base = gridBase + discardBonus;
            total = base * 6;
          }
          if (total > best.total) {
            best.total = total;
            best.base = base;
            best.handCount = handCount;
            best.gridHandCount = gridHandCount;
            best.hasPlacement = true;
            best.discard = discard;
            best.rows = rowMasks;
            best.cols = colMasks;
            best.corner = corner;
            best.cornerRows = cornerRows;
            best.cornerCols = cornerCols;
          }
        }
      }
    }
  }

  void evaluate_columns_generic(int rowValue, int rowHandCount, int discardBonus, Mask discard) {
    static const std::array<std::array<int, 4>, 24> perms = [] {
      std::array<std::array<int, 4>, 24> out{};
      std::array<int, 4> p = {0, 1, 2, 3};
      int index = 0;
      do {
        out[index++] = p;
      } while (std::next_permutation(p.begin(), p.end()));
      return out;
    }();

    std::array<std::array<Mask, 4>, 4> rowCellBits{};
    for (int row = 0; row < 4; ++row) rowCellBits[row] = rowBits(rowMasks[row]);

    int cornerUpper = corner_upper_bound_for_rows();
    int optimisticColumns = 0;
    for (int c0 = 0; c0 < 4; ++c0) {
      int bestForColumn = 0;
      for (int c1 = 0; c1 < 4; ++c1)
        for (int c2 = 0; c2 < 4; ++c2)
          for (int c3 = 0; c3 < 4; ++c3) {
            Mask col = rowCellBits[0][c0] | rowCellBits[1][c1] | rowCellBits[2][c2] | rowCellBits[3][c3];
            bestForColumn = std::max(bestForColumn, value[col]);
          }
      optimisticColumns += bestForColumn;
    }

    int optimisticGridHandCount =
        std::min(maxGridHandCount, rowHandCount + maxColumnHandCount + (cornerUpper > 0 ? 1 : 0));
    if (optimisticGridHandCount < minGridHandCount) return;
    int optimisticGridBase = rowValue + optimisticColumns + cornerUpper * 2;
    if (score_from_parts(optimisticGridBase, optimisticGridHandCount, discardBonus).total <= best.total) return;

    for (const auto& p1 : perms) {
      if (over_time()) return;
      for (const auto& p2 : perms) {
        for (const auto& p3 : perms) {
          std::array<std::array<Mask, 4>, 4> cells{};
          cells[0] = rowCellBits[0];
          for (int col = 0; col < 4; ++col) {
            cells[1][col] = rowCellBits[1][p1[col]];
            cells[2][col] = rowCellBits[2][p2[col]];
            cells[3][col] = rowCellBits[3][p3[col]];
          }

          int colValue = 0;
          int columnHandCount = 0;
          for (int col = 0; col < 4; ++col) {
            Mask colMask = cells[0][col] | cells[1][col] | cells[2][col] | cells[3][col];
            colMasks[col] = colMask;
            int colScore = value[colMask];
            if (colScore > 0) columnHandCount++;
            colValue += colScore;
          }

          int baseGridHandCount = rowHandCount + columnHandCount;
          if (columnHandCount > maxColumnHandCount) continue;
          if (baseGridHandCount > maxGridHandCount) continue;
          int candidateCornerUpper = baseGridHandCount < maxGridHandCount ? cornerUpper : 0;
          int upperGridHandCount = baseGridHandCount + (candidateCornerUpper > 0 ? 1 : 0);
          if (upperGridHandCount < minGridHandCount) continue;
          columnPartitions++;
          ScoreParts upper = score_from_parts(rowValue + colValue + candidateCornerUpper * 2, upperGridHandCount, discardBonus);
          if (upper.total <= best.total) continue;

          std::array<int, 2> cornerRows{};
          std::array<int, 2> cornerCols{};
          Mask corner = 0;
          auto cornerValue = best_corner_for_cells(cells, baseGridHandCount < maxGridHandCount, cornerRows, cornerCols, corner);
          if (!cornerValue.has_value()) continue;

          int gridHandCount = baseGridHandCount + (cornerValue.value() > 0 ? 1 : 0);
          if (gridHandCount < minGridHandCount || gridHandCount > maxGridHandCount) continue;
          int gridBase = rowValue + colValue + cornerValue.value() * 2;
          ScoreParts score = score_from_parts(gridBase, gridHandCount, discardBonus);
          if (score.total > best.total) {
            best.total = score.total;
            best.base = score.base;
            best.handCount = score.handCount;
            best.gridHandCount = gridHandCount;
            best.hasPlacement = true;
            best.discard = discard;
            best.rows = rowMasks;
            best.cols = colMasks;
            best.corner = corner;
            best.cornerRows = cornerRows;
            best.cornerCols = cornerCols;
          }
        }
      }
    }
  }

  int optimistic_row_value(const std::vector<Mask>& candidates, Mask remaining, int needed) {
    int total = 0;
    int count = 0;
    for (Mask candidate : candidates) {
      if ((candidate & ~remaining) == 0) {
        total += value[candidate];
        count++;
        if (count == needed) break;
      }
    }
    return count == needed ? total : -1;
  }

  void search_rows(Mask board, Mask remaining, int depth, int rowValue, int discardBonus, Mask discard) {
    if (over_time() || rowLimitHit) return;
    if (depth == 4) {
      if (remaining != 0) return;
      if (skipRowsRemaining > 0) {
        skipRowsRemaining--;
        rowPartitionsSkipped++;
        return;
      }
      if (maxRows > 0 && rowPartitionsCompleted >= maxRows) {
        rowLimitHit = true;
        return;
      }
      if (threePlusLow) {
        evaluate_columns_generic(rowValue, 4, discardBonus, discard);
      } else {
        evaluate_columns_by_permutation(rowValue, discardBonus, discard);
      }
      if (!timedOut) {
        rowPartitions++;
        rowPartitionsCompleted++;
        currentDiscardRowsCompleted++;
      }
      return;
    }

    auto candidates = row_candidates(remaining);
    int optimistic = optimistic_row_value(candidates, remaining, 4 - depth);
    if (optimistic < 0) return;
    if (skipRowsRemaining == 0) {
      int optimisticTotal = 0;
      if (threePlusLow) {
        int optimisticGridBase = rowValue + optimistic + 3600 + 900;
        int optimisticGridHandCount = std::min(maxGridHandCount, 4 + 4 + 1);
        optimisticTotal = score_from_parts(optimisticGridBase, optimisticGridHandCount, discardBonus).total;
      } else {
        int optimisticGridBase = rowValue + optimistic + 3600 + 900;
        optimisticTotal = highBuckets ? optimisticGridBase * 5 : (optimisticGridBase + discardBonus) * 6;
        if (highBuckets && discardBonus > 0) {
          optimisticTotal = std::max(optimisticTotal, (optimisticGridBase + discardBonus) * 6);
        }
      }
      if (optimisticTotal <= best.total) return;
    }

    for (Mask candidate : candidates) {
      rowMasks[depth] = candidate;
      search_rows(board, remaining ^ candidate, depth + 1, rowValue + value[candidate], discardBonus, discard);
      if (timedOut || rowLimitHit) return;
    }
  }

  std::vector<Mask> four_card_submasks(Mask mask) {
    auto indexes = indexes_from_mask(mask);
    std::vector<Mask> result;
    for (size_t a = 0; a + 3 < indexes.size(); ++a) {
      for (size_t b = a + 1; b + 2 < indexes.size(); ++b) {
        for (size_t c = b + 1; c + 1 < indexes.size(); ++c) {
          for (size_t d = c + 1; d < indexes.size(); ++d) {
            result.push_back((Mask(1) << indexes[a]) | (Mask(1) << indexes[b]) | (Mask(1) << indexes[c]) |
                             (Mask(1) << indexes[d]));
          }
        }
      }
    }
    return result;
  }

  void finish_row_partition(int rowValue, int rowHandCount, int discardBonus, Mask discard) {
    if (skipRowsRemaining > 0) {
      skipRowsRemaining--;
      rowPartitionsSkipped++;
      return;
    }
    if (maxRows > 0 && rowPartitionsCompleted >= maxRows) {
      rowLimitHit = true;
      return;
    }
    evaluate_columns_generic(rowValue, rowHandCount, discardBonus, discard);
    if (!timedOut) {
      rowPartitions++;
      rowPartitionsCompleted++;
      currentDiscardRowsCompleted++;
    }
  }

  void search_three_positive_rows(Mask remaining, int depth, int rowValue, int discardBonus, Mask discard,
                                  Mask deadRowMask) {
    if (over_time() || rowLimitHit) return;
    if (depth == 3) {
      if (remaining != 0) return;
      rowMasks[3] = deadRowMask;
      finish_row_partition(rowValue, 3, discardBonus, discard);
      return;
    }

    auto candidates = row_candidates(remaining);
    int optimistic = optimistic_row_value(candidates, remaining, 3 - depth);
    if (optimistic < 0) return;
    if (skipRowsRemaining == 0) {
      int optimisticGridBase = rowValue + optimistic + 1800 + 900;
      int optimisticGridHandCount = std::min(maxGridHandCount, 3 + 4 + 1);
      if (score_from_parts(optimisticGridBase, optimisticGridHandCount, discardBonus).total <= best.total) return;
    }

    for (Mask candidate : candidates) {
      rowMasks[depth] = candidate;
      search_three_positive_rows(remaining ^ candidate, depth + 1, rowValue + value[candidate], discardBonus, discard,
                                 deadRowMask);
      if (timedOut || rowLimitHit) return;
    }
  }

  void search_one_dead_row(Mask board, int discardBonus, Mask discard) {
    for (Mask deadRowMask : four_card_submasks(board)) {
      if (timedOut || rowLimitHit || over_time()) return;
      if (value[deadRowMask] > 0) continue;
      Mask remaining = board ^ deadRowMask;
      search_three_positive_rows(remaining, 0, 0, discardBonus, discard, deadRowMask);
    }
  }

  void search_low_rows(Mask remaining, int depth, int rowValue, int rowHandCount, int discardBonus, Mask discard) {
    if (over_time() || rowLimitHit) return;
    if (depth == 4) {
      if (remaining != 0 || rowHandCount > 2) return;
      finish_row_partition(rowValue, rowHandCount, discardBonus, discard);
      return;
    }

    Mask lowBit = Mask(1) << lowest_bit_index(remaining);
    for (Mask candidate : four_card_submasks(remaining)) {
      if (timedOut || rowLimitHit || over_time()) return;
      if ((candidate & lowBit) == 0) continue;
      int handValue = value[candidate];
      int nextRowHandCount = rowHandCount + (handValue > 0 ? 1 : 0);
      if (nextRowHandCount > 2) continue;

      if (skipRowsRemaining == 0) {
        int rowsLeft = 3 - depth;
        int positiveRowsLeft = 2 - nextRowHandCount;
        int optimisticRowValue = rowValue + handValue + std::min(rowsLeft, positiveRowsLeft) * 450;
        int optimisticGridBase = optimisticRowValue + maxColumnHandCount * 450 + 900;
        int optimisticGridHandCount =
            std::min(maxGridHandCount, nextRowHandCount + maxColumnHandCount + 1);
        if (score_from_parts(optimisticGridBase, optimisticGridHandCount, discardBonus).total <= best.total) continue;
      }

      rowMasks[depth] = candidate;
      search_low_rows(remaining ^ candidate, depth + 1, rowValue + handValue, nextRowHandCount, discardBonus, discard);
    }
  }

  void initialize(const std::vector<std::string>& inputCards, int incumbent = 0) {
    cards = inputCards;
    best.total = incumbent;
    for (int a = 0; a < 17; ++a) {
      for (int b = a + 1; b < 18; ++b) {
        for (int c = b + 1; c < 19; ++c) {
          for (int d = c + 1; d < 20; ++d) {
            Mask mask = (Mask(1) << a) | (Mask(1) << b) | (Mask(1) << c) | (Mask(1) << d);
            auto hand = score_hand(cards, mask);
            value[mask] = hand.value;
            allDiscards.push_back({mask, hand.value});
            if (hand.value > 0) positives.push_back({mask, hand.value});
          }
        }
      }
    }
    std::sort(positives.begin(), positives.end(), [](const Candidate& a, const Candidate& b) {
      if (a.value != b.value) return a.value > b.value;
      return a.mask < b.mask;
    });
    std::sort(allDiscards.begin(), allDiscards.end(), [](const Candidate& a, const Candidate& b) {
      if (a.value != b.value) return a.value > b.value;
      return a.mask < b.mask;
    });
  }

  void solve(double seconds, int incumbent, int discardLimit, int skipDiscardCount, uint64_t skipRowCount,
             uint64_t rowLimit, bool includeHighBuckets, bool includeThreePlusLow, bool includeLowTwo) {
    highBuckets = includeHighBuckets;
    threePlusLow = includeThreePlusLow;
    lowTwo = includeLowTwo;
    minGridHandCount = 0;
    maxGridHandCount = lowTwo ? 5 : (threePlusLow ? 7 : 9);
    maxColumnHandCount = lowTwo ? 2 : 4;
    secondsLimit = seconds;
    maxDiscards = discardLimit;
    skipDiscards = skipDiscardCount;
    skipRows = skipRowCount;
    skipRowsRemaining = skipRowCount;
    maxRows = rowLimit;
    started = std::chrono::steady_clock::now();
    Mask all = (Mask(1) << 20) - 1;
    int seenDiscards = 0;
    const auto& discardCandidates = (highBuckets || threePlusLow || lowTwo) ? allDiscards : positives;
    for (const auto& discardCandidate : discardCandidates) {
      if (over_time()) break;
      if (seenDiscards++ < skipDiscards) continue;
      discardsChecked++;
      if (maxDiscards > 0 && static_cast<int>(discardsChecked) > maxDiscards) {
        discardsChecked--;
        break;
      }
      Mask board = all ^ discardCandidate.mask;
      int discardBonus = discardCandidate.value * 3;
      currentDiscardRowsCompleted = 0;
      int absoluteGridUpper = lowTwo ? (450 * 4 + 900) : (threePlusLow ? (450 * 6 + 900) : (450 * 8 + 900));
      int absoluteGridHandCount = lowTwo ? 5 : (threePlusLow ? 7 : 9);
      int absoluteTotalUpper = 0;
      if (threePlusLow || lowTwo) {
        absoluteTotalUpper = score_from_parts(absoluteGridUpper, absoluteGridHandCount, discardBonus).total;
      } else {
        absoluteTotalUpper = highBuckets ? absoluteGridUpper * 5 : (absoluteGridUpper + discardBonus) * 6;
        if (highBuckets && discardBonus > 0) {
          absoluteTotalUpper = std::max(absoluteTotalUpper, (absoluteGridUpper + discardBonus) * 6);
        }
      }
      if (skipRowsRemaining == 0 && absoluteTotalUpper <= best.total) {
        fullyCheckedDiscards++;
        continue;
      }
      if (lowTwo) {
        search_low_rows(board, 0, 0, 0, discardBonus, discardCandidate.mask);
      } else {
        search_rows(board, board, 0, 0, discardBonus, discardCandidate.mask);
      }
      if (!timedOut && !rowLimitHit && threePlusLow) {
        search_one_dead_row(board, discardBonus, discardCandidate.mask);
      }
      if (timedOut || rowLimitHit) {
        openDiscardRowsCompleted = currentDiscardRowsCompleted;
        break;
      }
      fullyCheckedDiscards++;
      openDiscardRowsCompleted = 0;
    }
  }

  std::vector<std::string> materialize_grid() const {
    if (!best.hasPlacement) return {};

    std::vector<int> rowOrder;
    rowOrder.push_back(best.cornerRows[0]);
    for (int index = 0; index < 4; ++index) {
      if (index != best.cornerRows[0] && index != best.cornerRows[1]) rowOrder.push_back(index);
    }
    rowOrder.push_back(best.cornerRows[1]);

    std::vector<int> colOrder;
    colOrder.push_back(best.cornerCols[0]);
    for (int index = 0; index < 4; ++index) {
      if (index != best.cornerCols[0] && index != best.cornerCols[1]) colOrder.push_back(index);
    }
    colOrder.push_back(best.cornerCols[1]);

    std::vector<std::string> grid;
    for (int row : rowOrder) {
      for (int col : colOrder) {
        Mask cell = best.rows[row] & best.cols[col];
        grid.push_back(cards[lowest_bit_index(cell)]);
      }
    }
    return grid;
  }

  std::vector<std::string> materialize_discard() const {
    if (!best.hasPlacement) return {};
    std::vector<std::string> discard;
    for (int index : indexes_from_mask(best.discard)) discard.push_back(cards[index]);
    return discard;
  }
};

std::vector<std::string> parse_cards(int argc, char** argv, bool& sample, double& seconds, int& incumbent,
                                     int& discardLimit, int& skipDiscards, uint64_t& skipRows, uint64_t& rowLimit,
                                     bool& highBuckets, bool& threePlusLow, bool& lowTwo) {
  std::vector<std::string> cards;
  sample = false;
  seconds = 0;
  incumbent = 0;
  discardLimit = 0;
  skipDiscards = 0;
  skipRows = 0;
  rowLimit = 0;
  highBuckets = false;
  threePlusLow = false;
  lowTwo = false;
  for (int i = 1; i < argc; ++i) {
    std::string arg = argv[i];
    if (arg == "--sample") {
      sample = true;
    } else if (arg == "--seconds" && i + 1 < argc) {
      seconds = std::atof(argv[++i]);
    } else if (arg == "--incumbent" && i + 1 < argc) {
      incumbent = std::atoi(argv[++i]);
    } else if (arg == "--discard-limit" && i + 1 < argc) {
      discardLimit = std::atoi(argv[++i]);
    } else if (arg == "--skip-discards" && i + 1 < argc) {
      skipDiscards = std::atoi(argv[++i]);
    } else if (arg == "--skip-rows" && i + 1 < argc) {
      skipRows = std::strtoull(argv[++i], nullptr, 10);
    } else if (arg == "--row-limit" && i + 1 < argc) {
      rowLimit = std::strtoull(argv[++i], nullptr, 10);
    } else if (arg == "--high-buckets") {
      highBuckets = true;
    } else if (arg == "--three-plus-low") {
      threePlusLow = true;
    } else if (arg == "--low-two") {
      lowTwo = true;
    } else {
      cards.push_back(arg);
    }
  }
  if (sample) return SAMPLE;
  return cards;
}

int main(int argc, char** argv) {
  bool sample = false;
  double seconds = 0;
  int incumbent = 0;
  int discardLimit = 0;
  int skipDiscards = 0;
  uint64_t skipRows = 0;
  uint64_t rowLimit = 0;
  bool highBuckets = false;
  bool threePlusLow = false;
  bool lowTwo = false;
  auto cards = parse_cards(argc, argv, sample, seconds, incumbent, discardLimit, skipDiscards, skipRows, rowLimit,
                           highBuckets, threePlusLow, lowTwo);
  if (cards.size() != 20) {
    std::cerr << "Provide 20 cards or --sample\n";
    return 2;
  }

  Solver solver;
  solver.initialize(cards, incumbent);
  solver.solve(seconds, incumbent, discardLimit, skipDiscards, skipRows, rowLimit, highBuckets, threePlusLow, lowTwo);

  std::cout << "{\n";
  std::cout << "  \"mode\": \""
            << (lowTwo ? "low-two" : (threePlusLow ? "three-plus-low" : (highBuckets ? "high-buckets" : "10-hand")))
            << "\",\n";
  std::cout << "  \"bestTotal\": " << solver.best.total << ",\n";
  std::cout << "  \"bestBase\": " << solver.best.base << ",\n";
  std::cout << "  \"bestHandCount\": " << solver.best.handCount << ",\n";
  std::cout << "  \"bestGridHandCount\": " << solver.best.gridHandCount << ",\n";
  std::cout << "  \"hasNewPlacement\": " << (solver.best.hasPlacement ? "true" : "false") << ",\n";
  std::cout << "  \"timedOut\": " << (solver.timedOut ? "true" : "false") << ",\n";
  std::cout << "  \"exhausted10HandBucket\": " << (!solver.timedOut && (discardLimit == 0 || static_cast<int>(solver.discardsChecked) < discardLimit) ? "true" : "false") << ",\n";
  std::cout << "  \"exhaustedSearchBucket\": " << (!solver.timedOut && (discardLimit == 0 || static_cast<int>(solver.discardsChecked) < discardLimit) ? "true" : "false") << ",\n";
  std::cout << "  \"skipDiscards\": " << skipDiscards << ",\n";
  std::cout << "  \"skipRows\": " << skipRows << ",\n";
  std::cout << "  \"discardLimit\": " << discardLimit << ",\n";
  std::cout << "  \"rowLimit\": " << rowLimit << ",\n";
  std::cout << "  \"discardsChecked\": " << solver.discardsChecked << ",\n";
  std::cout << "  \"fullyCheckedDiscards\": " << solver.fullyCheckedDiscards << ",\n";
  std::cout << "  \"rowPartitionsSkipped\": " << solver.rowPartitionsSkipped << ",\n";
  std::cout << "  \"rowPartitionsCompleted\": " << solver.rowPartitionsCompleted << ",\n";
  std::cout << "  \"openDiscardRowsCompleted\": " << solver.openDiscardRowsCompleted << ",\n";
  std::cout << "  \"rowLimitHit\": " << (solver.rowLimitHit ? "true" : "false") << ",\n";
  std::cout << "  \"candidateDiscards\": "
            << ((highBuckets || threePlusLow || lowTwo) ? solver.allDiscards.size() : solver.positives.size()) << ",\n";
  std::cout << "  \"rowPartitions\": " << solver.rowPartitions << ",\n";
  std::cout << "  \"columnPartitions\": " << solver.columnPartitions << ",\n";
  std::cout << "  \"discard\": \"" << (solver.best.hasPlacement ? join_cards(cards, solver.best.discard) : "") << "\",\n";
  std::cout << "  \"grid\": " << json_card_array(solver.materialize_grid()) << ",\n";
  std::cout << "  \"discardCards\": " << json_card_array(solver.materialize_discard()) << "\n";
  std::cout << "}\n";
  return 0;
}
