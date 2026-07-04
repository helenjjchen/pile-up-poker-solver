const TRANSFORMS = [
  (row, col) => [row, col],
  (row, col) => [col, 3 - row],
  (row, col) => [3 - row, 3 - col],
  (row, col) => [3 - col, row],
  (row, col) => [row, 3 - col],
  (row, col) => [3 - row, col],
  (row, col) => [col, row],
  (row, col) => [3 - col, 3 - row],
];

function indexFor(row, col) {
  return row * 4 + col;
}

export function transformGrid(grid, transformIndex) {
  const transformed = Array(16).fill(null);
  const transform = TRANSFORMS[transformIndex];

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
  const boardKeys = TRANSFORMS.map((_, index) => transformGrid(grid, index).join(","));
  boardKeys.sort();
  return `${boardKeys[0]}|${discardKey}`;
}
