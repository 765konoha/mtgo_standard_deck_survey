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
    };
  };

  const translatedDecks = decks.map((deck) => ({
    ...deck,
    mainboard: deck.mainboard.map(translateCard),
    sideboard: deck.sideboard.map(translateCard),
  }));

  return { decks: translatedDecks, missing };
}

