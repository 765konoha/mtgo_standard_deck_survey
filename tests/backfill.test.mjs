import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  discoverEventPages,
  parseLookbackDays,
  shouldFetchEvent,
} from '../scripts/lib/backfill.mjs';
import { buildPublicIndexes } from '../scripts/lib/build-public-index.mjs';

const NOW = new Date('2026-07-03T03:00:00+09:00');

test('parses lookback-days in both supported CLI forms', () => {
  assert.equal(parseLookbackDays(['--lookback-days=10'], {}), 10);
  assert.equal(parseLookbackDays(['--lookback-days', '10'], {}), 10);
  assert.equal(parseLookbackDays([], { FORCE_BACKFILL: 'true', LOOKBACK_DAYS: '10' }), 10);
  assert.equal(parseLookbackDays([], { FORCE_BACKFILL: 'false', LOOKBACK_DAYS: '10' }), null);
});

test('backfill scans every archive month and keeps the inclusive 10-day period', async () => {
  const pages = new Map([
    ['https://www.mtgo.com/decklists/2026/07', eventLinks([
      ['standard-league-2026-07-03-a', 'Standard League', 'July 3 2026'],
      ['standard-league-2026-07-03-a', 'Standard League', 'July 3 2026'],
      ['standard-challenge-32-2026-07-02-a', 'Standard Challenge 32', 'July 2 2026'],
      ['standard-challenge-32-2026-07-02-b', 'Standard Challenge 32', 'July 2 2026'],
    ])],
    ['https://www.mtgo.com/decklists/2026/06', eventLinks([
      ['standard-league-2026-06-24-a', 'Standard League', 'June 24 2026'],
      ['standard-league-2026-06-23-a', 'Standard League', 'June 23 2026'],
    ])],
  ]);
  const scanned = [];
  const result = await discoverEventPages({
    listUrl: 'https://www.mtgo.com/decklists',
    lookbackDays: 10,
    now: NOW,
    fetchText: async (url) => {
      scanned.push(url);
      return pages.get(url) || '';
    },
  });

  assert.deepEqual(scanned, [
    'https://www.mtgo.com/decklists/2026/07',
    'https://www.mtgo.com/decklists/2026/06',
  ]);
  assert.equal(result.pagesScanned, 2);
  assert.deepEqual(result.period, { startDate: '2026-06-24', endDate: '2026-07-03' });
  assert.equal(result.events.length, 4);
  assert.equal(result.events.filter((event) => event.eventType === 'challenge').length, 2);
  assert.ok(result.events.some((event) => event.eventDate === '2026-06-24'));
  assert.ok(!result.events.some((event) => event.eventDate === '2026-06-23'));
});

test('fetch decisions skip valid completed data but retry pending and missing completed data', () => {
  assert.equal(shouldFetchEvent({
    status: 'completed',
    hasValidCompletedJson: true,
  }), false);
  assert.equal(shouldFetchEvent({
    status: 'pending_publication',
    hasValidCompletedJson: false,
  }), true);
  assert.equal(shouldFetchEvent({
    status: 'completed',
    hasValidCompletedJson: false,
  }), true);
});

test('public indexes contain multiple days but retain old event JSON on disk', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mtgo-index-'));
  const dataDir = join(root, 'data', 'events');
  const publicDir = join(root, 'public', 'data', 'events');
  await mkdir(dataDir, { recursive: true });
  await mkdir(publicDir, { recursive: true });
  await writeEvent(dataDir, 'newest', '2026-07-03', 'Lightning Bolt');
  await writeEvent(dataDir, 'boundary', '2026-06-24', 'Island');
  await writeEvent(dataDir, 'too-old', '2026-06-23', 'Swamp');

  const result = await buildPublicIndexes({ root, lookbackDays: 10, now: NOW });
  const index = JSON.parse(await readFile(join(root, 'public', 'data', 'index.json'), 'utf8'));
  const cardIndex = JSON.parse(
    await readFile(join(root, 'public', 'data', 'card-search-index.json'), 'utf8')
  );

  assert.deepEqual(result.period, { startDate: '2026-06-24', endDate: '2026-07-03' });
  assert.deepEqual(index.events.map((event) => event.id), ['newest', 'boundary']);
  assert.deepEqual(cardIndex.cards.map((card) => card.nameEn), ['Island', 'Lightning Bolt']);
  assert.ok(cardIndex.cards.every((card) => card.deckCount === 1 && card.deckRefs.length === 1));
  assert.ok(await readFile(join(dataDir, 'too-old.json'), 'utf8'));
});

function eventLinks(events) {
  return events.map(([slug, title, date]) => `
    <a href="/decklist/${slug}">
      <h3>${title}</h3>
      <time datetime="${date === 'July 3 2026' ? '2026-07-03T01:00:00Z' : '2026-06-24T01:00:00Z'}">${date}</time>
    </a>
  `).join('');
}

async function writeEvent(dir, id, eventDate, cardName) {
  const value = {
    schemaVersion: 1,
    event: {
      id,
      name: id,
      eventType: 'league',
      eventDate,
      publishedDate: eventDate,
      sourceUrl: `https://www.mtgo.com/decklist/${id}-${eventDate}`,
      status: 'completed',
    },
    decks: [{
      id: `${id}-deck`,
      mainboard: [{
        quantity: 4,
        nameEn: cardName,
        nameJa: null,
        translationStatus: 'missing',
      }],
      sideboard: [],
    }],
  };
  await writeFile(join(dir, `${id}.json`), `${JSON.stringify(value)}\n`, 'utf8');
}
