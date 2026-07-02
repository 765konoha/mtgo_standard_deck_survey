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
const DEBUG_CARD_NAMES = [
  'Abigale, Poet Laureate // Heroic Stanza',
  'Aclazotz, Deepest Betrayal // Temple of the Dead',
  'Beanstalk Wurm // Plant Beans',
];

const dictionary = {
  schemaVersion: 1,
  generatedAt: toIsoTokyo(),
  source: {
    name: 'Scryfall Cards Search API',
    url: CARDS_SEARCH_API,
    query: SEARCH_QUERY,
    includeMultilingual: true,
    unique: 'prints',
  },
  cards: {},
};

const candidatesByKey = new Map();
const debugRecords = new Map(DEBUG_CARD_NAMES.map((name) => [name, []]));

let fetchedCards = 0;
let japanesePrints = 0;
let faceAliasCount = 0;
let pageCount = 0;

console.log('[DICTIONARY] loading Standard-legal Japanese cards from Scryfall search');

let nextUrl = buildSearchUrl();
while (nextUrl) {
  pageCount += 1;
  const page = await fetchJson(nextUrl);
  const cards = Array.isArray(page.data) ? page.data : [];
  fetchedCards += cards.length;

  for (const card of cards) {
    processCard(card);
  }

  console.log(
    `[DICTIONARY] page ${pageCount}: fetched ${cards.length}, total ${fetchedCards}`
  );

  nextUrl = page.has_more ? page.next_page : null;
  if (nextUrl) {
    await sleep(REQUEST_DELAY_MS);
  }
}

for (const [key, candidates] of candidatesByKey) {
  const selected = selectBestCandidate(candidates);
  dictionary.cards[key] = toDictionaryEntry(selected);
}

validateDictionary(dictionary);
await writeJsonAtomic(TEMP_PATH, dictionary);
validateDictionary(await readJson(TEMP_PATH));
await rename(TEMP_PATH, OUTPUT_PATH);

const missingEntries = getMissingEntries();

console.log(`[DICTIONARY] fetched cards: ${fetchedCards}`);
console.log(`[DICTIONARY] Japanese prints fetched: ${japanesePrints}`);
console.log(`[DICTIONARY] English name keys generated: ${Object.keys(dictionary.cards).length}`);
console.log(`[DICTIONARY] face aliases generated: ${faceAliasCount}`);
console.log(`[DICTIONARY] missing Japanese dictionary entries: ${missingEntries.length}`);
console.log(
  `[DICTIONARY] missing Japanese cards: ${
    missingEntries.length > 0
      ? missingEntries.map(([key, entry]) => `${entry.nameEn} (${key})`).join('; ')
      : 'none'
  }`
);

for (const name of DEBUG_CARD_NAMES) {
  logDebugCard(name);
}

function buildSearchUrl() {
  const url = new URL(CARDS_SEARCH_API);
  url.searchParams.set('q', SEARCH_QUERY);
  url.searchParams.set('include_multilingual', 'true');
  url.searchParams.set('unique', 'prints');
  url.searchParams.set('order', 'name');
  return url.toString();
}

function processCard(card) {
  if (!card?.name) return;
  if (card.lang !== 'ja') return;

  const nameJa = getJapaneseName(card);
  japanesePrints += 1;

  const candidate = {
    nameEn: card.name,
    nameJa,
    detailUrl: card.scryfall_uri || null,
    typeGroup: classifyTypeGroup(card.type_line || getFacesTypeLine(card)),
    translationStatus: nameJa ? 'complete' : 'missing',
    releasedAt: card.released_at || '0000-00-00',
    hasPrintedName: Boolean(card.printed_name),
    hasCompleteFaceNames: hasCompleteFacePrintedNames(card),
    sourceCard: card,
  };

  const keys = getDictionaryKeys(card);
  for (const key of keys) {
    addCandidate(key, candidate);
  }

  addDebugRecord(card, candidate, keys);
}

function getDictionaryKeys(card) {
  const keys = new Set();
  addKey(keys, card.name);

  const faces = Array.isArray(card.card_faces) ? card.card_faces : [];
  for (const face of faces) {
    addKey(keys, face.name);
  }
  if (faces[0]?.name) {
    addKey(keys, faces[0].name);
  }

  if (faces.length > 0) {
    const fullKey = normalizeCardName(card.name);
    for (const key of keys) {
      if (key !== fullKey) faceAliasCount += 1;
    }
  }

  return keys;
}

