import { RANK_GLYPH_MASK_SIZE, RANK_GLYPH_TEMPLATES } from "./rankGlyphTemplates.js";
import { PRO_RANK_GLYPH_TEMPLATES } from "./proRankGlyphTemplates.js";
import { SCORE_GLYPH_MASK_SIZE, SCORE_GLYPH_TEMPLATES } from "./scoreGlyphTemplates.js";
import { SUIT_GLYPH_MASK_SIZE, SUIT_GLYPH_TEMPLATES } from "./suitGlyphTemplates.js";
import {
  isPayoutFeasibleForHandCount,
  isPayoutFeasibleTotal,
  scorePlacement,
} from "./scoring.js?v=scoring-feasibility-1";
import {
  proMultiplierForHandCount,
  scoreProPlacement,
} from "./proScoring.js";
import { PRO_STANDARD_DECK } from "./proCards.js";
import { DECK } from "./cards.js";

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
const PRO_FULL_SCREEN_LAYOUT = {
  gridCentersX: [0.266, 0.409, 0.552, 0.695, 0.839],
  gridCentersY: [0.229, 0.32, 0.411, 0.501, 0.592],
  trayCentersX: [0.218, 0.363, 0.508, 0.653, 0.798],
  gridWidth: 0.14,
  gridHeight: 0.089,
  trayWidth: 0.145,
  trayHeight: 0.11,
  trayCenterY: 0.92,
};
const PRO_CROPPED_BOARD_LAYOUT = {
  // Cropped/shared gameplay captures omit the app header and leave the board
  // at the top of the image. The horizontal geometry is unchanged, while the
  // five card rows occupy a larger share of the shorter image.
  gridCentersX: [0.266, 0.409, 0.552, 0.695, 0.839],
  gridCentersY: [0.118, 0.238, 0.358, 0.478, 0.598],
  trayCentersX: [0.218, 0.363, 0.508, 0.653, 0.798],
  gridWidth: 0.14,
  gridHeight: 0.116,
  trayWidth: 0.145,
  trayHeight: 0.14,
  trayCenterY: 0.96,
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
const MIN_FOCUSED_TEMPLATE_RANK_SCORE = 0.45;
const MIN_FOCUSED_TEMPLATE_RANK_MARGIN = 0.07;
const MIN_SUIT_GLYPH_SCORE = 0.58;
const MAX_DISPLAYED_SCORE_TOTAL = 40000;
const MAX_PRO_DISPLAYED_SCORE_TOTAL = 40500;
const MIN_PRO_SCREENSHOT_WIDTH = 500;
const SCORE_CONTRAST_THRESHOLDS = [900, 2500, 6400, 10000, 14400];
const SUITS = ["H", "S", "C", "D"];

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

function proFallbackSlotRects(width, height) {
  const layout =
    height / width < 1.9
      ? PRO_CROPPED_BOARD_LAYOUT
      : PRO_FULL_SCREEN_LAYOUT;
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

function colorChroma(color) {
  return Math.max(...color) - Math.min(...color);
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))];
}

function adaptiveChromaThreshold(colors) {
  const chromas = colors.map(colorChroma).filter((chroma) => chroma > 0);
  return Math.max(9, Math.min(25, percentile(chromas, 0.9) * 0.35));
}

function chromaticPointsFromCrop(imageData, rect, crop, topEdge = null) {
  const width = rectWidth(rect);
  const height = rectHeight(rect);
  const xStart = Math.floor(width * crop.xStart);
  const xEnd = Math.ceil(width * crop.xEnd);
  const yStart = Math.floor(height * crop.yStart);
  const yEnd = Math.ceil(height * crop.yEnd);
  const cropWidth = Math.max(1, xEnd - xStart);
  const cropHeight = Math.max(1, yEnd - yStart);
  const samples = [];

  for (let localY = yStart; localY < yEnd; localY += 1) {
    for (let localX = xStart; localX < xEnd; localX += 1) {
      const x = Math.round(rect.left + localX);
      const y = Math.round(
        topEdge ? topEdge.intercept + topEdge.slope * x + localY : rect.top + localY,
      );
      if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) continue;
      samples.push({
        localX: localX - xStart,
        localY: localY - yStart,
        color: pixelAt(imageData, x, y),
      });
    }
  }

  const threshold = adaptiveChromaThreshold(samples.map((sample) => sample.color));
  const selected = samples.filter(
    ({ color }) => Math.max(...color) > 55 && colorChroma(color) >= threshold,
  );
  return {
    width: cropWidth,
    height: cropHeight,
    points: selected.map(({ localX, localY }) => [localX, localY]),
    colorByPoint: new Map(
      selected.map(({ localX, localY, color }) => [`${localX},${localY}`, color]),
    ),
  };
}

function cardSurfaceColor(imageData, rect, topEdge = null) {
  const width = rectWidth(rect);
  const height = rectHeight(rect);
  const samples = [];
  const xStart = Math.floor(width * 0.38);
  const xEnd = Math.ceil(width * 0.62);
  const yStart = Math.floor(height * 0.055);
  const yEnd = Math.ceil(height * 0.18);

  for (let localY = yStart; localY < yEnd; localY += 2) {
    for (let localX = xStart; localX < xEnd; localX += 2) {
      const x = Math.round(rect.left + localX);
      const y = Math.round(
        topEdge ? topEdge.intercept + topEdge.slope * x + localY : rect.top + localY,
      );
      if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) continue;
      samples.push(pixelAt(imageData, x, y));
    }
  }
  if (!samples.length) return [255, 255, 255];
  return [0, 1, 2].map((channel) => median(samples.map((color) => color[channel])));
}

function isRankInk(color, background) {
  const max = Math.max(...color);
  return (
    colorDistance(color, background) > 900 &&
    (colorChroma(color) >= 4 || max < 185)
  );
}

function rankPoints(imageData, rect, crop, topEdge = null) {
  // Face cards use character art in the middle of the card, so only read the
  // small top-left rank glyph. The foreground is measured against this card's
  // own blank surface, so a theme can use any four colors.
  const width = rectWidth(rect);
  const height = rectHeight(rect);
  const background = cardSurfaceColor(imageData, rect, topEdge);
  const xStart = Math.floor(width * crop.xStart);
  const xEnd = Math.ceil(width * crop.xEnd);
  const yStart = Math.floor(height * crop.yStart);
  const yEnd = Math.ceil(height * crop.yEnd);
  const points = [];

  for (let localY = yStart; localY < yEnd; localY += 1) {
    for (let localX = xStart; localX < xEnd; localX += 1) {
      const x = Math.round(rect.left + localX);
      const y = Math.round(
        topEdge ? topEdge.intercept + topEdge.slope * x + localY : rect.top + localY,
      );
      if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) continue;
      if (isRankInk(pixelAt(imageData, x, y), background)) {
        points.push([localX - xStart, localY - yStart]);
      }
    }
  }
  return normalizePoints(points);
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

