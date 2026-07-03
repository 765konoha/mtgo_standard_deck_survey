import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { isDateInRange, lookbackPeriod } from './backfill.mjs';
import { readJson, toIsoTokyo, writeJsonAtomic } from './fs-utils.mjs';

export async function buildPublicIndexes({
  root = '.',
  lookbackDays = 10,
  now = new Date(),
} = {}) {
  const dataEventsDir = join(root, 'data', 'events');
  const publicEventsDir = join(root, 'public', 'data', 'events');
  const publicIndex = join(root, 'public', 'data', 'index.json');
  const cardSearchIndex = join(root, 'public', 'data', 'card-search-index.json');
  const period = lookbackPeriod(lookbackDays, now);
  const dataFiles = await safeReaddir(dataEventsDir);
  const publicFiles = await safeReaddir(publicEventsDir);
  const files = [...new Set([...dataFiles, ...publicFiles])].filter((name) => name.endsWith('.json'));
  const recordsById = new Map();

  for (const file of files) {
    const dataPath = dataFiles.includes(file) ? join(dataEventsDir, file) : join(publicEventsDir, file);
    const eventData = await readJson(dataPath);
    const eventDate = eventData?.event?.eventDate
      || eventData?.event?.publishedDate
      || extractDateFromUrl(eventData?.event?.sourceUrl);
    if (!eventData?.event || !isDateInRange(eventDate, period)) continue;
    const record = { file, eventData, eventDate };
    const existing = recordsById.get(eventData.event.id);
    if (!existing || (
      eventData.event.status === 'completed'
      && existing.eventData.event.status !== 'completed'
    )) {
      recordsById.set(eventData.event.id, record);
    }
  }
  const records = [...recordsById.values()];

  const events = records.map(({ file, eventData, eventDate }) => ({
    id: eventData.event.id,
    name: eventData.event.name,
    eventType: eventData.event.eventType,
    eventDate,
    publishedDate: eventData.event.publishedDate,
    status: eventData.event.status,
    deckCount: eventData.decks?.length || 0,
    sourceUrl: eventData.event.sourceUrl,
    dataFile: `./events/${file}`,
    firstSeenAt: eventData.event.firstSeenAt,
    lastCheckedAt: eventData.event.fetchedAt || eventData.event.lastCheckedAt,
    completedAt: eventData.event.completedAt,
  })).sort(compareEvents);

  const untranslatedCards = records.reduce((sum, { eventData }) => sum + countMissing(eventData), 0);
  const summary = {
    completedEvents: events.filter((event) => event.status === 'completed').length,
    pendingEvents: events.filter((event) => ['pending_publication', 'discovered'].includes(event.status)).length,
    fetchErrors: events.filter((event) => event.status === 'fetch_error').length,
    parseErrors: events.filter((event) => event.status === 'parse_error').length,
    timedOutEvents: events.filter((event) => event.status === 'publication_timeout').length,
    untranslatedCards,
  };
  const overallStatus = summary.fetchErrors || summary.parseErrors || summary.timedOutEvents
    ? 'partial'
    : summary.pendingEvents ? 'pending' : 'success';
  const generatedAt = toIsoTokyo(now);
  const previous = await readJson(publicIndex, {});
  const stableIndex = {
    schemaVersion: 1,
    period: { ...period, lookbackDays },
    overallStatus,
    summary,
    events,
  };
  const indexChanged = JSON.stringify(withoutTimestamps(previous)) !== JSON.stringify(stableIndex);
  if (indexChanged) {
    await writeJsonAtomic(publicIndex, {
      schemaVersion: 1,
      generatedAt,
      lastSuccessfulUpdateAt:
        summary.completedEvents > 0 ? generatedAt : previous.lastSuccessfulUpdateAt || null,
      period: stableIndex.period,
      overallStatus,
      summary,
      events,
    });
  }

  const cardPayload = buildCardSearchIndex(records, period, lookbackDays);
  const previousCards = await readJson(cardSearchIndex, {});
  const cardsChanged = JSON.stringify(withoutGeneratedAt(previousCards)) !== JSON.stringify(cardPayload);
  if (cardsChanged) {
    await writeJsonAtomic(cardSearchIndex, { ...cardPayload, generatedAt });
  }

  console.log(`[INDEX] ${events.length} events from ${period.startDate} to ${period.endDate}, ${untranslatedCards} untranslated cards`);
  console.log(`[CARD INDEX] ${cardPayload.cards.length} cards from ${events.length} events`);
  return { events, period, indexChanged, cardsChanged, cardSearchIndex: cardPayload };
}

function buildCardSearchIndex(records, period, lookbackDays) {
  const cards = new Map();
  for (const { eventData } of records.filter(({ eventData }) => eventData.event.status === 'completed')) {
    for (const deck of eventData.decks || []) {
      for (const card of [...(deck.mainboard || []), ...(deck.sideboard || [])]) {
        const key = String(card.nameEn || '').toLocaleLowerCase('en-US');
        if (!key) continue;
        const entry = cards.get(key) || {
          nameEn: card.nameEn,
          nameJa: card.nameJa || null,
          eventIds: new Set(),
          deckIds: new Set(),
          totalQuantity: 0,
        };
        entry.eventIds.add(eventData.event.id);
        entry.deckIds.add(`${eventData.event.id}/${deck.id}`);
        entry.totalQuantity += Number(card.quantity) || 0;
        cards.set(key, entry);
      }
    }
  }
  return {
    schemaVersion: 1,
    period: { ...period, lookbackDays },
    cards: [...cards.values()].map((card) => ({
      ...card,
      eventIds: [...card.eventIds].sort(),
      deckCount: card.deckIds.size,
      totalQuantity: card.totalQuantity,
      deckIds: undefined,
    })).map(({ deckIds: _deckIds, ...card }) => card)
      .sort((a, b) => a.nameEn.localeCompare(b.nameEn)),
  };
}

function withoutTimestamps(value) {
  const { generatedAt: _generatedAt, lastSuccessfulUpdateAt: _lastSuccessfulUpdateAt, ...rest } = value || {};
  return rest;
}

function withoutGeneratedAt(value) {
  const { generatedAt: _generatedAt, ...rest } = value || {};
  return rest;
}

function compareEvents(a, b) {
  return b.eventDate.localeCompare(a.eventDate)
    || a.name.localeCompare(b.name)
    || a.id.localeCompare(b.id);
}

function extractDateFromUrl(url = '') {
  const match = String(url).match(/(\d{4})-?(\d{2})-?(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

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
    return sum + cards.filter((card) => card.translationStatus !== 'complete').length;
  }, 0);
}
