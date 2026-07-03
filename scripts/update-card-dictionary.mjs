import { rename } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildCardDictionary,
  diagnoseCardNames,
} from './lib/build-card-dictionary.mjs';
import { readJson, toIsoTokyo, writeJsonAtomic } from './lib/fs-utils.mjs';

const CARDS_SEARCH_API = 'https://api.scryfall.com/cards/search';
const USER_AGENT = 'mtgo-standard-deck-survey/1.0 (+https://github.com/)';
const REQUEST_DELAY_MS = Number(process.env.SCRYFALL_REQUEST_DELAY_MS || 500);
const MAX_FETCH_ATTEMPTS = Number(process.env.SCRYFALL_MAX_FETCH_ATTEMPTS || 5);
const ENGLISH_QUERY = 'format:standard lang:en';
const JAPANESE_QUERY = 'format:standard lang:ja';
const OUTPUT_PATH = join('data', 'cards', 'en-ja-map.json');
const TEMP_PATH = `${OUTPUT_PATH}.next`;
const OVERRIDES_PATH = join('data', 'cards', 'manual-overrides.json');
const DIAGNOSTIC_CARD_NAMES = [
  'Leyline Weaver',
  'Kavaero, Mind-Bitten',
  'Emeritus of Ideation // Ancestral Recall',
  'Clarion Conqueror',
  'Great Hall of the Biblioplex',
];

console.log('[DICTIONARY] loading Standard English cards');
const englishPrints = await fetchSearch(ENGLISH_QUERY);
console.log('[DICTIONARY] loading Standard Japanese prints');
const japanesePrints = await fetchSearch(JAPANESE_QUERY);
const manualOverrides = await readJson(OVERRIDES_PATH, {});

const { dictionary, stats, unresolved } = buildCardDictionary({
  englishPrints,
  japanesePrints,
  manualOverrides,
  generatedAt: toIsoTokyo(),
  source: {
    name: 'Scryfall Cards Search API',
    url: CARDS_SEARCH_API,
    englishQuery: ENGLISH_QUERY,
    japaneseQuery: JAPANESE_QUERY,
    includeMultilingual: true,
    unique: 'prints',
    joinKey: 'oracle_id',
  },
});

await writeJsonAtomic(TEMP_PATH, dictionary);
validateDictionary(await readJson(TEMP_PATH));
await rename(TEMP_PATH, OUTPUT_PATH);

console.log(`[DICTIONARY] Standard English cards: ${stats.standardEnglishCards}`);
console.log(`[DICTIONARY] Japanese prints fetched: ${stats.japanesePrints}`);
console.log(`[DICTIONARY] joined by oracle_id: ${stats.oracleJoined}`);
console.log(`[DICTIONARY] names from printed_name: ${stats.fromPrintedName}`);
console.log(`[DICTIONARY] names from card_faces: ${stats.fromCardFaces}`);
console.log(`[DICTIONARY] aliases generated: ${stats.aliases}`);
console.log(`[DICTIONARY] missing Japanese cards: ${stats.missingJapaneseCards}`);
for (const card of unresolved) {
  console.log(
    `[DICTIONARY][UNRESOLVED] ${card.nameEn} | oracle_id=${card.oracleId} | layout=${card.layout}`
  );
}

for (const diagnostic of diagnoseCardNames({
  englishPrints,
  japanesePrints,
  dictionary,
  names: DIAGNOSTIC_CARD_NAMES,
})) {
  console.log(`[DICTIONARY][DIAGNOSE] ${JSON.stringify(diagnostic)}`);
}

async function fetchSearch(query) {
  const cards = [];
  let pageCount = 0;
  let nextUrl = buildSearchUrl(query);
  while (nextUrl) {
    pageCount += 1;
    const page = await fetchJson(nextUrl);
    const pageCards = Array.isArray(page.data) ? page.data : [];
    cards.push(...pageCards);
    console.log(
      `[DICTIONARY] ${query}: page ${pageCount}, fetched ${pageCards.length}, total ${cards.length}`
    );
    nextUrl = page.has_more ? page.next_page : null;
    if (nextUrl) await sleep(REQUEST_DELAY_MS);
  }
  return cards;
}

function buildSearchUrl(query) {
  const url = new URL(CARDS_SEARCH_API);
  url.searchParams.set('q', query);
  url.searchParams.set('include_multilingual', 'true');
  url.searchParams.set('unique', 'prints');
  url.searchParams.set('order', 'name');
  return url.toString();
}

async function fetchJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(60000),
      });
      if (response.ok) return response.json();
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const retryAfter = Number(response.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : REQUEST_DELAY_MS * attempt * attempt;
      console.log(`[DICTIONARY] HTTP ${response.status}; retrying in ${waitMs}ms`);
      await sleep(waitMs);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_FETCH_ATTEMPTS) await sleep(REQUEST_DELAY_MS * attempt);
    }
  }
  throw lastError || new Error(`Failed to fetch ${url}`);
}

function validateDictionary(value) {
  if (value?.schemaVersion !== 1 || !value.cards || typeof value.cards !== 'object') {
    throw new Error('Generated dictionary has an invalid schema');
  }
  for (const [key, entry] of Object.entries(value.cards)) {
    if (!key || !entry?.nameEn) throw new Error(`Invalid dictionary entry: ${key}`);
    if (!['complete', 'missing'].includes(entry.translationStatus)) {
      throw new Error(`Invalid translationStatus for ${key}`);
    }
    if (entry.translationStatus === 'complete' && !entry.nameJa) {
      throw new Error(`Complete entry has no Japanese name: ${key}`);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
