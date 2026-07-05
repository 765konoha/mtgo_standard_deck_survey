import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  discoverEventPages,
  extractEventDateFromPage,
  extractEventDateTimeFromPage,
  isDateInRange,
  parseLookbackDays,
  shouldFetchEvent,
} from './lib/backfill.mjs';
import { buildIndex } from './lib/run-build-index.mjs';
import { dateTokyo, readJson, toIsoTokyo, writeJsonAtomic, writeTextAtomic } from './lib/fs-utils.mjs';
import { parseEventPage } from './lib/parse-event-page.mjs';
import { translateDecks } from './lib/translate-decklists.mjs';
import { validateEventData } from './lib/validate-data.mjs';

const LIST_URL = process.env.MTGO_DECKLISTS_URL || 'https://www.mtgo.com/decklists';
const USER_AGENT = 'mtgo-standard-deck-survey/1.0 (+https://github.com/)';
const PUBLICATION_TIMEOUT_DAYS = Number(process.env.PUBLICATION_TIMEOUT_DAYS || 7);
const MAX_FETCH_ATTEMPTS = Number(process.env.MAX_FETCH_ATTEMPTS || 3);
const FORCE = process.argv.includes('--force') || process.env.FORCE_REFETCH === 'true';
const LOOKBACK_DAYS = parseLookbackDays();

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

const discovery = await discoverEventPages({
  listUrl: LIST_URL,
  lookbackDays: LOOKBACK_DAYS,
  fetchText,
});
const discovered = discovery.events;
if (discovery.period) {
  console.log(`[BACKFILL] lookback period: ${discovery.period.startDate} to ${discovery.period.endDate}`);
}
console.log(`[DISCOVER] pages scanned: ${discovery.pagesScanned}`);
console.log(`[DISCOVER] Standard events found: ${discovered.length}`);

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
  } else {
    Object.assign(existing, {
      eventName: event.name,
      eventType: event.eventType,
      sourceUrl: event.sourceUrl,
      eventDate: event.eventDate,
      publishedDate: event.publishedDate,
    });
  }
}

let skippedCompleted = 0;
let eventsProcessed = 0;
let pendingEvents = 0;
let completedEvents = 0;

for (const eventState of stateById.values()) {
  if (discovery.period && !isDateInRange(
    eventState.eventDate || eventState.publishedDate,
    discovery.period
  )) continue;
  const summary = {
    id: eventState.eventId,
    name: eventState.eventName,
    eventType: eventState.eventType,
    eventDate: eventState.eventDate || dateTokyo(),
    eventDateTime: eventState.eventDateTime || null,
    publishedDate: eventState.publishedDate || dateTokyo(),
    sourceUrl: eventState.sourceUrl,
  };

  const hasCompletedJson = await hasValidCompletedEventJson(summary.id);
  const shouldFetch = shouldFetchEvent({
    status: eventState.status,
    force: FORCE,
    hasValidCompletedJson: hasCompletedJson,
  });
  if (!shouldFetch && hasCompletedJson) {
    await syncCompletedEventMetadata(summary);
    eventState.status = 'completed';
    skippedCompleted += 1;
    continue;
  }
  if (!shouldFetch) continue;

  await sleep(1200);
  const status = await processEvent(summary, eventState, dictionary);
  eventsProcessed += 1;
  if (status === 'completed') completedEvents += 1;
  if (status === 'pending_publication') pendingEvents += 1;
}

const nextState = {
  schemaVersion: 1,
  events: [...stateById.values()].sort((a, b) => b.eventDate.localeCompare(a.eventDate)),
};
await writeJsonAtomic(join('data', 'state', 'events.json'), nextState);
await buildIndex();
console.log(`[SKIP] already completed: ${skippedCompleted}`);
console.log(`[FETCH] events processed: ${eventsProcessed}`);
console.log(`[PENDING] events waiting for publication: ${pendingEvents}`);
console.log(`[COMPLETE] events completed: ${completedEvents}`);

async function processEvent(summary, eventState, dictionary) {
  const now = toIsoTokyo();
  try {
    console.log(`[FETCH] ${summary.name}: ${summary.sourceUrl}`);
    const html = await fetchText(summary.sourceUrl);
    await writeTextAtomic(join('data', 'raw', 'events', `${summary.id}.html`), html);
    summary.eventDate = extractEventDateFromPage(html) || summary.eventDate;
    summary.eventDateTime = extractEventDateTimeFromPage(html) || summary.eventDateTime || null;

    const parsed = parseEventPage(html, summary);
    const status = applyPublicationTimeout(parsed.status, eventState.firstSeenAt);
    const eventBase = {
      schemaVersion: 1,
      event: {
        id: summary.id,
        name: summary.name,
        eventType: summary.eventType,
        eventDate: summary.eventDate,
        eventDateTime: summary.eventDateTime || null,
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
      eventDate: summary.eventDate,
      eventDateTime: summary.eventDateTime || null,
      publishedDate: summary.publishedDate,
      lastCheckedAt: now,
      completedAt: status === 'completed' ? now : eventState.completedAt || null,
      retryCount: status === 'completed' ? 0 : (eventState.retryCount || 0) + 1,
      lastResult: {
        httpStatus: 200,
        deckCount: parsed.decks.length,
        reason: parsed.reason,
      },
    });
    return status;
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
    return 'fetch_error';
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

async function hasValidCompletedEventJson(eventId) {
  for (const path of [
    join('data', 'events', `${eventId}.json`),
    join('public', 'data', 'events', `${eventId}.json`),
  ]) {
    const eventData = await readJson(path, null);
    if (eventData?.event?.status !== 'completed') continue;
    try {
      validateEventData(eventData);
      return true;
    } catch {
      // Try the other copy before deciding the event must be fetched again.
    }
  }
  return false;
}

async function syncCompletedEventMetadata(summary) {
  for (const path of [
    join('data', 'events', `${summary.id}.json`),
    join('public', 'data', 'events', `${summary.id}.json`),
  ]) {
    const eventData = await readJson(path, null);
    if (eventData?.event?.status !== 'completed') continue;
    const nextEvent = {
      ...eventData.event,
      name: summary.name,
      eventType: summary.eventType,
      eventDate: summary.eventDate,
      eventDateTime: summary.eventDateTime || eventData.event.eventDateTime || null,
      publishedDate: summary.publishedDate,
      sourceUrl: summary.sourceUrl,
    };
    if (JSON.stringify(nextEvent) !== JSON.stringify(eventData.event)) {
      await writeJsonAtomic(path, { ...eventData, event: nextEvent });
    }
  }
}

function applyPublicationTimeout(status, firstSeenAt) {
  if (status !== 'pending_publication') return status;
  const firstSeen = firstSeenAt ? new Date(firstSeenAt) : new Date();
  const elapsedDays = (Date.now() - firstSeen.getTime()) / 86400000;
  return elapsedDays > PUBLICATION_TIMEOUT_DAYS ? 'publication_timeout' : status;
}

async function fetchText(url) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(45000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.text();
    } catch (error) {
      lastError = error;
      if (attempt < MAX_FETCH_ATTEMPTS) {
        console.log(`[RETRY] ${url}: attempt ${attempt + 1}/${MAX_FETCH_ATTEMPTS}`);
        await sleep(attempt * 1000);
      }
    }
  }
  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
