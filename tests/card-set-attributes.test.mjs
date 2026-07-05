import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCardDictionary,
  collectSetReferences,
  mergeSetScopedDictionary,
} from '../scripts/lib/build-card-dictionary.mjs';
import { translateDecks } from '../scripts/lib/translate-decklists.mjs';

function print(overrides = {}) {
  return {
    id: overrides.id || Math.random().toString(36).slice(2),
    oracle_id: 'oracle-1',
    name: 'Example Card',
    lang: 'en',
    layout: 'normal',
    scryfall_uri: 'https://scryfall.com/example',
    type_line: 'Instant',
    set: 'dmu',
    set_name: 'Dominaria United',
    set_type: 'expansion',
    released_at: '2022-09-09',
    collector_number: '1',
    ...overrides,
  };
}

test('uppercases Scryfall set codes and keeps set names and release dates', () => {
  const refs = collectSetReferences([print({ set: 'msh', set_name: 'Marvel Super Heroes', released_at: '2026-06-26' })]);
  assert.deepEqual(refs.setCodes, ['MSH']);
  assert.deepEqual(refs.sets, [
    { code: 'MSH', name: 'Marvel Super Heroes', releasedAt: '2026-06-26' },
  ]);
  assert.equal(refs.primarySetCode, 'MSH');
});

test('deduplicates multiple printings of the same set within one oracle group', () => {
  const refs = collectSetReferences([
    print({ id: 'a', set: 'fdn' }),
    print({ id: 'b', set: 'fdn' }),
  ]);
  assert.deepEqual(refs.setCodes, ['FDN']);
});

test('reprints keep every expansion set, stably sorted by release date desc', () => {
  const prints = [
    print({ id: 'a', set: 'dmu', set_name: 'Dominaria United', released_at: '2022-09-09' }),
    print({ id: 'b', set: 'fdn', set_name: 'Foundations', released_at: '2024-11-15' }),
  ];
  const refs = collectSetReferences(prints);
  const reversed = collectSetReferences([...prints].reverse());
  assert.deepEqual(refs.setCodes, ['FDN', 'DMU']);
  assert.deepEqual(reversed.setCodes, ['FDN', 'DMU']);
  assert.equal(refs.primarySetCode, 'FDN');
});

test('excludes token/promo/memorabilia printings but falls back when nothing else exists', () => {
  const refs = collectSetReferences([
    print({ id: 'a', set: 'fdn', set_type: 'expansion' }),
    print({ id: 'b', set: 'tfdn', set_type: 'token' }),
    print({ id: 'c', set: 'pfdn', set_type: 'promo' }),
    print({ id: 'd', set: 'afdn', set_type: 'memorabilia' }),
  ]);
  assert.deepEqual(refs.setCodes, ['FDN']);

  const fallback = collectSetReferences([
    print({ id: 'e', set: 'msc', set_type: 'commander', set_name: 'MSH Commander' }),
  ]);
  assert.deepEqual(fallback.setCodes, ['MSC']);
});

test('restricts setCodes to the allowed Standard set list, with fallback', () => {
  const prints = [
    print({ id: 'a', set: 'msh', set_name: 'Marvel Super Heroes', released_at: '2026-06-26' }),
    print({ id: 'b', set: 'ths', set_name: 'Theros', released_at: '2013-09-27' }),
    print({ id: 'c', set: 'm15', set_name: 'Magic 2015', released_at: '2014-07-18' }),
  ];
  const allowed = new Set(['MSH', 'FDN']);
  const refs = collectSetReferences(prints, allowed);
  // Old Theros / M15 reprints are dropped; only the in-Standard set remains.
  assert.deepEqual(refs.setCodes, ['MSH']);
  assert.equal(refs.primarySetCode, 'MSH');

  // A card whose printings are all outside the Standard list gets no set codes
  // rather than a misleading rotated-out one.
  const legacy = collectSetReferences([print({ id: 'd', set: 'ths', released_at: '2013-09-27' })], allowed);
  assert.deepEqual(legacy.setCodes, []);
  assert.equal(legacy.primarySetCode, null);

  // A Commander/promo-only printing is likewise not attributed under a config.
  const commanderOnly = collectSetReferences(
    [print({ id: 'e', set: 'msc', set_type: 'commander', released_at: '2026-06-26' })],
    allowed
  );
  assert.deepEqual(commanderOnly.setCodes, []);
});

test('handles cards without set data safely', () => {
  const refs = collectSetReferences([print({ set: undefined, set_name: undefined })]);
  assert.deepEqual(refs.setCodes, []);
  assert.deepEqual(refs.sets, []);
  assert.equal(refs.primarySetCode, null);
  assert.deepEqual(collectSetReferences([]).setCodes, []);
});

test('buildCardDictionary attaches set attributes to entries', () => {
  const { dictionary } = buildCardDictionary({
    englishPrints: [
      print({ id: 'a', set: 'dmu', released_at: '2022-09-09' }),
      print({ id: 'b', set: 'fdn', set_name: 'Foundations', released_at: '2024-11-15' }),
    ],
    japanesePrints: [],
    generatedAt: '2026-07-03T12:00:00+09:00',
  });
  const entry = dictionary.cards['example card'];
  assert.deepEqual(entry.setCodes, ['FDN', 'DMU']);
  assert.equal(entry.primarySetCode, 'FDN');
  assert.equal(entry.sets[0].name, 'Foundations');
});

