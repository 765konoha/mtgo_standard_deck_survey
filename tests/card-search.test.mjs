import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSearchText, rankCardSuggestions } from '../scripts/lib/card-search.mjs';

function entry(nameEn, nameJa, deckCount) {
  return {
    key: normalizeSearchText(nameEn),
    nameEn,
    nameJa: nameJa ?? null,
    normalizedNameEn: normalizeSearchText(nameEn),
    normalizedNameJa: nameJa ? normalizeSearchText(nameJa) : null,
    deckCount,
    deckRefs: [],
  };
}

test('normalizeSearchText folds case, width, whitespace, apostrophes, dashes and //', () => {
  assert.equal(normalizeSearchText('Lightning Strike'), 'lightning strike');
  assert.equal(normalizeSearchText('ＬＩＧＨＴ'), 'light');
  assert.equal(normalizeSearchText('  Lightning   Strike  '), 'lightning strike');
  assert.equal(normalizeSearchText('Urza’s Saga'), "urza's saga");
  assert.equal(normalizeSearchText('Fire—Ice'), 'fire-ice');
  assert.equal(normalizeSearchText('Fire//Ice'), 'fire // ice');
  assert.equal(normalizeSearchText('Fire  //  Ice'), 'fire // ice');
});

test('matches Japanese and English substrings case-insensitively', () => {
  const cards = [entry('Lightning Strike', '稲妻の一撃', 6)];
  assert.deepEqual(rankCardSuggestions(cards, '稲妻').map((c) => c.nameEn), ['Lightning Strike']);
  assert.deepEqual(rankCardSuggestions(cards, 'light').map((c) => c.nameEn), ['Lightning Strike']);
  assert.deepEqual(rankCardSuggestions(cards, 'LIGHT').map((c) => c.nameEn), ['Lightning Strike']);
});

test('exact match outranks prefix and substring', () => {
  const cards = [
    entry('Lightning Strike Force', null, 20),
    entry('Lightning', null, 1),
    entry('Ball Lightning', null, 30),
  ];
  assert.deepEqual(
    rankCardSuggestions(cards, 'lightning').map((c) => c.nameEn),
    ['Lightning', 'Lightning Strike Force', 'Ball Lightning']
  );
});

test('prefix match outranks non-prefix substring', () => {
  const cards = [
    entry('Skylight Chasm', null, 50),
    entry('Light Up the Stage', null, 1),
  ];
  assert.deepEqual(
    rankCardSuggestions(cards, 'light').map((c) => c.nameEn),
    ['Light Up the Stage', 'Skylight Chasm']
  );
});

test('word-start match outranks a mid-word substring', () => {
  const cards = [
    entry('Battlewing Mystic', null, 40),
    entry('Storm Fury', null, 1),
  ];
  // "fury" starts the second word of "Storm Fury"; in "Battlewing" it never
  // starts a word. Even with a much larger deckCount the word-start wins.
  assert.deepEqual(
    rankCardSuggestions(cards, 'fu', 10).map((c) => c.nameEn),
    ['Storm Fury']
  );
});

test('ties break by deck count descending', () => {
  const cards = [
    entry('Fire A', null, 2),
    entry('Fire B', null, 9),
    entry('Fire C', null, 5),
  ];
  assert.deepEqual(
    rankCardSuggestions(cards, 'fire').map((c) => c.nameEn),
    ['Fire B', 'Fire C', 'Fire A']
  );
});

test('limits suggestions to at most ten', () => {
  const cards = Array.from({ length: 12 }, (_, i) => entry(`Bolt ${String(i).padStart(2, '0')}`, null, 1));
  assert.equal(rankCardSuggestions(cards, 'bolt').length, 10);
  assert.equal(rankCardSuggestions(cards, 'bolt', 5).length, 5);
});

test('registers cards without a Japanese name and returns nothing when unmatched', () => {
  const cards = [entry('Nissa, Worldsoul Speaker', null, 3)];
  assert.deepEqual(rankCardSuggestions(cards, 'nissa').map((c) => c.nameEn), ['Nissa, Worldsoul Speaker']);
  assert.deepEqual(rankCardSuggestions(cards, 'jace'), []);
  assert.deepEqual(rankCardSuggestions(cards, '   '), []);
});
