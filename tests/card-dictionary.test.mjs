import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCardDictionary,
  getJapaneseName,
} from '../scripts/lib/build-card-dictionary.mjs';

test('joins renamed English and Japanese prints by oracle_id and registers aliases', () => {
  const result = buildCardDictionary({
    englishPrints: [{
      oracle_id: 'oracle-1',
      name: 'Spider Manifestation',
      printed_name: 'Leyline Weaver',
      lang: 'en',
      layout: 'normal',
      type_line: 'Creature',
      scryfall_uri: 'https://scryfall.test/en',
    }],
    japanesePrints: [{
      oracle_id: 'oracle-1',
      name: 'Spider Manifestation',
      printed_name: '蜘蛛の顕現',
      lang: 'ja',
      layout: 'normal',
      scryfall_uri: 'https://scryfall.test/ja',
    }],
  });

  assert.equal(result.dictionary.cards['spider manifestation'].nameJa, '蜘蛛の顕現');
  assert.equal(result.dictionary.cards['leyline weaver'].nameJa, '蜘蛛の顕現');
  assert.equal(result.dictionary.cards['leyline weaver'].nameEn, 'Leyline Weaver');
  assert.equal(result.stats.oracleJoined, 1);
});

test('uses the available card_faces printed_name when another face is untranslated', () => {
  const japaneseCard = {
    oracle_id: 'oracle-2',
    name: 'Front // Back',
    lang: 'ja',
    card_faces: [
      { name: 'Front', printed_name: '表面' },
      { name: 'Back', printed_name: null },
    ],
  };
  assert.deepEqual(getJapaneseName(japaneseCard), {
    nameJa: '表面',
    source: 'card_faces',
  });

  const result = buildCardDictionary({
    englishPrints: [{
      oracle_id: 'oracle-2',
      name: 'Front // Back',
      lang: 'en',
      layout: 'prepare',
      card_faces: [{ name: 'Front' }, { name: 'Back' }],
    }],
    japanesePrints: [japaneseCard],
  });
  assert.equal(result.dictionary.cards['front // back'].nameJa, '表面');
  assert.equal(result.dictionary.cards.front.nameJa, '表面');
  assert.equal(result.dictionary.cards.back.nameJa, null);
});

test('never lets a later null Japanese candidate replace a translated print', () => {
  const result = buildCardDictionary({
    englishPrints: [{ oracle_id: 'oracle-3', name: 'Card', lang: 'en' }],
    japanesePrints: [
      { oracle_id: 'oracle-3', name: 'Card', lang: 'ja', printed_name: 'カード', released_at: '2025-01-01' },
      { oracle_id: 'oracle-3', name: 'Card', lang: 'ja', printed_name: null, released_at: '2026-01-01' },
    ],
  });
  assert.equal(result.dictionary.cards.card.nameJa, 'カード');
});

test('manual overrides resolve a missing card', () => {
  const result = buildCardDictionary({
    englishPrints: [{ oracle_id: 'oracle-4', name: 'Untranslated', lang: 'en' }],
    japanesePrints: [],
    manualOverrides: {
      untranslated: {
        nameJa: '手動訳',
        detailUrl: 'https://example.test/card',
      },
    },
  });
  assert.equal(result.dictionary.cards.untranslated.nameJa, '手動訳');
  assert.equal(result.dictionary.cards.untranslated.translationStatus, 'complete');
  assert.equal(result.stats.missingJapaneseCards, 0);
});
