function buildBoardTransforms() {
  const transforms = [];
  const seen = new Set();

  for (const transpose of [false, true]) {
    for (const swapEdgeRows of [false, true]) {
      for (const swapInnerRows of [false, true]) {
        for (const swapEdgeCols of [false, true]) {
          for (const swapInnerCols of [false, true]) {
            const mapAxis = (value, swapEdges, swapInner) => {
              if (value === 0 || value === 3) return swapEdges ? 3 - value : value;
              return swapInner ? 3 - value : value;
            };
            const transform = (row, col) => {
              const mappedRow = mapAxis(row, swapEdgeRows, swapInnerRows);
              const mappedCol = mapAxis(col, swapEdgeCols, swapInnerCols);
              return transpose ? [mappedCol, mappedRow] : [mappedRow, mappedCol];
            };
            const key = Array.from({ length: 16 }, (_, index) => {
              const row = Math.floor(index / 4);
              const col = index % 4;
              return transform(row, col).join(":");
            }).join("|");
            if (!seen.has(key)) {
              seen.add(key);
              transforms.push(transform);
            }
          }
        }
      }
    }
  }

  return transforms;
}

export const BOARD_TRANSFORMS = buildBoardTransforms();

function indexFor(row, col) {
  return row * 4 + col;
}

export function transformGrid(grid, transformIndex) {
  const transformed = Array(16).fill(null);
  const transform = BOARD_TRANSFORMS[transformIndex];

  for (let index = 0; index < 16; index += 1) {
    const row = Math.floor(index / 4);
    const col = index % 4;
    const [nextRow, nextCol] = transform(row, col);
    transformed[indexFor(nextRow, nextCol)] = grid[index];
  }

  return transformed;
}

export function canonicalPlacementKey(grid, discard) {
  const discardKey = [...discard].sort().join(",");
  const boardKeys = BOARD_TRANSFORMS.map((_, index) => transformGrid(grid, index).join(","));
  boardKeys.sort();
  return `${boardKeys[0]}|${discardKey}`;
}
