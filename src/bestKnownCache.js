import {
  CARD_BY_ID,
  canonicalDealKey,
  sortCardIds,
  translatePlacementToDeal,
} from "./cards.js";
import { compareScores, scorePlacement } from "./scoring.js";
import { solutionHandProfileKey } from "./solutionProfiles.js";

export const BEST_KNOWN_CACHE_VERSION = 3;

function rawDealKey(cardIds) {
  return sortCardIds(cardIds).join(" ");
}

function validDeal(cardIds) {
  return (
    Array.isArray(cardIds) &&
    cardIds.length === 20 &&
    new Set(cardIds).size === 20 &&
    cardIds.every((cardId) => Boolean(CARD_BY_ID[cardId]))
  );
}

function normalizePlacement(candidate, sourceFallback, foundAtFallback) {
  if (!candidate || !Array.isArray(candidate.grid) || !Array.isArray(candidate.discard)) return null;
  if (candidate.grid.length !== 16 || candidate.discard.length !== 4) return null;
  const placementCards = [...candidate.grid, ...candidate.discard];
  if (!validDeal(placementCards)) return null;

  const score = scorePlacement(candidate.grid, candidate.discard);
  const solution = {
    grid: [...candidate.grid],
    discard: [...candidate.discard],
    score,
    source: candidate.source ?? sourceFallback,
    foundAt: candidate.foundAt ?? foundAtFallback,
    notes: candidate.notes ?? "",
  };
  return {
    ...solution,
    profileKey: solutionHandProfileKey(solution),
  };
}

function recordCandidates(record) {
  const legacyPlacement = {
    grid: record?.grid,
    discard: record?.discard,
    source: record?.source,
    foundAt: record?.foundAt,
    notes: record?.notes,
  };
  return [legacyPlacement, ...(Array.isArray(record?.variants) ? record.variants : [])];
}

function uniqueBestProfiles(solutions) {
  if (!solutions.length) return [];
  const ranked = [...solutions].sort((a, b) => compareScores(b.score, a.score));
  const bestScore = ranked[0].score;
  const byProfile = new Map();

  for (const solution of ranked) {
    if (compareScores(solution.score, bestScore) !== 0) continue;
    if (!byProfile.has(solution.profileKey)) byProfile.set(solution.profileKey, solution);
  }

  return [...byProfile.values()];
}

export function normalizeBestKnownRecord(record, sourceFallback = "saved") {
  if (!record || typeof record !== "object") return null;
  const foundAtFallback = record.foundAt ?? new Date().toISOString();
  const normalizedCandidates = recordCandidates(record)
    .map((candidate) => normalizePlacement(candidate, sourceFallback, foundAtFallback))
    .filter(Boolean);
  if (!normalizedCandidates.length) return null;

  const inferredDeal = sortCardIds([
    ...normalizedCandidates[0].grid,
    ...normalizedCandidates[0].discard,
  ]);
  const deal = validDeal(record.deal) ? sortCardIds(record.deal) : inferredDeal;
  const expectedDealKey = rawDealKey(deal);
  const matchingCandidates = normalizedCandidates.filter(
    (candidate) => rawDealKey([...candidate.grid, ...candidate.discard]) === expectedDealKey,
  );
  const variants = uniqueBestProfiles(matchingCandidates);
  if (!variants.length) return null;

  const representative = variants[0];
  const canonicalKey = canonicalDealKey(deal);
  return {
    id: record.id ?? `${canonicalKey}-${representative.score.total}`,
    dealKey: rawDealKey(deal),
    canonicalDealKey: canonicalKey,
    deal,
    grid: [...representative.grid],
    discard: [...representative.discard],
    score: representative.score,
    source: record.source ?? representative.source ?? sourceFallback,
    foundAt: record.foundAt ?? representative.foundAt ?? foundAtFallback,
    notes: record.notes ?? "",
    variants,
  };
}

export function createBestKnownRecord({ deal, solutions, source = "browser-local", foundAt, notes = "" }) {
  if (!validDeal(deal) || !Array.isArray(solutions) || !solutions.length) return null;
  const timestamp = foundAt ?? new Date().toISOString();
  const first = solutions.find((solution) => solution?.grid && solution?.discard);
  if (!first) return null;

  return normalizeBestKnownRecord(
    {
      deal,
      grid: first.grid,
      discard: first.discard,
      source: first.source ?? source,
      foundAt: timestamp,
      notes,
      variants: solutions.map((solution) => ({
        grid: solution.grid,
        discard: solution.discard,
        source: solution.source ?? source,
        foundAt: solution.foundAt ?? timestamp,
        notes: solution.notes ?? "",
      })),
    },
    source,
  );
}

