import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readJson, toIsoTokyo, writeJsonAtomic } from './lib/fs-utils.mjs';
import { buildSetTranslationAudit } from './lib/set-translation-audit.mjs';

const setCode = parseSetCode();
if (!setCode) {
  throw new Error('Usage: node scripts/audit-set-translations.mjs --set-code=MSH (or SET_CODE env)');
}

const dictionary = await readJson(join('data', 'cards', 'en-ja-map.json'), { cards: {} });
const cache = await readJson(join('data', 'cards', 'scryfall-ja-cache.json'), null);
const eventsById = new Map();
for (const directory of [join('data', 'events'), join('public', 'data', 'events')]) {
  for (const file of await safeReaddir(directory)) {
    if (!file.endsWith('.json')) continue;
    const eventData = await readJson(join(directory, file), null);
    if (eventData?.event?.id) eventsById.set(eventData.event.id, eventData);
  }
}

const audit = buildSetTranslationAudit({
  dictionary,
  events: [...eventsById.values()],
  cache,
  setCode,
  generatedAt: toIsoTokyo(),
});

const outputPath = join('data', 'cards', `${setCode.toLowerCase()}-translation-audit.json`);
await writeJsonAtomic(outputPath, audit);

console.log(`[SET AUDIT] set: ${audit.setCode}`);
console.log(`[SET AUDIT] total cards: ${audit.summary.totalCards}`);
console.log(`[SET AUDIT] complete: ${audit.summary.complete}`);
console.log(`[SET AUDIT] missing: ${audit.summary.missing}`);
console.log(`[SET AUDIT] same as English: ${audit.summary.sameAsEnglish}`);
console.log(`[SET AUDIT] partial: ${audit.summary.partial}`);
console.log(`[SET AUDIT] not applied to events: ${audit.summary.notAppliedToEvents}`);
console.log(`[SET AUDIT] written to ${outputPath}`);
for (const card of audit.cards.filter((entry) => entry.reason)) {
  console.log(
    `[SET AUDIT][UNRESOLVED] ${card.nameEn} | oracle_id=${card.oracleId || 'unknown'}`
    + ` | layout=${card.layout || 'unknown'} | ja prints=${card.japanesePrintCount}`
    + ` | reason=${card.reason}`
  );
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

async function safeReaddir(directory) {
  try {
    return await readdir(directory);
  } catch {
    return [];
  }
}
