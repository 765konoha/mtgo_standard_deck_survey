import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readJson, toIsoTokyo, writeJsonAtomic } from './lib/fs-utils.mjs';
import { buildTranslationAudit } from './lib/translation-audit.mjs';

const dictionary = await readJson(join('data', 'cards', 'en-ja-map.json'), {
  cards: {},
});
const eventsById = new Map();

for (const directory of [join('data', 'events'), join('public', 'data', 'events')]) {
  for (const file of await safeReaddir(directory)) {
    if (!file.endsWith('.json')) continue;
    const eventData = await readJson(join(directory, file), null);
    if (eventData?.event?.id) eventsById.set(eventData.event.id, eventData);
  }
}

const audit = buildTranslationAudit({
  dictionary,
  events: [...eventsById.values()],
  generatedAt: toIsoTokyo(),
});
await writeJsonAtomic(join('data', 'cards', 'translation-audit.json'), audit);

console.log(`[AUDIT] dictionary cards: ${audit.summary.auditedCards}`);
console.log(`[AUDIT] translated: ${audit.summary.translated}`);
console.log(`[AUDIT] nameJa null: ${audit.summary.nameJaNull}`);
console.log(`[AUDIT] missing: ${audit.summary.missing}`);
console.log(`[AUDIT] same as English: ${audit.summary.sameAsEnglish}`);
console.log(`[AUDIT] partial faces: ${audit.summary.partialFaces}`);
console.log(`[AUDIT] not applied to events: ${audit.summary.notAppliedToEvents}`);
console.log(`[AUDIT] manual overrides: ${audit.summary.manualOverrides}`);
for (const card of audit.cards) {
  console.log(
    `[AUDIT][UNRESOLVED] ${card.nameEn} | oracle_id=${card.oracleId || 'unknown'} | reasons=${card.reasons.join(',')}`
  );
}

async function safeReaddir(directory) {
  try {
    return await readdir(directory);
  } catch {
    return [];
  }
}
