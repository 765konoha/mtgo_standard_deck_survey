import { join } from 'node:path';
import { normalizeCardName } from './lib/normalize-card-name.mjs';
import { toIsoTokyo, writeJsonAtomic } from './lib/fs-utils.mjs';

const BULK_API = 'https://api.scryfall.com/bulk-data';
const USER_AGENT = 'mtgo-standard-deck-survey/1.0 (+https://github.com/)';

console.log('[DICTIONARY] loading Scryfall bulk metadata');
const bulk = await fetchJson(BULK_API);
const allCards = bulk.data.find((item) => item.type === 'all_cards');
if (!allCards?.download_uri) {
  throw new Error('Scryfall all_cards bulk file was not found');
}

console.log('[DICTIONARY] downloading all_cards bulk data');
const cards = await fetchJson(allCards.download_uri);

const englishByOracle = new Map();
const japaneseByOracle = new Map();

for (const card of cards) {
  if (!card.oracle_id || !card.name) continue;
  if (card.lang === 'en') {
    englishByOracle.set(card.oracle_id, card);
  } else if (card.lang === 'ja' && card.printed_name) {
    japaneseByOracle.set(card.oracle_id, card);
  }
}

const dictionary = {
  schemaVersion: 1,
  generatedAt: toIsoTokyo(),
  source: {
    name: 'Scryfall Bulk Data all_cards',
    url: BULK_API,
  },
  cards: {},
};

for (const [oracleId, enCard] of englishByOracle) {
  const jaCard = japaneseByOracle.get(oracleId);
  dictionary.cards[normalizeCardName(enCard.name)] = {
    nameEn: enCard.name,
    nameJa: jaCard?.printed_name || null,
    detailUrl: (jaCard || enCard).scryfall_uri || null,
    typeGroup: classifyTypeGroup(enCard.type_line || ''),
    translationStatus: jaCard?.printed_name ? 'complete' : 'missing',
  };
}

await writeJsonAtomic(join('data', 'cards', 'en-ja-map.json'), dictionary);
console.log(`[DICTIONARY] ${Object.keys(dictionary.cards).length} English card names written`);

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
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

