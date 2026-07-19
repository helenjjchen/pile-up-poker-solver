import { RANK_GLYPH_MASK_SIZE, RANK_GLYPH_TEMPLATES } from "./rankGlyphTemplates.js";

const SUIT_REFERENCES = {
  H: [245, 151, 157],
  S: [83, 172, 232],
  C: [134, 165, 122],
  D: [245, 181, 88],
};

const GRID_CENTERS_X = [0.306, 0.476, 0.646, 0.815];
const GRID_CENTERS_Y = [0.236, 0.343, 0.45, 0.556];
const TRAY_CENTERS_X = [0.25, 0.418, 0.586, 0.753];
const FULL_SCREEN_LAYOUT = {
  gridCentersX: GRID_CENTERS_X,
  gridCentersY: GRID_CENTERS_Y,
  trayCentersX: TRAY_CENTERS_X,
  gridWidth: 0.164,
  gridHeight: 0.104,
  trayWidth: 0.145,
  trayHeight: 0.13,
  trayCenterY: 0.925,
};
const CROPPED_BOARD_LAYOUT = {
  gridCentersX: [0.157, 0.369, 0.581, 0.794],
  gridCentersY: [0.151, 0.31, 0.469, 0.628],
  trayCentersX: [0.166, 0.378, 0.589, 0.8],
  gridWidth: 0.205,
  gridHeight: 0.153,
  trayWidth: 0.205,
  trayHeight: 0.16,
  trayCenterY: 0.872,
};
const GRID_RANK_CROPS = [
  { xStart: 0.11, xEnd: 0.34, yStart: 0.06, yEnd: 0.25 },
  { xStart: 0.08, xEnd: 0.43, yStart: 0.055, yEnd: 0.25 },
];
const DISCARD_RANK_CROPS = [
  { xStart: 0.04, xEnd: 0.22, yStart: 0.03, yEnd: 0.22 },
  { xStart: 0.11, xEnd: 0.34, yStart: 0.03, yEnd: 0.18 },
];
const TEMPLATE_GRID_RANK_CROP = { xStart: 0.08, xEnd: 0.43, yStart: 0.055, yEnd: 0.25 };
const TEMPLATE_DISCARD_RANK_CROPS = [
  { xStart: 0.04, xEnd: 0.2, yStart: 0, yEnd: 0.2 },
  { xStart: 0.08, xEnd: 0.2, yStart: -0.02, yEnd: 0.2 },
  { xStart: 0.02, xEnd: 0.25, yStart: -0.02, yEnd: 0.22 },
];
const MIN_TEMPLATE_RANK_SCORE = 0.52;
const CARD_COLOR_DISTANCE_LIMIT = 13000;
const MAX_DISPLAYED_SCORE_TOTAL = 40000;

function colorDistance(color, reference) {
  return (
    (color[0] - reference[0]) ** 2 +
    (color[1] - reference[1]) ** 2 +
    (color[2] - reference[2]) ** 2
  );
}

function clampRect(rect, width, height) {
  return {
    left: Math.max(0, Math.min(width - 1, Math.round(rect.left))),
    top: Math.max(0, Math.min(height - 1, Math.round(rect.top))),
    right: Math.max(1, Math.min(width, Math.round(rect.right))),
    bottom: Math.max(1, Math.min(height, Math.round(rect.bottom))),
  };
}

function fallbackSlotRects(width, height) {
  const layout = height / width < 2 ? CROPPED_BOARD_LAYOUT : FULL_SCREEN_LAYOUT;
  const gridWidth = width * layout.gridWidth;
  const gridHeight = height * layout.gridHeight;
  const trayWidth = width * layout.trayWidth;
  const trayHeight = height * layout.trayHeight;

  const grid = layout.gridCentersY.flatMap((centerY) =>
    layout.gridCentersX.map((centerX) =>
      clampRect(
        {
          left: width * centerX - gridWidth / 2,
          top: height * centerY - gridHeight / 2,
          right: width * centerX + gridWidth / 2,
          bottom: height * centerY + gridHeight / 2,
        },
        width,
        height,
      ),
    ),
  );

  const discard = layout.trayCentersX.map((centerX) =>
    clampRect(
      {
        left: width * centerX - trayWidth / 2,
        top: height * layout.trayCenterY - trayHeight / 2,
        right: width * centerX + trayWidth / 2,
        bottom: height * layout.trayCenterY + trayHeight / 2,
      },
      width,
      height,
    ),
  );

  return { grid, discard };
}

function centerOf(rect) {
  return {
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2,
  };
}

function rectWidth(rect) {
  return rect.right - rect.left;
}

function rectHeight(rect) {
  return rect.bottom - rect.top;
}

function padRect(rect, width, height, padding) {
  return clampRect(
    {
      left: rect.left - padding,
      top: rect.top - padding,
      right: rect.right + padding,
      bottom: rect.bottom + padding,
    },
    width,
    height,
  );
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function pixelAt(imageData, x, y) {
  const index = (y * imageData.width + x) * 4;
  return [imageData.data[index], imageData.data[index + 1], imageData.data[index + 2]];
}

function nearestSuit(color) {
  return Object.entries(SUIT_REFERENCES).sort(
    ([, a], [, b]) => colorDistance(color, a) - colorDistance(color, b),
  )[0][0];
}

function classifySuit(imageData, rect) {
  const counts = { H: 0, S: 0, C: 0, D: 0 };
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  const xStart = Math.floor(rect.left + width * 0.5);
  const xEnd = Math.floor(rect.left + width * 0.96);
  const yStart = Math.floor(rect.top + height * 0.02);
  const yEnd = Math.floor(rect.top + height * 0.25);

  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const color = pixelAt(imageData, x, y);
      const max = Math.max(...color);
      const min = Math.min(...color);
      if (max < 95 || max - min < 20) continue;
      counts[nearestSuit(color)] += 1;
    }
  }

  const [suit, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return { suit, confidence: Math.min(1, count / 24) };
}

