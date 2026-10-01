import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildPublicIndexes } from '../scripts/lib/build-public-index.mjs';
import {
  compareDuplicateEvents,
  eventIdentityKey,
  mtgoEventNumber,
} from '../scripts/lib/event-rules.mjs';

const NOW = new Date('2026-09-30T12:00:00+09:00');

test('extracts the MTGO event number from both slug styles', () => {
  assert.equal(mtgoEventNumber('standard-challenge-16-2026-09-2312854542'), '12854542');
  assert.equal(mtgoEventNumber('standard-challenge-2026-07-03-12846464'), '12846464');
  assert.equal(mtgoEventNumber('standard-league-2026-09-3011129'), '11129');
  assert.equal(mtgoEventNumber('standard-challenge-2026-07-03-a'), null);
});

test('a challenge re-published under another date slug shares one identity', () => {
  const a = eventIdentityKey({ id: 'standard-challenge-16-2026-09-1412854542', eventType: 'challenge' });
  const b = eventIdentityKey({ id: 'standard-challenge-16-2026-09-2312854542', eventType: 'challenge' });
  assert.equal(a, b);
});

test('same-day challenges with different MTGO numbers keep distinct identities', () => {
  const early = eventIdentityKey({ id: 'standard-challenge-32-2026-08-1412851641', eventType: 'challenge' });
  const late = eventIdentityKey({ id: 'standard-challenge-32-2026-08-1412851651', eventType: 'challenge' });
  assert.notEqual(early, late);
});

test('league numbers are shared across days, so leagues keep their own ids', () => {
  const day1 = eventIdentityKey({ id: 'standard-league-2026-09-2911015', eventType: 'league' });
  const day2 = eventIdentityKey({ id: 'standard-league-2026-09-3011015', eventType: 'league' });
  assert.notEqual(day1, day2);
});

test('prefers the completed copy whose slug date matches the event date', () => {
  const stale = { id: 'standard-challenge-16-2026-09-1412854542', eventDate: '2026-09-23', status: 'completed', firstSeenAt: '2026-09-20T00:00:00+09:00' };
  const canonical = { id: 'standard-challenge-16-2026-09-2312854542', eventDate: '2026-09-23', status: 'completed', firstSeenAt: '2026-09-24T00:00:00+09:00' };
  const pending = { ...canonical, status: 'pending_publication' };
  assert.ok(compareDuplicateEvents(canonical, stale) < 0);
  assert.ok(compareDuplicateEvents(stale, pending) < 0);
});

test('public index lists a re-published challenge once and keeps same-day siblings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mtgo-republished-'));
  const dataDir = join(root, 'data', 'events');
  await mkdir(dataDir, { recursive: true });
  await mkdir(join(root, 'public', 'data', 'events'), { recursive: true });
  const writeChallenge = async (id, dateTime) => {
    const value = {
      schemaVersion: 1,
      event: {
        id,
        name: 'Standard Challenge 16',
        eventType: 'challenge',
        eventDate: '2026-09-23',
        eventDateTime: dateTime,
        publishedDate: '2026-09-23',
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
  await writeChallenge('standard-challenge-16-2026-09-1412854542', '2026-09-23T07:00:00');
  await writeChallenge('standard-challenge-16-2026-09-2312854542', '2026-09-23T07:00:00');
  await writeChallenge('standard-challenge-32-2026-09-2312854550', '2026-09-23T18:00:00');

  await buildPublicIndexes({ root, lookbackDays: 10, now: NOW });
  const index = JSON.parse(await readFile(join(root, 'public', 'data', 'index.json'), 'utf8'));
  assert.deepEqual(
    index.events.map((event) => event.id),
    ['standard-challenge-16-2026-09-2312854542', 'standard-challenge-32-2026-09-2312854550']
  );
  const search = JSON.parse(await readFile(join(root, 'public', 'data', 'card-search-index.json'), 'utf8'));
  assert.equal(search.cards[0].deckCount, 2, 'the duplicate copy is not counted in card search');
});
