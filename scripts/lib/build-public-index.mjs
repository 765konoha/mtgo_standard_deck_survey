import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { isDateInRange, lookbackPeriod } from './backfill.mjs';
import { isBasicLandCard } from './basic-land.mjs';
import { normalizeCardName } from './normalize-card-name.mjs';
import { validateCardSearchIndex } from './validate-search-index.mjs';
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
    eventDateTime: eventData.event.eventDateTime || null,
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

  // Set display names/release dates come from the dictionary when available;
  // the index still builds without it (names fall back to null).
  const dictionary = await readJson(join(root, 'data', 'cards', 'en-ja-map.json'), null);
  const cardPayload = buildCardSearchIndex(records, period, lookbackDays, dictionary);
  const previousCards = await readJson(cardSearchIndex, {});
  const cardsChanged = JSON.stringify(withoutGeneratedAt(previousCards)) !== JSON.stringify(cardPayload);
  let cardsWritten = false;
  if (cardsChanged) {
    try {
      validateCardSearchIndex(cardPayload);
      await writeJsonAtomic(cardSearchIndex, { ...cardPayload, generatedAt });
      cardsWritten = true;
    } catch (error) {
      console.warn(`[CARD INDEX] skipped write, keeping existing index: ${error.message}`);
    }
  }

  console.log(`[INDEX] ${events.length} events from ${period.startDate} to ${period.endDate}, ${untranslatedCards} untranslated cards`);
  console.log(`[CARD INDEX] ${cardPayload.cards.length} cards from ${events.length} events`);
  return { events, period, indexChanged, cardsChanged: cardsChanged && cardsWritten, cardSearchIndex: cardPayload };
}

function buildCardSearchIndex(records, period, lookbackDays, dictionary = null) {
  const cards = new Map();
  const dictionaryLookup = buildDictionaryLookup(dictionary);
  const completedRecords = records.filter(({ eventData }) => eventData.event.status === 'completed');
  const stats = {
    targetEvents: completedRecords.length,
    targetDecks: 0,
    targetCardRows: 0,
    rawDeckRefs: 0,
  };

  for (const { eventData } of completedRecords) {
    const eventId = eventData.event.id;
    for (const deck of eventData.decks || []) {
      stats.targetDecks += 1;
      stats.targetCardRows += (deck.mainboard || []).length + (deck.sideboard || []).length;
      const deckId = deck.id;
      if (deckId == null) continue;
      // Merge a card's main/side copies within one deck into a single ref so
      // the same deck is never counted twice for one card.
      const perCard = new Map();
      accumulate(perCard, deck.mainboard, 'main', dictionaryLookup);
      accumulate(perCard, deck.sideboard, 'side', dictionaryLookup);
      for (const [key, info] of perCard) {
        stats.rawDeckRefs += 1;
        const entry = cards.get(key) || {
          key,
          nameEn: info.nameEn,
          nameJa: info.nameJa,
          normalizedNameEn: normalizeCardName(info.nameEn),
          normalizedNameJa: info.nameJa ? normalizeCardName(info.nameJa) : null,
          translationStatus: info.translationStatus,
          oracleId: info.oracleId,
          isBasicLand: info.isBasicLand,
          setCodes: [...info.setCodes],
          primarySetCode: info.primarySetCode,
          sourceKeys: new Set(),
          refs: new Map(),
        };
        entry.sourceKeys.add(info.sourceKey);
        if (shouldAdoptNameEn(entry, info)) {
          entry.nameEn = info.nameEn;
          entry.normalizedNameEn = normalizeCardName(info.nameEn);
        }
        if (shouldAdoptNameJa(entry, info)) {
          entry.nameJa = info.nameJa;
          entry.normalizedNameJa = normalizeCardName(info.nameJa);
          entry.translationStatus = info.translationStatus;
        }
        if (!entry.oracleId && info.oracleId) entry.oracleId = info.oracleId;
        entry.isBasicLand ||= info.isBasicLand;
        entry.setCodes = mergeSetCodes(entry.setCodes, info.setCodes);
        if (!entry.primarySetCode || !entry.setCodes.includes(entry.primarySetCode)) {
          entry.primarySetCode = info.primarySetCode && entry.setCodes.includes(info.primarySetCode)
            ? info.primarySetCode
            : entry.setCodes[0] ?? null;
        }
        // MTGO can list the same deck id twice (e.g. one player with two 5-0
        // runs the same day). Merge those into one ref so a deck is counted once.
        const refKey = `${eventId}\u0000${deckId}`;
        const existing = entry.refs.get(refKey);
        if (existing) {
          existing.mainboardQuantity += info.main;
          existing.sideboardQuantity += info.side;
        } else {
          entry.refs.set(refKey, {
            eventId,
            deckId: String(deckId),
            mainboardQuantity: info.main,
            sideboardQuantity: info.side,
          });
        }
        cards.set(key, entry);
      }
    }
  }
  const postDeckRefs = [...cards.values()].reduce((sum, card) => sum + card.refs.size, 0);
  const unifiedCardIdentities = [...cards.values()].filter((card) => card.sourceKeys.size > 1).length;
  const cardEntries = [...cards.values()].map((card) => {
    const deckRefs = [...card.refs.values()].sort(
      (a, b) => a.eventId.localeCompare(b.eventId) || a.deckId.localeCompare(b.deckId)
    );
    return {
      key: card.key,
      nameEn: card.nameEn,
      nameJa: card.nameJa || null,
      normalizedNameEn: card.normalizedNameEn,
      normalizedNameJa: card.normalizedNameJa,
      oracleId: card.oracleId || null,
      isBasicLand: Boolean(card.isBasicLand),
      setCodes: card.setCodes,
      primarySetCode: card.primarySetCode,
      deckCount: deckRefs.length,
      deckRefs,
    };
  }).sort((a, b) => a.nameEn.localeCompare(b.nameEn));
  const payload = {
    schemaVersion: 2,
    period: { ...period, lookbackDays },
    expansions: buildExpansionSummaries(cardEntries, dictionary),
    cards: cardEntries,
  };
  logCardIndexStats({
    ...stats,
    postDeckRefs,
    unifiedCardIdentities,
    basicLandCardsExcludedFromExpansions: cardEntries.filter(isBasicLandCard).length,
    expansions: payload.expansions,
  });
  return payload;
}

