import type { CardSearchEntry, CardSearchIndex, DeckSearchReference } from '../types';

// Normalizes text for card-name matching. This mirrors normalizeCardName in
// scripts/lib/normalize-card-name.mjs so that browser search keys line up with
// the keys baked into public/data/card-search-index.json. Keep them in sync.
export function normalizeSearchText(value: string): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[‘’ʼ＇]/g, "'")
    .replace(/[‐-―−－]/g, '-')
    .replace(/\s*\/\/\s*/g, ' // ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const MATCH_EXACT = 0;
const MATCH_PREFIX = 1;
const MATCH_WORD_START = 2;
const MATCH_SUBSTRING = 3;
const NO_MATCH = Infinity;
const BASIC_LAND_EN = new Set(['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes']);
const BASIC_LAND_JA = new Set(['平地', '島', '沼', '山', '森', '荒地']);

type BasicLandCandidate = Partial<CardSearchEntry> & {
  name?: string | null;
};

export function cardSearchIdentity(card: CardSearchEntry): string {
  return card.oracleId || card.key || card.normalizedNameEn || normalizeSearchText(card.nameEn);
}

export function isBasicLandCard(card: BasicLandCandidate | null | undefined): boolean {
  if (!card) return false;
  if (card.isBasicLand === true) return true;
  const typeLineEn = String(card.typeLineEn || card.typeLine || '');
  if (/\bbasic\s+land\b/i.test(typeLineEn)) return true;
  const typeLineJa = String(card.typeLineJa || '');
  if (typeLineJa.includes('基本土地')) return true;
  const nameEn = normalizeSearchText(card.nameEn || card.name || '');
  if (BASIC_LAND_EN.has(nameEn)) return true;
  const nameJa = String(card.nameJa || '').normalize('NFKC').trim();
  return BASIC_LAND_JA.has(nameJa);
}

function matchTier(normalized: string | null, query: string): number {
  if (!normalized) return NO_MATCH;
  if (normalized === query) return MATCH_EXACT;
  if (normalized.startsWith(query)) return MATCH_PREFIX;
  if (normalized.split(' ').some((token) => token.startsWith(query))) return MATCH_WORD_START;
  if (normalized.includes(query)) return MATCH_SUBSTRING;
  return NO_MATCH;
}

function cardTier(card: CardSearchEntry, query: string): number {
  const en = card.normalizedNameEn || normalizeSearchText(card.nameEn);
  const ja = card.nameJa ? card.normalizedNameJa || normalizeSearchText(card.nameJa) : null;
  return Math.min(matchTier(en, query), ja ? matchTier(ja, query) : NO_MATCH);
}

// Ranks entries against a raw query: match tier first, then deck count (desc),
// then Japanese name, then English name. Mirrors rankCardSuggestions in
// scripts/lib/card-search.mjs.
export function rankCardSuggestions(
  cards: CardSearchEntry[],
  rawQuery: string,
  limit = 10
): CardSearchEntry[] {
  const query = normalizeSearchText(rawQuery);
  if (!query) return [];

  const scored: { card: CardSearchEntry; tier: number }[] = [];
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

export interface DeckMatch {
  mainboardQuantity: number;
  sideboardQuantity: number;
}

// Builds a lookup of eventId -> (deckId -> quantities) for the selected card so
// the event list can both filter and annotate matching decks in O(1).
export function buildDeckRefIndex(
  card: CardSearchEntry | null
): Map<string, Map<string, DeckMatch>> {
  const index = new Map<string, Map<string, DeckMatch>>();
  if (!card) return index;
  for (const ref of card.deckRefs) {
    const byDeck = index.get(ref.eventId) ?? new Map<string, DeckMatch>();
    const existing = byDeck.get(ref.deckId) ?? {
      mainboardQuantity: 0,
      sideboardQuantity: 0,
    };
    existing.mainboardQuantity += ref.mainboardQuantity;
    existing.sideboardQuantity += ref.sideboardQuantity;
    byDeck.set(ref.deckId, existing);
    index.set(ref.eventId, byDeck);
  }
  return index;
}

// Human-readable "メイン N枚 / サイド M枚" label for a matched deck.
export function formatDeckMatch(match: DeckSearchReference | DeckMatch): string {
  const parts: string[] = [];
  if (match.mainboardQuantity > 0) parts.push(`メイン ${match.mainboardQuantity}枚`);
  if (match.sideboardQuantity > 0) parts.push(`サイド ${match.sideboardQuantity}枚`);
  return parts.join(' / ');
}

export interface ExpansionDeckMatch {
  mainboardQuantity: number;
  sideboardQuantity: number;
  cardKinds: number;
}

// Builds eventId -> (deckId -> aggregate) for every deck containing at least
// one card of the given expansion. Mirrors buildExpansionDeckIndex in
// scripts/lib/card-search.mjs — keep the two in sync.
export function buildExpansionDeckIndex(
  index: CardSearchIndex | null,
  expansionCode: string | null
): Map<string, Map<string, ExpansionDeckMatch>> {
  const result = new Map<string, Map<string, ExpansionDeckMatch>>();
  if (!index || !expansionCode) return result;
  const seenKinds = new Map<string, Set<string>>();
  for (const card of dedupeCardSearchEntries(index.cards)) {
    if (isBasicLandCard(card)) continue;
    if (!(card.setCodes ?? []).includes(expansionCode)) continue;
    const cardKey = cardSearchIdentity(card);
    for (const ref of card.deckRefs) {
      const byDeck = result.get(ref.eventId) ?? new Map<string, ExpansionDeckMatch>();
      const deckKey = `${ref.eventId}\u0000${ref.deckId}`;
      const match = byDeck.get(ref.deckId) ?? {
        mainboardQuantity: 0,
        sideboardQuantity: 0,
        cardKinds: 0,
      };
      match.mainboardQuantity += ref.mainboardQuantity;
      match.sideboardQuantity += ref.sideboardQuantity;
      const deckKinds = seenKinds.get(deckKey) ?? new Set<string>();
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

// "メイン12枚／サイド3枚・5種類" style label for an expansion-filtered deck.
export function formatExpansionMatch(match: ExpansionDeckMatch): string {
  const total = match.mainboardQuantity + match.sideboardQuantity;
  return `${match.cardKinds}種類・合計${total}枚`;
}

// Compact set badge for a card row: single set -> "FDN"; reprints -> "FDN +2"
// (primary code plus how many other sets), with the full list for tooltips.
// Never asserts which printing was actually played.
export function formatSetBadge(
  setCodes: string[] | undefined,
  primarySetCode: string | null | undefined
): { label: string; title: string } | null {
  const codes = setCodes ?? [];
  if (codes.length === 0) return null;
  const primary = primarySetCode && codes.includes(primarySetCode) ? primarySetCode : codes[0];
  const others = codes.length - 1;
  return {
    label: others > 0 ? `${primary} +${others}` : primary,
    title: codes.join(', '),
  };
}

export interface SetBadge {
  code: string;
  label: string;
  title: string;
  selected: boolean;
}

export function formatSetBadges(
  setCodes: string[] | undefined,
  primarySetCode: string | null | undefined,
  selectedSetCode: string | null = null,
  suppressSelected = false
): SetBadge[] {
  const codes = [...new Set(setCodes ?? [])].filter(Boolean);
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
    title: code === selectedSetCode ? `${code}（選択中セット）` : code,
    selected: code === selectedSetCode,
  }));
}

export function dedupeCardSearchEntries(cards: CardSearchEntry[]): CardSearchEntry[] {
  const byKey = new Map<string, CardSearchEntry>();
  for (const card of cards ?? []) {
    const key = cardSearchIdentity(card);
    if (!key) continue;
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeCardSearchEntries(existing, card) : cloneCardSearchEntry(card));
  }
  return [...byKey.values()];
}

function cloneCardSearchEntry(card: CardSearchEntry): CardSearchEntry {
  return {
    ...card,
    setCodes: [...(card.setCodes ?? [])],
    deckRefs: [...(card.deckRefs ?? [])],
  };
}

function mergeCardSearchEntries(a: CardSearchEntry, b: CardSearchEntry): CardSearchEntry {
  const nameJa = a.nameJa || b.nameJa || null;
  const setCodes = [...new Set([...(a.setCodes ?? []), ...(b.setCodes ?? [])])].sort();
  const deckRefs = mergeDeckRefs([...(a.deckRefs ?? []), ...(b.deckRefs ?? [])]);
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

function mergeDeckRefs(refs: DeckSearchReference[]): DeckSearchReference[] {
  const byDeck = new Map<string, DeckSearchReference>();
  for (const ref of refs) {
    const key = `${ref.eventId}\u0000${ref.deckId}`;
    const existing = byDeck.get(key) ?? {
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

function preferCompleteName(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return !a.includes(' // ') && b.includes(' // ') ? b : a;
}

// Intersects the per-deck visibility maps of active filters (card selection,
// expansion). Passing null for a filter means "no restriction from it".
export function intersectDeckIndexes<A, B>(
  a: Map<string, Map<string, A>> | null,
  b: Map<string, Map<string, B>> | null
): Map<string, Set<string>> | null {
  if (!a && !b) return null;
  const single = (m: Map<string, Map<string, unknown>>) => {
    const out = new Map<string, Set<string>>();
    for (const [eventId, decks] of m) out.set(eventId, new Set(decks.keys()));
    return out;
  };
  if (!a) return single(b as Map<string, Map<string, unknown>>);
  if (!b) return single(a as Map<string, Map<string, unknown>>);
  const out = new Map<string, Set<string>>();
  for (const [eventId, decksA] of a) {
    const decksB = b.get(eventId);
    if (!decksB) continue;
    const decks = new Set<string>();
    for (const deckId of decksA.keys()) {
      if (decksB.has(deckId)) decks.add(deckId);
    }
    if (decks.size > 0) out.set(eventId, decks);
  }
  return out;
}
