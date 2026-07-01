import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyEvent } from '../scripts/lib/event-rules.mjs';

test('classifies Standard League', () => {
  assert.equal(classifyEvent('Standard League June 30 2026'), 'league');
});

test('classifies Standard Challenge variants', () => {
  assert.equal(classifyEvent('Standard Challenge 32 June 30 2026'), 'challenge');
  assert.equal(classifyEvent('Standard Challenge 64 June 30 2026'), 'challenge');
});

test('excludes non-standard events', () => {
  assert.equal(classifyEvent('Modern Challenge 64 June 30 2026'), null);
});

