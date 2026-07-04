import { scoreHand, scorePlacement, multiplierForHandCount, LINE_DEFINITIONS } from "./scoring.js";

const GRID_LINE_COUNT = LINE_DEFINITIONS.length;
const DISCARD_LINE_INDEX = GRID_LINE_COUNT;
const DISCARD_SLOTS = [16, 17, 18, 19];
const ALL_LINES = [...LINE_DEFINITIONS, { key: "discard", label: "Discard", indices: DISCARD_SLOTS, bonus: 3 }];

function combinations4(length) {
  const result = [];
  for (let a = 0; a < length - 3; a += 1) {
    for (let b = a + 1; b < length - 2; b += 1) {
      for (let c = b + 1; c < length - 1; c += 1) {
        for (let d = c + 1; d < length; d += 1) {
          result.push([a, b, c, d]);
        }
      }
    }
  }
  return result;
}

function term(coef, name) {
  return { coef, name };
}

function formatTerm({ coef, name }, isFirst) {
  const sign = coef < 0 ? "-" : isFirst ? "" : "+";
  const abs = Math.abs(coef);
  const body = abs === 1 ? name : `${abs} ${name}`;
  return sign ? `${sign} ${body}` : body;
}

function appendExpression(lines, prefix, terms, suffix = "") {
  if (terms.length === 0) {
    lines.push(`${prefix}0${suffix}`);
    return;
  }

  const maxLength = 118;
  let current = prefix;

  terms.forEach((item, index) => {
    const piece = formatTerm(item, index === 0 && current.trim().endsWith(":"));
    const next = current.endsWith(" ") || current.endsWith(":") ? `${current} ${piece}` : `${current} ${piece}`;
    if (next.length > maxLength && current.trim() !== prefix.trim()) {
      lines.push(current);
      current = `  ${piece}`;
    } else {
      current = next;
    }
  });

  lines.push(`${current}${suffix}`);
}

function variableNamesForScenario(candidates) {
  const names = [];
  for (let cardIndex = 0; cardIndex < 20; cardIndex += 1) {
    for (let slotIndex = 0; slotIndex < 20; slotIndex += 1) {
      names.push(`x_${cardIndex}_${slotIndex}`);
    }
  }
  for (let lineIndex = 0; lineIndex < ALL_LINES.length; lineIndex += 1) {
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      names.push(`z_${lineIndex}_${candidateIndex}`);
    }
  }
  return names;
}

function buildSubsetMetadata(cardIds) {
  const candidates = combinations4(cardIds.length)
    .map((cardIndexes) => {
      const cards = cardIndexes.map((cardIndex) => cardIds[cardIndex]);
      const hand = scoreHand(cards);
      return {
        cardIndexes,
        cards,
        hand,
      };
    })
    .filter((candidate) => candidate.hand.base > 0);

  return { candidates };
}

function buildScenarioModel(cardIds, metadata, scenario) {
  const { candidates } = metadata;
  const lines = [];
  const multiplier =
    scenario.gridHandCount === 9 && scenario.discardPositive
      ? multiplierForHandCount(10)
      : multiplierForHandCount(scenario.gridHandCount);

  lines.push("Maximize");

  const objectiveTerms = [];
  ALL_LINES.forEach((line, lineIndex) => {
    if (lineIndex === DISCARD_LINE_INDEX && !(scenario.gridHandCount === 9 && scenario.discardPositive)) {
      return;
    }

    candidates.forEach((candidate, candidateIndex) => {
      const bonus = lineIndex === DISCARD_LINE_INDEX ? 3 : line.bonus;
      objectiveTerms.push(term(candidate.hand.base * bonus * multiplier, `z_${lineIndex}_${candidateIndex}`));
    });
  });

  appendExpression(lines, " obj:", objectiveTerms.length ? objectiveTerms : [term(0, "x_0_0")]);
  lines.push("Subject To");

  for (let cardIndex = 0; cardIndex < cardIds.length; cardIndex += 1) {
    appendExpression(
      lines,
      ` card_${cardIndex}:`,
      Array.from({ length: 20 }, (_, slotIndex) => term(1, `x_${cardIndex}_${slotIndex}`)),
      " = 1",
    );
  }

  for (let slotIndex = 0; slotIndex < 20; slotIndex += 1) {
    appendExpression(
      lines,
      ` slot_${slotIndex}:`,
      Array.from({ length: cardIds.length }, (_, cardIndex) => term(1, `x_${cardIndex}_${slotIndex}`)),
      " = 1",
    );
  }

  ALL_LINES.forEach((line, lineIndex) => {
    candidates.forEach((candidate, candidateIndex) => {
      candidate.cardIndexes.forEach((cardIndex) => {
        appendExpression(
          lines,
          ` upper_${lineIndex}_${candidateIndex}_${cardIndex}:`,
          [term(1, `z_${lineIndex}_${candidateIndex}`), ...line.indices.map((slotIndex) => term(-1, `x_${cardIndex}_${slotIndex}`))],
          " <= 0",
        );
      });

      const lowerTerms = [
        term(1, `z_${lineIndex}_${candidateIndex}`),
        ...candidate.cardIndexes.flatMap((cardIndex) => line.indices.map((slotIndex) => term(-1, `x_${cardIndex}_${slotIndex}`))),
      ];
      appendExpression(lines, ` lower_${lineIndex}_${candidateIndex}:`, lowerTerms, " >= -3");
    });

    appendExpression(
      lines,
      ` line_positive_${lineIndex}:`,
      candidates.map((_, candidateIndex) => term(1, `z_${lineIndex}_${candidateIndex}`)),
      " <= 1",
    );
  });

  const gridCountTerms = [];
  for (let lineIndex = 0; lineIndex < GRID_LINE_COUNT; lineIndex += 1) {
    candidates.forEach((_, candidateIndex) => gridCountTerms.push(term(1, `z_${lineIndex}_${candidateIndex}`)));
  }
  appendExpression(lines, " grid_hand_count:", gridCountTerms, ` = ${scenario.gridHandCount}`);

  if (scenario.gridHandCount === 9) {
    appendExpression(
      lines,
      " discard_positive:",
      candidates.map((_, candidateIndex) => term(1, `z_${DISCARD_LINE_INDEX}_${candidateIndex}`)),
      ` = ${scenario.discardPositive ? 1 : 0}`,
    );
  }

  lines.push("Binary");
  const names = variableNamesForScenario(candidates);
  for (let index = 0; index < names.length; index += 4) {
    lines.push(` ${names.slice(index, index + 4).join(" ")}`);
  }
  lines.push("End");

  return lines.join("\n");
}

