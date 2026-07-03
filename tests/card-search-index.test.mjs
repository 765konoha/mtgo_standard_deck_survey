import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildPublicIndexes } from '../scripts/lib/build-public-index.mjs';
import { validateCardSearchIndex } from '../scripts/lib/validate-search-index.mjs';

const NOW = new Date('2026-07-03T03:00:00+09:00');

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'mtgo-card-index-'));
  const dataDir = join(root, 'data', 'events');
  await mkdir(dataDir, { recursive: true });
  await mkdir(join(root, 'public', 'data', 'events'), { recursive: true });
  return { root, dataDir };
}

function card(nameEn, quantity, nameJa = null) {
  return { quantity, nameEn, nameJa, translationStatus: nameJa ? 'complete' : 'missing' };
}

async function writeEvent(dir, options) {
  const { id, eventDate, status = 'completed', eventType = 'league', decks = [] } = options;
  const value = {
    schemaVersion: 1,
    event: {
      id,
      name: id,
      eventType,
      eventDate,
      publishedDate: eventDate,
      sourceUrl: `https://www.mtgo.com/decklist/${id}-${eventDate}`,
      status,
    },
    decks,
  };
  await writeFile(join(dir, `${id}.json`), `${JSON.stringify(value)}\n`, 'utf8');
}

async function readCardIndex(root) {
  return JSON.parse(await readFile(join(root, 'public', 'data', 'card-search-index.json'), 'utf8'));
}

test('merges a deck main/side into one ref and only covers completed, in-range events', async () => {
  const { root, dataDir } = await setup();
  await writeEvent(dataDir, {
    id: 'in-range',
    eventDate: '2026-07-02',
    eventType: 'challenge',
    decks: [{
      id: '1-alice',
      player: 'alice',
      placement: 1,
      mainboard: [card('Lightning Strike', 4, '稲妻の一撃'), card('Mountain', 20)],
      sideboard: [card('Lightning Strike', 2, '稲妻の一撃')],
    }],
  });
  await writeEvent(dataDir, {
    id: 'pending',
    eventDate: '2026-07-01',
    status: 'pending_publication',
    decks: [{ id: 'x', player: 'x', mainboard: [card('Lightning Strike', 4)], sideboard: [] }],
  });
  await writeEvent(dataDir, {
    id: 'too-old',
    eventDate: '2026-06-23',
    decks: [{ id: 'y', player: 'y', record: '5-0', mainboard: [card('Lightning Strike', 3)], sideboard: [] }],
  });

  await buildPublicIndexes({ root, lookbackDays: 10, now: NOW });
  const index = await readCardIndex(root);
  validateCardSearchIndex(index);

  const strike = index.cards.find((c) => c.nameEn === 'Lightning Strike');
  assert.equal(strike.key, 'lightning strike');
  assert.equal(strike.nameJa, '稲妻の一撃');
  assert.equal(strike.normalizedNameJa, '稲妻の一撃');
  assert.equal(strike.deckCount, 1);
  assert.deepEqual(strike.deckRefs, [
    { eventId: 'in-range', deckId: '1-alice', mainboardQuantity: 4, sideboardQuantity: 2 },
  ]);
  // pending + too-old events are excluded entirely.
  assert.ok(index.cards.every((c) => c.deckRefs.every((ref) => ref.eventId === 'in-range')));
});

test('registers cards without a Japanese name and counts distinct decks across events', async () => {
  const { root, dataDir } = await setup();
  await writeEvent(dataDir, {
    id: 'event-a',
    eventDate: '2026-07-02',
    decks: [{ id: 'a1', player: 'a1', record: '5-0', mainboard: [card('Proft’s Eidetic Memory', 2)], sideboard: [] }],
  });
  await writeEvent(dataDir, {
    id: 'event-b',
    eventDate: '2026-07-01',
    decks: [{ id: 'b1', player: 'b1', record: '5-0', mainboard: [card('Proft’s Eidetic Memory', 3)], sideboard: [] }],
  });

  await buildPublicIndexes({ root, lookbackDays: 10, now: NOW });
  const index = await readCardIndex(root);

  const card1 = index.cards.find((c) => c.key === "proft's eidetic memory");
  assert.ok(card1, 'card is registered even without a Japanese name');
  assert.equal(card1.nameJa, null);
  assert.equal(card1.normalizedNameJa, null);
  assert.equal(card1.deckCount, 2);
  assert.deepEqual(card1.deckRefs.map((ref) => ref.eventId), ['event-a', 'event-b']);
});

test('handles events with empty or missing deck lists without throwing', async () => {
  const { root, dataDir } = await setup();
  await writeEvent(dataDir, { id: 'empty', eventDate: '2026-07-02', decks: [] });
  await writeEvent(dataDir, {
    id: 'no-sideboard',
    eventDate: '2026-07-02',
    decks: [{ id: 'z1', player: 'z1', record: '5-0', mainboard: [card('Island', 4)] }],
  });

  const result = await buildPublicIndexes({ root, lookbackDays: 10, now: NOW });
  const index = await readCardIndex(root);
  validateCardSearchIndex(index);
  assert.deepEqual(index.cards.map((c) => c.nameEn), ['Island']);
  assert.equal(result.period.startDate, '2026-06-24');
});

test('validateCardSearchIndex rejects malformed indexes', () => {
  assert.throws(() => validateCardSearchIndex({
    schemaVersion: 1,
    cards: [{ key: 'a', nameEn: 'A', deckCount: 1, deckRefs: [] }],
  }), /deckCount 1 does not match/);

  assert.throws(() => validateCardSearchIndex({
    schemaVersion: 1,
    cards: [{
      key: 'a',
      nameEn: 'A',
      deckCount: 2,
      deckRefs: [
        { eventId: 'e', deckId: 'd', mainboardQuantity: 1, sideboardQuantity: 0 },
        { eventId: 'e', deckId: 'd', mainboardQuantity: 2, sideboardQuantity: 0 },
      ],
    }],
  }), /duplicate eventId\/deckId/);

  assert.throws(() => validateCardSearchIndex({
    schemaVersion: 1,
    cards: [{
      key: 'a',
      nameEn: 'A',
      deckCount: 1,
      deckRefs: [{ eventId: 'e', deckId: 'd', mainboardQuantity: -1, sideboardQuantity: 0 }],
    }],
  }), /mainboardQuantity must be a non-negative integer/);

  assert.throws(() => validateCardSearchIndex({
    schemaVersion: 1,
    cards: [{ key: '', nameEn: 'A', deckCount: 0, deckRefs: [] }],
  }), /key is required/);
});