function rankPoints(imageData, rect, suit, crop) {
  const reference = SUIT_REFERENCES[suit];
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  // Face cards use character art in the middle of the card, so only read the
  // small top-left rank glyph. The suit is read separately from color.
  const xStart = Math.floor(rect.left + width * crop.xStart);
  const xEnd = Math.floor(rect.left + width * crop.xEnd);
  const yStart = Math.floor(rect.top + height * crop.yStart);
  const yEnd = Math.floor(rect.top + height * crop.yEnd);
  const rawPoints = [];

  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const color = pixelAt(imageData, x, y);
      const max = Math.max(...color);
      const min = Math.min(...color);
      if (max < 100 || max - min < 10) continue;
      if (colorDistance(color, reference) < 14000) {
        rawPoints.push([x - xStart, y - yStart]);
      }
    }
  }

  if (!rawPoints.length) return null;

  const minX = Math.min(...rawPoints.map(([x]) => x));
  const maxX = Math.max(...rawPoints.map(([x]) => x));
  const minY = Math.min(...rawPoints.map(([, y]) => y));
  const maxY = Math.max(...rawPoints.map(([, y]) => y));

  return {
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    points: rawPoints.map(([x, y]) => [x - minX, y - minY]),
  };
}

function isRankInk(color, reference) {
  const max = Math.max(...color);
  const min = Math.min(...color);
  return max >= 100 && max - min >= 10 && colorDistance(color, reference) < 14000;
}

function cardTopEdgeLine(imageData, rect) {
  const points = [];
  const scanBottom = Math.min(rect.bottom, rect.top + Math.min(120, rectHeight(rect) * 0.4));

  for (let x = rect.left; x < rect.right; x += 1) {
    let y = rect.top;
    for (; y < scanBottom; y += 1) {
      const color = pixelAt(imageData, x, y);
      // Card surfaces are near-neutral white. This excludes the colored edge,
      // suit art, and the dark game background while retaining the first pixel
      // inside a tilted card.
      if (Math.min(...color) > 200 && Math.max(...color) - Math.min(...color) < 24) break;
    }
    if (y < scanBottom) points.push([x, y]);
  }

  const trim = Math.max(3, Math.floor(points.length * 0.05));
  const usable = points.slice(trim, Math.max(trim, points.length - trim));
  if (usable.length < Math.max(18, rectWidth(rect) * 0.45)) return null;

  const meanX = usable.reduce((sum, [x]) => sum + x, 0) / usable.length;
  const meanY = usable.reduce((sum, [, y]) => sum + y, 0) / usable.length;
  const denominator = usable.reduce((sum, [x]) => sum + (x - meanX) ** 2, 0);
  if (!denominator) return null;
  const slope = usable.reduce((sum, [x, y]) => sum + (x - meanX) * (y - meanY), 0) / denominator;
  return { intercept: meanY - slope * meanX, slope };
}

function rankPointsFromCardFrame(imageData, rect, suit, crop, topEdge) {
  if (!topEdge) return null;
  const reference = SUIT_REFERENCES[suit];
  const width = rectWidth(rect);
  const height = rectHeight(rect);
  const xStart = Math.floor(width * crop.xStart);
  const xEnd = Math.ceil(width * crop.xEnd);
  const yStart = Math.floor(height * crop.yStart);
  const yEnd = Math.ceil(height * crop.yEnd);
  const rawPoints = [];

  for (let localY = yStart; localY < yEnd; localY += 1) {
    for (let localX = xStart; localX < xEnd; localX += 1) {
      const x = Math.round(rect.left + localX);
      const y = Math.round(topEdge.intercept + topEdge.slope * x + localY);
      if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) continue;
      if (isRankInk(pixelAt(imageData, x, y), reference)) rawPoints.push([localX, localY]);
    }
  }

  return normalizePoints(rawPoints);
}

function normalizedRankMask(mask) {
  if (!mask?.points?.length) return null;
  const width = RANK_GLYPH_MASK_SIZE.width;
  const height = RANK_GLYPH_MASK_SIZE.height;
  const filled = new Set(mask.points.map(([x, y]) => `${x},${y}`));
  const normalized = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const yStart = Math.floor((y * mask.height) / height);
    const yEnd = Math.max(yStart + 1, Math.ceil(((y + 1) * mask.height) / height));
    for (let x = 0; x < width; x += 1) {
      const xStart = Math.floor((x * mask.width) / width);
      const xEnd = Math.max(xStart + 1, Math.ceil(((x + 1) * mask.width) / width));
      let hit = false;
      for (let sourceY = yStart; sourceY < yEnd && !hit; sourceY += 1) {
        for (let sourceX = xStart; sourceX < xEnd; sourceX += 1) {
          if (filled.has(`${sourceX},${sourceY}`)) {
            hit = true;
            break;
          }
        }
      }
      normalized[y * width + x] = hit ? 1 : 0;
    }
  }

  return normalized;
}

function rankTemplateScore(mask, template) {
  let intersection = 0;
  let maskCount = 0;
  let templateCount = 0;
  for (let index = 0; index < mask.length; index += 1) {
    maskCount += mask[index];
    templateCount += template[index];
    intersection += mask[index] & template[index];
  }
  return maskCount && templateCount ? (2 * intersection) / (maskCount + templateCount) : 0;
}

function templateRankCandidates(imageData, rect, suit, zone) {
  const masks = [];
  const regularCrops = zone === "discard" ? DISCARD_RANK_CROPS : [TEMPLATE_GRID_RANK_CROP, ...GRID_RANK_CROPS];
  regularCrops.forEach((crop) => masks.push(rankPoints(imageData, rect, suit, crop)));

  if (zone === "discard") {
    const topEdge = cardTopEdgeLine(imageData, rect);
    TEMPLATE_DISCARD_RANK_CROPS.forEach((crop) => {
      masks.push(rankPointsFromCardFrame(imageData, rect, suit, crop, topEdge));
    });
  }

  const candidates = new Map();
  masks.forEach((rawMask) => {
    const mask = normalizedRankMask(removeArtifactComponents(rawMask ?? { points: [], width: 0, height: 0 }));
    if (!mask) return;
    Object.entries(RANK_GLYPH_TEMPLATES).forEach(([rank, template]) => {
      const score = rankTemplateScore(mask, template);
      const existing = candidates.get(rank);
      if (!existing || score > existing.confidence) candidates.set(rank, { rank, confidence: score });
    });
  });

  return [...candidates.values()].sort((a, b) => b.confidence - a.confidence);
}

function connectedComponents(points, width, height) {
  const filled = new Set(points.map(([x, y]) => `${x},${y}`));
  const components = [];

  while (filled.size) {
    const first = filled.values().next().value;
    filled.delete(first);
    const stack = [first.split(",").map(Number)];
    const component = [];

    while (stack.length) {
      const [x, y] = stack.pop();
      component.push([x, y]);
      [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ].forEach(([nextX, nextY]) => {
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) return;
        const key = `${nextX},${nextY}`;
        if (!filled.has(key)) return;
        filled.delete(key);
        stack.push([nextX, nextY]);
      });
    }

    if (component.length > 4) components.push(component);
  }

  return components;
}

