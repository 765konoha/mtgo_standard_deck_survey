import { normalizeCardName } from './normalize-card-name.mjs';

const BASIC_LAND_EN = new Set([
  'plains',
  'island',
  'swamp',
  'mountain',
  'forest',
  'wastes',
]);

const BASIC_LAND_JA = new Set([
  '平地',
  '島',
  '沼',
  '山',
  '森',
  '荒地',
]);

export function isBasicLandCard(card = {}) {
  if (!card) return false;
  const typeLineEn = String(card.typeLineEn || card.typeLine || '');
  if (/\bbasic\s+land\b/i.test(typeLineEn)) return true;

  const typeLineJa = String(card.typeLineJa || '');
  if (typeLineJa.includes('基本土地')) return true;

  const normalizedNameEn = normalizeCardName(card.nameEn || card.name || '');
  if (BASIC_LAND_EN.has(normalizedNameEn)) return true;

  const nameJa = String(card.nameJa || '').normalize('NFKC').trim();
  return BASIC_LAND_JA.has(nameJa);
}