function rankPointsFromCardFrame(imageData, rect, crop, topEdge) {
  if (!topEdge) return null;
  return rankPoints(imageData, rect, crop, topEdge);
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

function templateRankCandidatesForMask(rawMask) {
  const mask = normalizedRankMask(
    removeArtifactComponents(rawMask ?? { points: [], width: 0, height: 0 }),
  );
  if (!mask) return [];
  return Object.entries(RANK_GLYPH_TEMPLATES)
    .map(([rank, template]) => ({
      rank,
      confidence: rankTemplateScore(mask, template),
    }))
    .sort((first, second) => second.confidence - first.confidence);
}

function templateRankCandidates(imageData, rect, zone) {
  const masks = [];
  const regularCrops = zone === "discard" ? DISCARD_RANK_CROPS : [TEMPLATE_GRID_RANK_CROP, ...GRID_RANK_CROPS];
  const topEdge = zone === "discard" ? cardTopEdgeLine(imageData, rect) : null;
  regularCrops.forEach((crop) => masks.push(rankPoints(imageData, rect, crop, topEdge)));

  if (zone === "discard") {
    TEMPLATE_DISCARD_RANK_CROPS.forEach((crop) => {
      masks.push(rankPointsFromCardFrame(imageData, rect, crop, topEdge));
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

function proDiscardRankPoints(imageData, rect, inkColor) {
  if (!inkColor) return null;
  const width = rectWidth(rect);
  const height = rectHeight(rect);
  const points = [];
  const scanTop = Math.max(0, rect.top - Math.max(24, Math.round(height * 0.3)));
  const right = Math.min(rect.right, Math.round(rect.left + width * 0.46));

  for (let y = scanTop; y < rect.bottom; y += 1) {
    for (let x = rect.left; x < right; x += 1) {
      const color = pixelAt(imageData, x, y);
      if (colorChroma(color) < 5 || colorDistance(color, inkColor) > 6400) continue;
      points.push([x - rect.left, y - scanTop]);
    }
  }
  if (!points.length) return null;

  const firstInkY = Math.min(...points.map(([, y]) => y));
  const rankBandBottom = firstInkY + Math.max(20, Math.round(height * 0.18));
  return normalizePoints(points.filter(([, y]) => y <= rankBandBottom));
}

function proTemplateRankCandidates(imageData, rect, zone, inkColor = null) {
  const topEdge = zone === "discard" ? cardTopEdgeLine(imageData, rect) : null;
  const dynamicDiscardMask =
    zone === "discard" ? proDiscardRankPoints(imageData, rect, inkColor) : null;
  const dynamicDiscardDensity = dynamicDiscardMask?.width && dynamicDiscardMask?.height
    ? dynamicDiscardMask.points.length / (dynamicDiscardMask.width * dynamicDiscardMask.height)
    : 0;
  const masks =
    zone === "discard"
      ? dynamicDiscardMask && dynamicDiscardDensity < 0.72
        ? [dynamicDiscardMask]
        : [
            ...DISCARD_RANK_CROPS.map((crop) => rankPoints(imageData, rect, crop, topEdge)),
            ...TEMPLATE_DISCARD_RANK_CROPS.map((crop) =>
              rankPointsFromCardFrame(imageData, rect, crop, topEdge),
            ),
          ]
      : [rankPoints(imageData, rect, GRID_RANK_CROPS[0])];
  const candidates = new Map();

  masks.forEach((rawMask) => {
    const mask = normalizedRankMask(
      removeArtifactComponents(rawMask ?? { points: [], width: 0, height: 0 }),
    );
    if (!mask) return;
    Object.entries(PRO_RANK_GLYPH_TEMPLATES).forEach(([rank, templates]) => {
      const score = Math.max(...templates.map((template) => rankTemplateScore(mask, template)));
      const existing = candidates.get(rank);
      if (!existing || score > existing.confidence) {
        candidates.set(rank, { rank, confidence: score });
      }
    });
  });

  return [...candidates.values()].sort((first, second) => second.confidence - first.confidence);
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

function connectedComponents8(points, width, height) {
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
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (!offsetX && !offsetY) continue;
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
          const key = `${nextX},${nextY}`;
          if (!filled.has(key)) continue;
          filled.delete(key);
          stack.push([nextX, nextY]);
        }
      }
    }
    components.push(component);
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

  const withoutEdgeLines = components.filter((component) => {
    const xs = component.map(([x]) => x);
    const ys = component.map(([, y]) => y);
    const componentWidth = Math.max(...xs) - Math.min(...xs) + 1;
    const componentHeight = Math.max(...ys) - Math.min(...ys) + 1;
    const componentTop = Math.min(...ys);

    // Tight card detection can put the colored top border inside the rank
    // crop. It appears as a separate one-pixel line and shifts a 6/9's hole
    // far enough left to resemble an A. Remove only that border-shaped
    // artifact; tall secondary components such as the "1" in 10 remain.
    return !(
      componentTop <= 2 &&
      componentHeight <= 2 &&
      componentWidth >= mask.width * 0.75
    );
  });
  const usableComponents = withoutEdgeLines.length ? withoutEdgeLines : components;
  const largest = Math.max(...usableComponents.map((component) => component.length));
  const minimumSize = Math.max(18, largest * 0.12);
  const filteredPoints = usableComponents
    .filter((component) => component.length >= minimumSize)
    .flatMap((component) => component);

  return normalizePoints(filteredPoints) ?? mask;
}

function normalizedSuitMask(points) {
  const normalized = normalizePoints(points);
  if (!normalized) return null;

  const outputWidth = SUIT_GLYPH_MASK_SIZE.width;
  const outputHeight = SUIT_GLYPH_MASK_SIZE.height;
  const padding = 2;
  const innerWidth = outputWidth - padding * 2;
  const innerHeight = outputHeight - padding * 2;
  const scale = Math.min(innerWidth / normalized.width, innerHeight / normalized.height);
  const scaledWidth = Math.max(1, Math.round(normalized.width * scale));
  const scaledHeight = Math.max(1, Math.round(normalized.height * scale));
  const offsetX = Math.floor((outputWidth - scaledWidth) / 2);
  const offsetY = Math.floor((outputHeight - scaledHeight) / 2);
  const filled = new Set(normalized.points.map(([x, y]) => `${x},${y}`));
  const output = new Uint8Array(outputWidth * outputHeight);

  for (let targetY = 0; targetY < scaledHeight; targetY += 1) {
    const sourceYStart = Math.floor((targetY * normalized.height) / scaledHeight);
    const sourceYEnd = Math.max(
      sourceYStart + 1,
      Math.ceil(((targetY + 1) * normalized.height) / scaledHeight),
    );
    for (let targetX = 0; targetX < scaledWidth; targetX += 1) {
      const sourceXStart = Math.floor((targetX * normalized.width) / scaledWidth);
      const sourceXEnd = Math.max(
        sourceXStart + 1,
        Math.ceil(((targetX + 1) * normalized.width) / scaledWidth),
      );
      let hit = false;
      for (let sourceY = sourceYStart; sourceY < sourceYEnd && !hit; sourceY += 1) {
        for (let sourceX = sourceXStart; sourceX < sourceXEnd; sourceX += 1) {
          if (!filled.has(`${sourceX},${sourceY}`)) continue;
          hit = true;
          break;
        }
      }
      if (hit) output[(offsetY + targetY) * outputWidth + offsetX + targetX] = 1;
    }
  }

  return output;
}

function cosineMaskScore(mask, template) {
  let intersection = 0;
  let maskCount = 0;
  let templateCount = 0;
  for (let index = 0; index < mask.length; index += 1) {
    maskCount += mask[index];
    templateCount += template[index];
    intersection += mask[index] & template[index];
  }
  return maskCount && templateCount ? intersection / Math.sqrt(maskCount * templateCount) : 0;
}

function componentBounds(component) {
  const xs = component.map(([x]) => x);
  const ys = component.map(([, y]) => y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return {
    left,
    right,
    top,
    bottom,
    width: right - left + 1,
    height: bottom - top + 1,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

function componentInkColor(component, colorByPoint) {
  const colors = component
    .map(([x, y]) => colorByPoint.get(`${x},${y}`))
    .filter(Boolean)
    .sort((first, second) => colorChroma(second) - colorChroma(first));
  const strongest = colors.slice(0, Math.max(1, Math.ceil(colors.length * 0.4)));
  if (!strongest.length) return null;
  return [0, 1, 2].map((channel) => Math.round(median(strongest.map((color) => color[channel]))));
}

function classifySuit(imageData, rect, zone) {
  const crop =
    zone === "discard"
      ? { xStart: 0.48, xEnd: 0.98, yStart: -0.04, yEnd: 0.3 }
      : { xStart: 0.48, xEnd: 0.98, yStart: 0, yEnd: 0.3 };
  const topEdge = zone === "discard" ? cardTopEdgeLine(imageData, rect) : null;
  const glyphCrop = chromaticPointsFromCrop(imageData, rect, crop, topEdge);
  const components = connectedComponents8(glyphCrop.points, glyphCrop.width, glyphCrop.height);
  const candidates = [];

  components.forEach((component) => {
    const bounds = componentBounds(component);
    const aspect = Math.max(bounds.width / bounds.height, bounds.height / bounds.width);
    if (component.length < 3 || bounds.width < 2 || bounds.height < 2) return;
    if (bounds.width > glyphCrop.width * 0.6 || bounds.height > glyphCrop.height * 0.8) return;
    if (aspect >= 2.8) return;

    const mask = normalizedSuitMask(component);
    if (!mask) return;
    const suitScores = Object.fromEntries(
      Object.entries(SUIT_GLYPH_TEMPLATES).map(([suit, template]) => [
        suit,
        cosineMaskScore(mask, template),
      ]),
    );
    const ranked = Object.entries(suitScores).sort((a, b) => b[1] - a[1]);
    const normalizedCenterX = bounds.centerX / glyphCrop.width;
    const normalizedCenterY = bounds.centerY / glyphCrop.height;
    const centerDistance = Math.hypot(normalizedCenterX - 0.62, normalizedCenterY - 0.55);
    const touchesEdge =
      bounds.left <= 1 ||
      bounds.top <= 1 ||
      bounds.right >= glyphCrop.width - 2 ||
      bounds.bottom >= glyphCrop.height - 2;
    const selectionScore =
      ranked[0][1] +
      Math.min(0.06, component.length / Math.max(1, glyphCrop.width * glyphCrop.height)) -
      centerDistance * 0.04 -
      (touchesEdge ? 0.08 : 0);
    candidates.push({
      suit: ranked[0][0],
      confidence: ranked[0][1],
      margin: ranked[0][1] - ranked[1][1],
      suitScores,
      inkColor: componentInkColor(component, glyphCrop.colorByPoint),
      selectionScore,
    });
  });

  const best = candidates.sort((first, second) => second.selectionScore - first.selectionScore)[0];
  if (!best || best.confidence < MIN_SUIT_GLYPH_SCORE) {
    return {
      suit: null,
      confidence: best?.confidence ?? 0,
      margin: best?.margin ?? 0,
      suitScores: best?.suitScores ?? Object.fromEntries(SUITS.map((suit) => [suit, 0])),
      inkColor: best?.inkColor ?? null,
    };
  }
  return best;
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

function classifyRankCandidate(imageData, rect, crop, topEdge = null) {
  const rawMask = rankPoints(imageData, rect, crop, topEdge);
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
    upperLeft: points.filter(([x, y]) => x < width * 0.42 && y < height * 0.5).length,
    upperRight: points.filter(([x, y]) => x >= width * 0.58 && y < height * 0.5).length,
    lowerLeft: points.filter(([x, y]) => x < width * 0.42 && y >= height * 0.5).length,
    lowerRight: points.filter(([x, y]) => x >= width * 0.58 && y >= height * 0.5).length,
  };

  return classifyRank(features);
}

function classifyRankFromSlot(imageData, rect, zone) {
  const templateCandidates = templateRankCandidates(imageData, rect, zone);
  const bestTemplate = templateCandidates[0];
  const crops = zone === "discard" ? DISCARD_RANK_CROPS : GRID_RANK_CROPS;
  const topEdge = zone === "discard" ? cardTopEdgeLine(imageData, rect) : null;
  const candidates = crops.map((crop) =>
    classifyRankCandidate(imageData, rect, crop, topEdge),
  );
  const rankedCandidates = candidates
    .filter((candidate) => candidate?.rank)
    .sort((a, b) => b.confidence - a.confidence);

  // The first grid crop is intentionally tight around the corner rank. When
  // a wider crop contains a recolored antialiasing fragment, the overall
  // template can fall below the normal floor and the generic shape heuristic
  // can confuse a 7 with J. A distinct focused match is better evidence than
  // that low-score fallback.
  const focusedTemplateCandidates =
    zone === "grid"
      ? templateRankCandidatesForMask(rankPoints(imageData, rect, GRID_RANK_CROPS[0]))
      : [];
  const focusedTemplate = focusedTemplateCandidates[0];
  const focusedMargin =
    (focusedTemplate?.confidence ?? 0) -
    (focusedTemplateCandidates[1]?.confidence ?? 0);
  if (
    (!bestTemplate || bestTemplate.confidence < MIN_TEMPLATE_RANK_SCORE) &&
    focusedTemplate?.confidence >= MIN_FOCUSED_TEMPLATE_RANK_SCORE &&
    focusedMargin >= MIN_FOCUSED_TEMPLATE_RANK_MARGIN
  ) {
    const alternatives = rankedCandidates
      .filter((candidate) => candidate.rank !== focusedTemplate.rank)
      .concat(templateCandidates, focusedTemplateCandidates.slice(1))
      .sort((a, b) => b.confidence - a.confidence)
      .filter(
        (candidate, index, all) =>
          candidate.rank !== focusedTemplate.rank &&
          all.findIndex((entry) => entry.rank === candidate.rank) === index,
      )
      .slice(0, 8);
    return {
      ...focusedTemplate,
      confidence: Math.max(0.62, focusedTemplate.confidence),
      alternatives,
    };
  }

  if (bestTemplate?.confidence >= MIN_TEMPLATE_RANK_SCORE) {
    // The 0.52 overlap floor was established from verified glyph fixtures;
    // raw Dice overlap is not itself a probability. Put an accepted template
    // on the same calibrated confidence scale as the heuristic recognizer.
    // Margin and heuristic agreement remain useful supporting evidence and
    // alternatives are retained for deck-level conflict resolution.
    const confidence = Math.max(0.62, bestTemplate.confidence);
    const alternatives = rankedCandidates
      .filter((candidate) => candidate.rank !== bestTemplate.rank)
      .concat(templateCandidates.slice(1))
      .sort((a, b) => b.confidence - a.confidence)
      .filter(
        (candidate, index, all) =>
          all.findIndex((entry) => entry.rank === candidate.rank) === index,
      )
      .slice(0, 8);
    return { ...bestTemplate, confidence, alternatives };
  }

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
  const suitResult = classifySuit(imageData, rect, zone);
  const rankResult = classifyRankFromSlot(imageData, rect, zone);
  const rankMargin =
    rankResult.confidence - (rankResult.alternatives?.[0]?.confidence ?? 0);
  return {
    cardId: rankResult.rank && suitResult.suit ? `${rankResult.rank}${suitResult.suit}` : null,
    rank: rankResult.rank,
    suit: suitResult.suit,
    confidence: Math.min(suitResult.confidence, rankResult.confidence),
    rankConfidence: rankResult.confidence,
    rankMargin,
    suitConfidence: suitResult.confidence,
    suitMargin: suitResult.margin,
    suitScores: suitResult.suitScores,
    inkColor: suitResult.inkColor,
    alternatives: rankResult.alternatives.map((alternative) => ({
      cardId: suitResult.suit ? `${alternative.rank}${suitResult.suit}` : null,
      rank: alternative.rank,
      suit: suitResult.suit,
      confidence: Math.min(suitResult.confidence, alternative.confidence),
    })),
  };
}

function recognizeProSlot(imageData, rect, zone) {
  const suitResult = classifySuit(imageData, rect, zone);
  const proCandidates = proTemplateRankCandidates(
    imageData,
    rect,
    zone,
    suitResult.inkColor,
  );
  const templateRank = proCandidates[0];
  const genericRank = classifyRankFromSlot(imageData, rect, zone);
  const useTemplate = templateRank?.confidence >= 0.48;
  const rankResult = useTemplate
    ? {
        ...templateRank,
        confidence: Math.max(0.62, templateRank.confidence),
        alternatives: proCandidates.slice(1, 9),
      }
    : genericRank;
  const rankMargin = useTemplate
    ? templateRank.confidence - (proCandidates[1]?.confidence ?? 0)
    : rankResult.confidence - (rankResult.alternatives?.[0]?.confidence ?? 0);

  return {
    cardId: rankResult.rank && suitResult.suit ? `${rankResult.rank}${suitResult.suit}` : null,
    rank: rankResult.rank,
    suit: suitResult.suit,
    confidence: Math.min(suitResult.confidence, rankResult.confidence),
    rankConfidence: rankResult.confidence,
    rankMargin,
    suitConfidence: suitResult.confidence,
    suitMargin: suitResult.margin,
    suitScores: suitResult.suitScores,
    inkColor: suitResult.inkColor,
    alternatives: rankResult.alternatives.map((alternative) => ({
      cardId: suitResult.suit ? `${alternative.rank}${suitResult.suit}` : null,
      rank: alternative.rank,
      suit: suitResult.suit,
      confidence: Math.min(
        suitResult.confidence,
        Math.max(0.58, alternative.confidence),
      ),
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

function colorVectorDistance(first, second) {
  return Math.sqrt(colorDistance(first, second));
}

function meanColor(colors) {
  return [0, 1, 2].map(
    (channel) => colors.reduce((sum, color) => sum + color[channel], 0) / colors.length,
  );
}

function anonymousColorClusters(slots) {
  const entries = slots.filter(
    (slot) => slot.inkColor?.length === 3 && slot.suitScores && slot.rank,
  );
  if (entries.length < 8) return null;

  const seeds = [[...entries[0].inkColor]];
  while (seeds.length < 4) {
    const next = entries
      .map((entry) => ({
        color: entry.inkColor,
        distance: Math.min(...seeds.map((seed) => colorVectorDistance(entry.inkColor, seed))),
      }))
      .sort((first, second) => second.distance - first.distance)[0];
    if (!next || next.distance < 1) return null;
    seeds.push([...next.color]);
  }

  let centroids = seeds;
  let assignments = [];
  for (let iteration = 0; iteration < 12; iteration += 1) {
    assignments = entries.map((entry) => {
      let bestIndex = 0;
      let bestDistance = Infinity;
      centroids.forEach((centroid, index) => {
        const distance = colorVectorDistance(entry.inkColor, centroid);
        if (distance >= bestDistance) return;
        bestIndex = index;
        bestDistance = distance;
      });
      return bestIndex;
    });
    const nextCentroids = centroids.map((centroid, index) => {
      const colors = entries
        .filter((_, entryIndex) => assignments[entryIndex] === index)
        .map((entry) => entry.inkColor);
      return colors.length ? meanColor(colors) : centroid;
    });
    const movement = nextCentroids.reduce(
      (sum, centroid, index) => sum + colorVectorDistance(centroid, centroids[index]),
      0,
    );
    centroids = nextCentroids;
    if (movement < 0.1) break;
  }

  const clusters = centroids.map((centroid, clusterIndex) => ({
    centroid,
    entries: entries.filter((_, entryIndex) => assignments[entryIndex] === clusterIndex),
  }));
  if (clusters.some((cluster) => !cluster.entries.length)) return null;

  const maximumWithin = Math.max(
    ...clusters.flatMap((cluster) =>
      cluster.entries.map((entry) => colorVectorDistance(entry.inkColor, cluster.centroid)),
    ),
  );
  let minimumBetween = Infinity;
  for (let first = 0; first < centroids.length; first += 1) {
    for (let second = first + 1; second < centroids.length; second += 1) {
      minimumBetween = Math.min(
        minimumBetween,
        colorVectorDistance(centroids[first], centroids[second]),
      );
    }
  }
  if (minimumBetween < Math.max(18, maximumWithin * 2.2)) return null;

  return clusters;
}

function permutations(values) {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) =>
    permutations(values.filter((_, otherIndex) => otherIndex !== index)).map((tail) => [
      value,
      ...tail,
    ]),
  );
}

function calibrateSuitsFromScreenshotColors(slots) {
  const clusters = anonymousColorClusters(slots);
  if (!clusters) return false;

  const mappings = permutations(SUITS)
    .map((suits) => ({
      suits,
      score: clusters.reduce(
        (total, cluster, clusterIndex) =>
          total +
          cluster.entries.reduce(
            (sum, slot) => sum + (slot.suitScores?.[suits[clusterIndex]] ?? 0),
            0,
          ),
        0,
      ),
    }))
    .sort((first, second) => second.score - first.score);
  const mappingMargin = mappings[0]?.score - (mappings[1]?.score ?? 0);
  if (!mappings[0] || mappingMargin < 0.05) return false;

  let changed = false;
  clusters.forEach((cluster, clusterIndex) => {
    const suit = mappings[0].suits[clusterIndex];
    const clusterConfidence =
      cluster.entries.reduce((sum, slot) => sum + (slot.suitScores?.[suit] ?? 0), 0) /
      cluster.entries.length;
    cluster.entries.forEach((slot) => {
      if (slot.suit !== suit) changed = true;
      slot.suit = suit;
      // Once four compact anonymous color groups agree on a unique one-to-one
      // shape mapping, the screenshot supplies repeated evidence for every
      // member of that group. Keep the raw silhouette score for diagnostics,
      // but calibrate the combined evidence above the manual-review floor.
      slot.suitConfidence = Math.max(
        slot.suitScores?.[suit] ?? 0,
        clusterConfidence,
        0.62,
      );
      slot.confidence = Math.min(slot.rankConfidence ?? slot.confidence, slot.suitConfidence);
      slot.cardId = slot.rank ? `${slot.rank}${suit}` : null;
      slot.alternatives = (slot.alternatives ?? []).map((alternative) => ({
        ...alternative,
        cardId: alternative.rank ? `${alternative.rank}${suit}` : null,
        suit,
        confidence: Math.min(slot.suitConfidence, alternative.confidence),
      }));
    });
  });
  return changed;
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

function clearIndistinguishableConflictGroups(slots) {
  const groups = new Map();
  slots.forEach((slot) => {
    if (!slot.cardId) return;
    groups.set(slot.cardId, [...(groups.get(slot.cardId) ?? []), slot]);
  });

  let changed = false;
  groups.forEach((group) => {
    if (group.length < 3) return;
    const profiles = group.map((slot) =>
      rankedSlotCandidates(slot)
        .slice(0, 6)
        .map((candidate) => `${candidate.cardId}:${candidate.confidence.toFixed(2)}`)
        .join("|"),
    );
    if (!profiles.every((profile) => profile === profiles[0])) return;

    // Three or more pixel-identical "cards" are usually a repeated UI patch
    // (the Finish button caused this exact failure), not independent card
    // evidence. Do not manufacture a legal-looking set from identical
    // alternatives; leave the slots unknown and require review.
    group.forEach((slot) => {
      clearRecognizedSlot(slot);
      slot.alternatives = [];
    });
    changed = true;
  });
  return changed;
}

function resolveDeckConflicts(slots) {
  const recognizedCards = slots.map((slot) => slot.cardId).filter(Boolean);
  const needsResolution = recognizedCards.length !== slots.length || new Set(recognizedCards).size !== recognizedCards.length;
  if (!needsResolution) return false;

  let changed = clearIndistinguishableConflictGroups(slots);
  const slotsBySuit = new Map();
  slots.forEach((slot) => {
    if (!slot.suit || (!slot.cardId && !slot.alternatives?.length)) return;
    slotsBySuit.set(slot.suit, [...(slotsBySuit.get(slot.suit) ?? []), slot]);
  });

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
  // Card borders, ranks, and suits remain chromatic across Puzzmo themes.
  // Geometry detection only needs to know that a pixel is colored; it must
  // never attach a fixed semantic suit to that color.
  return max >= 55 && colorChroma(color) >= 12;
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

function discardRowRecognitionScore(slots, expectedCount) {
  const recognizedCards = slots.map((slot) => slot.cardId).filter(Boolean);
  const uniqueCards = new Set(recognizedCards);
  const confidence = slots.reduce((sum, slot) => sum + slot.confidence, 0);
  const duplicateCount = recognizedCards.length - uniqueCards.size;

  // A real tray can repeat a rank or suit, but never the exact same card.
  // Reward four distinct, visually supported reads so a solid-color control
  // cannot masquerade as four identical cards and then be "repaired" by the
  // deck constraint solver.
  return (
    confidence +
    uniqueCards.size * 0.1 +
    (recognizedCards.length === expectedCount ? 0.2 : 0) -
    duplicateCount * 0.35
  );
}

function refineDiscardRects(
  imageData,
  discardRects,
  expectedCount = 4,
  recognize = recognizeSlot,
  maxOffsetRatio = 0.65,
) {
  if (discardRects.length !== expectedCount) return discardRects;

  const nominalHeight = median(discardRects.map(rectHeight));
  if (!nominalHeight) return discardRects;

  const nominalSlots = discardRects.map((rect) => recognize(imageData, rect, "discard"));
  const nominalCards = nominalSlots.map((slot) => slot.cardId).filter(Boolean);
  const nominalScore = discardRowRecognitionScore(nominalSlots, expectedCount);
  if (
    nominalCards.length === expectedCount &&
    new Set(nominalCards).size === expectedCount &&
    expectedCount === 4 &&
    nominalScore >= 3.7
  ) {
    return discardRects;
  }

  const step = Math.max(2, Math.round(nominalHeight * 0.03));
  const firstOffset = Math.round(nominalHeight * -0.15);
  const lastOffset = Math.round(nominalHeight * maxOffsetRatio);
  let best = { rects: discardRects, score: nominalScore };

  for (let offset = firstOffset; offset <= lastOffset; offset += step) {
    const rects = discardRects.map((rect) =>
      clampRect(
        {
          left: rect.left,
          top: rect.top + offset,
          right: rect.right,
          bottom: rect.bottom + offset,
        },
        imageData.width,
        imageData.height,
      ),
    );
    const slots = rects.map((rect) => recognize(imageData, rect, "discard"));
    const score = discardRowRecognitionScore(slots, expectedCount);
    if (score > best.score) best = { rects, score };
  }

  return best.rects;
}

function shiftSlotRects(rects, dx, dy, width, height) {
  return rects.map((rect) =>
    clampRect(
      {
        left: rect.left + dx,
        top: rect.top + dy,
        right: rect.right + dx,
        bottom: rect.bottom + dy,
      },
      width,
      height,
    ),
  );
}

function proGridAlignmentScore(imageData, rects) {
  // Eight cards spread across the board are enough to align the shared frame.
  // Sampling keeps upload latency low while avoiding the Joker-prone center.
  const alignmentSampleIndices = [1, 3, 5, 9, 15, 19, 21, 23];
  const slots = alignmentSampleIndices.map((index) =>
    recognizeProSlot(imageData, rects[index], "grid"),
  );
  const recognizedCards = slots.map((slot) => slot.cardId).filter(Boolean);
  const duplicateCount = recognizedCards.length - new Set(recognizedCards).size;
  return (
    slots.reduce(
      (sum, slot) =>
        sum +
        slot.rankConfidence +
        slot.suitConfidence +
        Math.max(-0.1, Math.min(0.1, slot.rankMargin ?? 0)) * 3,
      0,
    ) +
    recognizedCards.length * 0.04 -
    duplicateCount * 0.2
  );
}

function scaledAlignmentOffsets(radius, scale) {
  return [
    ...new Set(
      Array.from({ length: radius * 2 + 1 }, (_, index) =>
        Math.round((index - radius) * scale),
      ),
    ),
  ];
}

function alignProFallbackRects(imageData, fallbackRects) {
  const horizontalOffsets = scaledAlignmentOffsets(4, imageData.width / 588);
  const verticalOffsets = scaledAlignmentOffsets(5, imageData.height / 1280);
  let best = {
    grid: fallbackRects.grid,
    discard: fallbackRects.discard,
    score: proGridAlignmentScore(imageData, fallbackRects.grid),
  };

  verticalOffsets.forEach((dy) => {
    const grid = shiftSlotRects(
      fallbackRects.grid,
      0,
      dy,
      imageData.width,
      imageData.height,
    );
    const score = proGridAlignmentScore(imageData, grid);
    if (score <= best.score) return;
    best = {
      grid,
      discard: shiftSlotRects(
        fallbackRects.discard,
        0,
        dy,
        imageData.width,
        imageData.height,
      ),
      score,
    };
  });

  const verticalBest = best;
  horizontalOffsets.forEach((dx) => {
    const grid = shiftSlotRects(
      verticalBest.grid,
      dx,
      0,
      imageData.width,
      imageData.height,
    );
    const score = proGridAlignmentScore(imageData, grid);
    if (score <= best.score) return;
    best = {
      grid,
      discard: shiftSlotRects(
        verticalBest.discard,
        dx,
        0,
        imageData.width,
        imageData.height,
      ),
      score,
    };
  });

  const horizontalBest = best;
  verticalOffsets.forEach((dy) => {
    const grid = shiftSlotRects(
      horizontalBest.grid,
      0,
      dy,
      imageData.width,
      imageData.height,
    );
    const score = proGridAlignmentScore(imageData, grid);
    if (score <= best.score) return;
    best = {
      grid,
      discard: shiftSlotRects(
        horizontalBest.discard,
        0,
        dy,
        imageData.width,
        imageData.height,
      ),
      score,
    };
  });

  return { grid: best.grid, discard: best.discard };
}

function slotRects(imageData) {
  const rects = detectSlotRects(imageData) ?? fallbackSlotRects(imageData.width, imageData.height);
  return {
    ...rects,
    discard: refineDiscardRects(imageData, rects.discard),
  };
}

function medianChannel(values) {
  return median(values.map(Number));
}

function scoreForegroundMask(imageData, rect, contrastThreshold = SCORE_CONTRAST_THRESHOLDS[0]) {
  const borderSamples = [];
  const inset = Math.max(1, Math.min(6, Math.floor(Math.min(rectWidth(rect), rectHeight(rect)) * 0.08)));
  const xPositions = [rect.left + inset, (rect.left + rect.right) / 2, rect.right - inset - 1].map(Math.round);
  const yPositions = [rect.top + inset, rect.top + rectHeight(rect) * 0.22, rect.bottom - inset - 1].map(Math.round);

  xPositions.forEach((x) => {
    borderSamples.push(pixelAt(imageData, x, yPositions[0]));
    borderSamples.push(pixelAt(imageData, x, yPositions[2]));
  });
  yPositions.forEach((y) => {
    borderSamples.push(pixelAt(imageData, xPositions[0], y));
    borderSamples.push(pixelAt(imageData, xPositions[2], y));
  });

  const background = [0, 1, 2].map((channel) => medianChannel(borderSamples.map((color) => color[channel])));
  const points = [];

  for (let y = rect.top; y < rect.bottom; y += 1) {
    for (let x = rect.left; x < rect.right; x += 1) {
      const color = pixelAt(imageData, x, y);
      const contrast = colorDistance(color, background);
      // Score text is neutral black/white. Excluding saturated pixels keeps the
      // nearby yellow brackets and colorful card borders out of the OCR mask.
      if (contrast > contrastThreshold && Math.max(...color) - Math.min(...color) < 32) {
        points.push([x - rect.left, y - rect.top]);
      }
    }
  }

  return points;
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

function normalizedScoreGlyphMask(box) {
  const sourceWidth = box.right - box.left;
  const sourceHeight = box.bottom - box.top;
  const points = box.points ?? [];
  if (!sourceWidth || !sourceHeight || !points.length) return null;

  const filled = new Set(points.map(([x, y]) => `${x},${y}`));
  const width = SCORE_GLYPH_MASK_SIZE.width;
  const height = SCORE_GLYPH_MASK_SIZE.height;
  const normalized = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const yStart = Math.floor((y * sourceHeight) / height);
    const yEnd = Math.max(yStart + 1, Math.ceil(((y + 1) * sourceHeight) / height));
    for (let x = 0; x < width; x += 1) {
      const xStart = Math.floor((x * sourceWidth) / width);
      const xEnd = Math.max(xStart + 1, Math.ceil(((x + 1) * sourceWidth) / width));
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

function classifyScoreGlyph(box) {
  const mask = normalizedScoreGlyphMask(box);
  if (mask) {
    const candidates = Object.entries(SCORE_GLYPH_TEMPLATES)
      .flatMap(([digit, templates]) =>
        templates.map((template) => ({ digit, confidence: rankTemplateScore(mask, template) })),
      )
      .sort((a, b) => b.confidence - a.confidence);
    if (candidates[0]?.confidence >= 0.58) return candidates[0].digit;
  }
  return classifyScoreDigit(scoreDigitFeatures(box));
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
  if (right > left * 1.4 && bottom >= top * 0.6) return "3";
  if (left > right * 1.2 && bottom >= top * 0.6) return "5";

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
    lowerLeft > lowerRight * 0.72,
    lowerRight > lowerLeft * 0.72,
  ].map(Boolean);
  const best = Object.entries(expected)
    .map(([digit, pattern]) => ({
      digit,
      distance: pattern.reduce((sum, bit, index) => sum + (Boolean(bit) === observed[index] ? 0 : 1), 0),
    }))
    .sort((a, b) => a.distance - b.distance)[0];

  if (best?.distance <= 2) return best.digit;
  return null;
}

function displayedScoreTotalFromDigits(digits) {
  if (!/^\d{3,5}$/.test(digits)) return null;
  const value = Number(digits);
  if (!Number.isFinite(value) || value > MAX_DISPLAYED_SCORE_TOTAL || !isPayoutFeasibleTotal(value)) return null;
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

function stripAttachedComma(box, expectedHeight) {
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  if (!box.points?.length || height <= expectedHeight + 1) return null;

  const cutoffY = Math.max(1, expectedHeight - 2);
  const cutoffX = Math.max(1, Math.ceil(width * 0.45));
  const points = box.points.filter(([x, y]) => !(x < cutoffX && y >= cutoffY));
  if (points.length < box.points.length * 0.55) return null;

  const minX = Math.min(...points.map(([x]) => x));
  const maxX = Math.max(...points.map(([x]) => x));
  const minY = Math.min(...points.map(([, y]) => y));
  const maxY = Math.max(...points.map(([, y]) => y));
  return {
    left: 0,
    top: 0,
    right: maxX - minX + 1,
    bottom: maxY - minY + 1,
    size: points.length,
    points: points.map(([x, y]) => [x - minX, y - minY]),
  };
}

function classifyScoreGlyphInRow(box, expectedHeight) {
  const withoutComma = stripAttachedComma(box, expectedHeight);
  if (withoutComma) {
    const structuralDigit = classifyScoreDigit(scoreDigitFeatures(withoutComma));
    if (structuralDigit) return structuralDigit;
  }
  return classifyScoreGlyph(box);
}

function readScoreTotalFromBoxes(boxes) {
  const tallest = Math.max(0, ...boxes.map((box) => box.bottom - box.top));
  const digitBoxes = boxes.filter(
    (box) =>
      box.bottom - box.top >= Math.max(8, tallest * 0.55) &&
      box.right - box.left >= 3,
  );
  const rows = groupTextBoxesByRow(digitBoxes);
  const candidates = rows
    .map((row) => {
      const numericBoxes = row.boxes
        .sort((a, b) => a.left - b.left)
        // The first tall glyph is the dollar sign. A detached comma is filtered
        // above because it is much shorter than the digits.
        .slice(1);
      const expectedHeight = median(numericBoxes.map((box) => box.bottom - box.top));
      const glyphs = numericBoxes.map((box) => classifyScoreGlyphInRow(box, expectedHeight));
      const rowDigits = glyphs.every(Boolean) ? glyphs.join("") : "";
      return {
        centerY: row.centerY,
        value: displayedScoreTotalFromDigits(rowDigits),
      };
    })
    .filter((candidate) => candidate.value !== null)
    .sort((a, b) => b.centerY - a.centerY);

  return candidates[0]?.value ?? null;
}

function readHandCountFromBoxes(boxes) {
  const rows = groupTextBoxesByRow(boxes)
    .map((row) => ({
      centerY: row.centerY,
      boxes: row.boxes
        .filter((box) => box.bottom - box.top >= 8)
        .sort((a, b) => a.left - b.left),
    }))
    .sort((a, b) => a.centerY - b.centerY);

  for (const row of rows) {
    if (row.boxes.length < 2) continue;
    const firstTwo = row.boxes.slice(0, 2).map(classifyScoreGlyph);
    if (firstTwo.join("") === "10") return 10;
  }

  return null;
}

function consensusValue(values, minimumVotes = 1) {
  const counts = new Map();
  values.filter((value) => value !== null).forEach((value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const best = ranked[0];
  if (!best || best[1] < minimumVotes || ranked[1]?.[1] === best[1]) return null;
  return best[0];
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
          top: gridTop - cardHeight * 0.44,
          right: gridRight + cardWidth * 0.1,
          bottom: gridTop - cardHeight * 0.18,
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

function recognizeDisplayedScore(imageData, rects, options = {}) {
  const { hand: handRect, total: totalRect } = displayedScoreRects(imageData, rects);
  const handReads = SCORE_CONTRAST_THRESHOLDS.map((contrastThreshold) =>
    readHandCountFromBoxes(
      textComponentBoxes(
        scoreForegroundMask(imageData, handRect, contrastThreshold),
        handRect.right - handRect.left,
        handRect.bottom - handRect.top,
      ),
    ),
  );
  const handCount = consensusValue(handReads, 2);
  const totalReads = SCORE_CONTRAST_THRESHOLDS.map((contrastThreshold) =>
    readScoreTotalFromBoxes(
      textComponentBoxes(
      scoreForegroundMask(imageData, totalRect, contrastThreshold),
      totalRect.right - totalRect.left,
      totalRect.bottom - totalRect.top,
      ),
    ),
  ).map((total) => {
    if (total === null) return null;
    return Number.isFinite(handCount) && options.validatePayout !== false
      ? isPayoutFeasibleForHandCount(total, handCount)
        ? total
        : null
      : total;
  });

  return {
    handCount,
    // Nested contrast masks are corroborating reads, not independent OCR
    // engines. Require a unique repeated result; tied values are untrusted.
    total: consensusValue(totalReads, 2),
  };
}

function proDisplayedScoreRects(imageData, rects) {
  const gridRight = Math.max(...rects.grid.map((rect) => rect.right));
  const gridTop = Math.min(...rects.grid.map((rect) => rect.top));
  const cardWidth = median(rects.grid.map(rectWidth));
  const cardHeight = median(rects.grid.map(rectHeight));
  return {
    hand: clampRect(
      {
        left: gridRight - cardWidth * 0.84,
        top: gridTop - cardHeight * 0.46,
        right: gridRight - cardWidth * 0.54,
        bottom: gridTop - cardHeight * 0.27,
      },
      imageData.width,
      imageData.height,
    ),
    total: clampRect(
      {
        left: gridRight - cardWidth * 0.84,
        top: gridTop - cardHeight * 0.3,
        right: gridRight + cardWidth * 0.1,
        bottom: gridTop - cardHeight * 0.12,
      },
      imageData.width,
      imageData.height,
    ),
  };
}

function neutralTextPoints(imageData, rect, luminanceThreshold) {
  const points = [];
  for (let y = rect.top; y < rect.bottom; y += 1) {
    for (let x = rect.left; x < rect.right; x += 1) {
      const color = pixelAt(imageData, x, y);
      const luminance = (color[0] + color[1] + color[2]) / 3;
      if (luminance < luminanceThreshold && colorChroma(color) < 35) {
        points.push([x - rect.left, y - rect.top]);
      }
    }
  }
  return points;
}

function scoreRectHasDarkBackground(imageData, rect) {
  const inset = Math.max(
    1,
    Math.min(6, Math.floor(Math.min(rectWidth(rect), rectHeight(rect)) * 0.08)),
  );
  const xPositions = [
    rect.left + inset,
    (rect.left + rect.right) / 2,
    rect.right - inset - 1,
  ].map(Math.round);
  const yPositions = [
    rect.top + inset,
    rect.top + rectHeight(rect) * 0.22,
    rect.bottom - inset - 1,
  ].map(Math.round);
  const luminances = [];

  xPositions.forEach((x) => {
    [yPositions[0], yPositions[2]].forEach((y) => {
      const color = pixelAt(imageData, x, y);
      luminances.push((color[0] + color[1] + color[2]) / 3);
    });
  });
  yPositions.forEach((y) => {
    [xPositions[0], xPositions[2]].forEach((x) => {
      const color = pixelAt(imageData, x, y);
      luminances.push((color[0] + color[1] + color[2]) / 3);
    });
  });

  return median(luminances) < 128;
}

function classifyProScoreDigit(box) {
  const features = scoreDigitFeatures(box);
  const template = classifyScoreGlyph(box);
  const structural = classifyScoreDigit(features);
  // The shared template corpus does not yet contain 3 or 6. Prefer the
  // structural read for those two shapes instead of snapping them to 8.
  if (structural === "3" || structural === "6") return structural;
  if (features.holes.length === 0 && structural) return structural;
  return template ?? structural;
}

function selectProDisplayedScoreTotal(candidates, handCount) {
  const finiteCandidates = candidates.filter(Number.isFinite);
  if (!finiteCandidates.length) return null;
  if (Number.isInteger(handCount)) {
    const feasible = finiteCandidates.find((total) =>
      isProDisplayedScorePairFeasible(total, handCount),
    );
    if (Number.isFinite(feasible)) return feasible;
  }
  return finiteCandidates[0];
}

function readProScoreTotalFromBoxes(boxes, handCount = null) {
  const tallest = Math.max(0, ...boxes.map((box) => box.bottom - box.top));
  const glyphBoxes = boxes
    .filter(
      (box) =>
        box.bottom - box.top >= Math.max(7, tallest * 0.55) &&
        box.right - box.left >= 3,
    )
    .sort((first, second) => first.left - second.left);
  // The dollar sign normally occupies one full-height component, but JPEG
  // ringing can split it into two. Decode both plausible starts and use the
  // separately recognized hand count to reject an impossible extra leading 1.
  const candidates = [1, 2].map((leadingGlyphCount) => {
    const digits = glyphBoxes.slice(leadingGlyphCount).map(classifyProScoreDigit);
    if (!digits.length || digits.some((digit) => !digit)) return null;
    const text = digits.join("");
    if (!/^\d{3,6}$/.test(text)) return null;
    const value = Number(text);
    return Number.isFinite(value) && value <= MAX_PRO_DISPLAYED_SCORE_TOTAL ? value : null;
  });
  return selectProDisplayedScoreTotal(candidates, handCount);
}

function readProHandCountFromBoxes(boxes, preferStructural = false) {
  const digits = boxes
    .filter((box) => {
      const width = box.right - box.left;
      const height = box.bottom - box.top;
      const occupancy = (box.points?.length ?? box.size ?? 0) / Math.max(1, width * height);
      return height >= 7 && occupancy < 0.92;
    })
    .sort((first, second) => first.left - second.left)
    .map((box) =>
      preferStructural
        ? classifyProScoreDigit(box)
        : classifyScoreGlyph(box),
    )
    .filter(Boolean)
    .join("");
  if (!/^\d{1,2}$/.test(digits)) return null;
  const value = Number(digits);
  return value >= 0 && value <= 12 ? value : null;
}

function isProDisplayedScorePairFeasible(total, handCount) {
  if (
    !Number.isFinite(total) ||
    !Number.isInteger(handCount) ||
    handCount < 0 ||
    handCount > 12
  ) {
    return false;
  }
  if (handCount === 0) return total === 0;

  const multiplier = proMultiplierForHandCount(handCount);
  // Every scoring hand is worth at least a pair ($5), and every Pro hand
  // value is a multiple of $5. The maximum regular hand is $450; the corner
  // hand can contribute one extra $450 through its ×2 bonus. At 12 hands the
  // discard is necessarily active and can contribute up to $1,350 through ×3.
  const minimum = handCount * 5 * multiplier;
  const maximum =
    handCount === 12
      ? (10 * 450 + 2 * 450 + 3 * 450) * multiplier
      : (handCount * 450 + 450) * multiplier;
  return (
    total >= minimum &&
    total <= maximum &&
    total % (5 * multiplier) === 0
  );
}

function recognizeProDisplayedScore(imageData, rects) {
  const scoreRects = proDisplayedScoreRects(imageData, rects);
  const darkScoreTheme = scoreRectHasDarkBackground(imageData, scoreRects.hand);
  const handThresholds = darkScoreTheme
    ? SCORE_CONTRAST_THRESHOLDS
    : [170, 180, 190];
  const totalThresholds = darkScoreTheme
    ? SCORE_CONTRAST_THRESHOLDS
    : [100, 120, 140, 160];
  const foregroundPoints = darkScoreTheme
    ? scoreForegroundMask
    : neutralTextPoints;
  const handReads = handThresholds.map((threshold) =>
    readProHandCountFromBoxes(
      textComponentBoxes(
        foregroundPoints(imageData, scoreRects.hand, threshold),
        rectWidth(scoreRects.hand),
        rectHeight(scoreRects.hand),
      ),
      darkScoreTheme,
    ),
  );
  let handCount = consensusValue(handReads, 2);
  const totalReads = totalThresholds.map((threshold) =>
    readProScoreTotalFromBoxes(
      textComponentBoxes(
        foregroundPoints(imageData, scoreRects.total, threshold),
        rectWidth(scoreRects.total),
        rectHeight(scoreRects.total),
      ),
      handCount,
    ),
  );
  const consensusTotal = consensusValue(totalReads, 2);
  const feasibleTotals = [
    ...new Set(
      totalReads.filter(
        (candidate) =>
          Number.isInteger(handCount) &&
          isProDisplayedScorePairFeasible(candidate, handCount),
      ),
    ),
  ].sort((first, second) => second - first);
  // Threshold masks are correlated, so a repeated but arithmetically
  // impossible partial read must not outweigh the sole complete payout.
  const total =
    Number.isFinite(consensusTotal) &&
    (!Number.isInteger(handCount) ||
      isProDisplayedScorePairFeasible(consensusTotal, handCount))
      ? consensusTotal
      : feasibleTotals.length
        ? feasibleTotals[0]
        : consensusTotal;
  if (
    Number.isFinite(total) &&
    Number.isFinite(handCount) &&
    !isProDisplayedScorePairFeasible(total, handCount)
  ) {
    // The score total uses a longer, more distinctive glyph sequence than the
    // one- or two-digit hand count. Keep the total as a checksum, but discard
    // an impossible hand-count read rather than letting it block a valid board.
    handCount = null;
  }
  return { handCount, total };
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

function proJokerColorClusterCount(imageData, rect) {
  const colors = [];
  const top = Math.max(0, rect.top);
  const bottom = Math.min(imageData.height, Math.round(rect.top + rectHeight(rect) * 0.32));
  const left = Math.max(0, rect.left);
  const right = Math.min(imageData.width, rect.right);
  for (let y = top; y < bottom; y += 2) {
    for (let x = left; x < right; x += 2) {
      const color = pixelAt(imageData, x, y);
      if (Math.max(...color) < 70 || colorChroma(color) < 25) continue;
      colors.push(color);
    }
  }

  const clusters = [];
  colors
    .sort((first, second) => colorChroma(second) - colorChroma(first))
    .forEach((color) => {
      const existing = clusters.find(
        (cluster) => colorVectorDistance(color, cluster.centroid) < 42,
      );
      if (existing) {
        existing.colors.push(color);
        existing.centroid = meanColor(existing.colors);
      } else {
        clusters.push({ centroid: [...color], colors: [color] });
      }
    });
  const minimumSize = Math.max(3, colors.length * 0.025);
  return clusters.filter((cluster) => cluster.colors.length >= minimumSize).length;
}

function proJokerSlotIndex(imageData, rects, slots) {
  const colorScores = rects.map((rect) => proJokerColorClusterCount(imageData, rect));
  const bestColorScore = Math.max(...colorScores);
  if (bestColorScore >= 3) return colorScores.indexOf(bestColorScore);

  return slots
    .map((slot, index) => ({
      index,
      confidence: (slot.rankConfidence ?? 0) + (slot.suitConfidence ?? 0),
    }))
    .sort((first, second) => first.confidence - second.confidence)[0]?.index ?? 0;
}

function assertProScreenshotDimensions(width, height) {
  if (!width || !height || height < 240) {
    throw new Error("This does not look like a Pile-Up Poker Pro screenshot.");
  }
  if (width < MIN_PRO_SCREENSHOT_WIDTH) {
    throw new Error(
      `Use the original full-resolution Pro screenshot (at least ${MIN_PRO_SCREENSHOT_WIDTH}px wide).`,
    );
  }
}

export function proDisplayedScoreMismatch(actual, expected) {
  if (
    !expected ||
    (!Number.isFinite(expected.total) && !Number.isFinite(expected.handCount))
  ) {
    return null;
  }
  // The total is a longer and substantially more reliable OCR target than
  // the one- or two-digit hand count. Use the hand count only as a fallback
  // checksum when no trusted total was read.
  const totalIsTrusted = Number.isFinite(expected.total);
  const totalMismatch =
    totalIsTrusted && expected.total !== actual.total;
  const handCountMismatch =
    !totalIsTrusted &&
    Number.isFinite(expected.handCount) &&
    expected.handCount !== actual.handCount;
  return totalMismatch || handCountMismatch
    ? {
        actual,
        expected,
        handCountMismatch,
        totalMismatch,
      }
    : null;
}

function proRecognizedScoreMismatch(grid, discard, expected) {
  return proDisplayedScoreMismatch(
    scoreProPlacement(grid, discard),
    expected,
  );
}

function displayedScoreConfirmsPlacement(actual, displayedScore) {
  return (
    Number.isFinite(displayedScore?.total) &&
    Number.isFinite(actual?.total) &&
    displayedScore.total === actual.total &&
    (!Number.isFinite(displayedScore.handCount) ||
      displayedScore.handCount === actual.handCount)
  );
}

function scoreDisambiguatesSlot(
  cards,
  index,
  availableDeck,
  scoreCards,
  displayedScore,
) {
  const usedCards = new Set(cards);
  return availableDeck.every((card) => {
    if (card.id === cards[index] || usedCards.has(card.id)) return true;
    const alternativeCards = [...cards];
    alternativeCards[index] = card.id;
    return !displayedScoreConfirmsPlacement(
      scoreCards(alternativeCards),
      displayedScore,
    );
  });
}

function proScoreMatchesExpected(score, expected) {
  return !proDisplayedScoreMismatch(score, expected);
}

function flagProScoreMismatchSlots(
  allSlots,
  reviewFlags,
  jokerIndex,
  displayedScore,
) {
  const cards = allSlots.map((slot) => slot.cardId);
  const correctionIndices = new Set();
  function collectCorrections(candidatesForSlot) {
    allSlots.forEach((slot, index) => {
      if (index === jokerIndex) return;
      candidatesForSlot(slot).forEach((alternative) => {
        if (
          !alternative.cardId ||
          alternative.cardId === slot.cardId ||
          cards.some(
            (cardId, cardIndex) =>
              cardIndex !== index && cardId === alternative.cardId,
          )
        ) {
          return;
        }
        const candidateCards = [...cards];
        candidateCards[index] = alternative.cardId;
        const score = scoreProPlacement(
          candidateCards.slice(0, 25),
          candidateCards.slice(25, 30),
        );
        if (proScoreMatchesExpected(score, displayedScore)) {
          correctionIndices.add(index);
        }
      });
    });
  }

  collectCorrections((slot) => slot.alternatives ?? []);
  if (!correctionIndices.size) {
    // The visual candidate list is deliberately short. If it does not expose
    // a checksum-restoring correction, try the remaining same-suit cards.
    // Suit glyphs are substantially more stable than rank glyphs under dark
    // screenshots, so this remains a focused review hint rather than marking
    // the whole board.
    collectCorrections((slot) =>
      PRO_STANDARD_DECK
        .filter((card) => card.suit === slot.suit)
        .map((card) => ({ cardId: card.id })),
    );
  }
  if (correctionIndices.size) {
    correctionIndices.forEach((index) => {
      reviewFlags[index] = true;
    });
    return;
  }

  const uncertain = allSlots
    .map((slot, index) => ({
      index,
      // A close rank match is the most common checksum-breaking error. Suit
      // and aggregate confidence break ties without pretending the checksum
      // can identify one specific card by itself.
      uncertainty:
        (slot.rankMargin ?? 0) * 4 +
        (slot.suitMargin ?? 0) +
        slot.confidence,
    }))
    .filter(({ index }) => index !== jokerIndex)
    .sort((first, second) => first.uncertainty - second.uncertainty);

  uncertain.slice(0, 3).forEach(({ index }) => {
    reviewFlags[index] = true;
  });
}

export function recognizeProFantasylandImageData(imageData) {
  assertProScreenshotDimensions(imageData?.width, imageData?.height);
  const fallbackRects = proFallbackSlotRects(imageData.width, imageData.height);
  const alignedRects = alignProFallbackRects(imageData, fallbackRects);
  const rects = {
    ...alignedRects,
    discard: refineDiscardRects(
      imageData,
      alignedRects.discard,
      5,
      recognizeProSlot,
      0.52,
    ),
  };
  const displayedScore = recognizeProDisplayedScore(imageData, rects);
  const gridSlots = rects.grid.map((rect) => recognizeProSlot(imageData, rect, "grid"));
  const discardSlots = rects.discard.map((rect) => recognizeProSlot(imageData, rect, "discard"));
  const allRects = [...rects.grid, ...rects.discard];
  const allSlots = [...gridSlots, ...discardSlots];
  const jokerIndex = proJokerSlotIndex(imageData, allRects, allSlots);
  const standardSlots = allSlots.filter((_, index) => index !== jokerIndex);

  calibrateSuitsFromScreenshotColors(standardSlots);
  const preConstraintCards = allSlots.map((slot) => slot.cardId);
  const rawRecognizedCards = standardSlots.map((slot) => slot.cardId).filter(Boolean);
  const rawConflicts = new Set(rawRecognizedCards).size !== rawRecognizedCards.length;
  resolveDeckConflicts(standardSlots);
  enforceDeckConstraints(standardSlots);

  allSlots[jokerIndex] = {
    cardId: "JK",
    rank: "JOKER",
    suit: null,
    confidence: 1,
    rankConfidence: 1,
    suitConfidence: 1,
    alternatives: [],
  };

  const cards = allSlots.map((slot) => slot.cardId);
  const recognizedCards = cards.filter(Boolean);
  const missing = recognizedCards.length !== 30;
  const duplicates = new Set(recognizedCards).size !== recognizedCards.length;
  const confidence = Math.min(...allSlots.map((slot) => slot.confidence));
  const grid = allSlots.slice(0, 25).map((slot) => slot.cardId);
  const discard = allSlots.slice(25, 30).map((slot) => slot.cardId);
  const placementScore =
    !missing && !duplicates
      ? scoreProPlacement(grid, discard)
      : null;
  const scoreValidated = displayedScoreConfirmsPlacement(
    placementScore,
    displayedScore,
  );
  const deckAdjusted = allSlots.some(
    (slot, index) =>
      index !== jokerIndex &&
      preConstraintCards[index] !== slot.cardId,
  );
  const canUseScoreToResolveReviews = scoreValidated;
  const visualReviewFlags = allSlots.map(
    (slot, index) =>
      index !== jokerIndex &&
      (slot.confidence < 0.6 || (slot.rankMargin ?? 0) < 0.02),
  );
  const deckAdjustedFlags = allSlots.map(
    (slot, index) =>
      index !== jokerIndex &&
      preConstraintCards[index] !== slot.cardId,
  );
  const reviewCandidateFlags = visualReviewFlags.map(
    (needsVisualReview, index) =>
      needsVisualReview ||
      (deckAdjustedFlags[index] && !scoreValidated),
  );
  const scoreResolvedReviewFlags = reviewCandidateFlags.map(
    (needsReview, index) =>
      needsReview &&
      canUseScoreToResolveReviews &&
      scoreDisambiguatesSlot(
        cards,
        index,
        PRO_STANDARD_DECK,
        (candidateCards) =>
          scoreProPlacement(
            candidateCards.slice(0, 25),
            candidateCards.slice(25, 30),
          ),
        displayedScore,
      ),
  );
  const unresolvedLowConfidence = reviewCandidateFlags.some(
    (needsReview, index) =>
      needsReview && !scoreResolvedReviewFlags[index],
  );
  const reviewFlags = allSlots.map(
    (slot, index) =>
      index !== jokerIndex &&
      (!slot.cardId ||
        (reviewCandidateFlags[index] && !scoreResolvedReviewFlags[index])),
  );
  const scoreMismatch =
    !missing && !duplicates
      ? proRecognizedScoreMismatch(grid, discard, displayedScore)
      : null;
  if (scoreMismatch) {
    flagProScoreMismatchSlots(
      allSlots,
      reviewFlags,
      jokerIndex,
      displayedScore,
    );
  }
  let warning = "";
  if (missing) {
    warning = `${recognizedCards.length}/30 cards auto-detected. Review the highlighted slots.`;
  } else if (duplicates) {
    warning = "Some detected Pro cards were duplicates. Review the highlighted slots.";
  } else if (scoreMismatch) {
    warning =
      "Detected Pro cards do not match the screenshot score. Review the highlighted cards.";
  } else if (
    (rawConflicts || deckAdjusted) &&
    reviewFlags.some(Boolean)
  ) {
    warning = "Some Pro card reads needed deck validation. Review the highlighted slots.";
  } else if (unresolvedLowConfidence) {
    warning = "I read all 30 Pro cards, but a few need review. Check the highlighted slots.";
  }

  return {
    grid,
    discard,
    review: {
      grid: reviewFlags.slice(0, 25),
      discard: reviewFlags.slice(25, 30),
    },
    confidenceBySlot: {
      grid: allSlots.slice(0, 25).map((slot) => slot.confidence),
      discard: allSlots.slice(25, 30).map((slot) => slot.confidence),
    },
    confidence,
    displayedScore,
    scoreValidated,
    scoreMismatch,
    complete: !warning,
    warning,
  };
}

export function recognizedScoreMismatch(recognized) {
  if (!recognized?.displayedScore) return null;
  const cards = [...(recognized.grid ?? []), ...(recognized.discard ?? [])];
  if (cards.length !== 20 || cards.some((cardId) => !cardId) || new Set(cards).size !== cards.length) return null;

  const actual = scorePlacement(recognized.grid, recognized.discard);
  const expected = recognized.displayedScore;
  const totalIsFeasible = isPayoutFeasibleTotal(expected.total);
  const totalMatchesActual =
    totalIsFeasible && expected.total === actual.total;
  const displayedPairIsFeasible =
    !Number.isFinite(expected.handCount) ||
    isPayoutFeasibleForHandCount(expected.total, expected.handCount);
  const totalIsTrusted =
    totalIsFeasible && (displayedPairIsFeasible || totalMatchesActual);
  const totalMismatch =
    totalIsTrusted && expected.total !== actual.total;
  const handCountMismatch =
    !totalIsTrusted &&
    Number.isFinite(expected.handCount) &&
    expected.handCount !== actual.handCount;
  return totalMismatch || handCountMismatch
    ? {
        actual,
        expected,
        handCountMismatch,
        totalMismatch,
      }
    : null;
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
  calibrateSuitsFromScreenshotColors(allSlots);
  const preConstraintCards = allSlots.map((slot) => slot.cardId);
  const rawRecognizedCards = allSlots.map((slot) => slot.cardId).filter(Boolean);
  const rawConflicts = new Set(rawRecognizedCards).size !== rawRecognizedCards.length;
  resolveDeckConflicts(allSlots);
  enforceDeckConstraints(allSlots);
  const displayedScore = recognizeDisplayedScore(imageData, rects);
  const cards = allSlots.map((slot) => slot.cardId);
  const recognizedCards = cards.filter(Boolean);
  const missing = recognizedCards.length !== 20;
  const duplicates = new Set(recognizedCards).size !== recognizedCards.length;
  const confidence = Math.min(...allSlots.map((slot) => slot.confidence));
  const grid = gridSlots.map((slot) => slot.cardId);
  const discard = discardSlots.map((slot) => slot.cardId);
  const placementScore =
    !missing && !duplicates
      ? scorePlacement(grid, discard)
      : null;
  const scoreValidated = displayedScoreConfirmsPlacement(
    placementScore,
    displayedScore,
  );
  const deckAdjusted = allSlots.some(
    (slot, index) => preConstraintCards[index] !== slot.cardId,
  );
  const canUseScoreToResolveReviews =
    scoreValidated && !rawConflicts && !deckAdjusted;
  const visualReviewFlags = allSlots.map(
    (slot) => slot.confidence < 0.6,
  );
  const scoreResolvedReviewFlags = visualReviewFlags.map(
    (needsVisualReview, index) =>
      needsVisualReview &&
      canUseScoreToResolveReviews &&
      scoreDisambiguatesSlot(
        cards,
        index,
        DECK,
        (candidateCards) =>
          scorePlacement(
            candidateCards.slice(0, 16),
            candidateCards.slice(16, 20),
          ),
        displayedScore,
      ),
  );
  const unresolvedLowConfidence = visualReviewFlags.some(
    (needsVisualReview, index) =>
      needsVisualReview && !scoreResolvedReviewFlags[index],
  );
  const reviewFlags = allSlots.map(
    (slot, index) =>
      !slot.cardId ||
      (visualReviewFlags[index] && !scoreResolvedReviewFlags[index]) ||
      preConstraintCards[index] !== slot.cardId,
  );
  let warning = "";
  if (missing) {
    warning = `${recognizedCards.length}/20 cards auto-detected. Review the highlighted slots.`;
  } else if (duplicates) {
    warning = "Some detected cards were duplicates. Review the highlighted slots.";
  } else if (rawConflicts || deckAdjusted) {
    warning = "Some card reads needed deck validation. Review the highlighted slots.";
  } else if (unresolvedLowConfidence) {
    warning = "I read all 20 cards, but a few need review. Check the highlighted slots.";
  }

  return {
    grid,
    discard,
    review: {
      grid: reviewFlags.slice(0, 16),
      discard: reviewFlags.slice(16, 20),
    },
    confidenceBySlot: {
      grid: gridSlots.map((slot) => slot.confidence),
      discard: discardSlots.map((slot) => slot.confidence),
    },
    confidence,
    displayedScore,
    scoreValidated,
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

export async function recognizeProFantasylandScreenshot(file) {
  const bitmap = await loadImageSource(file);
  const width = bitmap.width || bitmap.naturalWidth;
  const height = bitmap.height || bitmap.naturalHeight;
  assertProScreenshotDimensions(width, height);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Screenshot reading is not available in this browser.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  return recognizeProFantasylandImageData(context.getImageData(0, 0, width, height));
}

export const __recognizerTestHooks = {
  alignProFallbackRects,
  assertProScreenshotDimensions,
  cardTopEdgeLine,
  classifyRank,
  classifyProScoreDigit,
  classifyScoreGlyph,
  classifyScoreDigit,
  consensusValue,
  displayedScoreTotalFromDigits,
  displayedScoreRects,
  recognizeDisplayedScore,
  readHandCountFromBoxes,
  readScoreTotalFromBoxes,
  scoreForegroundMask,
  scoreRectHasDarkBackground,
  scoreDigitFeatures,
  textComponentBoxes,
  normalizedRankMask,
  neutralTextPoints,
  proFallbackSlotRects,
  proDisplayedScoreRects,
  recognizeProDisplayedScore,
  readProHandCountFromBoxes,
  readProScoreTotalFromBoxes,
  proRecognizedScoreMismatch,
  isProDisplayedScorePairFeasible,
  selectProDisplayedScoreTotal,
  proDiscardRankPoints,
  proJokerColorClusterCount,
  proTemplateRankCandidates,
  rankPoints,
  recognizeProSlot,
  refineDiscardRects,
  removeArtifactComponents,
  recognizeSlot,
  resolveDeckConflicts,
};
