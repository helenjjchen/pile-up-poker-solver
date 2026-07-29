export function solutionPlacementKey(solution) {
  if (!solution?.grid?.length || !solution?.discard?.length) return "";
  return `${solution.grid.join("|")}::${[...solution.discard].sort().join("|")}`;
}

export function pinnedSolutionPortfolio(
  candidates,
  pinnedCandidates,
  {
    compare,
    keyOf = solutionPlacementKey,
    maxSolutions,
  },
) {
  const pinnedKeys = new Set(
    pinnedCandidates
      .filter(Boolean)
      .map(keyOf)
      .filter(Boolean),
  );
  const uniqueByKey = new Map();

  [...pinnedCandidates, ...candidates]
    .filter(Boolean)
    .forEach((candidate) => {
      const key = keyOf(candidate);
      if (key && !uniqueByKey.has(key)) uniqueByKey.set(key, candidate);
    });

  const sorted = [...uniqueByKey.values()].sort(compare);
  const visible = sorted.slice(0, maxSolutions);
  pinnedKeys.forEach((pinnedKey) => {
    if (visible.some((candidate) => keyOf(candidate) === pinnedKey)) return;
    const pinned = uniqueByKey.get(pinnedKey);
    if (pinned) visible.push(pinned);
  });

  while (visible.length > maxSolutions) {
    let removableIndex = -1;
    for (let index = visible.length - 1; index >= 0; index -= 1) {
      if (!pinnedKeys.has(keyOf(visible[index]))) {
        removableIndex = index;
        break;
      }
    }
    if (removableIndex < 0) break;
    visible.splice(removableIndex, 1);
  }

  return visible.sort(compare);
}
