import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readJson } from './lib/fs-utils.mjs';
import { translateDecks } from './lib/translate-decklists.mjs';
import { validateEventData } from './lib/validate-data.mjs';
import { writeJsonAtomic } from './lib/fs-utils.mjs';

const dictionary = await readJson(join('data', 'cards', 'en-ja-map.json'), {
  schemaVersion: 1,
  cards: {},
});

await mkdir(join('public', 'data', 'events'), { recursive: true });

let rebuilt = 0;
for (const file of await safeReaddir(join('data', 'events'))) {
  if (!file.endsWith('.json')) continue;
  const path = join('data', 'events', file);
  const eventData = await readJson(path);
  if (!eventData?.event || eventData.event.status !== 'completed') {
    await copyFile(path, join('public', 'data', 'events', file));
    continue;
  }

  const rawDecks = eventData.decks.map((deck) => ({
    ...deck,
    mainboard: deck.mainboard.map((card) => ({ quantity: card.quantity, nameEn: card.nameEn })),
    sideboard: deck.sideboard.map((card) => ({ quantity: card.quantity, nameEn: card.nameEn })),
  }));
  const { decks } = translateDecks(rawDecks, dictionary);
  const next = { ...eventData, decks };
  validateEventData(next);
  await writeJsonAtomic(path, next);
  await writeJsonAtomic(join('public', 'data', 'events', file), next);
  rebuilt += 1;
}

console.log(`[REBUILD] ${rebuilt} completed events retranslated`);

async function safeReaddir(path) {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

