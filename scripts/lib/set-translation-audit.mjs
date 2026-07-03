import { normalizeCardName } from './normalize-card-name.mjs';

// Audits the Japanese translation state of every dictionary entry that belongs
// to one set (by setCodes). Works entirely from local data: the dictionary,
// event JSON, and the Scryfall Japanese-print cache.
export function buildSetTranslationAudit({
  dictionary,
  events = [],
  cache = null,
  setCode,
  generatedAt,
}) {
  const targetCode = String(setCode || '').toUpperCase();
  const cards = dictionary?.cards || {};
  const cachedOracle = cache?.oracleIds || {};

  // Collect how each card is used in events so we can detect stale event JSON.
  const eventUsage = new Map();
  for (const eventData of events) {
    const eventId = eventData?.event?.id;
    for (const deck of eventData?.decks || []) {
      for (const card of [...(deck.mainboard || []), ...(deck.sideboard || [])]) {
        const key = normalizeCardName(card.nameEn);
        const usage = eventUsage.get(key) || { eventIds: new Set(), staleTranslation: false };
        if (eventId) usage.eventIds.add(eventId);
        const entry = cards[key];
        if (entry?.nameJa && card.nameJa !== entry.nameJa) usage.staleTranslation = true;
        eventUsage.set(key, usage);
      }
    }
  }

  const auditedCards = [];
  const seenOracleIds = new Set();
  for (const [key, entry] of Object.entries(cards)) {
    if (!(entry.setCodes || []).includes(targetCode)) continue;
    // Audit one row per oracle identity; aliases share the same translation.
    if (entry.oracleId && seenOracleIds.has(entry.oracleId)) continue;
    if (entry.oracleId) seenOracleIds.add(entry.oracleId);

    const cachedPrints = entry.oracleId ? cachedOracle[entry.oracleId]?.prints || [] : [];
    const japanesePrints = cachedPrints.filter((print) => print.lang === 'ja');
    const usage = eventUsage.get(key) || { eventIds: new Set(), staleTranslation: false };
    const reason = classify(entry, japanesePrints, usage);
    auditedCards.push({
      nameEn: entry.nameEn,
      nameJa: entry.nameJa ?? null,
      oracleId: entry.oracleId || null,
      collectorNumber: japanesePrints[0]?.collector_number || null,
      layout: entry.layout || null,
      translationStatus: entry.translationStatus,
      translationSource: entry.translationSource || null,
      japanesePrintCount: japanesePrints.length,
      japanesePrintedNames: japanesePrints.map((print) => ({
        printedName: print.printed_name || null,
        facePrintedNames: (print.card_faces || []).map((face) => face.printed_name || null),
      })),
      usedInEvents: [...usage.eventIds].sort(),
      reason,
      resolution: reason === null ? 'translated' : null,
    });
  }
  auditedCards.sort((a, b) => a.nameEn.localeCompare(b.nameEn));

  const byReason = (reason) => auditedCards.filter((card) => card.reason === reason).length;
  return {
    schemaVersion: 1,
    generatedAt,
    setCode: targetCode,
    summary: {
      totalCards: auditedCards.length,
      complete: auditedCards.filter((card) => card.translationStatus === 'complete').length,
      missing: byReason('no_japanese_print_on_scryfall') + byReason('missing_printed_name'),
      sameAsEnglish: auditedCards.filter(
        (card) => card.nameJa && normalizeCardName(card.nameJa) === normalizeCardName(card.nameEn)
      ).length,
      partial: byReason('partial_card_faces'),
      completeWithoutSource: byReason('complete_without_source'),
      printedNameNotAdopted: byReason('printed_name_not_adopted'),
      notAppliedToEvents: byReason('not_applied_to_events'),
    },
    cards: auditedCards,
  };
}

function classify(entry, japanesePrints, usage) {
  // F: dictionary has the translation but event JSON still carries an old value.
  if (entry.nameJa && usage.staleTranslation) return 'not_applied_to_events';
  // D: complete without evidence of where the name came from.
  if (entry.translationStatus === 'complete' && entry.nameJa && !entry.translationSource) {
    return 'complete_without_source';
  }
  if (entry.nameJa && entry.translationStatus === 'complete') return null;
  // E: some faces translated, others not.
  if (entry.translationStatus === 'partial') return 'partial_card_faces';
  // G: a Japanese print with a printed_name exists but was not adopted.
  const hasPrintedName = japanesePrints.some(
    (print) => print.printed_name || (print.card_faces || []).some((face) => face.printed_name)
  );
  if (hasPrintedName) return 'printed_name_not_adopted';
  // A/B: nothing usable — distinguish "no Japanese print at all" from
  // "Japanese print exists but has no printed name".
  return japanesePrints.length > 0 ? 'missing_printed_name' : 'no_japanese_print_on_scryfall';
}