function holeInfo(points, width, height) {
  const filled = new Set(points.map(([x, y]) => `${x},${y}`));
  const seen = new Set();
  const holes = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startKey = `${x},${y}`;
      if (filled.has(startKey) || seen.has(startKey)) continue;

      const stack = [[x, y]];
      const cells = [];
      let touchesEdge = false;
      seen.add(startKey);

      while (stack.length) {
        const [cellX, cellY] = stack.pop();
        cells.push([cellX, cellY]);
        if (cellX === 0 || cellY === 0 || cellX === width - 1 || cellY === height - 1) {
          touchesEdge = true;
        }

        [
          [cellX + 1, cellY],
          [cellX - 1, cellY],
          [cellX, cellY + 1],
          [cellX, cellY - 1],
        ].forEach(([nextX, nextY]) => {
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) return;
          const key = `${nextX},${nextY}`;
          if (filled.has(key) || seen.has(key)) return;
          seen.add(key);
          stack.push([nextX, nextY]);
        });
      }

      if (!touchesEdge && cells.length > 2) {
        holes.push({
          size: cells.length,
          x: cells.reduce((sum, [cellX]) => sum + cellX, 0) / cells.length / width,
          y: cells.reduce((sum, [, cellY]) => sum + cellY, 0) / cells.length / height,
        });
      }
    }
  }

  return holes;
}

function normalizePoints(points) {
  if (!points.length) return null;

  const minX = Math.min(...points.map(([x]) => x));
  const maxX = Math.max(...points.map(([x]) => x));
  const minY = Math.min(...points.map(([, y]) => y));
  const maxY = Math.max(...points.map(([, y]) => y));

  return {
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    points: points.map(([x, y]) => [x - minX, y - minY]),
  };
}

function removeArtifactComponents(mask) {
  const components = connectedComponents(mask.points, mask.width, mask.height);
  if (components.length <= 1) return mask;

  const largest = Math.max(...components.map((component) => component.length));
  const minimumSize = Math.max(18, largest * 0.12);
  const filteredPoints = components
    .filter((component) => component.length >= minimumSize)
    .flatMap((component) => component);

  return normalizePoints(filteredPoints) ?? mask;
}

function classifyRank(features) {
  const { width, pixelCount, componentCount, components, holes, left, middleX, right, top, middleY, bottom } = features;
  const primaryHole = holes[0];
  const hasLeadingOneComponent = components.some(
    (component) => component.size > 35 && component.x < 0.2 && component.height > 0.55,
  );

  if (pixelCount < 25) return { rank: null, confidence: 0 };
  if (holes.length >= 2) return { rank: "8", confidence: 0.95 };
  if (width >= 28 && holes.length === 1 && componentCount >= 2 && hasLeadingOneComponent && primaryHole.x > 0.45) {
    return { rank: "10", confidence: 0.95 };
  }

  if (holes.length === 1) {
    if (width >= 28 && pixelCount > 260 && primaryHole.y < 0.6 && left > middleX * 0.7 && right > middleX * 1.2) {
      return { rank: "Q", confidence: 0.96 };
    }
    if (width >= 22 && primaryHole.y < 0.48 && right > left * 1.15 && right > middleX * 1.6 && top > bottom * 1.05) {
      return { rank: "Q", confidence: 0.94 };
    }
    if (
      width >= 23 &&
      width < 28 &&
      pixelCount > 220 &&
      primaryHole.y > 0.42 &&
      primaryHole.y < 0.56 &&
      left > right * 1.2 &&
      bottom > top * 1.2
    ) {
      return { rank: "A", confidence: 0.94 };
    }
    if (
      primaryHole.y > 0.4 &&
      primaryHole.y < 0.56 &&
      Math.abs(left - right) < middleX * 0.55 &&
      bottom >= top * 1.08
    ) {
      return { rank: "A", confidence: 0.92 };
    }
    if (width >= 20 && primaryHole.x < 0.3 && primaryHole.y > 0.25) return { rank: "A", confidence: 0.9 };
    return primaryHole.y > 0.5 ? { rank: "6", confidence: 0.9 } : { rank: "9", confidence: 0.9 };
  }

  if (top > middleY * 1.8 && top > bottom * 1.6 && pixelCount < 180) {
    return { rank: "7", confidence: 0.88 };
  }
  if (right > (left + middleX) * 0.85 && top > middleY * 1.25 && bottom > middleY * 1.25 && pixelCount > 70) {
    return { rank: "Q", confidence: 0.93 };
  }
  if (
    width >= 18 &&
    width <= 30 &&
    componentCount <= 2 &&
    middleX > Math.max(left, right) * 2.2 &&
    bottom > middleY * 1.2 &&
    bottom > top * 3 &&
    top < middleY * 0.55
  ) {
    return { rank: "J", confidence: 0.91 };
  }
  if (right > left * 1.8 && bottom >= top * 1.25) {
    return { rank: "J", confidence: 0.86 };
  }
  if (width > 22 && pixelCount < 42) {
    return { rank: "J", confidence: 0.78 };
  }
  if (
    width > 22 &&
    pixelCount > 65 &&
    top < middleY * 0.5 &&
    bottom >= middleY * 0.9 &&
    middleX <= Math.max(left, right) * 2
  ) {
    return { rank: "A", confidence: 0.72 };
  }
  if (width >= 14 && left > right * 1.8 && left > middleX * 1.4 && pixelCount > 80) {
    return { rank: "K", confidence: 0.82 };
  }
  if (right > left * 1.8) {
    return { rank: "J", confidence: 0.72 };
  }

  return { rank: null, confidence: 0 };
}