// Aggregates per-expansion card and deck counts across the indexed cards.
// A card with multiple set codes counts toward each of them, but the same
// deck is never counted twice within one expansion.
function buildExpansionSummaries(cardEntries, dictionary) {
  const setInfo = new Map();
  for (const entry of Object.values(dictionary?.cards || {})) {
    for (const set of entry.sets || []) {
      if (set?.code && !setInfo.has(set.code)) {
        setInfo.set(set.code, { name: set.name || null, releasedAt: set.releasedAt || null });
      }
    }
  }
  const expansions = new Map();
  for (const card of cardEntries) {
    if (isBasicLandCard(card)) continue;
    for (const code of card.setCodes || []) {
      const expansion = expansions.get(code) || { code, cardCount: 0, deckKeys: new Set() };
      expansion.cardCount += 1;
      for (const ref of card.deckRefs) {
        expansion.deckKeys.add(`${ref.eventId} ${ref.deckId}`);
      }
      expansions.set(code, expansion);
    }
  }
  return [...expansions.values()]
    .map(({ code, cardCount, deckKeys }) => ({
      code,
      name: setInfo.get(code)?.name || null,
      releasedAt: setInfo.get(code)?.releasedAt || null,
      cardCount,
      deckCount: deckKeys.size,
    }))
    .sort(
      (a, b) => String(b.releasedAt || '').localeCompare(String(a.releasedAt || ''))
        || a.code.localeCompare(b.code)
    );
}

function accumulate(perCard, cardList, zone, dictionaryLookup) {
  for (const card of cardList || []) {
    const info = toCardIndexInfo(card, dictionaryLookup);
    const key = info.key;
    if (!key) continue;
    const existing = perCard.get(key) || {
      ...info,
      main: 0,
      side: 0,
    };
    if (shouldAdoptNameEn(existing, info)) existing.nameEn = info.nameEn;
    if (shouldAdoptNameJa(existing, info)) {
      existing.nameJa = info.nameJa;
      existing.translationStatus = info.translationStatus;
    }
    if (!existing.oracleId && info.oracleId) existing.oracleId = info.oracleId;
    existing.isBasicLand ||= info.isBasicLand;
    existing.setCodes = mergeSetCodes(existing.setCodes, info.setCodes);
    if (!existing.primarySetCode || !existing.setCodes.includes(existing.primarySetCode)) {
      existing.primarySetCode = info.primarySetCode && existing.setCodes.includes(info.primarySetCode)
        ? info.primarySetCode
        : existing.setCodes[0] ?? null;
    }
    existing[zone] += Number(card.quantity) || 0;
    perCard.set(key, existing);
  }
}

