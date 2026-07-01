import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readJson, toIsoTokyo, writeJsonAtomic } from './lib/fs-utils.mjs';

const DATA_EVENTS_DIR = join('data', 'events');
const PUBLIC_EVENTS_DIR = join('public', 'data', 'events');
const PUBLIC_INDEX = join('public', 'data', 'index.json');

const eventFiles = await safeReaddir(DATA_EVENTS_DIR);
const publicFiles = await safeReaddir(PUBLIC_EVENTS_DIR);
const files = [...new Set([...eventFiles, ...publicFiles])].filter((name) => name.endsWith('.json'));

const events = [];
let untranslatedCards = 0;

for (const file of files) {
  const dataPath = eventFiles.includes(file)
    ? join(DATA_EVENTS_DIR, file)
    : join(PUBLIC_EVENTS_DIR, file);
  const eventData = await readJson(dataPath);
  if (!eventData?.event) continue;
  untranslatedCards += countMissing(eventData);
  events.push({
    id: eventData.event.id,
    name: eventData.event.name,
    eventType: eventData.event.eventType,
    eventDate: eventData.event.eventDate,
    publishedDate: eventData.event.publishedDate,
    status: eventData.event.status,
    deckCount: eventData.decks?.length || 0,
    sourceUrl: eventData.event.sourceUrl,
    dataFile: `./events/${file}`,
    firstSeenAt: eventData.event.firstSeenAt,
    lastCheckedAt: eventData.event.fetchedAt || eventData.event.lastCheckedAt,
    completedAt: eventData.event.completedAt,
  });
}

events.sort((a, b) => {
  const dateCompare = b.eventDate.localeCompare(a.eventDate);
  if (dateCompare !== 0) return dateCompare;
  return a.name.localeCompare(b.name);
});

const summary = {
  completedEvents: events.filter((e) => e.status === 'completed').length,
  pendingEvents: events.filter((e) => e.status === 'pending_publication' || e.status === 'discovered').length,
  fetchErrors: events.filter((e) => e.status === 'fetch_error').length,
  parseErrors: events.filter((e) => e.status === 'parse_error').length,
  timedOutEvents: events.filter((e) => e.status === 'publication_timeout').length,
  untranslatedCards,
};

const overallStatus = summary.fetchErrors || summary.parseErrors || summary.timedOutEvents
  ? 'partial'
  : summary.pendingEvents
    ? 'pending'
    : 'success';

const previous = await readJson(PUBLIC_INDEX, {});
const generatedAt = toIsoTokyo();
await writeJsonAtomic(PUBLIC_INDEX, {
  schemaVersion: 1,
  generatedAt,
  lastSuccessfulUpdateAt:
    summary.completedEvents > 0 ? generatedAt : previous.lastSuccessfulUpdateAt || null,
  overallStatus,
  summary,
  events,
});

console.log(`[INDEX] ${events.length} events, ${untranslatedCards} untranslated cards`);

async function safeReaddir(path) {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

function countMissing(eventData) {
  return (eventData.decks || []).reduce((sum, deck) => {
    const cards = [...(deck.mainboard || []), ...(deck.sideboard || [])];
    return sum + cards.filter((card) => card.translationStatus === 'missing').length;
  }, 0);
}

