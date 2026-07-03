import { access, copyFile, mkdir, readdir } from 'node:fs/promises';
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
const dataDirectory = join('data', 'events');
const publicDirectory = join('public', 'data', 'events');
const files = new Set([
  ...(await safeReaddir(dataDirectory)),
  ...(await safeReaddir(publicDirectory)),
]);

for (const file of files) {
  if (!file.endsWith('.json')) continue;
  const dataPath = join(dataDirectory, file);
  const publicPath = join(publicDirectory, file);
  const hasDataSource = await pathExists(dataPath);
  const sourcePath = hasDataSource ? dataPath : publicPath;
  const eventData = await readJson(sourcePath);
  if (!eventData?.event || eventData.event.status !== 'completed') {
    if (hasDataSource) await copyFile(dataPath, publicPath);
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
  if (hasDataSource) await writeJsonAtomic(dataPath, next);
  await writeJsonAtomic(publicPath, next);
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

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

