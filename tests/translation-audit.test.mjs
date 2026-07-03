import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTranslationAudit } from '../scripts/lib/translation-audit.mjs';

test('audits null, same-as-English, partial, and stale event translations', () => {
  const dictionary = {
    cards: {
      missing: {
        nameEn: 'Missing',
        nameJa: null,
        detailUrl: 'https://example.test/missing',
        oracleId: 'missing-id',
        translationStatus: 'missing',
      },
      suspicious: {
        nameEn: 'Suspicious',
        nameJa: 'Suspicious',
        translationStatus: 'complete',
        translationSource: 'scryfall_printed_name',
      },
      'double card': {
        nameEn: 'Double Card',
        nameJa: null,
        oracleId: 'double-id',
        layout: 'transform',
        translationStatus: 'partial',
        translationSource: 'scryfall_card_faces',
        translatedFaces: [
          { nameEn: 'Front', nameJa: '\u8868\u9762' },
          { nameEn: 'Back', nameJa: null },
        ],
      },
      translated: {
        nameEn: 'Translated',
        nameJa: '\u7FFB\u8A33\u6E08\u307F',
        translationStatus: 'complete',
        translationSource: 'scryfall_printed_name',
      },
    },
  };
  const events = [{
    event: { id: 'event-1' },
    decks: [{
      mainboard: [{
        nameEn: 'Translated',
        nameJa: null,
        translationStatus: 'missing',
      }],
      sideboard: [],
    }],
  }];
  const audit = buildTranslationAudit({ dictionary, events, generatedAt: 'now' });

  assert.equal(audit.summary.nameJaNull, 3);
  assert.equal(audit.summary.missing, 2);
  assert.equal(audit.summary.sameAsEnglish, 1);
  assert.equal(audit.summary.partialFaces, 1);
  assert.equal(audit.summary.notAppliedToEvents, 1);
  assert.ok(audit.cards.find((card) => card.nameEn === 'Missing'));
  assert.deepEqual(
    audit.cards.find((card) => card.nameEn === 'Translated').eventIds,
    ['event-1']
  );
});
