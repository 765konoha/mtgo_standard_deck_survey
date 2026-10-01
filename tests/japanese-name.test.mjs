import assert from 'node:assert/strict';
import test from 'node:test';
import { getJapaneseName, shouldRecheckJapaneseCache } from '../scripts/lib/build-card-dictionary.mjs';
import { stripFurigana } from '../scripts/lib/japanese-name.mjs';
import { translateDecks } from '../scripts/lib/translate-decklists.mjs';

test('removes furigana readings that follow kanji', () => {
  assert.equal(stripFurigana('繁（はん）殖（しょく）池（いけ）'), '繁殖池');
  assert.equal(stripFurigana('光（ひかり）に導（みちび）かれし者（もの）、ハリーヤ'), '光に導かれし者、ハリーヤ');
  assert.equal(stripFurigana('混（こん）合（ごう）成（せい）体（たい）、ダイアドライン'), '混合成体、ダイアドライン');
});

test('leaves names without furigana untouched', () => {
  assert.equal(stripFurigana('草むした墓'), '草むした墓');
  assert.equal(stripFurigana('ショック（テスト）'), 'ショック（テスト）');
  assert.equal(stripFurigana(null), null);
});

test('dictionary names from Scryfall are stored without furigana', () => {
  const result = getJapaneseName({
    lang: 'ja',
    name: 'Annul',
    printed_name: '無（む）効（こう）',
  });
  assert.equal(result.nameJa, '無効');
  assert.equal(result.status, 'complete');
});

test('event translation strips furigana left in an older dictionary', () => {
  const { decks } = translateDecks(
    [{ id: 'd', mainboard: [{ quantity: 1, nameEn: 'Annul' }], sideboard: [] }],
    { cards: { annul: { nameEn: 'Annul', nameJa: '無（む）効（こう）', translationStatus: 'complete' } } }
  );
  assert.equal(decks[0].mainboard[0].nameJa, '無効');
});

const DAY = 86400000;
const NOW = Date.parse('2026-10-01T00:00:00+09:00');
const checkedDaysAgo = (days) => new Date(NOW - days * DAY).toISOString();

test('cached prints with a Japanese name are not rechecked', () => {
  const entry = {
    checkedAt: checkedDaysAgo(60),
    prints: [{ lang: 'ja', name: 'Annul', printed_name: '無効', card_faces: [] }],
  };
  assert.equal(shouldRecheckJapaneseCache(entry, { now: NOW, ttlDays: 7 }), false);
});

test('cached prints without a Japanese name are rechecked after the TTL', () => {
  const entry = (days) => ({
    checkedAt: checkedDaysAgo(days),
    prints: [{ lang: 'ja', name: 'Clarion Conqueror', printed_name: null, card_faces: [] }],
  });
  assert.equal(shouldRecheckJapaneseCache(entry(3), { now: NOW, ttlDays: 7 }), false);
  assert.equal(shouldRecheckJapaneseCache(entry(30), { now: NOW, ttlDays: 7 }), true);
});

test('empty cache entries keep the existing negative-cache TTL', () => {
  assert.equal(shouldRecheckJapaneseCache({ checkedAt: checkedDaysAgo(3), prints: [] }, { now: NOW, ttlDays: 7 }), false);
  assert.equal(shouldRecheckJapaneseCache({ checkedAt: checkedDaysAgo(8), prints: [] }, { now: NOW, ttlDays: 7 }), true);
  assert.equal(shouldRecheckJapaneseCache(undefined, { now: NOW }), true);
});

test('card search does not give a card the Japanese name of its other face', async () => {
  const { mkdtemp, mkdir, readFile, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { buildPublicIndexes } = await import('../scripts/lib/build-public-index.mjs');
  const root = await mkdtemp(join(tmpdir(), 'mtgo-faces-'));
  const oracleId = 'ff812a78-3fe7-47bc-9984-1c2380cff5b1';
  await mkdir(join(root, 'data', 'events'), { recursive: true });
  await mkdir(join(root, 'data', 'cards'), { recursive: true });
  await mkdir(join(root, 'public', 'data', 'events'), { recursive: true });
  // The omen-side alias comes first, as in the real dictionary.
  await writeFile(join(root, 'data', 'cards', 'en-ja-map.json'), JSON.stringify({
    cards: {
      'charring bite': { nameEn: 'Charring Bite', nameJa: '黒焦げの噛みつき', translationStatus: 'complete', oracleId },
      'twinmaw stormbrood': { nameEn: 'Twinmaw Stormbrood', nameJa: null, translationStatus: 'missing', oracleId },
    },
  }));
  await writeFile(join(root, 'data', 'events', 'standard-league-2026-09-3011129.json'), JSON.stringify({
    schemaVersion: 1,
    event: { id: 'standard-league-2026-09-3011129', name: 'Standard League', eventType: 'league', eventDate: '2026-09-30', publishedDate: '2026-09-30', sourceUrl: 'https://www.mtgo.com/decklist/x', status: 'completed' },
    decks: [{ id: 'd1', player: 'p', placement: null, mainboard: [{ quantity: 2, nameEn: 'Twinmaw Stormbrood', nameJa: null, oracleId, translationStatus: 'missing' }], sideboard: [] }],
  }));
  await buildPublicIndexes({ root, lookbackDays: 10, now: new Date('2026-10-01T12:00:00+09:00') });
  const index = JSON.parse(await readFile(join(root, 'public', 'data', 'card-search-index.json'), 'utf8'));
  assert.equal(index.cards[0].nameEn, 'Twinmaw Stormbrood');
  assert.equal(index.cards[0].nameJa, null);
});
