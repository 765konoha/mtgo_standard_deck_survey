import type { CardSearchEntry, DeckSearchReference } from '../types';

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
    byDeck.set(ref.deckId, {
      mainboardQuantity: ref.mainboardQuantity,
      sideboardQuantity: ref.sideboardQuantity,
    });
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
