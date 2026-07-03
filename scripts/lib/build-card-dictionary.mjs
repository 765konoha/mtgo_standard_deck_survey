import { normalizeCardName } from './normalize-card-name.mjs';

export function buildCardDictionary({
  englishPrints,
  japanesePrints,
  manualOverrides = {},
  generatedAt,
  source = {},
}) {
  const englishByOracle = groupByOracle(englishPrints);
  const japaneseByOracle = groupByOracle(japanesePrints);
  const cards = {};
  const unresolved = [];
  const stats = {
    standardEnglishCards: englishByOracle.size,
    japanesePrints: japanesePrints.length,
    oracleJoined: 0,
    fromPrintedName: 0,
    fromCardFaces: 0,
    aliases: 0,
    missingJapaneseCards: 0,
  };

  for (const [oracleId, englishCards] of englishByOracle) {
    const englishCard = selectEnglishCard(englishCards);
    const japaneseCard = selectJapaneseCard(japaneseByOracle.get(oracleId) || []);
    const japaneseName = getJapaneseName(japaneseCard);
    if (japaneseCard) stats.oracleJoined += 1;
    if (japaneseName.source === 'printed_name') stats.fromPrintedName += 1;
    if (japaneseName.source === 'card_faces') stats.fromCardFaces += 1;

    const aliases = collectAliases(englishCards);
    for (const alias of aliases) {
      const faceName = alias.faceIndex == null
        ? null
        : japaneseCard?.card_faces?.[alias.faceIndex]?.printed_name || null;
      const nameJa = faceName || (alias.faceIndex == null ? japaneseName.nameJa : null);
      mergeEntry(cards, normalizeCardName(alias.name), {
        nameEn: alias.name,
        nameJa,
        detailUrl: japaneseCard?.scryfall_uri || englishCard.scryfall_uri || null,
        typeGroup: classifyTypeGroup(englishCard.type_line || facesTypeLine(englishCard)),
        translationStatus: nameJa ? 'complete' : 'missing',
        oracleId,
        layout: englishCard.layout || null,
      });
    }
    stats.aliases += aliases.length;

    if (!japaneseName.nameJa) {
      stats.missingJapaneseCards += 1;
      unresolved.push({
        nameEn: englishCard.name,
        oracleId,
        layout: englishCard.layout || 'unknown',
      });
    }
  }

  applyManualOverrides(cards, manualOverrides);
  const remainingUnresolved = unresolved
    .filter((card) => !cards[normalizeCardName(card.nameEn)]?.nameJa)
    .sort((a, b) => a.nameEn.localeCompare(b.nameEn));
  stats.missingJapaneseCards = remainingUnresolved.length;
  return {
    dictionary: {
      schemaVersion: 1,
      generatedAt,
      source,
      cards: Object.fromEntries(Object.entries(cards).sort(([a], [b]) => a.localeCompare(b))),
    },
    stats,
    unresolved: remainingUnresolved,
  };
}

export function getJapaneseName(card) {
  if (!card) return { nameJa: null, source: null };
  if (card.printed_name) {
    return { nameJa: card.printed_name, source: 'printed_name' };
  }
  const faceNames = (card.card_faces || [])
    .map((face) => face.printed_name)
    .filter(Boolean);
  if (faceNames.length > 0) {
    return { nameJa: faceNames.join(' // '), source: 'card_faces' };
  }
  return { nameJa: null, source: null };
}

export function diagnoseCardNames({
  englishPrints,
  japanesePrints,
  dictionary,
  names,
}) {
  return names.map((requestedName) => {
    const normalized = normalizeCardName(requestedName);
    const englishCard = englishPrints.find((card) => collectAliases([card])
      .some((alias) => normalizeCardName(alias.name) === normalized));
    const japaneseCards = englishCard
      ? japanesePrints.filter((card) => card.oracle_id === englishCard.oracle_id)
      : [];
    const selectedJapanese = selectJapaneseCard(japaneseCards);
    const result = dictionary.cards[normalized] || null;
    return {
      requestedName,
      englishCard: compactCard(englishCard),
      japaneseCard: compactCard(selectedJapanese),
      oracleId: englishCard?.oracle_id || null,
      printedName: selectedJapanese?.printed_name || null,
      cardFaces: (selectedJapanese?.card_faces || []).map(compactFace),
      dictionaryResult: result,
      previousFailureReason: failureReason(requestedName, englishCard, selectedJapanese),
    };
  });
}

