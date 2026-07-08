const SUIT_REFERENCES = {
  H: [245, 151, 157],
  S: [83, 172, 232],
  C: [134, 165, 122],
  D: [245, 181, 88],
};

const GRID_CENTERS_X = [0.306, 0.476, 0.646, 0.815];
const GRID_CENTERS_Y = [0.236, 0.343, 0.45, 0.556];
const TRAY_CENTERS_X = [0.25, 0.418, 0.586, 0.753];

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

function slotRects(width, height) {
  const gridWidth = width * 0.164;
  const gridHeight = height * 0.104;
  const trayWidth = width * 0.145;
  const trayHeight = height * 0.13;

  const grid = GRID_CENTERS_Y.flatMap((centerY) =>
    GRID_CENTERS_X.map((centerX) =>
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

  const discard = TRAY_CENTERS_X.map((centerX) =>
    clampRect(
      {
        left: width * centerX - trayWidth / 2,
        top: height * 0.925 - trayHeight / 2,
        right: width * centerX + trayWidth / 2,
        bottom: height,
      },
      width,
      height,
    ),
  );

  return { grid, discard };
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

function rankPoints(imageData, rect, suit) {
  const reference = SUIT_REFERENCES[suit];
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  // Face cards use character art in the middle of the card, so only read the
  // small top-left rank glyph. The suit is read separately from color.
  const xStart = Math.floor(rect.left + width * 0.08);
  const xEnd = Math.floor(rect.left + width * 0.43);
  const yStart = Math.floor(rect.top + height * 0.055);
  const yEnd = Math.floor(rect.top + height * 0.25);
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

function classifyRank(features) {
  const { width, pixelCount, componentCount, holes, left, middleX, right, top, middleY, bottom } = features;
  const primaryHole = holes[0];

  if (pixelCount < 25) return { rank: null, confidence: 0 };
  if (holes.length >= 2) return { rank: "8", confidence: 0.95 };
  if (
    componentCount >= 2 ||
    (width >= 20 && holes.length === 1 && primaryHole.y > 0.4 && primaryHole.x > 0.55)
  ) {
    return { rank: "10", confidence: 0.95 };
  }

  if (holes.length === 1) {
    if (width >= 20 && primaryHole.x < 0.3) return { rank: "A", confidence: 0.9 };
    return primaryHole.y > 0.5 ? { rank: "6", confidence: 0.9 } : { rank: "9", confidence: 0.9 };
  }

  if (top > middleY * 1.8 && top > bottom * 1.7 && pixelCount < 75) {
    return { rank: "7", confidence: 0.9 };
  }
  if (right > (left + middleX) * 1.05 && top > middleY * 1.5 && bottom > middleY * 1.5) {
    return { rank: "Q", confidence: 0.86 };
  }
  if (right > left * 1.8 && bottom >= top * 1.6) {
    return { rank: "J", confidence: 0.86 };
  }
  if (width > 22 && pixelCount < 42) {
    return { rank: "J", confidence: 0.78 };
  }
  if (width > 24 && left > right * 4) {
    return { rank: "K", confidence: 0.78 };
  }
  if (left > right * 1.3) {
    return { rank: "K", confidence: 0.82 };
  }
  if (right > left * 1.8) {
    return { rank: "J", confidence: 0.72 };
  }

  return { rank: "K", confidence: 0.62 };
}

function classifyRankFromSlot(imageData, rect, suit) {
  const mask = rankPoints(imageData, rect, suit);
  if (!mask) return { rank: null, confidence: 0 };

  const { width, height, points } = mask;
  const components = connectedComponents(points, width, height);
  const holes = holeInfo(points, width, height).sort((a, b) => b.size - a.size);
  const features = {
    width,
    height,
    pixelCount: points.length,
    componentCount: components.length,
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

function recognizeSlot(imageData, rect) {
  const suitResult = classifySuit(imageData, rect);
  const rankResult = classifyRankFromSlot(imageData, rect, suitResult.suit);
  return {
    cardId: rankResult.rank ? `${rankResult.rank}${suitResult.suit}` : null,
    rank: rankResult.rank,
    suit: suitResult.suit,
    confidence: Math.min(suitResult.confidence, rankResult.confidence),
  };
}

function loadImageBitmap(file) {
  if (typeof createImageBitmap === "function") return createImageBitmap(file);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read screenshot image."));
    image.src = URL.createObjectURL(file);
  });
}

export async function recognizeFantasylandScreenshot(file) {
  const bitmap = await loadImageBitmap(file);
  const width = bitmap.width;
  const height = bitmap.height;
  if (!width || !height || height < width * 1.5) {
    throw new Error("This does not look like a portrait Pile-Up Poker screenshot.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Screenshot reading is not available in this browser.");
  context.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  const imageData = context.getImageData(0, 0, width, height);
  const rects = slotRects(width, height);
  const gridSlots = rects.grid.map((rect) => recognizeSlot(imageData, rect));
  const discardSlots = rects.discard.map((rect) => recognizeSlot(imageData, rect));
  const cards = [...gridSlots, ...discardSlots].map((slot) => slot.cardId);
  const missing = cards.filter(Boolean).length !== 20;
  const duplicates = new Set(cards.filter(Boolean)).size !== cards.filter(Boolean).length;
  const confidence = Math.min(...[...gridSlots, ...discardSlots].map((slot) => slot.confidence));

  if (missing || duplicates || confidence < 0.6) {
    throw new Error("I could not confidently read all 20 cards. Please adjust them manually.");
  }

  return {
    grid: gridSlots.map((slot) => slot.cardId),
    discard: discardSlots.map((slot) => slot.cardId),
    confidence,
  };
}
