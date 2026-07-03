import { normalizeCardName } from './normalize-card-name.mjs';

// Shared suggestion-ranking logic used by Node tests and mirrored by
// src/utils/cardSearch.ts for the browser. Keep the two implementations in
// sync. normalizeSearchText intentionally reuses normalizeCardName so search
// keys and display normalization never diverge.
export const normalizeSearchText = normalizeCardName;

export const MATCH_EXACT = 0;
export const MATCH_PREFIX = 1;
export const MATCH_WORD_START = 2;
export const MATCH_SUBSTRING = 3;
export const NO_MATCH = Infinity;

function matchTier(normalized, query) {
  if (!normalized) return NO_MATCH;
  if (normalized === query) return MATCH_EXACT;
  if (normalized.startsWith(query)) return MATCH_PREFIX;
  if (normalized.split(' ').some((token) => token.startsWith(query))) return MATCH_WORD_START;
  if (normalized.includes(query)) return MATCH_SUBSTRING;
  return NO_MATCH;
}

function cardTier(card, query) {
  const en = card.normalizedNameEn ?? normalizeSearchText(card.nameEn);
  const ja = card.nameJa ? (card.normalizedNameJa ?? normalizeSearchText(card.nameJa)) : null;
  return Math.min(matchTier(en, query), ja ? matchTier(ja, query) : NO_MATCH);
}

// Rank card entries against a raw query. Returns the best `limit` matches,
// ordered by match tier, then deck count (desc), then Japanese and English name.
export function rankCardSuggestions(cards, rawQuery, limit = 10) {
  const query = normalizeSearchText(rawQuery);
  if (!query) return [];

  const scored = [];
  for (const card of cards) {
    const tier = cardTier(card, query);
    if (tier === NO_MATCH) continue;
    scored.push({ card, tier });
  }

  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const deckDiff = (b.card.deckCount ?? 0) - (a.card.deckCount ?? 0);
    if (deckDiff !== 0) return deckDiff;
    const jaDiff = (a.card.nameJa ?? '').localeCompare(b.card.nameJa ?? '', 'ja');
    if (jaDiff !== 0) return jaDiff;
    return a.card.nameEn.localeCompare(b.card.nameEn, 'en');
  });

  return scored.slice(0, limit).map((entry) => entry.card);
}