function scenarioLabel(scenario) {
  if (scenario.gridHandCount === 9) {
    return scenario.discardPositive ? "9 grid + discard" : "9 grid";
  }
  return `${scenario.gridHandCount} grid`;
}

function extractPlacement(cardIds, solution) {
  const slots = Array(20).fill(null);
  for (let cardIndex = 0; cardIndex < cardIds.length; cardIndex += 1) {
    for (let slotIndex = 0; slotIndex < 20; slotIndex += 1) {
      const column = solution.Columns[`x_${cardIndex}_${slotIndex}`];
      if (column && column.Primal > 0.5) {
        slots[slotIndex] = cardIds[cardIndex];
      }
    }
  }
  return {
    grid: slots.slice(0, 16),
    discard: slots.slice(16, 20),
  };
}

function buildScenarios() {
  const scenarios = [];
  for (let gridHandCount = 0; gridHandCount <= 8; gridHandCount += 1) {
    scenarios.push({ gridHandCount, discardPositive: false });
  }
  scenarios.push({ gridHandCount: 9, discardPositive: false });
  scenarios.push({ gridHandCount: 9, discardPositive: true });
  return scenarios;
}

export function buildFantasylandModelForScenario(cardIds, scenario) {
  if (cardIds.length !== 20) {
    throw new Error("Fantasyland exact solver requires exactly 20 cards.");
  }
  return buildScenarioModel(cardIds, buildSubsetMetadata(cardIds), scenario);
}

export async function solveFantasylandExact(cardIds, highs, options = {}) {
  if (cardIds.length !== 20) {
    throw new Error("Fantasyland exact solver requires exactly 20 cards.");
  }

  const startedAt = performance.now();
  const metadata = buildSubsetMetadata(cardIds);
  const scenarios = options.scenarios ?? buildScenarios();
  const scenarioSummaries = [];
  let best = null;

  for (const scenario of scenarios) {
    const model = buildScenarioModel(cardIds, metadata, scenario);
    const solution = highs.solve(model, {
      output_flag: false,
      log_to_console: false,
      presolve: "on",
      time_limit: options.timeLimitSecondsPerScenario ?? 8,
      random_seed: 7,
    });

    const summary = {
      scenario,
      label: scenarioLabel(scenario),
      status: solution.Status,
      objectiveValue: solution.ObjectiveValue,
    };
    scenarioSummaries.push(summary);

    if (solution.Status !== "Optimal" && solution.Status !== "Time limit reached" && solution.Status !== "Target for objective reached") {
      continue;
    }

    const placement = extractPlacement(cardIds, solution);
    if (placement.grid.some((cardId) => !cardId) || placement.discard.some((cardId) => !cardId)) {
      continue;
    }

    const score = scorePlacement(placement.grid, placement.discard);
    const candidate = {
      ...placement,
      score,
      scenario: summary,
      exact: solution.Status === "Optimal",
      objectiveValue: solution.ObjectiveValue,
    };

    if (!best || candidate.score.total > best.score.total) {
      best = candidate;
    }
  }

  return {
    best,
    exact: Boolean(best) && scenarioSummaries.every((item) => item.status === "Optimal" || item.status === "Infeasible"),
    scenarioSummaries,
    elapsedMs: performance.now() - startedAt,
  };
}
