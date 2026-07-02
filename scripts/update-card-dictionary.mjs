import { rename } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeCardName } from './lib/normalize-card-name.mjs';
import { readJson, toIsoTokyo, writeJsonAtomic } from './lib/fs-utils.mjs';

const CARDS_SEARCH_API = 'https://api.scryfall.com/cards/search';
const USER_AGENT = 'mtgo-standard-deck-survey/1.0 (+https://github.com/)';
const REQUEST_DELAY_MS = Number(process.env.SCRYFALL_REQUEST_DELAY_MS || 500);
const MAX_FETCH_ATTEMPTS = Number(process.env.SCRYFALL_MAX_FETCH_ATTEMPTS || 5);
const SEARCH_QUERY = 'format:standard lang:ja';
const OUTPUT_PATH = join('data', 'cards', 'en-ja-map.json');
const TEMP_PATH = join('data', 'cards', 'en-ja-map.json.next');

const dictionary = {
  schemaVersion: 1,
  generatedAt: toIsoTokyo(),
  source: {
    name: 'Scryfall Cards Search API',
    url: CARDS_SEARCH_API,
    query: SEARCH_QUERY,
    includeMultilingual: true,
  },
  cards: {},
};

let fetchedCards = 0;
let missingJapaneseNames = 0;
let pageCount = 0;

console.log('[DICTIONARY] loading Standard-legal Japanese cards from Scryfall search');

let nextUrl = buildSearchUrl();
while (nextUrl) {
  pageCount += 1;
  const page = await fetchJson(nextUrl);
  const cards = Array.isArray(page.data) ? page.data : [];
  fetchedCards += cards.length;

  for (const card of cards) {
    addCardToDictionary(card);
  }

  console.log(
    `[DICTIONARY] page ${pageCount}: fetched ${cards.length}, total ${fetchedCards}`
  );

  nextUrl = page.has_more ? page.next_page : null;
  if (nextUrl) {
    await sleep(REQUEST_DELAY_MS);
  }
}

validateDictionary(dictionary);
await writeJsonAtomic(TEMP_PATH, dictionary);
validateDictionary(await readJson(TEMP_PATH));
await rename(TEMP_PATH, OUTPUT_PATH);

console.log(`[DICTIONARY] fetched cards: ${fetchedCards}`);
console.log(`[DICTIONARY] dictionary entries: ${Object.keys(dictionary.cards).length}`);
console.log(`[DICTIONARY] missing Japanese names in fetched cards: ${missingJapaneseNames}`);
console.log(`[DICTIONARY] missing Japanese dictionary entries: ${countMissingEntries()}`);

function buildSearchUrl() {
  const url = new URL(CARDS_SEARCH_API);
  url.searchParams.set('q', SEARCH_QUERY);
  url.searchParams.set('include_multilingual', 'true');
  url.searchParams.set('unique', 'prints');
  url.searchParams.set('order', 'name');
  return url.toString();
}

function addCardToDictionary(card) {
  if (!card?.name) return;

  const key = normalizeCardName(card.name);
  if (!key) return;

  const nameJa = card.printed_name || null;
  if (!nameJa) {
    missingJapaneseNames += 1;
  }

  const entry = {
    nameEn: card.name,
    nameJa,
    detailUrl: card.scryfall_uri || null,
    typeGroup: classifyTypeGroup(card.type_line || ''),
    translationStatus: nameJa ? 'complete' : 'missing',
  };

  const existing = dictionary.cards[key];
  if (!existing || existing.translationStatus === 'missing') {
    dictionary.cards[key] = entry;
  }
}

function validateDictionary(value) {
  if (value?.schemaVersion !== 1 || !value.cards || typeof value.cards !== 'object') {
    throw new Error('Generated dictionary has an invalid schema');
  }

  for (const [key, entry] of Object.entries(value.cards)) {
    if (!key || !entry?.nameEn) {
      throw new Error(`Invalid dictionary entry: ${key}`);
    }
    if (!['complete', 'missing'].includes(entry.translationStatus)) {
      throw new Error(`Invalid translationStatus for ${key}`);
    }
  }
}

function countMissingEntries() {
  return Object.values(dictionary.cards).filter(
    (entry) => entry.translationStatus === 'missing'
  ).length;
}

async function fetchJson(url) {
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(60000),
    });

    if (response.ok) {
      return response.json();
    }

    if (response.status === 429 || response.status >= 500) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : REQUEST_DELAY_MS * attempt * attempt;
      console.log(
        `[DICTIONARY] HTTP ${response.status}; retrying in ${waitMs}ms (attempt ${attempt}/${MAX_FETCH_ATTEMPTS})`
      );
      await sleep(waitMs);
      continue;
    }

    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  throw new Error(`Failed to fetch ${url} after ${MAX_FETCH_ATTEMPTS} attempts`);
}

function classifyTypeGroup(typeLine) {
  const value = typeLine.toLowerCase();
  if (value.includes('land')) return 'land';
  if (value.includes('creature')) return 'creature';
  if (value.includes('planeswalker')) return 'planeswalker';
  if (value.includes('instant')) return 'instant';
  if (value.includes('sorcery')) return 'sorcery';
  if (value.includes('enchantment')) return 'enchantment';
  if (value.includes('artifact')) return 'artifact';
  if (value.includes('battle')) return 'battle';
  return 'other';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
