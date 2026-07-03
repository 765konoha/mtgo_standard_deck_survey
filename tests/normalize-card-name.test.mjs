import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCardName } from '../scripts/lib/normalize-card-name.mjs';

test('normalizes case and surrounding whitespace', () => {
  assert.equal(normalizeCardName('  Lightning Strike  '), 'lightning strike');
});

test('normalizes repeated whitespace and unicode apostrophes', () => {
  assert.equal(normalizeCardName('Kaito\u2019s  Pursuit'), "kaito's pursuit");
});

test('normalizes split-card separators', () => {
  assert.equal(normalizeCardName('Fire //Ice'), 'fire // ice');
});

test('normalizes full-width latin characters', () => {
  assert.equal(
    normalizeCardName('\uFF2C\uFF29\uFF27\uFF28\uFF34\uFF2E\uFF29\uFF2E\uFF27'),
    'lightning'
  );
});

test('normalizes unicode dash variants', () => {
  assert.equal(normalizeCardName('Foo\u2014Bar'), 'foo-bar');
});
