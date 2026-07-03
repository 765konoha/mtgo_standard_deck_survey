import { normalizeCardName } from './normalize-card-name.mjs';

const MULTI_FACE_LAYOUTS = new Set([
  'transform',
  'modal_dfc',
  'adventure',
  'split',
  'prepare',
  'flip',
  'reversible_card',
]);

export function buildTranslationAudit({
  dictionary,
  events,
  generatedAt,
}) {
  const audited = new Map();
  const cards = dictionary?.cards || {};

  for (const entry of Object.values(cards)) {
    const record = ensureRecord(audited, entry.nameEn, entry);
    auditValues(record, entry);
  }

  for (const eventData of events) {
    const eventId = eventData?.event?.id;
    for (const deck of eventData?.decks || []) {
      for (const card of [...(deck.mainboard || []), ...(deck.sideboard || [])]) {
        const dictionaryEntry = cards[normalizeCardName(card.nameEn)];
        const record = ensureRecord(audited, card.nameEn, dictionaryEntry || card);
        if (eventId) record.eventIds.add(eventId);
        auditValues(record, card);
        if (
          dictionaryEntry?.nameJa
          && (
            card.nameJa !== dictionaryEntry.nameJa
            || card.translationStatus !== dictionaryEntry.translationStatus
          )
        ) {
          record.reasons.add('notAppliedToEvents');
        }
      }
    }
  }

  const auditedCards = [...audited.values()]
    .filter((record) => record.reasons.size > 0)
    .map((record) => ({
      nameEn: record.nameEn,
      oracleId: record.oracleId,
      layout: record.layout,
      translationStatus: record.translationStatus,
      translationSource: record.translationSource,
      reason: [...record.reasons][0],
      reasons: [...record.reasons].sort(),
      eventIds: [...record.eventIds].sort(),
    }))
    .sort((a, b) => a.nameEn.localeCompare(b.nameEn));

  const count = (reason) => auditedCards.filter((card) => card.reasons.includes(reason)).length;
  return {
    schemaVersion: 1,
    generatedAt,
    summary: {
      auditedCards: Object.keys(cards).length,
      translated: Object.values(cards).filter(
        (entry) => entry.nameJa && entry.translationStatus === 'complete'
      ).length,
      unresolved: auditedCards.length,
      nameJaNull: count('nameJaNull'),
      missing: count('missing'),
      sameAsEnglish: count('sameAsEnglish'),
      partialFaces: count('partialFaces'),
      notAppliedToEvents: count('notAppliedToEvents'),
      detailWithoutJapaneseName: count('detailWithoutJapaneseName'),
      manualOverrides: Object.values(cards)
        .filter((entry) => entry.translationSource === 'manual_override').length,
    },
    cards: auditedCards,
  };
}

function ensureRecord(records, nameEn, value) {
  const key = normalizeCardName(nameEn);
  if (!records.has(key)) {
    records.set(key, {
      nameEn,
      oracleId: value?.oracleId || null,
      layout: value?.layout || null,
      translationStatus: value?.translationStatus || 'missing',
      translationSource: value?.translationSource || null,
      reasons: new Set(),
      eventIds: new Set(),
    });
  }
  const record = records.get(key);
  record.oracleId ||= value?.oracleId || null;
  record.layout ||= value?.layout || null;
  return record;
}

function auditValues(record, value) {
  if (!value?.nameJa) record.reasons.add('nameJaNull');
  if (value?.translationStatus === 'missing') record.reasons.add('missing');
  if (
    value?.nameJa
    && normalizeCardName(value.nameJa) === normalizeCardName(value.nameEn)
  ) {
    record.reasons.add('sameAsEnglish');
  }
  if (
    value?.translationStatus === 'partial'
    || (
      MULTI_FACE_LAYOUTS.has(value?.layout)
      && Array.isArray(value?.translatedFaces)
      && value.translatedFaces.some((face) => face.nameJa)
      && value.translatedFaces.some((face) => !face.nameJa)
    )
  ) {
    record.reasons.add('partialFaces');
  }
  if (value?.detailUrl && value?.oracleId && !value?.nameJa) {
    record.reasons.add('detailWithoutJapaneseName');
  }
  record.translationStatus = value?.translationStatus || record.translationStatus;
  record.translationSource = value?.translationSource || record.translationSource;
}