function classifyRankCandidate(imageData, rect, suit, crop) {
  const rawMask = rankPoints(imageData, rect, suit, crop);
  if (!rawMask) return { rank: null, confidence: 0 };

  const mask = removeArtifactComponents(rawMask);
  const { width, height, points } = mask;
  const components = connectedComponents(points, width, height);
  const holes = holeInfo(points, width, height).sort((a, b) => b.size - a.size);
  const componentSummaries = components.map((component) => {
    const xs = component.map(([x]) => x);
    const ys = component.map(([, y]) => y);
    const left = Math.min(...xs);
    const right = Math.max(...xs) + 1;
    const top = Math.min(...ys);
    const bottom = Math.max(...ys) + 1;
    return {
      size: component.length,
      x: component.reduce((sum, [x]) => sum + x, 0) / component.length / width,
      y: component.reduce((sum, [, y]) => sum + y, 0) / component.length / height,
      width: (right - left) / width,
      height: (bottom - top) / height,
    };
  });
  const features = {
    width,
    height,
    pixelCount: points.length,
    componentCount: components.length,
    components: componentSummaries,
    holes,
    left: points.filter(([x]) => x < width * 0.33).length,
    middleX: points.filter(([x]) => x >= width * 0.33 && x < width * 0.66).length,
    right: points.filter(([x]) => x >= width * 0.66).length,
    top: points.filter(([, y]) => y < height * 0.33).length,
    middleY: points.filter(([, y]) => y >= height * 0.33 && y < height * 0.66).length,
    bottom: points.filter(([, y]) => y >= height * 0.66).length,
  };

  return classifyRank(features);
}

function classifyRankFromSlot(imageData, rect, suit, zone) {
  const templateCandidates = templateRankCandidates(imageData, rect, suit, zone);
  const bestTemplate = templateCandidates[0];
  if (bestTemplate?.confidence >= MIN_TEMPLATE_RANK_SCORE) {
    return {
      ...bestTemplate,
      alternatives: templateCandidates.slice(1),
    };
  }

  const crops = zone === "discard" ? DISCARD_RANK_CROPS : GRID_RANK_CROPS;
  const candidates = crops.map((crop) => classifyRankCandidate(imageData, rect, suit, crop));
  const rankedCandidates = candidates
    .filter((candidate) => candidate?.rank)
    .sort((a, b) => b.confidence - a.confidence);
  const bestCandidate = rankedCandidates[0] ?? { rank: null, confidence: 0 };
  const alternatives = rankedCandidates
    .filter((candidate) => candidate.rank !== bestCandidate.rank)
    .concat(templateCandidates.filter((candidate) => candidate.rank !== bestCandidate.rank))
    .sort((a, b) => b.confidence - a.confidence)
    .filter((candidate, index, all) => all.findIndex((entry) => entry.rank === candidate.rank) === index)
    .slice(0, 6);

  return { ...bestCandidate, alternatives };
}

function recognizeSlot(imageData, rect, zone) {
  const suitResult = classifySuit(imageData, rect);
  const rankResult = classifyRankFromSlot(imageData, rect, suitResult.suit, zone);
  return {
    cardId: rankResult.rank ? `${rankResult.rank}${suitResult.suit}` : null,
    rank: rankResult.rank,
    suit: suitResult.suit,
    confidence: Math.min(suitResult.confidence, rankResult.confidence),
    alternatives: rankResult.alternatives.map((alternative) => ({
      cardId: `${alternative.rank}${suitResult.suit}`,
      rank: alternative.rank,
      suit: suitResult.suit,
      confidence: Math.min(suitResult.confidence, alternative.confidence),
    })),
  };
}

function emptySlot() {
  return {
    cardId: null,
    rank: null,
    suit: null,
    confidence: 0,
  };
}

function cardRank(cardId) {
  return cardId ? cardId.slice(0, -1) : null;
}

function clearRecognizedSlot(slot) {
  slot.cardId = null;
  slot.rank = null;
  slot.confidence = 0;
}

function deckCounts(slots) {
  const cards = new Map();
  const ranks = new Map();
  slots.forEach((slot) => {
    if (!slot.cardId) return;
    cards.set(slot.cardId, (cards.get(slot.cardId) ?? 0) + 1);
    const rank = cardRank(slot.cardId);
    ranks.set(rank, (ranks.get(rank) ?? 0) + 1);
  });
  return { cards, ranks };
}

function candidateFitsDeck(candidate, counts) {
  if (!candidate?.cardId) return false;
  return (counts.cards.get(candidate.cardId) ?? 0) < 1 && (counts.ranks.get(cardRank(candidate.cardId)) ?? 0) < 4;
}

function applyCandidate(slot, candidate) {
  slot.cardId = candidate.cardId;
  slot.rank = candidate.rank;
  slot.suit = candidate.suit;
  slot.confidence = candidate.confidence;
}

function rankedSlotCandidates(slot) {
  const candidates = [
    slot.cardId
      ? { cardId: slot.cardId, rank: slot.rank, suit: slot.suit, confidence: slot.confidence }
      : null,
    ...(slot.alternatives ?? []),
  ].filter((candidate) => candidate?.cardId && candidate.rank && candidate.suit);

  return candidates
    .sort((a, b) => b.confidence - a.confidence)
    .filter((candidate, index, all) => all.findIndex((entry) => entry.cardId === candidate.cardId) === index);
}

function bestSuitAssignment(slots) {
  const entries = slots
    .map((slot) => ({ slot, candidates: rankedSlotCandidates(slot) }))
    .filter((entry) => entry.candidates.length)
    .sort((a, b) => a.candidates.length - b.candidates.length);
  if (entries.length !== slots.length) return null;

  let best = null;
  const usedCards = new Set();
  const chosen = [];

  function visit(index, score) {
    if (index === entries.length) {
      if (!best || score > best.score) best = { score, chosen: [...chosen] };
      return;
    }

    const { slot, candidates } = entries[index];
    for (const candidate of candidates) {
      if (usedCards.has(candidate.cardId)) continue;
      usedCards.add(candidate.cardId);
      chosen.push({ slot, candidate });
      // A logarithmic score lets the strongest visual evidence dominate while
      // still giving the deck's no-duplicate rule a chance to correct a close
      // call instead of blanking a card.
      visit(index + 1, score + Math.log(Math.max(0.01, candidate.confidence)));
      chosen.pop();
      usedCards.delete(candidate.cardId);
    }
  }

  visit(0, 0);
  return best;
}

function resolveDeckConflicts(slots) {
  const recognizedCards = slots.map((slot) => slot.cardId).filter(Boolean);
  const needsResolution = recognizedCards.length !== slots.length || new Set(recognizedCards).size !== recognizedCards.length;
  if (!needsResolution) return false;

  const slotsBySuit = new Map();
  slots.forEach((slot) => {
    if (!slot.suit) return;
    slotsBySuit.set(slot.suit, [...(slotsBySuit.get(slot.suit) ?? []), slot]);
  });

  let changed = false;
  slotsBySuit.forEach((suitSlots) => {
    const assignment = bestSuitAssignment(suitSlots);
    if (!assignment) return;
    assignment.chosen.forEach(({ slot, candidate }) => {
      if (slot.cardId !== candidate.cardId) changed = true;
      applyCandidate(slot, candidate);
    });
  });

  return changed;
}

