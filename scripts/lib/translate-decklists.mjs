import { normalizeCardName } from './normalize-card-name.mjs';

export function translateDecks(decks, dictionary) {
  const cards = dictionary?.cards || {};
  let missing = 0;

  const translateCard = (card) => {
    const entry = cards[normalizeCardName(card.nameEn)];
    if (!entry || !entry.nameJa) missing += 1;
    return {
      quantity: card.quantity,
      nameEn: entry?.nameEn || card.nameEn,
      nameJa: entry?.nameJa || null,
      detailUrl: entry?.detailUrl || null,
      typeGroup: entry?.typeGroup || 'other',
      category: entry?.typeGroup || 'other',
      oracleId: entry?.oracleId || null,
      translationStatus: entry?.translationStatus || 'missing',
      translationSource: entry?.translationSource || null,
      setCodes: entry?.setCodes || [],
      primarySetCode: entry?.primarySetCode ?? null,
    };
  };

  const translatedDecks = decks.map((deck) => ({
    ...deck,
    // MTGO emits separate rows for different printings / artwork of the same
    // card. They are deck-list details, not distinct card names, so combine
    // them within each zone before attaching dictionary metadata.
    mainboard: mergeCardRows(deck.mainboard).map(translateCard),
    sideboard: mergeCardRows(deck.sideboard).map(translateCard),
  }));

  return { decks: translatedDecks, missing };
}

export function mergeCardRows(cards) {
  const merged = new Map();

  for (const card of cards || []) {
    const key = normalizeCardName(card.nameEn);
    if (!key) continue;

    const existing = merged.get(key);
    if (existing) {
      existing.quantity += card.quantity;
    } else {
      merged.set(key, { ...card });
    }
  }

  return [...merged.values()];
}

