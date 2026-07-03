import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCardDictionary,
  getJapaneseName,
} from '../scripts/lib/build-card-dictionary.mjs';

const GREAT_HALL_JA = '\u5927\u56F3\u66F8\u68DF\u306E\u5927\u30DB\u30FC\u30EB';
const VIBRANT_JA = '\u9BAE\u3084\u304B\u306A\u8FF8\u308A';
const EMERITUS_JA = '\u89B3\u5FF5\u306E\u540D\u8A89\u6559\u6388 // \u7956\u5148\u306E\u56DE\u60F3';
const ESPER_JA = '\u5E7B\u7363\u3068\u306E\u4EA4\u308F\u308A // \u53EC\u559A\uFF1A\u5E7B\u7363\u30DE\u30C7\u30A3\u30F3';

test('joins renamed English and Japanese prints by oracle_id and registers aliases', () => {
  const result = buildCardDictionary({
    englishPrints: [{
      oracle_id: 'oracle-1',
      name: 'Spider Manifestation',
      printed_name: 'Leyline Weaver',
      lang: 'en',
      type_line: 'Creature',
    }],
    japanesePrints: [{
      oracle_id: 'oracle-1',
      name: 'Spider Manifestation',
      printed_name: '\u8718\u86DB\u306E\u9855\u73FE',
      lang: 'ja',
    }],
  });

  assert.equal(result.dictionary.cards['leyline weaver'].nameJa, '\u8718\u86DB\u306E\u9855\u73FE');
  assert.equal(result.dictionary.cards['leyline weaver'].translationSource, 'scryfall_printed_name');
});

test('uses manual overrides for investigated Scryfall gaps', () => {
  const result = buildCardDictionary({
    englishPrints: [
      { oracle_id: 'great', name: 'Great Hall of the Biblioplex', lang: 'en' },
      { oracle_id: 'vibrant', name: 'Vibrant Outburst', lang: 'en' },
      {
        oracle_id: 'emeritus',
        name: 'Emeritus of Ideation // Ancestral Recall',
        lang: 'en',
        card_faces: [{ name: 'Emeritus of Ideation' }, { name: 'Ancestral Recall' }],
      },
    ],
    japanesePrints: [{
      oracle_id: 'emeritus',
      name: 'Emeritus of Ideation // Ancestral Recall',
      lang: 'ja',
      card_faces: [
        { name: 'Emeritus of Ideation', printed_name: '\u89B3\u5FF5\u306E\u540D\u8A89\u6559\u6388' },
        { name: 'Ancestral Recall', printed_name: null },
      ],
    }],
    manualOverrides: {
      'Great Hall of the Biblioplex': { nameJa: GREAT_HALL_JA },
      'Vibrant Outburst': { nameJa: VIBRANT_JA },
      'Emeritus of Ideation // Ancestral Recall': { nameJa: EMERITUS_JA },
    },
  });

  assert.equal(result.dictionary.cards['great hall of the biblioplex'].nameJa, GREAT_HALL_JA);
  assert.equal(result.dictionary.cards['vibrant outburst'].nameJa, VIBRANT_JA);
  assert.equal(result.dictionary.cards['emeritus of ideation // ancestral recall'].nameJa, EMERITUS_JA);
  assert.equal(
    result.dictionary.cards['emeritus of ideation // ancestral recall'].translationSource,
    'manual_override'
  );
});

test('selects the fully translated Japanese Esper print', () => {
  const englishCard = {
    oracle_id: 'esper',
    name: 'Esper Origins // Summon: Esper Maduin',
    lang: 'en',
    card_faces: [{ name: 'Esper Origins' }, { name: 'Summon: Esper Maduin' }],
  };
  const untranslatedJapanesePrint = {
    ...englishCard,
    lang: 'ja',
    collector_number: '185',
    card_faces: [
      { name: 'Esper Origins', printed_name: 'Esper Origins' },
      { name: 'Summon: Esper Maduin', printed_name: 'Summon: Esper Maduin' },
    ],
  };
  const translatedJapanesePrint = {
    ...englishCard,
    lang: 'ja',
    collector_number: '370',
    card_faces: [
      { name: 'Esper Origins', printed_name: '\u5E7B\u7363\u3068\u306E\u4EA4\u308F\u308A' },
      { name: 'Summon: Esper Maduin', printed_name: '\u53EC\u559A\uFF1A\u5E7B\u7363\u30DE\u30C7\u30A3\u30F3' },
    ],
  };
  const result = buildCardDictionary({
    englishPrints: [englishCard],
    japanesePrints: [untranslatedJapanesePrint, translatedJapanesePrint],
  });
  const entry = result.dictionary.cards['esper origins // summon: esper maduin'];

  assert.equal(entry.nameJa, ESPER_JA);
  assert.equal(entry.translationStatus, 'complete');
  assert.equal(entry.translationSource, 'scryfall_printed_name');
});

test('does not use English card or face names as Japanese fallbacks', () => {
  assert.deepEqual(getJapaneseName({
    lang: 'ja',
    name: 'Front // Back',
    card_faces: [
      { name: 'Front', printed_name: 'Front' },
      { name: 'Back', printed_name: 'Back' },
    ],
  }), { nameJa: null, source: null });

  const result = buildCardDictionary({
    englishPrints: [{ oracle_id: 'missing', name: 'English Only', lang: 'en' }],
    japanesePrints: [{ oracle_id: 'missing', name: 'English Only', lang: 'ja' }],
  });
  assert.equal(result.dictionary.cards['english only'].nameJa, null);
  assert.equal(result.dictionary.cards['english only'].translationStatus, 'missing');
  assert.equal(result.dictionary.cards['english only'].translationSource, null);
});

test('never lets a later null Japanese candidate replace a translated print', () => {
  const result = buildCardDictionary({
    englishPrints: [{ oracle_id: 'card', name: 'Card', lang: 'en' }],
    japanesePrints: [
      { oracle_id: 'card', name: 'Card', lang: 'ja', printed_name: '\u30AB\u30FC\u30C9' },
      { oracle_id: 'card', name: 'Card', lang: 'ja', printed_name: null },
    ],
  });
  assert.equal(result.dictionary.cards.card.nameJa, '\u30AB\u30FC\u30C9');
});