function fillClearedSlotsFromAlternatives(slots) {
  let changed = false;
  const counts = deckCounts(slots);

  slots.forEach((slot) => {
    if (slot.cardId || !slot.alternatives?.length) return;
    const candidate = slot.alternatives.find((alternative) => candidateFitsDeck(alternative, counts));
    if (!candidate) return;

    applyCandidate(slot, candidate);
    counts.cards.set(candidate.cardId, (counts.cards.get(candidate.cardId) ?? 0) + 1);
    counts.ranks.set(candidate.rank, (counts.ranks.get(candidate.rank) ?? 0) + 1);
    changed = true;
  });

  return changed;
}

function clearOverflowSlots(slots, keyForSlot, limit) {
  let changed = false;
  const grouped = new Map();
  slots.forEach((slot) => {
    const key = keyForSlot(slot);
    if (!key) return;
    grouped.set(key, [...(grouped.get(key) ?? []), slot]);
  });

  grouped.forEach((group) => {
    if (group.length <= limit) return;
    changed = true;
    group
      .sort((a, b) => b.confidence - a.confidence)
      .slice(limit)
      .forEach(clearRecognizedSlot);
  });

  return changed;
}

function enforceDeckConstraints(slots) {
  const clearedDuplicateCards = clearOverflowSlots(slots, (slot) => slot.cardId, 1);
  const clearedRankOverflow = clearOverflowSlots(slots, (slot) => cardRank(slot.cardId), 4);
  const filledAlternatives = fillClearedSlotsFromAlternatives(slots);
  const clearedAlternativeDuplicates = clearOverflowSlots(slots, (slot) => slot.cardId, 1);
  const clearedAlternativeRankOverflow = clearOverflowSlots(slots, (slot) => cardRank(slot.cardId), 4);
  return (
    clearedDuplicateCards ||
    clearedRankOverflow ||
    filledAlternatives ||
    clearedAlternativeDuplicates ||
    clearedAlternativeRankOverflow
  );
}

function isCardColor(color) {
  const max = Math.max(...color);
  const min = Math.min(...color);
  if (max < 95 || max - min < 18) return false;

  const reference = SUIT_REFERENCES[nearestSuit(color)];
  return colorDistance(color, reference) < CARD_COLOR_DISTANCE_LIMIT;
}

function cardColorComponents(imageData) {
  const sampleStep = Math.max(2, Math.ceil(Math.min(imageData.width, imageData.height) / 360));
  const sampledWidth = Math.ceil(imageData.width / sampleStep);
  const sampledHeight = Math.ceil(imageData.height / sampleStep);
  const mask = new Uint8Array(sampledWidth * sampledHeight);

  for (let sy = 0; sy < sampledHeight; sy += 1) {
    const y = Math.min(imageData.height - 1, sy * sampleStep);
    for (let sx = 0; sx < sampledWidth; sx += 1) {
      const x = Math.min(imageData.width - 1, sx * sampleStep);
      if (isCardColor(pixelAt(imageData, x, y))) mask[sy * sampledWidth + sx] = 1;
    }
  }

  const visited = new Uint8Array(mask.length);
  const components = [];
  const neighborOffsets = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || visited[index]) continue;

    const stack = [index];
    const points = [];
    visited[index] = 1;

    while (stack.length) {
      const current = stack.pop();
      const x = current % sampledWidth;
      const y = Math.floor(current / sampledWidth);
      points.push([
        Math.min(imageData.width - 1, x * sampleStep + Math.floor(sampleStep / 2)),
        Math.min(imageData.height - 1, y * sampleStep + Math.floor(sampleStep / 2)),
      ]);

      neighborOffsets.forEach(([dx, dy]) => {
        const nextX = x + dx;
        const nextY = y + dy;
        if (nextX < 0 || nextX >= sampledWidth || nextY < 0 || nextY >= sampledHeight) return;
        const nextIndex = nextY * sampledWidth + nextX;
        if (!mask[nextIndex] || visited[nextIndex]) return;
        visited[nextIndex] = 1;
        stack.push(nextIndex);
      });
    }

    if (points.length > 4) {
      components.push({
        sampleArea: sampleStep * sampleStep,
        points,
      });
    }
  }

  return components;
}

function componentCardCandidate(component, imageWidth, imageHeight) {
  const xs = component.points.map(([x]) => x);
  const ys = component.points.map(([, y]) => y);
  const rect = {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs) + 1,
    bottom: Math.max(...ys) + 1,
  };
  const width = rectWidth(rect);
  const height = rectHeight(rect);
  const aspect = height / width;

  if (width < Math.max(64, imageWidth * 0.08) || height < Math.max(78, imageHeight * 0.045)) return null;
  if (width > imageWidth * 0.32 || height > imageHeight * 0.24) return null;
  if (aspect < 1.08 || aspect > 1.9) return null;

  const edgeBand = Math.max(4, Math.min(18, Math.round(Math.min(width, height) * 0.08)));
  let top = 0;
  let bottom = 0;
  let left = 0;
  let right = 0;

  component.points.forEach(([x, y]) => {
    if (y - rect.top < edgeBand) top += component.sampleArea;
    if (rect.bottom - y <= edgeBand) bottom += component.sampleArea;
    if (x - rect.left < edgeBand) left += component.sampleArea;
    if (rect.right - x <= edgeBand) right += component.sampleArea;
  });

  const topDensity = top / (width * edgeBand);
  const bottomDensity = bottom / (width * edgeBand);
  const leftDensity = left / (height * edgeBand);
  const rightDensity = right / (height * edgeBand);
  const denseEdges = [topDensity, bottomDensity, leftDensity, rightDensity].filter((density) => density > 0.14).length;
  const edgeScore = Math.min(topDensity, bottomDensity, leftDensity, rightDensity);

  if (denseEdges < 3) return null;
  if (denseEdges < 4 && Math.max(topDensity, bottomDensity, leftDensity, rightDensity) < 0.22) return null;

  const area = width * height;
  const fillRatio = (component.points.length * component.sampleArea) / area;
  if (fillRatio < 0.025 || fillRatio > 0.5) return null;

  const center = centerOf(rect);
  return {
    rect,
    centerX: center.x,
    centerY: center.y,
    width,
    height,
    area,
    score: edgeScore * 6 + denseEdges + Math.min(fillRatio, 0.2) + Math.min(area / (imageWidth * imageHeight), 0.08),
  };
}

