import { readdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildCardDictionary,
  mergeSetScopedDictionary,
  unresolvedOracleIds,
} from './lib/build-card-dictionary.mjs';
import { readJson, toIsoTokyo, writeJsonAtomic } from './lib/fs-utils.mjs';
import { normalizeCardName } from './lib/normalize-card-name.mjs';

const CARDS_SEARCH_API = 'https://api.scryfall.com/cards/search';
const CARDS_COLLECTION_API = 'https://api.scryfall.com/cards/collection';
const USER_AGENT = 'mtgo-standard-deck-survey/1.0 (+https://github.com/)';
const REQUEST_DELAY_MS = Number(process.env.SCRYFALL_REQUEST_DELAY_MS || 500);
const MAX_FETCH_ATTEMPTS = Number(process.env.SCRYFALL_MAX_FETCH_ATTEMPTS || 5);
const ENGLISH_QUERY = 'format:standard lang:en';
const JAPANESE_QUERY = 'format:standard lang:ja';
const OUTPUT_PATH = join('data', 'cards', 'en-ja-map.json');
const TEMP_PATH = `${OUTPUT_PATH}.next`;
const OVERRIDES_PATH = join('data', 'cards', 'manual-overrides.json');
const CACHE_PATH = join('data', 'cards', 'scryfall-ja-cache.json');
const ORACLE_RECHECK_BATCH_SIZE = Number(process.env.SCRYFALL_ORACLE_BATCH_SIZE || 10);
const COLLECTION_BATCH_SIZE = 75;
// Cached "no Japanese prints" answers expire so late-arriving Scryfall
// language data (e.g. a brand-new set) is eventually re-checked.
const NEGATIVE_CACHE_TTL_DAYS = Number(process.env.SCRYFALL_NEGATIVE_CACHE_TTL_DAYS || 7);
const CONFIG_PATH = join('data', 'config', 'standard-set-codes.json');
// Standard holds roughly the last three years of premier sets; the exact pool
// is data-derived on each full update and can be hand-edited in CONFIG_PATH.
const STANDARD_ROTATION_YEARS = Number(process.env.STANDARD_ROTATION_YEARS || 3);
const TARGET_SET_CODE = parseSetCode();

if (TARGET_SET_CODE) {
  await runSetScopedUpdate(TARGET_SET_CODE);
  process.exit(0);
}

console.log('[DICTIONARY] loading Standard English cards');
const standardEnglishPrints = await fetchSearch(ENGLISH_QUERY);
console.log('[DICTIONARY] loading Standard Japanese prints');
const standardJapanesePrints = await fetchSearch(JAPANESE_QUERY);
const manualOverrides = await readJson(OVERRIDES_PATH, {});
const cache = await readJson(CACHE_PATH, {
  schemaVersion: 1,
  oracleIds: {},
  englishNames: {},
});
cache.oracleIds ||= {};
cache.englishNames ||= {};
const eventNames = await readAllEventCardNames();
const standardEnglishNames = new Set(standardEnglishPrints.flatMap(cardEnglishAliases));
const missingEventNames = eventNames.filter(
  (name) => !standardEnglishNames.has(normalizeCardName(name))
);
const uncachedEventNames = missingEventNames.filter(
  (name) => !(normalizeCardName(name) in cache.englishNames)
);
console.log(`[DICTIONARY] event card names outside current Standard: ${missingEventNames.length}`);
console.log(`[DICTIONARY] uncached event card names: ${uncachedEventNames.length}`);
for (let index = 0; index < uncachedEventNames.length; index += COLLECTION_BATCH_SIZE) {
  const names = uncachedEventNames.slice(index, index + COLLECTION_BATCH_SIZE);
  const page = await fetchJson(CARDS_COLLECTION_API, {
    method: 'POST',
    body: { identifiers: names.map((name) => ({ name })) },
  });
  for (const name of names) {
    const normalizedName = normalizeCardName(name);
    const card = (page.data || []).find(
      (candidate) => cardEnglishAliases(candidate).includes(normalizedName)
    );
    cache.englishNames[normalizedName] = {
      checkedAt: toIsoTokyo(),
      card: card ? compactCachedCard(card) : null,
    };
  }
  cache.updatedAt = toIsoTokyo();
  await writeJsonAtomic(CACHE_PATH, cache);
  if (index + COLLECTION_BATCH_SIZE < uncachedEventNames.length) await sleep(REQUEST_DELAY_MS);
}
const eventEnglishPrints = missingEventNames
  .map((name) => cache.englishNames[normalizeCardName(name)]?.card)
  .filter(Boolean);
