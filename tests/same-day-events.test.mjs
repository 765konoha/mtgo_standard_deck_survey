import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  discoverEventPages,
  discoverEventsFromHtml,
  extractEventDateTimeFromPage,
  shouldFetchEvent,
} from '../scripts/lib/backfill.mjs';
import { buildPublicIndexes } from '../scripts/lib/build-public-index.mjs';

const NOW = new Date('2026-07-05T03:00:00+09:00');

// One anchor as MTGO renders it in the decklists listing.
function link(slug, title, dateText) {
  return `
    <a href="/decklist/${slug}">
      <h3>${title}</h3>
      <time datetime="2026-07-03T01:00:00Z">${dateText}</time>
    </a>`;
}

test('case 1/5: two same-day Standard Challenges are both discovered as distinct events', () => {
  const html = [
    link('standard-challenge-2026-07-03-12846464', 'Standard Challenge', 'July 3 2026'),
    link('standard-challenge-2026-07-03-12846474', 'Standard Challenge', 'July 3 2026'),
  ].join('');
  const events = discoverEventsFromHtml(html, 'https://www.mtgo.com/decklists', NOW);
  assert.equal(events.length, 2);
  assert.equal(new Set(events.map((e) => e.id)).size, 2);
  assert.ok(events.every((e) => e.eventType === 'challenge' && e.eventDate === '2026-07-03'));
});

test('case 6: the same event listed twice (identical URL) is fetched once', async () => {
  const html = [
    link('standard-challenge-2026-07-03-12846464', 'Standard Challenge', 'July 3 2026'),
    link('standard-challenge-2026-07-03-12846464', 'Standard Challenge', 'July 3 2026'),
  ].join('');
  // De-duplication is keyed by event id (derived from the URL), so a repeated
  // listing collapses to a single discovered event.
  const result = await discoverEventPages({
    listUrl: 'https://www.mtgo.com/decklists',
    lookbackDays: null,
    now: NOW,
    fetchText: async () => html,
  });
  assert.equal(result.events.length, 1);
});

test('case 4: same-named challenges on different days are separate events', () => {
  const html = `
    <a href="/decklist/standard-challenge-2026-07-03-12846464"><h3>Standard Challenge</h3><time datetime="2026-07-03T01:00:00Z">July 3 2026</time></a>
    <a href="/decklist/standard-challenge-2026-07-04-12846482"><h3>Standard Challenge</h3><time datetime="2026-07-04T01:00:00Z">July 4 2026</time></a>`;
  const events = discoverEventsFromHtml(html, 'https://www.mtgo.com/decklists', NOW);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((e) => e.eventDate).sort(), ['2026-07-03', '2026-07-04']);
});

test('discovery keys by event, not by date, and preserves same-day siblings', async () => {
  const pages = new Map([[
    'https://www.mtgo.com/decklists',
    [
      link('standard-challenge-2026-07-03-a', 'Standard Challenge', 'July 3 2026'),
      link('standard-challenge-2026-07-03-b', 'Standard Challenge 32', 'July 3 2026'),
      link('standard-league-2026-07-03', 'Standard League', 'July 3 2026'),
    ].join(''),
  ]]);
  const result = await discoverEventPages({
    listUrl: 'https://www.mtgo.com/decklists',
    lookbackDays: null,
    now: NOW,
    fetchText: async (url) => pages.get(url) || '',
  });
  const challenges = result.events.filter((e) => e.eventType === 'challenge' && e.eventDate === '2026-07-03');
  assert.equal(challenges.length, 2, 'both same-day challenges survive de-duplication');
  assert.equal(result.events.filter((e) => e.eventType === 'league').length, 1);
});

test('case 3: an empty listing yields zero events without error', () => {
  assert.deepEqual(discoverEventsFromHtml('<html><body>no decklists</body></html>', 'https://www.mtgo.com/decklists', NOW), []);
});

test('case 2: only the un-fetched same-day sibling is fetched again', () => {
  // The already-completed event with valid JSON is skipped; its sibling is not.
  assert.equal(shouldFetchEvent({ status: 'completed', hasValidCompletedJson: true }), false);
  assert.equal(shouldFetchEvent({ status: 'discovered', hasValidCompletedJson: false }), true);
});

test('extractEventDateTimeFromPage normalizes the MTGO start time', () => {
  assert.equal(
    extractEventDateTimeFromPage('x,"starttime":"2026-07-03 18:00:00.0","form":1'),
    '2026-07-03T18:00:00'
  );
  assert.equal(extractEventDateTimeFromPage('no start time here'), null);
});

test('public index keeps both same-day challenges and orders them by start time', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mtgo-sameday-'));
  const dataDir = join(root, 'data', 'events');
  await mkdir(dataDir, { recursive: true });
  await mkdir(join(root, 'public', 'data', 'events'), { recursive: true });
  const writeChallenge = async (id, dateTime) => {
    const value = {
      schemaVersion: 1,
      event: {
        id,
        name: 'Standard Challenge',
        eventType: 'challenge',
        eventDate: '2026-07-03',
        eventDateTime: dateTime,
        publishedDate: '2026-07-03',
        sourceUrl: `https://www.mtgo.com/decklist/${id}`,
        status: 'completed',
      },
      decks: [{
        id: `${id}-1`,
        player: 'p',
        placement: 1,
        mainboard: [{ quantity: 4, nameEn: 'Island', nameJa: null, translationStatus: 'missing' }],
        sideboard: [],
      }],
    };
    await writeFile(join(dataDir, `${id}.json`), `${JSON.stringify(value)}\n`, 'utf8');
  };
  await writeChallenge('challenge-late-222', '2026-07-03T18:00:00');
  await writeChallenge('challenge-early-111', '2026-07-03T00:00:00');

  await buildPublicIndexes({ root, lookbackDays: 10, now: NOW });
  const index = JSON.parse(await readFile(join(root, 'public', 'data', 'index.json'), 'utf8'));
  const sameDay = index.events.filter((e) => e.eventDate === '2026-07-03');
  assert.equal(sameDay.length, 2, 'both same-day challenges are indexed, neither overwrites the other');
  // Earlier start time comes first.
  assert.deepEqual(sameDay.map((e) => e.id), ['challenge-early-111', 'challenge-late-222']);
  assert.deepEqual(sameDay.map((e) => e.eventDateTime), ['2026-07-03T00:00:00', '2026-07-03T18:00:00']);
});