function centerDistanceRatio(candidate, kept) {
  const xRatio = Math.abs(candidate.centerX - kept.centerX) / Math.max(candidate.width, kept.width);
  const yRatio = Math.abs(candidate.centerY - kept.centerY) / Math.max(candidate.height, kept.height);
  return Math.max(xRatio, yRatio);
}

function dedupeCardCandidates(candidates) {
  const kept = [];
  [...candidates]
    .sort((a, b) => b.score - a.score || b.area - a.area)
    .forEach((candidate) => {
      if (kept.some((existing) => centerDistanceRatio(candidate, existing) < 0.42)) return;
      kept.push(candidate);
    });

  return kept.sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX);
}

function combinationsOfFour(items) {
  const combinations = [];
  for (let a = 0; a < items.length - 3; a += 1) {
    for (let b = a + 1; b < items.length - 2; b += 1) {
      for (let c = b + 1; c < items.length - 1; c += 1) {
        for (let d = c + 1; d < items.length; d += 1) {
          combinations.push([items[a], items[b], items[c], items[d]]);
        }
      }
    }
  }
  return combinations;
}

function spreadRatio(values) {
  if (!values.length) return 0;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const base = Math.max(1, median(values));
  return (high - low) / base;
}

function rowCandidateScore(cells) {
  const sorted = [...cells].sort((a, b) => a.centerX - b.centerX);
  const gaps = sorted.slice(1).map((cell, index) => cell.centerX - sorted[index].centerX);
  const widths = sorted.map((cell) => cell.width);
  const heights = sorted.map((cell) => cell.height);
  const minGap = Math.min(...gaps);
  const averageWidth = median(widths);
  if (minGap < averageWidth * 0.55) return -Infinity;

  return (
    sorted.reduce((sum, cell) => sum + cell.score, 0) -
    spreadRatio(gaps) * 8 -
    spreadRatio(widths) * 4 -
    spreadRatio(heights) * 4 -
    spreadRatio(sorted.map((cell) => cell.centerY)) * 6
  );
}

function bestFourCells(cells) {
  const sorted =
    cells.length > 10
      ? [...cells]
          .sort((a, b) => b.score - a.score || b.area - a.area)
          .slice(0, 10)
          .sort((a, b) => a.centerX - b.centerX)
      : [...cells].sort((a, b) => a.centerX - b.centerX);
  if (sorted.length === 4) return sorted;

  let best = null;
  let bestScore = -Infinity;
  combinationsOfFour(sorted).forEach((combination) => {
    const score = rowCandidateScore(combination);
    if (score <= bestScore) return;
    best = combination;
    bestScore = score;
  });

  return best ? best.sort((a, b) => a.centerX - b.centerX) : null;
}

function clusteredRows(candidates) {
  const cardHeight = median(candidates.map((candidate) => candidate.height));
  const tolerance = Math.max(24, cardHeight * 0.35);
  const clusters = [];

  [...candidates]
    .sort((a, b) => a.centerY - b.centerY)
    .forEach((candidate) => {
      const cluster = clusters.find((entry) => Math.abs(candidate.centerY - entry.centerY) <= tolerance);
      if (cluster) {
        cluster.cells.push(candidate);
        cluster.centerY = median(cluster.cells.map((cell) => cell.centerY));
      } else {
        clusters.push({ centerY: candidate.centerY, cells: [candidate] });
      }
    });

  return clusters
    .map((cluster) => {
      const cells = bestFourCells(cluster.cells);
      if (!cells) return null;
      return {
        cells,
        centerY: median(cells.map((cell) => cell.centerY)),
        score: rowCandidateScore(cells),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.centerY - b.centerY);
}

function boardRowsScore(rows) {
  const yGaps = rows.slice(1).map((row, index) => row.centerY - rows[index].centerY);
  const heights = rows.flatMap((row) => row.cells.map((cell) => cell.height));
  const averageHeight = median(heights);
  const averageGap = median(yGaps);

  if (averageGap < averageHeight * 0.7 || averageGap > averageHeight * 1.45) return -Infinity;

  const columnSpreads = [0, 1, 2, 3].map((index) =>
    spreadRatio(rows.map((row) => row.cells[index].centerX)),
  );
  if (Math.max(...columnSpreads) > 0.08) return -Infinity;

  return (
    rows.reduce((sum, row) => sum + row.score, 0) -
    spreadRatio(yGaps) * 12 -
    spreadRatio(heights) * 6 -
    columnSpreads.reduce((sum, spread) => sum + spread, 0) * 80
  );
}

function chooseBoardRows(rows) {
  let best = null;
  let bestScore = -Infinity;

  for (let start = 0; start <= rows.length - 4; start += 1) {
    combinationsOfFour(rows.slice(start, start + 6)).forEach((combination) => {
      const score = boardRowsScore(combination);
      if (score <= bestScore) return;
      best = combination;
      bestScore = score;
    });
  }

  return best;
}

function chooseDiscardRow(rows, boardRows) {
  if (!boardRows) return null;
  const boardBottom = Math.max(...boardRows.flatMap((row) => row.cells.map((cell) => cell.rect.bottom)));
  const boardHeight = median(boardRows.flatMap((row) => row.cells.map((cell) => cell.height)));

  return (
    rows
      .filter((row) => row.centerY > boardBottom + boardHeight * 0.45)
      .sort((a, b) => a.centerY - b.centerY)[0] ?? null
  );
}

function detectSlotRects(imageData) {
  const candidates = dedupeCardCandidates(
    cardColorComponents(imageData)
      .map((component) => componentCardCandidate(component, imageData.width, imageData.height))
      .filter(Boolean),
  );
  const rows = clusteredRows(candidates);
  const boardRows = chooseBoardRows(rows);
  if (!boardRows) return null;

  const padding = Math.max(2, Math.round(median(boardRows.flatMap((row) => row.cells.map((cell) => cell.width))) * 0.015));
  const grid = boardRows
    .flatMap((row) => row.cells)
    .map((cell) => padRect(cell.rect, imageData.width, imageData.height, padding));
  const discardRow = chooseDiscardRow(rows, boardRows);
  const discard =
    discardRow?.cells.map((cell) => padRect(cell.rect, imageData.width, imageData.height, padding)) ??
    fallbackSlotRects(imageData.width, imageData.height).discard;

  return { grid, discard };
}

function slotRects(imageData) {
  return detectSlotRects(imageData) ?? fallbackSlotRects(imageData.width, imageData.height);
}

function brightPixelMask(imageData, rect) {
  const points = [];
  for (let y = rect.top; y < rect.bottom; y += 1) {
    for (let x = rect.left; x < rect.right; x += 1) {
      const [red, green, blue] = pixelAt(imageData, x, y);
      if (red > 165 && green > 165 && blue > 165) points.push([x - rect.left, y - rect.top]);
    }
  }
  return points;
}

function componentBounds(points, width, height) {
  return connectedComponents(points, width, height)
    .map((component) => {
      const xs = component.map(([x]) => x);
      const ys = component.map(([, y]) => y);
      return {
        left: Math.min(...xs),
        top: Math.min(...ys),
        right: Math.max(...xs) + 1,
        bottom: Math.max(...ys) + 1,
        size: component.length,
      };
    })
    .filter((box) => box.size > 4 && box.bottom - box.top > 5)
    .sort((a, b) => a.left - b.left);
}

function textComponentBoxes(points, width, height) {
  const filled = new Set(points.map(([x, y]) => `${x},${y}`));
  const components = [];
  const offsets = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];

  while (filled.size) {
    const first = filled.values().next().value;
    filled.delete(first);
    const stack = [first.split(",").map(Number)];
    const component = [];

    while (stack.length) {
      const [x, y] = stack.pop();
      component.push([x, y]);

      offsets.forEach(([dx, dy]) => {
        const nextX = x + dx;
        const nextY = y + dy;
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) return;
        const key = `${nextX},${nextY}`;
        if (!filled.has(key)) return;
        filled.delete(key);
        stack.push([nextX, nextY]);
      });
    }

    if (component.length <= 2) continue;
    const xs = component.map(([x]) => x);
    const ys = component.map(([, y]) => y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs) + 1;
    const bottom = Math.max(...ys) + 1;
    components.push({
      left,
      top,
      right,
      bottom,
      size: component.length,
      points: component.map(([x, y]) => [x - left, y - top]),
    });
  }

  return components.sort((a, b) => a.left - b.left);
}