function toCardIndexInfo(card, dictionaryLookup) {
  const sourceName = card?.nameEn || '';
  const normalizedSourceName = normalizeCardName(sourceName);
  const dictionaryEntry = dictionaryLookup.byOracleId.get(card?.oracleId)
    || dictionaryLookup.byName.get(normalizedSourceName)
    || null;
  const oracleId = card?.oracleId || dictionaryEntry?.oracleId || null;
  const nameEn = preferredNameEn(card?.nameEn, dictionaryEntry?.nameEn);
  const nameJa = preferredNameJaValue(card, dictionaryEntry);
  const translationStatus = nameJa
    ? preferredTranslationStatus(card?.translationStatus, dictionaryEntry?.translationStatus)
    : 'missing';
  const setCodes = mergeSetCodes(card?.setCodes || [], dictionaryEntry?.setCodes || []);
  const primarySetCode = preferredPrimarySetCode(card?.primarySetCode, dictionaryEntry?.primarySetCode, setCodes);
  const isBasicLand = isBasicLandCard(card) || isBasicLandCard(dictionaryEntry);
  return {
    key: oracleId || normalizedSourceName,
    sourceKey: normalizedSourceName || String(sourceName),
    nameEn,
    nameJa,
    translationStatus,
    oracleId,
    isBasicLand,
    setCodes,
    primarySetCode,
  };
}

function buildDictionaryLookup(dictionary) {
  const byName = new Map();
  const byOracleId = new Map();
  for (const entry of Object.values(dictionary?.cards || {})) {
    if (!entry) continue;
    if (entry.oracleId && !byOracleId.has(entry.oracleId)) {
      byOracleId.set(entry.oracleId, entry);
    }
    for (const name of dictionaryNames(entry)) {
      const key = normalizeCardName(name);
      if (key && !byName.has(key)) byName.set(key, entry);
    }
  }
  return { byName, byOracleId };
}

function dictionaryNames(entry) {
  const names = [entry.nameEn, ...(entry.aliases || [])];
  if (typeof entry.nameEn === 'string' && entry.nameEn.includes(' // ')) {
    names.push(...entry.nameEn.split(/\s*\/\/\s*/));
  }
  return names.filter(Boolean);
}

function preferredNameEn(current, candidate) {
  if (!candidate) return current || '';
  if (!current) return candidate;
  const currentComplete = String(current).includes(' // ');
  const candidateComplete = String(candidate).includes(' // ');
  return candidateComplete && !currentComplete ? candidate : current;
}

function preferredNameJaValue(card, dictionaryEntry) {
  if (card?.nameJa && card.translationStatus === 'complete') return card.nameJa;
  if (dictionaryEntry?.nameJa && dictionaryEntry.translationStatus === 'complete') return dictionaryEntry.nameJa;
  if (card?.nameJa) return card.nameJa;
  if (dictionaryEntry?.nameJa) return dictionaryEntry.nameJa;
  return null;
}

function preferredTranslationStatus(current, candidate) {
  if (current === 'complete' || candidate === 'complete') return 'complete';
  if (current === 'partial' || candidate === 'partial') return 'partial';
  return 'missing';
}

function preferredPrimarySetCode(current, candidate, setCodes) {
  if (current && setCodes.includes(current)) return current;
  if (candidate && setCodes.includes(candidate)) return candidate;
  return setCodes[0] ?? null;
}

function shouldAdoptNameEn(entry, info) {
  if (!entry.nameEn) return true;
  return !String(entry.nameEn).includes(' // ') && String(info.nameEn).includes(' // ');
}

function shouldAdoptNameJa(entry, info) {
  if (!info.nameJa) return false;
  if (!entry.nameJa) return true;
  const rank = { complete: 2, partial: 1, missing: 0 };
  return (rank[info.translationStatus] || 0) > (rank[entry.translationStatus] || 0);
}

function mergeSetCodes(...sets) {
  return [...new Set(sets.flat().filter(Boolean).map((code) => String(code).toUpperCase()))].sort();
}

function logCardIndexStats({
  targetEvents,
  targetDecks,
  targetCardRows,
  rawDeckRefs,
  postDeckRefs,
  unifiedCardIdentities,
  basicLandCardsExcludedFromExpansions,
  expansions,
}) {
  console.log(`[CARD INDEX] target events: ${targetEvents}`);
  console.log(`[CARD INDEX] target decks: ${targetDecks}`);
  console.log(`[CARD INDEX] target card rows: ${targetCardRows}`);
  console.log(`[CARD INDEX] deckRefs before/after dedupe: ${rawDeckRefs}/${postDeckRefs}`);
  console.log(`[CARD INDEX] unified card identities: ${unifiedCardIdentities}`);
  console.log(`[CARD INDEX] basic lands excluded from set counts: ${basicLandCardsExcludedFromExpansions}`);
  for (const expansion of expansions) {
    console.log(`[CARD INDEX] set ${expansion.code}: cardCount=${expansion.cardCount}, deckCount=${expansion.deckCount}`);
  }
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
  // Newest day first; within a day order by start time so same-day events
  // (e.g. multiple Standard Challenges) stay in a stable chronological order.
  return b.eventDate.localeCompare(a.eventDate)
    || String(a.eventDateTime || '').localeCompare(String(b.eventDateTime || ''))
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