function groupByOracle(cards) {
  const grouped = new Map();
  for (const card of cards || []) {
    if (!card?.oracle_id || !card?.name) continue;
    if (!grouped.has(card.oracle_id)) grouped.set(card.oracle_id, []);
    grouped.get(card.oracle_id).push(card);
  }
  return grouped;
}

function selectEnglishCard(cards) {
  return [...cards].sort((a, b) =>
    Number(Boolean(b.type_line)) - Number(Boolean(a.type_line))
    || String(b.released_at || '').localeCompare(String(a.released_at || ''))
  )[0];
}

function selectJapaneseCard(cards) {
  return [...cards].sort((a, b) => {
    const aName = getJapaneseName(a);
    const bName = getJapaneseName(b);
    return Number(Boolean(bName.nameJa)) - Number(Boolean(aName.nameJa))
      || sourceScore(bName.source) - sourceScore(aName.source)
      || String(b.released_at || '').localeCompare(String(a.released_at || ''));
  })[0] || null;
}

function sourceScore(source) {
  return source === 'printed_name' ? 2 : source === 'card_faces' ? 1 : 0;
}

function collectAliases(cards) {
  const aliases = new Map();
  const add = (name, faceIndex = null) => {
    const key = normalizeCardName(name);
    if (key && !aliases.has(key)) aliases.set(key, { name, faceIndex });
  };
  for (const card of cards) {
    add(card.name);
    add(card.printed_name);
    for (const [index, face] of (card.card_faces || []).entries()) {
      add(face.name, index);
      add(face.printed_name, index);
    }
  }
  return [...aliases.values()];
}

function mergeEntry(cards, key, candidate) {
  if (!key) return;
  const current = cards[key];
  if (!current || (!current.nameJa && candidate.nameJa)) {
    cards[key] = candidate;
    return;
  }
  if (current.nameJa && !candidate.nameJa) return;
  cards[key] = {
    ...current,
    ...candidate,
    nameJa: candidate.nameJa || current.nameJa || null,
    detailUrl: candidate.detailUrl || current.detailUrl || null,
  };
}

function applyManualOverrides(cards, overrides) {
  for (const [name, override] of Object.entries(overrides || {})) {
    const key = normalizeCardName(name);
    const current = cards[key] || {
      nameEn: name,
      nameJa: null,
      detailUrl: null,
      typeGroup: 'other',
      oracleId: null,
      layout: null,
    };
    const nameJa = override.nameJa || current.nameJa || null;
    cards[key] = {
      ...current,
      ...override,
      nameEn: current.nameEn || name,
      nameJa,
      detailUrl: override.detailUrl || current.detailUrl || null,
      translationStatus: nameJa ? 'complete' : 'missing',
    };
  }
}

function compactCard(card) {
  if (!card) return null;
  return {
    id: card.id,
    oracle_id: card.oracle_id,
    name: card.name,
    lang: card.lang,
    layout: card.layout,
    printed_name: card.printed_name || null,
    card_faces: (card.card_faces || []).map(compactFace),
    scryfall_uri: card.scryfall_uri,
  };
}

function compactFace(face) {
  return { name: face.name, printed_name: face.printed_name || null };
}

function failureReason(requestedName, englishCard, japaneseCard) {
  if (!englishCard) return 'English alias was not present in the Standard English print set';
  if (!japaneseCard) return 'No Standard-legal Japanese print shares this oracle_id';
  if (normalizeCardName(requestedName) !== normalizeCardName(englishCard.name)) {
    return 'MTGO used an English printed-name alias; the old card.name lookup could not join it';
  }
  if (japaneseCard.printed_name) {
    return englishCard.name === japaneseCard.name
      ? 'The old name-keyed lookup should have matched; a later null candidate could win'
      : 'English and Japanese card.name differ; the old name-keyed lookup could not join them';
  }
  if ((japaneseCard.card_faces || []).some((face) => face.printed_name)) {
    return 'Only some card_faces had printed_name; the old code required every face';
  }
  return 'The Japanese print exists but Scryfall provides no printed Japanese name';
}

function facesTypeLine(card) {
  return (card.card_faces || []).map((face) => face.type_line || '').join(' ');
}

function classifyTypeGroup(typeLine = '') {
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