function readSimpleDigitsFromBounds(bounds) {
  const digits = [];
  for (const box of bounds) {
    const width = box.right - box.left;
    const height = box.bottom - box.top;
    if (height < 8) continue;
    if (width <= 4 && height >= 10) {
      digits.push("1");
      continue;
    }
    if (width >= 8 && height >= 10) {
      digits.push("0");
    }
  }
  return digits.join("");
}

function scoreDigitFeatures(box) {
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  const points = box.points ?? [];
  const holes = holeInfo(points, width, height).sort((a, b) => b.size - a.size);

  return {
    width,
    height,
    pixelCount: points.length || box.size,
    holes,
    left: points.filter(([x]) => x < width * 0.33).length,
    middleX: points.filter(([x]) => x >= width * 0.33 && x < width * 0.66).length,
    right: points.filter(([x]) => x >= width * 0.66).length,
    top: points.filter(([, y]) => y < height * 0.25).length,
    middleY: points.filter(([, y]) => y >= height * 0.38 && y < height * 0.62).length,
    bottom: points.filter(([, y]) => y >= height * 0.75).length,
    upperLeft: points.filter(([x, y]) => x < width * 0.42 && y < height * 0.5).length,
    upperRight: points.filter(([x, y]) => x >= width * 0.58 && y < height * 0.5).length,
    lowerLeft: points.filter(([x, y]) => x < width * 0.42 && y >= height * 0.5).length,
    lowerRight: points.filter(([x, y]) => x >= width * 0.58 && y >= height * 0.5).length,
  };
}

function classifyScoreDigit(features) {
  const {
    width,
    height,
    pixelCount,
    holes,
    left,
    middleX,
    right,
    top,
    middleY,
    bottom,
    upperLeft,
    upperRight,
    lowerLeft,
    lowerRight,
  } = features;

  if (height < 8 || pixelCount < 12) return null;
  if (width <= Math.max(4, height * 0.34)) return "1";
  if (holes.length >= 2) return "8";

  if (holes.length === 1) {
    const [hole] = holes;
    if (hole.y < 0.36) return "9";
    if (hole.y > 0.58) return "6";
    return "0";
  }

  if (top > middleY * 2 && top > bottom * 2 && lowerLeft < upperRight * 0.45) return "7";
  if (middleY > top * 0.85 && middleY > bottom * 1.2 && upperLeft > lowerLeft * 1.4) return "4";

  const expected = {
    "2": [1, 1, 1, 0, 1, 1, 0],
    "3": [1, 1, 1, 0, 1, 0, 1],
    "5": [1, 1, 1, 1, 0, 0, 1],
  };
  const observed = [
    top > 0,
    middleY > 0,
    bottom > 0,
    upperLeft > upperRight * 0.55,
    upperRight > upperLeft * 0.55,
    lowerLeft > lowerRight * 0.55,
    lowerRight > lowerLeft * 0.55,
  ].map(Boolean);
  const best = Object.entries(expected)
    .map(([digit, pattern]) => ({
      digit,
      distance: pattern.reduce((sum, bit, index) => sum + (Boolean(bit) === observed[index] ? 0 : 1), 0),
    }))
    .sort((a, b) => a.distance - b.distance)[0];

  if (best?.distance <= 2) return best.digit;
  if (right > left * 1.4 && bottom >= top * 0.6) return "3";
  if (left > right * 1.2 && bottom >= top * 0.6) return "5";
  return null;
}

function displayedScoreTotalFromDigits(digits) {
  if (!/^\d{3,5}$/.test(digits)) return null;
  const value = Number(digits);
  if (!Number.isFinite(value) || value > MAX_DISPLAYED_SCORE_TOTAL) return null;
  return value;
}

