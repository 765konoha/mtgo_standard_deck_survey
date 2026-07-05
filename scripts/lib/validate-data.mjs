const VALID_STATUSES = new Set([
  'discovered',
  'pending_publication',
  'completed',
  'fetch_error',
  'parse_error',
  'publication_timeout',
]);

export function validateEventData(eventData) {
  const errors = [];
  if (!eventData?.event?.id) errors.push('event.id is required');
  if (!eventData?.event?.sourceUrl) errors.push('event.sourceUrl is required');
  if (!VALID_STATUSES.has(eventData?.event?.status)) errors.push('invalid event.status');
  if (!Array.isArray(eventData?.decks)) errors.push('decks must be an array');

  const seenPlacements = new Set();
  const seenDeckIds = new Set();
  for (const [deckIndex, deck] of (eventData?.decks || []).entries()) {
    if (!deck.id) {
      errors.push(`deck ${deckIndex}: id is required`);
    } else if (seenDeckIds.has(deck.id)) {
      errors.push(`deck ${deckIndex}: duplicate id ${deck.id}`);
    }
    seenDeckIds.add(deck.id);
    if (!deck.player) errors.push(`deck ${deckIndex}: player is required`);
    if (!Array.isArray(deck.mainboard) || deck.mainboard.length === 0) {
      errors.push(`deck ${deckIndex}: mainboard is empty`);
    }
    if (eventData.event.eventType === 'challenge') {
      if (!Number.isInteger(deck.placement) || deck.placement < 1 || deck.placement > 8) {
        errors.push(`deck ${deckIndex}: challenge placement must be 1-8`);
      }
      if (seenPlacements.has(deck.placement)) {
        errors.push(`deck ${deckIndex}: duplicate placement ${deck.placement}`);
      }
      seenPlacements.add(deck.placement);
    }
    if (eventData.event.eventType === 'league' && deck.record !== '5-0') {
      errors.push(`deck ${deckIndex}: league record must be 5-0`);
    }
    for (const [cardIndex, card] of [...(deck.mainboard || []), ...(deck.sideboard || [])].entries()) {
      if (!Number.isInteger(card.quantity) || card.quantity <= 0) {
        errors.push(`deck ${deckIndex} card ${cardIndex}: quantity must be positive`);
      }
      // Expansion attributes are optional (older events may predate them) but
      // must be consistent when present.
      if (card.setCodes !== undefined && !Array.isArray(card.setCodes)) {
        errors.push(`deck ${deckIndex} card ${cardIndex}: setCodes must be an array`);
      }
      if (
        card.primarySetCode != null
        && !(Array.isArray(card.setCodes) && card.setCodes.includes(card.primarySetCode))
      ) {
        errors.push(`deck ${deckIndex} card ${cardIndex}: primarySetCode must be null or in setCodes`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
}