const englishPrints = deduplicatePrints([...standardEnglishPrints, ...eventEnglishPrints]);
const unresolvedIds = unresolvedOracleIds(englishPrints, standardJapanesePrints);
const recheckedPrints = [];
const uncachedIds = unresolvedIds.filter((oracleId) => shouldRecheckOracle(cache.oracleIds[oracleId]));

console.log(`[DICTIONARY] unresolved oracle_ids to recheck: ${unresolvedIds.length}`);
console.log(`[DICTIONARY] uncached oracle_ids: ${uncachedIds.length}`);
for (let index = 0; index < uncachedIds.length; index += ORACLE_RECHECK_BATCH_SIZE) {
  const oracleIds = uncachedIds.slice(index, index + ORACLE_RECHECK_BATCH_SIZE);
  const prints = await fetchJapanesePrintsByOracleIds(oracleIds);
  for (const oracleId of oracleIds) {
    cache.oracleIds[oracleId] = {
      checkedAt: toIsoTokyo(),
      prints: prints
        .filter((card) => card.oracle_id === oracleId)
        .map(compactCachedCard),
    };
  }
  cache.updatedAt = toIsoTokyo();
  await writeJsonAtomic(CACHE_PATH, cache);
  if (index + ORACLE_RECHECK_BATCH_SIZE < uncachedIds.length) await sleep(REQUEST_DELAY_MS);
}
for (const oracleId of unresolvedIds) {
  const cached = cache.oracleIds[oracleId];
  recheckedPrints.push(...(cached?.prints || []));
  console.log(
    `[DICTIONARY][RECHECK] oracle_id=${oracleId} | Japanese prints=${cached?.prints?.length || 0} | ${cached?.prints?.map(describePrint).join('; ') || 'none'}`
  );
}
cache.updatedAt = toIsoTokyo();
await writeJsonAtomic(CACHE_PATH, cache);
const japanesePrints = deduplicatePrints([...standardJapanesePrints, ...recheckedPrints]);

// Refresh the current-Standard set list from the prints we just fetched so
// setCodes stay scoped to sets actually in Standard, not every historical
// reprint. Operators can hand-edit the file afterwards.
const allowedSetCodes = await refreshStandardSetCodes(englishPrints);

