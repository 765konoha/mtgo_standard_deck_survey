import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildExpansionDeckIndex,
  dedupeCardSearchEntries,
  filterCardsByExpansion,
  formatSetBadges,
  rankCardSuggestions,
} from '../scripts/lib/card-search.mjs';
import { buildPublicIndexes } from '../scripts/lib/build-public-index.mjs';

const NOW = new Date('2026-07-03T03:00:00+09:00');

function indexCard(nameEn, setCodes, deckRefs, extra = {}) {
  return {
    key: nameEn.toLowerCase(),
    nameEn,
    nameJa: null,
    normalizedNameEn: nameEn.toLowerCase(),
    normalizedNameJa: null,
    oracleId: null,
    setCodes,
    primarySetCode: setCodes[0] || null,
    deckCount: deckRefs.length,
    deckRefs,
    ...extra,
  };
}

function ref(eventId, deckId, main, side) {
  return { eventId, deckId, mainboardQuantity: main, sideboardQuantity: side };
}

test('collects decks containing expansion cards in main, side, or both', () => {
  const index = {
    cards: [
      indexCard('Main Only', ['MSH'], [ref('e1', 'd1', 4, 0)]),
      indexCard('Side Only', ['MSH'], [ref('e1', 'd2', 0, 2)]),
      indexCard('Both Zones', ['MSH'], [ref('e2', 'd3', 3, 1)]),
      indexCard('Other Set', ['FDN'], [ref('e3', 'd4', 4, 0)]),
    ],
  };
  const result = buildExpansionDeckIndex(index, 'MSH');
  assert.deepEqual([...result.keys()].sort(), ['e1', 'e2']);
  assert.deepEqual(result.get('e1').get('d1'), { mainboardQuantity: 4, sideboardQuantity: 0, cardKinds: 1 });
  assert.deepEqual(result.get('e1').get('d2'), { mainboardQuantity: 0, sideboardQuantity: 2, cardKinds: 1 });
  assert.deepEqual(result.get('e2').get('d3'), { mainboardQuantity: 3, sideboardQuantity: 1, cardKinds: 1 });
});

test('does not duplicate a deck when it holds multiple cards of the expansion', () => {
  const index = {
    cards: [
      indexCard('Card A', ['MSH'], [ref('e1', 'd1', 4, 0)]),
      indexCard('Card B', ['MSH'], [ref('e1', 'd1', 2, 1)]),
      indexCard('Card C', ['MSH', 'FDN'], [ref('e1', 'd1', 0, 3)]),
    ],
  };
  const result = buildExpansionDeckIndex(index, 'MSH');
  assert.equal(result.get('e1').size, 1);
  // Aggregates quantities and distinct card kinds across the deck.
  assert.deepEqual(result.get('e1').get('d1'), {
    mainboardQuantity: 6,
    sideboardQuantity: 4,
    cardKinds: 3,
  });
});

test('defensively merges duplicate expansion card entries and deck refs', () => {
  const index = {
    cards: [
      indexCard('Split Card // Back', ['MSH'], [
        ref('e1', 'd1', 4, 0),
      ], { key: 'oracle-a', oracleId: 'oracle-a', nameJa: '分割カード' }),
      indexCard('Split Card', ['FDN', 'MSH'], [
        ref('e1', 'd1', 0, 2),
        ref('e1', 'd1', 1, 0),
      ], { key: 'split card', oracleId: 'oracle-a' }),
    ],
  };

  const deduped = dedupeCardSearchEntries(index.cards);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].nameEn, 'Split Card // Back');
  assert.equal(deduped[0].nameJa, '分割カード');
  assert.deepEqual(deduped[0].setCodes, ['FDN', 'MSH']);
  assert.deepEqual(deduped[0].deckRefs, [ref('e1', 'd1', 5, 2)]);

  const result = buildExpansionDeckIndex(index, 'MSH');
  assert.deepEqual(result.get('e1').get('d1'), {
    mainboardQuantity: 5,
    sideboardQuantity: 2,
    cardKinds: 1,
  });
});

test('returns empty for no expansion selected or unknown codes', () => {
  const index = { cards: [indexCard('Card A', ['MSH'], [ref('e1', 'd1', 4, 0)])] };
  assert.equal(buildExpansionDeckIndex(index, null).size, 0);
  assert.equal(buildExpansionDeckIndex(index, 'ZZZ').size, 0);
  assert.equal(buildExpansionDeckIndex(null, 'MSH').size, 0);
});

test('suggestions narrow to the selected expansion', () => {
  const cards = [
    indexCard('Iron Fortress', ['MSH'], [ref('e1', 'd1', 4, 0)]),
    indexCard('Iron Golem', ['FDN'], [ref('e2', 'd2', 4, 0)]),
  ];
  const filtered = filterCardsByExpansion(cards, 'MSH');
  assert.deepEqual(
    rankCardSuggestions(filtered, 'iron').map((card) => card.nameEn),
    ['Iron Fortress']
  );
  // Without an expansion, everything stays searchable.
  assert.equal(rankCardSuggestions(filterCardsByExpansion(cards, null), 'iron').length, 2);
});

