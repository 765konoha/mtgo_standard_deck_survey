import { isBasicLandCard } from './basic-land.mjs';
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
export { isBasicLandCard };

export function cardSearchIdentity(card) {
  return card?.oracleId || card?.key || card?.normalizedNameEn || normalizeSearchText(card?.nameEn || '');
}

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

// Builds eventId -> (deckId -> {mainboardQuantity, sideboardQuantity,
// cardKinds}) for decks containing at least one card of the expansion.
// Mirrors buildExpansionDeckIndex in src/utils/cardSearch.ts — keep in sync.
export function buildExpansionDeckIndex(index, expansionCode) {
  const result = new Map();
  if (!index || !expansionCode) return result;
  const seenKinds = new Map();
  for (const card of dedupeCardSearchEntries(index.cards || [])) {
    if (isBasicLandCard(card)) continue;
    if (!(card.setCodes || []).includes(expansionCode)) continue;
    const cardKey = cardSearchIdentity(card);
    for (const ref of card.deckRefs || []) {
      const byDeck = result.get(ref.eventId) || new Map();
      const deckKey = `${ref.eventId}\u0000${ref.deckId}`;
      const match = byDeck.get(ref.deckId) || {
        mainboardQuantity: 0,
        sideboardQuantity: 0,
        cardKinds: 0,
      };
      match.mainboardQuantity += ref.mainboardQuantity;
      match.sideboardQuantity += ref.sideboardQuantity;
      const deckKinds = seenKinds.get(deckKey) || new Set();
      if (!deckKinds.has(cardKey)) {
        deckKinds.add(cardKey);
        match.cardKinds += 1;
        seenKinds.set(deckKey, deckKinds);
      }
      byDeck.set(ref.deckId, match);
      result.set(ref.eventId, byDeck);
    }
  }
  return result;
}

// Filters suggestion candidates to an expansion before ranking. Mirrors the
// pre-filter used by CardSearchBox in the browser.
export function filterCardsByExpansion(cards, expansionCode) {
  const deduped = dedupeCardSearchEntries(cards || []);
  if (!expansionCode) return deduped;
  return deduped.filter((card) => (card.setCodes || []).includes(expansionCode));
}

export function dedupeCardSearchEntries(cards) {
  const byKey = new Map();
  for (const card of cards || []) {
    const key = cardSearchIdentity(card);
    if (!key) continue;
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeCardSearchEntries(existing, card) : cloneCardSearchEntry(card));
  }
  return [...byKey.values()];
}

export function formatSetBadges(setCodes, primarySetCode, selectedSetCode = null, suppressSelected = false) {
  const codes = [...new Set((setCodes || []).filter(Boolean))];
  if (codes.length === 0) return [];
  const primary = primarySetCode && codes.includes(primarySetCode) ? primarySetCode : codes[0];
  if (suppressSelected || !selectedSetCode || !codes.includes(selectedSetCode)) {
    return [{
      code: primary,
      label: codes.length > 1 ? `${primary} +${codes.length - 1}` : primary,
      title: codes.join(', '),
      selected: false,
    }];
  }
  return codes.map((code) => ({
    code,
    label: code,
    title: code === selectedSetCode ? `${code} (selected set)` : code,
    selected: code === selectedSetCode,
  }));
}

// Rank card entries against a raw query. Returns the best `limit` matches,
// ordered by match tier, then deck count (desc), then Japanese and English name.
export function rankCardSuggestions(cards, rawQuery, limit = 10) {
  const query = normalizeSearchText(rawQuery);
  if (!query) return [];

  const scored = [];
  for (const card of dedupeCardSearchEntries(cards)) {
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

function cloneCardSearchEntry(card) {
  return {
    ...card,
    setCodes: [...(card.setCodes || [])],
    deckRefs: [...(card.deckRefs || [])],
  };
}

function mergeCardSearchEntries(a, b) {
  const nameJa = chooseNameJa(a, b);
  const setCodes = [...new Set([...(a.setCodes || []), ...(b.setCodes || [])])].sort();
  const deckRefs = mergeDeckRefs([...(a.deckRefs || []), ...(b.deckRefs || [])]);
  const nameEn = preferCompleteName(a.nameEn, b.nameEn);
  return {
    ...a,
    key: a.oracleId || b.oracleId || a.key || b.key,
    oracleId: a.oracleId || b.oracleId || null,
    isBasicLand: Boolean(a.isBasicLand || b.isBasicLand || isBasicLandCard(a) || isBasicLandCard(b)),
    nameEn,
    nameJa,
    normalizedNameEn: normalizeSearchText(nameEn),
    normalizedNameJa: nameJa ? normalizeSearchText(nameJa) : null,
    setCodes,
    primarySetCode: (a.primarySetCode && setCodes.includes(a.primarySetCode))
      ? a.primarySetCode
      : (b.primarySetCode && setCodes.includes(b.primarySetCode))
        ? b.primarySetCode
        : setCodes[0] || null,
    deckCount: deckRefs.length,
    deckRefs,
  };
}

function mergeDeckRefs(refs) {
  const byDeck = new Map();
  for (const ref of refs) {
    const key = `${ref.eventId}\u0000${ref.deckId}`;
    const existing = byDeck.get(key) || {
      eventId: ref.eventId,
      deckId: ref.deckId,
      mainboardQuantity: 0,
      sideboardQuantity: 0,
    };
    existing.mainboardQuantity += ref.mainboardQuantity || 0;
    existing.sideboardQuantity += ref.sideboardQuantity || 0;
    byDeck.set(key, existing);
  }
  return [...byDeck.values()].sort(
    (a, b) => a.eventId.localeCompare(b.eventId) || a.deckId.localeCompare(b.deckId)
  );
}

function chooseNameJa(a, b) {
  return a.nameJa || b.nameJa || null;
}

function preferCompleteName(a, b) {
  if (!a) return b;
  if (!b) return a;
  return !String(a).includes(' // ') && String(b).includes(' // ') ? b : a;
}