const { dictionary, stats, unresolved } = buildCardDictionary({
  englishPrints,
  japanesePrints,
  manualOverrides,
  generatedAt: toIsoTokyo(),
  allowedSetCodes,
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
console.log(`[DICTIONARY] partial Japanese cards: ${stats.partialJapaneseCards}`);
console.log(`[DICTIONARY] manual overrides applied: ${stats.manualOverrides}`);
for (const card of unresolved) {
  console.log(
    `[DICTIONARY][UNRESOLVED] ${card.nameEn} | oracle_id=${card.oracleId} | layout=${card.layout}`
  );
}

async function fetchSearch(query, { allowNotFound = false } = {}) {
  const cards = [];
  let pageCount = 0;
  let nextUrl = buildSearchUrl(query);
  while (nextUrl) {
    pageCount += 1;
    const page = await fetchJson(nextUrl, { allowNotFound });
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

async function fetchJapanesePrintsByOracleIds(oracleIds) {
  const oracleQuery = oracleIds.map((oracleId) => `oracleid:${oracleId}`).join(' or ');
  const url = buildSearchUrl(`lang:ja (${oracleQuery})`);
  const page = await fetchJson(url, { allowNotFound: true });
  const cards = [...(page.data || [])];
  let nextUrl = page.has_more ? page.next_page : null;
  while (nextUrl) {
    await sleep(REQUEST_DELAY_MS);
    const nextPage = await fetchJson(nextUrl, { allowNotFound: true });
    cards.push(...(nextPage.data || []));
    nextUrl = nextPage.has_more ? nextPage.next_page : null;
  }
  const requested = new Set(oracleIds);
  return cards.filter((card) => card.lang === 'ja' && requested.has(card.oracle_id));
}

function buildSearchUrl(query) {
  const url = new URL(CARDS_SEARCH_API);
  url.searchParams.set('q', query);
  url.searchParams.set('include_multilingual', 'true');
  url.searchParams.set('unique', 'prints');
  url.searchParams.set('order', 'name');
  return url.toString();
}

async function fetchJson(url, {
  allowNotFound = false,
  method = 'GET',
  body,
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(60000),
      });
      if (response.ok) return response.json();
      if (allowNotFound && response.status === 404) {
        return { data: [], has_more: false };
      }
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

function compactCachedCard(card) {
  return {
    id: card.id,
    oracle_id: card.oracle_id,
    name: card.name,
    lang: card.lang,
    layout: card.layout,
    printed_name: card.printed_name || null,
    card_faces: (card.card_faces || []).map((face) => ({
      name: face.name,
      printed_name: face.printed_name || null,
      type_line: face.type_line || null,
    })),
    scryfall_uri: card.scryfall_uri,
    type_line: card.type_line || null,
    released_at: card.released_at,
    set: card.set,
    set_name: card.set_name || null,
    set_type: card.set_type || null,
    collector_number: card.collector_number,
  };
}

// Derives the current-Standard set codes from the freshly fetched Standard
// prints (recent expansion/core sets) and persists them for reuse by
// set-scoped updates. Keeps setCodes from accumulating old reprints.
async function refreshStandardSetCodes(englishPrints) {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - STANDARD_ROTATION_YEARS);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const byCode = new Map();
  for (const card of englishPrints) {
    if (!card?.set || !['expansion', 'core'].includes(card.set_type)) continue;
    if (!card.released_at || card.released_at < cutoffDate) continue;
    const code = String(card.set).toUpperCase();
    const existing = byCode.get(code);
    if (!existing || card.released_at > existing.releasedAt) {
      byCode.set(code, { code, name: card.set_name || null, releasedAt: card.released_at });
    }
  }
  const sets = [...byCode.values()].sort(
    (a, b) => String(b.releasedAt || '').localeCompare(String(a.releasedAt || ''))
      || a.code.localeCompare(b.code)
  );
  const config = {
    schemaVersion: 1,
    generatedAt: toIsoTokyo(),
    rotationYears: STANDARD_ROTATION_YEARS,
    note: 'Auto-generated on full dictionary update. Edit setCodes to adjust the Standard pool by hand.',
    setCodes: sets.map((set) => set.code),
    sets,
  };
  await writeJsonAtomic(CONFIG_PATH, config);
  console.log(`[CONFIG] current Standard set codes (${config.setCodes.length}): ${config.setCodes.join(', ')}`);
  return new Set(config.setCodes);
}

async function loadStandardSetCodes() {
  const config = await readJson(CONFIG_PATH, null);
  if (!config?.setCodes?.length) return null;
  return new Set(config.setCodes.map((code) => String(code).toUpperCase()));
}

function parseSetCode(args = process.argv.slice(2), env = process.env) {
  let value = env.SET_CODE || null;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith('--set-code=')) value = args[index].split('=', 2)[1];
    if (args[index] === '--set-code') value = args[index + 1];
  }
  if (value == null || String(value).trim() === '') return null;
  const code = String(value).trim();
  if (!/^[a-z0-9]{2,6}$/i.test(code)) {
    throw new Error(`set-code must be a 2-6 character set code: ${value}`);
  }
  return code.toUpperCase();
}

function shouldRecheckOracle(cacheEntry, now = Date.now()) {
  if (!cacheEntry) return true;
  if ((cacheEntry.prints || []).length > 0) return false;
  const checkedAt = new Date(cacheEntry.checkedAt || 0).getTime();
  if (!Number.isFinite(checkedAt)) return true;
  return now - checkedAt > NEGATIVE_CACHE_TTL_DAYS * 86400000;
}

// Updates the dictionary for a single set (e.g. SET_CODE=MSH). Fetches only
// that set's printings, force-refreshes the Japanese-print cache for its
// unresolved oracle IDs, and safely merges the result into the existing
// dictionary without touching entries from other sets.
async function runSetScopedUpdate(setCode) {
  const setQuery = `set:${setCode.toLowerCase()}`;
  console.log(`[SET] target set: ${setCode}`);
  const englishPrints = await fetchSearch(`${setQuery} lang:en`);
  console.log(`[SET] English printings fetched: ${englishPrints.length}`);
  // Scryfall answers 404 for zero-result searches; a set with no Japanese
  // prints yet is an expected state, not an error.
  const japanesePrints = await fetchSearch(`${setQuery} lang:ja`, { allowNotFound: true });
  console.log(`[SET] Japanese printings fetched: ${japanesePrints.length}`);
  if (englishPrints.length === 0) {
    throw new Error(`No English printings found for set ${setCode}; refusing to update`);
  }

  const cache = await readJson(CACHE_PATH, {
    schemaVersion: 1,
    oracleIds: {},
    englishNames: {},
  });
  cache.oracleIds ||= {};
  cache.englishNames ||= {};
  const oracleIds = [...new Set(englishPrints.map((card) => card.oracle_id).filter(Boolean))];
  console.log(`[SET] Unique oracle IDs: ${oracleIds.length}`);

  // Force-refresh: a set-scoped update intentionally ignores cached negative
  // answers so newly published Japanese data is picked up immediately.
  const unresolvedIds = unresolvedOracleIds(englishPrints, japanesePrints);
  const recheckedPrints = [];
  console.log(`[SET] oracle IDs rechecked for Japanese prints: ${unresolvedIds.length}`);
  for (let index = 0; index < unresolvedIds.length; index += ORACLE_RECHECK_BATCH_SIZE) {
    const batch = unresolvedIds.slice(index, index + ORACLE_RECHECK_BATCH_SIZE);
    const prints = await fetchJapanesePrintsByOracleIds(batch);
    for (const oracleId of batch) {
      cache.oracleIds[oracleId] = {
        checkedAt: toIsoTokyo(),
        prints: prints
          .filter((card) => card.oracle_id === oracleId)
          .map(compactCachedCard),
      };
    }
    recheckedPrints.push(...prints.map(compactCachedCard));
    cache.updatedAt = toIsoTokyo();
    await writeJsonAtomic(CACHE_PATH, cache);
    if (index + ORACLE_RECHECK_BATCH_SIZE < unresolvedIds.length) await sleep(REQUEST_DELAY_MS);
  }

  const manualOverrides = await readJson(OVERRIDES_PATH, {});
  const allJapanese = deduplicatePrints([...japanesePrints, ...recheckedPrints]);
  const partialKeys = new Set(englishPrints.flatMap(cardEnglishAliases));
  const scopedOverrides = Object.fromEntries(
    Object.entries(manualOverrides).filter(([name]) => partialKeys.has(normalizeCardName(name)))
  );
  // Reuse the Standard set list written by the last full update. The target set
  // is always allowed so a brand-new set still attributes to itself.
  const configuredSetCodes = await loadStandardSetCodes();
  const allowedSetCodes = configuredSetCodes
    ? new Set([...configuredSetCodes, setCode.toUpperCase()])
    : null;
  const { dictionary: partial, stats, unresolved } = buildCardDictionary({
    englishPrints,
    japanesePrints: allJapanese,
    manualOverrides: scopedOverrides,
    generatedAt: toIsoTokyo(),
    allowedSetCodes,
    source: {
      name: 'Scryfall Cards Search API',
      url: CARDS_SEARCH_API,
      englishQuery: `${setQuery} lang:en`,
      japaneseQuery: `${setQuery} lang:ja`,
      includeMultilingual: true,
      unique: 'prints',
      joinKey: 'oracle_id',
    },
  });

  const existing = await readJson(OUTPUT_PATH, { schemaVersion: 1, cards: {} });
  const previousTranslated = Object.values(existing.cards || {}).filter((entry) => entry.nameJa).length;
  const { dictionary: merged, mergeStats } = mergeSetScopedDictionary(existing, partial);
  const nextTranslated = Object.values(merged.cards).filter((entry) => entry.nameJa).length;
  if (nextTranslated < previousTranslated) {
    throw new Error(
      `Set-scoped update would reduce translated entries from ${previousTranslated} to ${nextTranslated}; aborting`
    );
  }

  await writeJsonAtomic(TEMP_PATH, merged);
  validateDictionary(await readJson(TEMP_PATH));
  await rename(TEMP_PATH, OUTPUT_PATH);

  console.log(`[TRANSLATE] printed_name resolved: ${stats.fromPrintedName}`);
  console.log(`[TRANSLATE] card_faces resolved: ${stats.fromCardFaces}`);
  console.log(`[TRANSLATE] unchanged existing translations: ${mergeStats.translationsPreserved}`);
  console.log(`[TRANSLATE] translations adopted: ${mergeStats.translationsAdopted}`);
  console.log(`[TRANSLATE] entries added: ${mergeStats.added}`);
  console.log(`[TRANSLATE] entries updated: ${mergeStats.updated}`);
  console.log(`[TRANSLATE] missing after update: ${unresolved.length}`);
  for (const card of unresolved) {
    const cachedPrints = cache.oracleIds[card.oracleId]?.prints || [];
    console.log(
      `[SET][UNRESOLVED] ${card.nameEn} | oracle_id=${card.oracleId} | layout=${card.layout}`
      + ` | japanese prints=${cachedPrints.length}`
      + `${cachedPrints.length ? ` | ${cachedPrints.map(describePrint).join('; ')}` : ''}`
    );
  }
}

function cardEnglishAliases(card) {
  return [
    card?.name,
    ...(card?.card_faces || []).map((face) => face.name),
  ].filter(Boolean).map(normalizeCardName);
}

async function readAllEventCardNames() {
  const names = new Map();
  for (const directory of [join('data', 'events'), join('public', 'data', 'events')]) {
    for (const file of await safeReaddir(directory)) {
      if (!file.endsWith('.json')) continue;
      const eventData = await readJson(join(directory, file), null);
      for (const deck of eventData?.decks || []) {
        for (const card of [...(deck.mainboard || []), ...(deck.sideboard || [])]) {
          if (card?.nameEn) names.set(normalizeCardName(card.nameEn), card.nameEn);
        }
      }
    }
  }
  return [...names.values()];
}

async function safeReaddir(directory) {
  try {
    return await readdir(directory);
  } catch {
    return [];
  }
}

function deduplicatePrints(cards) {
  return [...new Map(cards.filter((card) => card?.id).map((card) => [card.id, card])).values()];
}

function describePrint(card) {
  const faceNames = (card.card_faces || [])
    .map((face) => face.printed_name || 'null')
    .join(' // ');
  return [
    `lang=${card.lang}`,
    `set=${card.set}`,
    `collector=${card.collector_number}`,
    `printed_name=${card.printed_name || 'null'}`,
    `faces=${faceNames || 'none'}`,
    `released_at=${card.released_at || 'unknown'}`,
  ].join(',');
}

function validateDictionary(value) {
  if (value?.schemaVersion !== 1 || !value.cards || typeof value.cards !== 'object') {
    throw new Error('Generated dictionary has an invalid schema');
  }
  for (const [key, entry] of Object.entries(value.cards)) {
    if (!key || !entry?.nameEn) throw new Error(`Invalid dictionary entry: ${key}`);
    if (!['complete', 'partial', 'missing'].includes(entry.translationStatus)) {
      throw new Error(`Invalid translationStatus for ${key}`);
    }
    if (entry.translationStatus === 'complete' && !entry.nameJa) {
      throw new Error(`Complete entry has no Japanese name: ${key}`);
    }
    if (entry.translationStatus === 'complete' && !entry.translationSource) {
      throw new Error(`Complete entry has no translationSource: ${key}`);
    }
    validateEntrySetAttributes(key, entry);
  }
}

function validateEntrySetAttributes(key, entry) {
  // Set attributes are optional for backward compatibility, but must be
  // internally consistent when present.
  if (entry.setCodes === undefined && entry.sets === undefined && entry.primarySetCode === undefined) {
    return;
  }
  if (!Array.isArray(entry.setCodes)) {
    throw new Error(`setCodes must be an array: ${key}`);
  }
  if (new Set(entry.setCodes).size !== entry.setCodes.length) {
    throw new Error(`setCodes must not contain duplicates: ${key}`);
  }
  for (const code of entry.setCodes) {
    if (typeof code !== 'string' || code !== code.toUpperCase()) {
      throw new Error(`setCodes must be uppercase strings: ${key}`);
    }
  }
  if (entry.primarySetCode != null && !entry.setCodes.includes(entry.primarySetCode)) {
    throw new Error(`primarySetCode must be null or one of setCodes: ${key}`);
  }
  const setListCodes = (entry.sets || []).map((set) => set.code);
  if (JSON.stringify(setListCodes) !== JSON.stringify(entry.setCodes)) {
    throw new Error(`sets and setCodes are inconsistent: ${key}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