test('suggestions are deduped by oracle id before ranking', () => {
  const cards = [
    indexCard('Esper Origins // Summon: Esper Maduin', ['MSH'], [ref('e1', 'd1', 4, 0)], {
      key: 'oracle-esper',
      oracleId: 'oracle-esper',
      nameJa: '幻獣との交わり // 召喚：幻獣マディン',
      normalizedNameJa: '幻獣との交わり // 召喚:幻獣マディン',
    }),
    indexCard('Esper Origins', ['MSH'], [ref('e1', 'd1', 0, 1)], {
      key: 'esper origins',
      oracleId: 'oracle-esper',
    }),
  ];

  const suggestions = rankCardSuggestions(cards, 'esper');
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].nameEn, 'Esper Origins // Summon: Esper Maduin');
  assert.deepEqual(suggestions[0].deckRefs, [ref('e1', 'd1', 4, 1)]);
});

test('set badges only highlight the selected expansion code', () => {
  assert.deepEqual(formatSetBadges(['FDN', 'MSH'], 'FDN', null), [
    { code: 'FDN', label: 'FDN +1', title: 'FDN, MSH', selected: false },
  ]);
  assert.deepEqual(formatSetBadges(['FDN', 'MSH'], 'FDN', 'MSH'), [
    { code: 'FDN', label: 'FDN', title: 'FDN', selected: false },
    { code: 'MSH', label: 'MSH', title: 'MSH (selected set)', selected: true },
  ]);
});

test('public index aggregates expansion cardCount and deckCount without duplicates', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mtgo-expansion-'));
  const dataDir = join(root, 'data', 'events');
  await mkdir(dataDir, { recursive: true });
  await mkdir(join(root, 'public', 'data', 'events'), { recursive: true });
  const card = (nameEn, quantity, setCodes, extra = {}) => ({
    quantity,
    nameEn,
    nameJa: null,
    translationStatus: 'missing',
    setCodes,
    primarySetCode: setCodes[0] || null,
    ...extra,
  });
  const eventData = {
    schemaVersion: 1,
    event: {
      id: 'e1',
      name: 'e1',
      eventType: 'league',
      eventDate: '2026-07-02',
      publishedDate: '2026-07-02',
      sourceUrl: 'https://www.mtgo.com/decklist/e1',
      status: 'completed',
    },
    decks: [
      {
        id: 'd1',
        player: 'repeat-player',
        record: '5-0',
        mainboard: [
          card('Alpha', 4, ['MSH'], { oracleId: 'oracle-alpha' }),
          card('Beta', 2, ['MSH'], { oracleId: 'oracle-beta' }),
        ],
        sideboard: [
          card('Alpha Face', 1, ['MSH'], { oracleId: 'oracle-alpha' }),
          card('Gamma', 2, ['FDN', 'DMU'], { oracleId: 'oracle-gamma' }),
        ],
      },
      {
        id: 'd2',
        player: 'repeat-player',
        record: '5-0',
        mainboard: [
          card('Alpha', 4, ['MSH'], { oracleId: 'oracle-alpha' }),
          card('NoSet', 4, []),
        ],
        sideboard: [],
      },
    ],
  };
  await writeFile(join(dataDir, 'e1.json'), `${JSON.stringify(eventData)}\n`, 'utf8');

  await buildPublicIndexes({ root, lookbackDays: 10, now: NOW });
  const index = JSON.parse(
    await readFile(join(root, 'public', 'data', 'card-search-index.json'), 'utf8')
  );

  assert.equal(index.schemaVersion, 2);
  const msh = index.expansions.find((expansion) => expansion.code === 'MSH');
  const fdn = index.expansions.find((expansion) => expansion.code === 'FDN');
  const dmu = index.expansions.find((expansion) => expansion.code === 'DMU');
  // Alpha/Alpha Face share one oracleId, so Alpha + Beta = 2 distinct MSH cards;
  // d1 + d2 = 2 decks, never duplicated.
  assert.deepEqual({ cardCount: msh.cardCount, deckCount: msh.deckCount }, { cardCount: 2, deckCount: 2 });
  assert.deepEqual({ cardCount: fdn.cardCount, deckCount: fdn.deckCount }, { cardCount: 1, deckCount: 1 });
  assert.deepEqual({ cardCount: dmu.cardCount, deckCount: dmu.deckCount }, { cardCount: 1, deckCount: 1 });
  // Cards without setCodes still index fine.
  const noSet = index.cards.find((entry) => entry.nameEn === 'NoSet');
  assert.deepEqual(noSet.setCodes, []);
  assert.equal(noSet.primarySetCode, null);
  // Per-card set attributes survive into the index.
  const alpha = index.cards.find((entry) => entry.nameEn === 'Alpha');
  assert.equal(alpha.key, 'oracle-alpha');
  assert.equal(alpha.oracleId, 'oracle-alpha');
  assert.deepEqual(alpha.setCodes, ['MSH']);
  assert.equal(alpha.primarySetCode, 'MSH');

  // Repeated players still have independent deck ids, so the quantities shown
  // for an expansion must match each deck rather than a player-level total.
  const matches = buildExpansionDeckIndex(index, 'MSH').get('e1');
  assert.deepEqual(matches.get('d1'), {
    mainboardQuantity: 6,
    sideboardQuantity: 1,
    cardKinds: 2,
  });
  assert.deepEqual(matches.get('d2'), {
    mainboardQuantity: 4,
    sideboardQuantity: 0,
    cardKinds: 1,
  });
});
