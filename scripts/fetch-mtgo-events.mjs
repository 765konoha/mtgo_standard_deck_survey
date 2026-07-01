import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { buildIndex } from './lib/run-build-index.mjs';
import { classifyEvent, eventIdFromUrl } from './lib/event-rules.mjs';
import { dateTokyo, readJson, toIsoTokyo, writeJsonAtomic, writeTextAtomic } from './lib/fs-utils.mjs';
import { parseEventPage } from './lib/parse-event-page.mjs';
import { translateDecks } from './lib/translate-decklists.mjs';
import { validateEventData } from './lib/validate-data.mjs';

const LIST_URL = process.env.MTGO_DECKLISTS_URL || 'https://www.mtgo.com/decklists';
const USER_AGENT = 'mtgo-standard-deck-survey/1.0 (+https://github.com/)';
const PUBLICATION_TIMEOUT_DAYS = Number(process.env.PUBLICATION_TIMEOUT_DAYS || 7);
const FORCE = process.argv.includes('--force') || process.env.FORCE_REFETCH === 'true';

await mkdir(join('data', 'raw', 'events'), { recursive: true });
await mkdir(join('data', 'events'), { recursive: true });
await mkdir(join('public', 'data', 'events'), { recursive: true });

const dictionary = await readJson(join('data', 'cards', 'en-ja-map.json'), {
  schemaVersion: 1,
  cards: {},
});
const state = await readJson(join('data', 'state', 'events.json'), {
  schemaVersion: 1,
  events: [],
});
const stateById = new Map(state.events.map((event) => [event.eventId, event]));

console.log(`[DISCOVER] loading ${LIST_URL}`);
const listHtml = await fetchText(LIST_URL);
const discovered = discoverEvents(listHtml);
console.log(`[DISCOVER] ${discovered.length} standard events found`);

for (const event of discovered) {
  const existing = stateById.get(event.id);
  if (!existing) {
    stateById.set(event.id, {
      eventId: event.id,
      eventName: event.name,
      eventType: event.eventType,
      sourceUrl: event.sourceUrl,
      status: 'discovered',
      firstSeenAt: toIsoTokyo(),
      lastCheckedAt: null,
      completedAt: null,
      retryCount: 0,
      lastResult: null,
      eventDate: event.eventDate,
      publishedDate: event.publishedDate,
    });
  }
}

for (const eventState of stateById.values()) {
  if (eventState.status === 'completed' && !FORCE) continue;
  if (!['discovered', 'pending_publication', 'fetch_error', 'parse_error', 'publication_timeout'].includes(eventState.status)) continue;

  const summary = {
    id: eventState.eventId,
    name: eventState.eventName,
    eventType: eventState.eventType,
    eventDate: eventState.eventDate || dateTokyo(),
    publishedDate: eventState.publishedDate || dateTokyo(),
    sourceUrl: eventState.sourceUrl,
  };

  await sleep(1200);
  await processEvent(summary, eventState, dictionary);
}

const nextState = {
  schemaVersion: 1,
  events: [...stateById.values()].sort((a, b) => b.eventDate.localeCompare(a.eventDate)),
};
await writeJsonAtomic(join('data', 'state', 'events.json'), nextState);
await buildIndex();