function groupTextBoxesByRow(boxes) {
  const rows = [];
  const medianHeight = median(boxes.map((box) => box.bottom - box.top));
  const tolerance = Math.max(4, medianHeight * 0.55);

  boxes
    .map((box) => ({
      ...box,
      centerY: (box.top + box.bottom) / 2,
    }))
    .sort((a, b) => a.centerY - b.centerY)
    .forEach((box) => {
      const row = rows.find((entry) => Math.abs(box.centerY - entry.centerY) <= tolerance);
      if (row) {
        row.boxes.push(box);
        row.centerY = median(row.boxes.map((entry) => entry.centerY));
      } else {
        rows.push({ centerY: box.centerY, boxes: [box] });
      }
    });

  return rows;
}

function readScoreTotalFromBoxes(boxes) {
  const digitBoxes = boxes
    .filter((box) => box.bottom - box.top >= 8 && box.right - box.left >= 3)
    .map((box) => ({
      ...box,
      digit: classifyScoreDigit(scoreDigitFeatures(box)),
    }))
    .filter((entry) => entry.digit);
  const rows = groupTextBoxesByRow(digitBoxes);
  const candidates = rows
    .map((row) => {
      const rowDigits = row.boxes
        .sort((a, b) => a.left - b.left)
        .map((box) => box.digit)
        .filter(Boolean)
        .join("");
      return {
        centerY: row.centerY,
        value: displayedScoreTotalFromDigits(rowDigits),
      };
    })
    .filter((candidate) => candidate.value !== null)
    .sort((a, b) => b.centerY - a.centerY);

  return candidates[0]?.value ?? null;
}

function displayedScoreRects(imageData, rects) {
  if (rects?.grid?.length >= 16) {
    const gridRight = Math.max(...rects.grid.map((rect) => rect.right));
    const gridTop = Math.min(...rects.grid.map((rect) => rect.top));
    const cardWidth = median(rects.grid.map(rectWidth));
    const cardHeight = median(rects.grid.map(rectHeight));
    return {
      hand: clampRect(
        {
          left: gridRight - cardWidth * 1.25,
          top: gridTop - cardHeight * 0.52,
          right: gridRight + cardWidth * 0.1,
          bottom: gridTop - cardHeight * 0.3,
        },
        imageData.width,
        imageData.height,
      ),
      total: clampRect(
        {
          left: gridRight - cardWidth * 1.35,
          top: gridTop - cardHeight * 0.34,
          right: gridRight + cardWidth * 0.22,
          bottom: gridTop - cardHeight * 0.07,
        },
        imageData.width,
        imageData.height,
      ),
    };
  }

  const width = imageData.width;
  const height = imageData.height;
  return {
    hand: clampRect(
      {
        left: width * 0.76,
        top: height * 0.145,
        right: width * 0.94,
        bottom: height * 0.18,
      },
      width,
      height,
    ),
    total: clampRect(
      {
        left: width * 0.74,
        top: height * 0.17,
        right: width * 0.94,
        bottom: height * 0.2,
      },
      width,
      height,
    ),
  };
}

function recognizeDisplayedScore(imageData, rects) {
  const { hand: handRect, total: totalRect } = displayedScoreRects(imageData, rects);
  const handBounds = componentBounds(
    brightPixelMask(imageData, handRect),
    handRect.right - handRect.left,
    handRect.bottom - handRect.top,
  );
  const handDigits = readSimpleDigitsFromBounds(handBounds);
  const totalBoxes = textComponentBoxes(
    brightPixelMask(imageData, totalRect),
    totalRect.right - totalRect.left,
    totalRect.bottom - totalRect.top,
  );
  const total = readScoreTotalFromBoxes(totalBoxes);

  return {
    handCount: handDigits === "10" ? 10 : null,
    total,
  };
}

function loadObjectUrlImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const cleanup = () => URL.revokeObjectURL(url);
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("Could not read screenshot image."));
    };
    image.src = url;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read screenshot file."));
    reader.readAsDataURL(file);
  });
}

async function loadDataUrlImage(file) {
  const dataUrl = await readFileAsDataUrl(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode screenshot image."));
    image.src = dataUrl;
  });
}

async function loadImageSource(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Mobile Safari may expose createImageBitmap but fail for user-selected files.
    }
  }

  try {
    return await loadObjectUrlImage(file);
  } catch {
    return loadDataUrlImage(file);
  }
}

export function recognizeFantasylandImageData(imageData) {
  const rects = slotRects(imageData);
  const gridSlots = Array.from({ length: 16 }, (_, index) =>
    rects.grid[index] ? recognizeSlot(imageData, rects.grid[index], "grid") : emptySlot(),
  );
  const discardSlots = Array.from({ length: 4 }, (_, index) =>
    rects.discard[index] ? recognizeSlot(imageData, rects.discard[index], "discard") : emptySlot(),
  );
  const allSlots = [...gridSlots, ...discardSlots];
  resolveDeckConflicts(allSlots);
  enforceDeckConstraints(allSlots);
  const displayedScore = recognizeDisplayedScore(imageData, rects);
  const cards = [...gridSlots, ...discardSlots].map((slot) => slot.cardId);
  const recognizedCards = cards.filter(Boolean);
  const missing = recognizedCards.length !== 20;
  const duplicates = new Set(recognizedCards).size !== recognizedCards.length;
  const confidence = Math.min(...[...gridSlots, ...discardSlots].map((slot) => slot.confidence));
  let warning = "";
  if (missing) {
    warning = `${recognizedCards.length}/20 cards auto-detected from the screenshot. Please adjust the rest manually.`;
  } else if (duplicates) {
    warning = "I read 20 cards from the screenshot, but some were duplicates. Please adjust them manually.";
  } else if (confidence < 0.6) {
    warning = "I read 20 cards from the screenshot, but one or more were low confidence. Please double-check them.";
  }

  return {
    grid: gridSlots.map((slot) => slot.cardId),
    discard: discardSlots.map((slot) => slot.cardId),
    confidence,
    displayedScore,
    complete: !warning,
    warning,
  };
}

export async function recognizeFantasylandScreenshot(file) {
  const bitmap = await loadImageSource(file);
  const width = bitmap.width || bitmap.naturalWidth;
  const height = bitmap.height || bitmap.naturalHeight;
  if (!width || !height || width < 240 || height < 240) {
    throw new Error("This does not look like a Pile-Up Poker screenshot.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Screenshot reading is not available in this browser.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  return recognizeFantasylandImageData(context.getImageData(0, 0, width, height));
}

export const __recognizerTestHooks = {
  classifyRank,
  classifyScoreDigit,
  displayedScoreTotalFromDigits,
  displayedScoreRects,
  resolveDeckConflicts,
};