function addKey(keys, value) {
  const key = normalizeCardName(value);
  if (key) keys.add(key);
}

function addCandidate(key, candidate) {
  if (!candidatesByKey.has(key)) {
    candidatesByKey.set(key, []);
  }
  candidatesByKey.get(key).push(candidate);
}

function selectBestCandidate(candidates) {
  return [...candidates].sort(compareCandidates)[0];
}

function compareCandidates(a, b) {
  return (
    Number(Boolean(b.hasPrintedName)) - Number(Boolean(a.hasPrintedName)) ||
    Number(Boolean(b.hasCompleteFaceNames)) - Number(Boolean(a.hasCompleteFaceNames)) ||
    Number(Boolean(b.nameJa)) - Number(Boolean(a.nameJa)) ||
    b.releasedAt.localeCompare(a.releasedAt)
  );
}

function toDictionaryEntry(candidate) {
  return {
    nameEn: candidate.nameEn,
    nameJa: candidate.nameJa,
    detailUrl: candidate.detailUrl,
    typeGroup: candidate.typeGroup,
    translationStatus: candidate.nameJa ? 'complete' : 'missing',
  };
}

function getJapaneseName(card) {
  if (card.printed_name) {
    return card.printed_name;
  }

  const faces = Array.isArray(card.card_faces) ? card.card_faces : [];
  if (faces.length > 0 && faces.every((face) => face.printed_name)) {
    return faces.map((face) => face.printed_name).join(' // ');
  }

  return null;
}

function hasCompleteFacePrintedNames(card) {
  const faces = Array.isArray(card.card_faces) ? card.card_faces : [];
  return faces.length > 0 && faces.every((face) => Boolean(face.printed_name));
}

function getFacesTypeLine(card) {
  return (card.card_faces || []).map((face) => face.type_line || '').join(' ');
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
    if (entry.translationStatus === 'complete' && !entry.nameJa) {
      throw new Error(`Complete entry has no Japanese name: ${key}`);
    }
  }
}

function getMissingEntries() {
  return Object.entries(dictionary.cards).filter(
    ([, entry]) => entry.translationStatus === 'missing'
  );
}

function addDebugRecord(card, candidate, keys) {
  const names = new Set([
    card.name,
    ...(card.card_faces || []).map((face) => face.name),
  ]);
  const target = DEBUG_CARD_NAMES.find((name) => names.has(name));
  if (!target) return;

  debugRecords.get(target).push({
    card,
    candidate,
    keys: [...keys],
  });
}

function logDebugCard(name) {
  const records = debugRecords.get(name) || [];
  if (records.length === 0) {
    console.log(`[DICTIONARY][DEBUG] ${name}: no Scryfall card matched this run`);
    return;
  }

  const key = normalizeCardName(name);
  const selected = dictionary.cards[key];

  console.log(`[DICTIONARY][DEBUG] ${name}`);
  for (const record of records.slice(0, 5)) {
    const card = record.card;
    const candidate = record.candidate;
    const selectedThisRecord = selected?.detailUrl === candidate.detailUrl;
    console.log(
      JSON.stringify(
        {
          cardName: card.name,
          printedName: card.printed_name || null,
          lang: card.lang,
          layout: card.layout,
          releasedAt: card.released_at,
          cardFaces: (card.card_faces || []).map((face) => ({
            name: face.name,
            printed_name: face.printed_name || null,
          })),
          adoptedJapaneseName: selectedThisRecord ? selected?.nameJa || null : null,
          reason: selectedThisRecord
            ? getAdoptionReason(candidate)
            : getExclusionReason(candidate, selected),
        },
        null,
        2
      )
    );
  }
}

function getAdoptionReason(candidate) {
  if (candidate.hasPrintedName) return 'adopted: card.printed_name is present';
  if (candidate.hasCompleteFaceNames) {
    return 'adopted: all card_faces[].printed_name are present';
  }
  return 'adopted: newest available candidate for this key';
}

function getExclusionReason(candidate, selected) {
  if (!selected) return 'excluded: no selected entry for key';
  if (selected.nameJa && !candidate.nameJa) {
    return 'excluded: would overwrite an existing Japanese name with null';
  }
  if (selected.nameJa && candidate.nameJa) {
    return 'excluded: another candidate had higher priority or newer released_at';
  }
  return 'excluded: lower priority candidate';
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