export function bestKnownSolutions(record) {
  const normalized = normalizeBestKnownRecord(record, record?.source ?? "saved");
  if (!normalized) return [];
  return normalized.variants.map((variant, index) => ({
    grid: [...variant.grid],
    discard: [...variant.discard],
    score: variant.score,
    source: variant.source ?? normalized.source,
    foundAt: variant.foundAt ?? normalized.foundAt,
    profileKey: variant.profileKey,
    key: `best-known-${normalized.dealKey}-${variant.profileKey}-${index}`,
  }));
}

export function bestKnownVariantCount(record) {
  return bestKnownSolutions(record).length;
}

export function adaptBestKnownRecordToDeal(record, targetDeal, sourceSuffix = "") {
  const normalized = normalizeBestKnownRecord(record, record?.source ?? "saved");
  if (!normalized || !validDeal(targetDeal)) return null;
  const sortedTarget = sortCardIds(targetDeal);
  if (normalized.canonicalDealKey !== canonicalDealKey(sortedTarget)) return null;
  if (normalized.dealKey === rawDealKey(sortedTarget) && !sourceSuffix) return normalized;

  const translatedVariants = normalized.variants
    .map((variant) => {
      const translated = translatePlacementToDeal(variant.grid, variant.discard, sortedTarget);
      if (!translated) return null;
      return {
        ...translated,
        source: `${variant.source ?? normalized.source}${sourceSuffix}`,
        foundAt: variant.foundAt,
        notes: variant.notes,
      };
    })
    .filter(Boolean);
  if (!translatedVariants.length) return null;

  return normalizeBestKnownRecord(
    {
      ...normalized,
      id: `${normalized.id}-canonical-${rawDealKey(sortedTarget)}`,
      dealKey: rawDealKey(sortedTarget),
      deal: sortedTarget,
      grid: translatedVariants[0].grid,
      discard: translatedVariants[0].discard,
      source: `${normalized.source}${sourceSuffix}`,
      variants: translatedVariants,
    },
    normalized.source,
  );
}

export function mergeBestKnownRecord(existingRecord, candidateRecord) {
  const existing = normalizeBestKnownRecord(existingRecord, existingRecord?.source ?? "saved");
  const candidate = normalizeBestKnownRecord(candidateRecord, candidateRecord?.source ?? "saved");
  if (!existing) return candidate;
  if (!candidate) return existing;

  const comparison = compareScores(candidate.score, existing.score);
  if (comparison > 0) return candidate;
  if (comparison < 0) return existing;

  const adaptedCandidate = adaptBestKnownRecordToDeal(candidate, existing.deal);
  if (!adaptedCandidate) return existing;
  return normalizeBestKnownRecord(
    {
      ...existing,
      variants: [...existing.variants, ...adaptedCandidate.variants],
    },
    existing.source,
  );
}

export function mergeBestKnownRecordList(records, targetDeal = null) {
  let merged = null;
  for (const rawRecord of records.filter(Boolean)) {
    const normalized = normalizeBestKnownRecord(rawRecord, rawRecord?.source ?? "saved");
    const needsTranslation = Boolean(targetDeal && normalized && normalized.dealKey !== rawDealKey(targetDeal));
    const record = targetDeal
      ? adaptBestKnownRecordToDeal(normalized, targetDeal, needsTranslation ? " canonical" : "")
      : normalized;
    if (!record) continue;
    merged = mergeBestKnownRecord(merged, record);
  }
  return merged;
}

function serializeScore(score) {
  return {
    total: score.total,
    beforeMultiplier: score.base,
    hands: score.handCount,
    multiplier: score.multiplier,
    qualityHands: score.qualityHandCount,
  };
}

function serializeVariant(variant) {
  return {
    grid: variant.grid,
    discard: variant.discard,
    score: serializeScore(variant.score),
    source: variant.source,
    foundAt: variant.foundAt,
    notes: variant.notes,
    profileKey: variant.profileKey,
  };
}

export function serializeBestKnownRecord(record) {
  const normalized = normalizeBestKnownRecord(record, record?.source ?? "saved");
  if (!normalized) return null;
  return {
    id: normalized.id,
    dealKey: normalized.dealKey,
    canonicalDealKey: normalized.canonicalDealKey,
    deal: normalized.deal,
    grid: normalized.grid,
    discard: normalized.discard,
    score: serializeScore(normalized.score),
    source: normalized.source,
    foundAt: normalized.foundAt,
    notes: normalized.notes,
    variants: normalized.variants.map(serializeVariant),
  };
}
