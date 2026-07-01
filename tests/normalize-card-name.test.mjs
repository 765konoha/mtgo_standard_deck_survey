import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCardName } from '../scripts/lib/normalize-card-name.mjs';

test('normalizes case and surrounding whitespace', () => {
  assert.equal(normalizeCardName('  Lightning Strike  '), 'lightning strike');
});

test('normalizes repeated whitespace and unicode apostrophes', () => {
  assert.equal(normalizeCardName("Kaito’s  Pursuit"), "kaito's pursuit");
});

test('normalizes split-card separators', () => {
  assert.equal(normalizeCardName('Fire //Ice'), 'fire // ice');
});

test('normalizes full-width latin characters', () => {
  assert.equal(normalizeCardName('Ｌｉｇｈｔｎｉｎｇ'), 'lightning');
});

test('normalizes unicode dash variants', () => {
  assert.equal(normalizeCardName('Foo—Bar'), 'foo-bar');
});