async function processEvent(summary, eventState, dictionary) {
  const now = toIsoTokyo();
  try {
    console.log(`[FETCH] ${summary.name}: ${summary.sourceUrl}`);
    const html = await fetchText(summary.sourceUrl);
    await writeTextAtomic(join('data', 'raw', 'events', `${summary.id}.html`), html);

    const parsed = parseEventPage(html, summary);
    const status = applyPublicationTimeout(parsed.status, eventState.firstSeenAt);
    const eventBase = {
      schemaVersion: 1,
      event: {
        id: summary.id,
        name: summary.name,
        eventType: summary.eventType,
        eventDate: summary.eventDate,
        publishedDate: summary.publishedDate,
        sourceUrl: summary.sourceUrl,
        status,
        firstSeenAt: eventState.firstSeenAt || now,
        fetchedAt: now,
        completedAt: status === 'completed' ? now : null,
      },
      decks: [],
    };

    if (status === 'completed') {
      const { decks, missing } = translateDecks(parsed.decks, dictionary);
      const completed = { ...eventBase, decks };
      validateEventData(completed);
      await writeJsonAtomic(join('data', 'events', `${summary.id}.json`), completed);
      await writeJsonAtomic(join('public', 'data', 'events', `${summary.id}.json`), completed);
      console.log(`[COMPLETE] ${summary.name}: ${decks.length} decks parsed, ${missing} missing translations`);
    } else {
      await writeNonCompletedEventIfSafe(summary.id, eventBase);
      console.log(`[${status.toUpperCase()}] ${summary.name}: ${parsed.reason}`);
    }

    Object.assign(eventState, {
      status,
      lastCheckedAt: now,
      completedAt: status === 'completed' ? now : eventState.completedAt || null,
      retryCount: status === 'completed' ? 0 : (eventState.retryCount || 0) + 1,
      lastResult: {
        httpStatus: 200,
        deckCount: parsed.decks.length,
        reason: parsed.reason,
      },
    });
  } catch (error) {
    const now = toIsoTokyo();
    await writeNonCompletedEventIfSafe(summary.id, {
      schemaVersion: 1,
      event: {
        id: summary.id,
        name: summary.name,
        eventType: summary.eventType,
        eventDate: summary.eventDate,
        publishedDate: summary.publishedDate,
        sourceUrl: summary.sourceUrl,
        status: 'fetch_error',
        firstSeenAt: eventState.firstSeenAt || now,
        fetchedAt: now,
        completedAt: null,
      },
      decks: [],
    });
    Object.assign(eventState, {
      status: 'fetch_error',
      lastCheckedAt: now,
      retryCount: (eventState.retryCount || 0) + 1,
      lastResult: {
        httpStatus: null,
        deckCount: 0,
        reason: error instanceof Error ? error.message : String(error),
      },
    });
    console.log(`[ERROR] ${summary.name}: ${eventState.lastResult.reason}`);
  }
}

async function writeNonCompletedEventIfSafe(eventId, eventData) {
  const dataPath = join('data', 'events', `${eventId}.json`);
  const publicPath = join('public', 'data', 'events', `${eventId}.json`);
  const existing = (await readJson(dataPath, null)) || (await readJson(publicPath, null));
  if (existing?.event?.status === 'completed') {
    console.log(`[SKIP] ${eventId}: preserving existing completed event JSON`);
    return;
  }
  await writeJsonAtomic(dataPath, eventData);
  await writeJsonAtomic(publicPath, eventData);
}

function discoverEvents(html) {
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const events = [];
  let match;
  while ((match = linkPattern.exec(html))) {
    const href = absoluteUrl(match[1], LIST_URL);
    const name = stripHtml(match[2]);
    const eventType = classifyEvent(name);
    if (!eventType || !/\/decklist\//i.test(href)) continue;
    const id = eventIdFromUrl(href, name);
    events.push({
      id,
      name,
      eventType,
      eventDate: extractDate(name) || dateTokyo(),
      publishedDate: dateTokyo(),
      sourceUrl: href,
    });
  }
  return events;
}

function extractDate(name) {
  const match = name.match(/([A-Z][a-z]+)\s+(\d{1,2})\s+(\d{4})/);
  if (!match) return null;
  const date = new Date(`${match[1]} ${match[2]}, ${match[3]} 00:00:00 GMT+0900`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function absoluteUrl(href, base) {
  return new URL(href, base).toString();
}

function applyPublicationTimeout(status, firstSeenAt) {
  if (status !== 'pending_publication') return status;
  const firstSeen = firstSeenAt ? new Date(firstSeenAt) : new Date();
  const elapsedDays = (Date.now() - firstSeen.getTime()) / 86400000;
  return elapsedDays > PUBLICATION_TIMEOUT_DAYS ? 'publication_timeout' : status;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.text();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
