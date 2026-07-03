import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCardDictionary, getJapaneseName } from '../scripts/lib/build-card-dictionary.mjs';
import { buildSetTranslationAudit } from '../scripts/lib/set-translation-audit.mjs';

const GENERATED_AT = '2026-07-03T12:00:00+09:00';

function entry(nameEn, overrides = {}) {
  return {
    nameEn,
    nameJa: null,
    detailUrl: null,
    typeGroup: 'creature',
    translationStatus: 'missing',
    translationSource: null,
    oracleId: `oracle-${nameEn.toLowerCase().replace(/\s+/g, '-')}`,
    layout: 'normal',
    setCodes: ['MSH'],
    sets: [{ code: 'MSH', name: 'Marvel Super Heroes', releasedAt: '2026-06-26' }],
    primarySetCode: 'MSH',
    ...overrides,
  };
}

test('audits every card of the target set and classifies missing prints', () => {
  const dictionary = {
    cards: {
      'card a': entry('Card A'),
      'card b': entry('Card B', {
        nameJa: 'カードB',
        translationStatus: 'complete',
        translationSource: 'scryfall_printed_name',
      }),
      'other set card': entry('Other Set Card', {
        setCodes: ['FDN'],
        sets: [{ code: 'FDN', name: 'Foundations', releasedAt: '2024-11-15' }],
        primarySetCode: 'FDN',
      }),
    },
  };
  const audit = buildSetTranslationAudit({
    dictionary,
    events: [],
    cache: { oracleIds: {} },
    setCode: 'msh',
    generatedAt: GENERATED_AT,
  });
  assert.equal(audit.setCode, 'MSH');
  // Only MSH cards are audited — the FDN card is out of scope.
  assert.equal(audit.summary.totalCards, 2);
  assert.equal(audit.summary.complete, 1);
  const cardA = audit.cards.find((card) => card.nameEn === 'Card A');
  assert.equal(cardA.reason, 'no_japanese_print_on_scryfall');
  const cardB = audit.cards.find((card) => card.nameEn === 'Card B');
  assert.equal(cardB.reason, null);
  assert.equal(cardB.resolution, 'translated');
});

test('detects an unadopted printed_name and Japanese prints without one', () => {
  const dictionary = {
    cards: {
      'unadopted': entry('Unadopted'),
      'no printed name': entry('No Printed Name'),
    },
  };
  const cache = {
    oracleIds: {
      'oracle-unadopted': {
        checkedAt: GENERATED_AT,
        prints: [{
          lang: 'ja',
          set: 'msh',
          collector_number: '42',
          printed_name: '未採用カード',
          card_faces: [],
        }],
      },
      'oracle-no-printed-name': {
        checkedAt: GENERATED_AT,
        prints: [{
          lang: 'ja',
          set: 'msh',
          collector_number: '43',
          printed_name: null,
          card_faces: [],
        }],
      },
    },
  };
  const audit = buildSetTranslationAudit({
    dictionary,
    events: [],
    cache,
    setCode: 'MSH',
    generatedAt: GENERATED_AT,
  });
  const unadopted = audit.cards.find((card) => card.nameEn === 'Unadopted');
  assert.equal(unadopted.reason, 'printed_name_not_adopted');
  assert.equal(unadopted.collectorNumber, '42');
  assert.equal(unadopted.japanesePrintCount, 1);
  const noPrintedName = audit.cards.find((card) => card.nameEn === 'No Printed Name');
  assert.equal(noPrintedName.reason, 'missing_printed_name');
});

test('flags partial faces, sourceless complete entries, and stale event JSON', () => {
  const dictionary = {
    cards: {
      'partial faces': entry('Partial Faces', { translationStatus: 'partial', layout: 'transform' }),
      'no source': entry('No Source', { nameJa: '出所不明', translationStatus: 'complete', translationSource: null }),
      'stale card': entry('Stale Card', {
        nameJa: '新しい訳',
        translationStatus: 'complete',
        translationSource: 'scryfall_printed_name',
      }),
    },
  };
  const events = [{
    event: { id: 'e1' },
    decks: [{
      mainboard: [{ nameEn: 'Stale Card', nameJa: '古い訳', quantity: 4 }],
      sideboard: [],
    }],
  }];
  const audit = buildSetTranslationAudit({
    dictionary,
    events,
    cache: { oracleIds: {} },
    setCode: 'MSH',
    generatedAt: GENERATED_AT,
  });
  assert.equal(audit.cards.find((card) => card.nameEn === 'Partial Faces').reason, 'partial_card_faces');
  assert.equal(audit.cards.find((card) => card.nameEn === 'No Source').reason, 'complete_without_source');
  const stale = audit.cards.find((card) => card.nameEn === 'Stale Card');
  assert.equal(stale.reason, 'not_applied_to_events');
  assert.deepEqual(stale.usedInEvents, ['e1']);
});

test('same-as-English printed_name from a ja print counts as translated, not missing', () => {
  const dictionary = {
    cards: {
      'proper noun': entry('Proper Noun', {
        nameJa: 'Proper Noun',
        translationStatus: 'complete',
        translationSource: 'scryfall_printed_name',
      }),
    },
  };
  const audit = buildSetTranslationAudit({
    dictionary,
    events: [],
    cache: { oracleIds: {} },
    setCode: 'MSH',
    generatedAt: GENERATED_AT,
  });
  const card = audit.cards.find((item) => item.nameEn === 'Proper Noun');
  // Tracked as sameAsEnglish for visibility, but still resolved.
  assert.equal(card.reason, null);
  assert.equal(audit.summary.sameAsEnglish, 1);
  assert.equal(audit.summary.complete, 1);
});

test('dictionary build never uses card.name as a Japanese name substitute', () => {
  // A ja-language card whose printed_name is absent must stay missing even
  // though card.name (English) is present.
  const japaneseCard = {
    lang: 'ja',
    name: 'English Name',
    printed_name: null,
    card_faces: [],
  };
  const result = getJapaneseName(japaneseCard);
  assert.equal(result.nameJa, null);
  assert.equal(result.status, 'missing');

  const { dictionary } = buildCardDictionary({
    englishPrints: [{
      id: 'en-1',
      oracle_id: 'oracle-x',
      name: 'English Name',
      lang: 'en',
      layout: 'normal',
      scryfall_uri: 'https://scryfall.com/x',
      type_line: 'Creature',
      set: 'msh',
      set_name: 'Marvel Super Heroes',
      set_type: 'expansion',
      released_at: '2026-06-26',
    }],
    japanesePrints: [{ ...japaneseCard, id: 'ja-1', oracle_id: 'oracle-x' }],
    generatedAt: GENERATED_AT,
  });
  const entry2 = dictionary.cards['english name'];
  assert.equal(entry2.nameJa, null);
  assert.equal(entry2.translationStatus, 'missing');
});