test('translateDecks reflects setCodes into event JSON cards', () => {
  const dictionary = {
    cards: {
      'example card': {
        nameEn: 'Example Card',
        nameJa: 'サンプル',
        detailUrl: null,
        typeGroup: 'instant',
        translationStatus: 'complete',
        translationSource: 'scryfall_printed_name',
        oracleId: 'oracle-1',
        setCodes: ['MSH'],
        primarySetCode: 'MSH',
      },
    },
  };
  const { decks } = translateDecks(
    [{ id: 'd1', mainboard: [{ quantity: 4, nameEn: 'Example Card' }], sideboard: [{ quantity: 1, nameEn: 'Unknown Card' }] }],
    dictionary
  );
  assert.deepEqual(decks[0].mainboard[0].setCodes, ['MSH']);
  assert.equal(decks[0].mainboard[0].primarySetCode, 'MSH');
  // Cards absent from the dictionary degrade to empty attribution, not errors.
  assert.deepEqual(decks[0].sideboard[0].setCodes, []);
  assert.equal(decks[0].sideboard[0].primarySetCode, null);
});

test('set-scoped merge preserves other sets and never nulls a good translation', () => {
  const existing = {
    schemaVersion: 1,
    cards: {
      'other card': {
        nameEn: 'Other Card',
        nameJa: '他のカード',
        translationStatus: 'complete',
        translationSource: 'scryfall_printed_name',
        setCodes: ['FDN'],
        sets: [{ code: 'FDN', name: 'Foundations', releasedAt: '2024-11-15' }],
        primarySetCode: 'FDN',
      },
      'shared card': {
        nameEn: 'Shared Card',
        nameJa: '既訳カード',
        translationStatus: 'complete',
        translationSource: 'scryfall_printed_name',
        setCodes: ['DMU'],
        sets: [{ code: 'DMU', name: 'Dominaria United', releasedAt: '2022-09-09' }],
        primarySetCode: 'DMU',
      },
    },
  };
  const partial = {
    schemaVersion: 1,
    generatedAt: '2026-07-03T12:00:00+09:00',
    cards: {
      'shared card': {
        nameEn: 'Shared Card',
        nameJa: null,
        translationStatus: 'missing',
        translationSource: null,
        setCodes: ['MSH'],
        sets: [{ code: 'MSH', name: 'Marvel Super Heroes', releasedAt: '2026-06-26' }],
        primarySetCode: 'MSH',
      },
      'new msh card': {
        nameEn: 'New MSH Card',
        nameJa: null,
        translationStatus: 'missing',
        translationSource: null,
        setCodes: ['MSH'],
        sets: [{ code: 'MSH', name: 'Marvel Super Heroes', releasedAt: '2026-06-26' }],
        primarySetCode: 'MSH',
      },
    },
  };
  const { dictionary, mergeStats } = mergeSetScopedDictionary(existing, partial);
  // Untouched entry from another set survives.
  assert.equal(dictionary.cards['other card'].nameJa, '他のカード');
  // Existing translation is never overwritten by a null candidate.
  const shared = dictionary.cards['shared card'];
  assert.equal(shared.nameJa, '既訳カード');
  assert.equal(shared.translationStatus, 'complete');
  // Set attributes are unioned and re-sorted (MSH is newer).
  assert.deepEqual(shared.setCodes, ['MSH', 'DMU']);
  assert.equal(shared.primarySetCode, 'MSH');
  assert.equal(dictionary.cards['new msh card'].nameEn, 'New MSH Card');
  assert.equal(mergeStats.added, 1);
  assert.equal(mergeStats.translationsPreserved, 1);
});

test('set-scoped merge adopts fresh translations and keeps manual overrides', () => {
  const existing = {
    schemaVersion: 1,
    cards: {
      'msh card': {
        nameEn: 'MSH Card',
        nameJa: null,
        translationStatus: 'missing',
        translationSource: null,
        setCodes: ['MSH'],
        sets: [{ code: 'MSH', name: null, releasedAt: '2026-06-26' }],
        primarySetCode: 'MSH',
      },
      'manual card': {
        nameEn: 'Manual Card',
        nameJa: '手動訳',
        translationStatus: 'complete',
        translationSource: 'manual_override',
        setCodes: ['MSH'],
        sets: [{ code: 'MSH', name: null, releasedAt: '2026-06-26' }],
        primarySetCode: 'MSH',
      },
    },
  };
  const partial = {
    schemaVersion: 1,
    cards: {
      'msh card': {
        nameEn: 'MSH Card',
        nameJa: '新訳カード',
        translationStatus: 'complete',
        translationSource: 'scryfall_printed_name',
        setCodes: ['MSH'],
        sets: [{ code: 'MSH', name: 'Marvel Super Heroes', releasedAt: '2026-06-26' }],
        primarySetCode: 'MSH',
      },
      'manual card': {
        nameEn: 'Manual Card',
        nameJa: 'Scryfall訳',
        translationStatus: 'complete',
        translationSource: 'scryfall_printed_name',
        setCodes: ['MSH'],
        sets: [{ code: 'MSH', name: 'Marvel Super Heroes', releasedAt: '2026-06-26' }],
        primarySetCode: 'MSH',
      },
    },
  };
  const { dictionary } = mergeSetScopedDictionary(existing, partial);
  assert.equal(dictionary.cards['msh card'].nameJa, '新訳カード');
  assert.equal(dictionary.cards['msh card'].translationSource, 'scryfall_printed_name');
  // Manual overrides outrank fetched translations.
  assert.equal(dictionary.cards['manual card'].nameJa, '手動訳');
  assert.equal(dictionary.cards['manual card'].translationSource, 'manual_override');
});
