import { slugify } from './event-rules.mjs';

const CARD_LINE = /^\s*(\d+)\s+(.+?)\s*$/;

export function parseEventPage(html, eventSummary) {
  const embeddedData = extractMtgoDecklistsData(html);
  if (embeddedData) {
    return parseEmbeddedDecklistsData(embeddedData, eventSummary);
  }

  const text = htmlToText(html);
  const hasDeckSignals = /decklist|main deck|sideboard|player|place|finish|5-0/i.test(text);
  const rawSections = splitDeckSections(text);

  if (rawSections.length === 0) {
    return {
      status: 'pending_publication',
      reason: 'decklists_not_published',
      decks: [],
      hasDeckSignals,
    };
  }

  const decks = rawSections
    .map((section, index) => parseDeckSection(section, index, eventSummary.eventType))
    .filter(Boolean);

  if (decks.length === 0 && hasDeckSignals) {
    return {
      status: 'parse_error',
      reason: 'deck_structure_unreadable',
      decks: [],
      hasDeckSignals,
    };
  }

  if (eventSummary.eventType === 'challenge') {
    const placements = new Set(decks.map((deck) => deck.placement).filter(Boolean));
    const hasDuplicatePlacements = placements.size !== decks.filter((d) => d.placement).length;
    const hasTopEight = [...Array(8)].every((_, index) => placements.has(index + 1));
    if (hasDuplicatePlacements) {
      return { status: 'parse_error', reason: 'duplicate_placement', decks, hasDeckSignals };
    }
    if (!hasTopEight) {
      return { status: 'pending_publication', reason: 'challenge_top8_incomplete', decks, hasDeckSignals };
    }
  }

  if (eventSummary.eventType === 'league') {
    const leagueDecks = decks.filter((deck) => deck.record === '5-0');
    if (leagueDecks.length === 0) {
      return { status: 'pending_publication', reason: 'league_5_0_not_published', decks: [], hasDeckSignals };
    }
    return { status: 'completed', reason: 'ok', decks: leagueDecks, hasDeckSignals };
  }

  return { status: 'completed', reason: 'ok', decks, hasDeckSignals };
}

function extractMtgoDecklistsData(html) {
  const marker = 'window.MTGO.decklists.data = ';
  const source = String(html || '');
  const start = source.indexOf(marker);
  if (start === -1) return null;

  const objectStart = source.indexOf('{', start + marker.length);
  if (objectStart === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = objectStart; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(objectStart, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function parseEmbeddedDecklistsData(data, eventSummary) {
  const rawDecklists = Array.isArray(data.decklists) ? data.decklists : [];
  const hasDeckSignals = Boolean(data.description || rawDecklists.length > 0 || data.standings);

  if (rawDecklists.length === 0) {
    return {
      status: 'pending_publication',
      reason: 'decklists_not_published',
      decks: [],
      hasDeckSignals,
    };
  }

  if (eventSummary.eventType === 'challenge') {
    const rankByLoginId = new Map(
      (Array.isArray(data.standings) ? data.standings : [])
        .map((standing) => [String(standing.loginid), Number(standing.rank)])
        .filter(([, rank]) => Number.isInteger(rank))
    );
    const topEight = rawDecklists
      .map((deck) => ({ deck, rank: rankByLoginId.get(String(deck.loginid)) }))
      .filter(({ rank }) => Number.isInteger(rank) && rank >= 1 && rank <= 8)
      .sort((a, b) => a.rank - b.rank);

    if (topEight.length === 0 && hasDeckSignals) {
      return {
        status: 'parse_error',
        reason: 'challenge_standings_unreadable',
        decks: [],
        hasDeckSignals,
      };
    }
    if (topEight.length < 8) {
      return {
        status: 'pending_publication',
        reason: 'challenge_top8_incomplete',
        decks: topEight.map(({ deck, rank }) => convertEmbeddedDeck(deck, rank, null)),
        hasDeckSignals,
      };
    }

    const decks = topEight.map(({ deck, rank }) => convertEmbeddedDeck(deck, rank, null));
    if (decks.some((deck) => !deck || deck.mainboardCount <= 0 || !deck.player)) {
      return {
        status: 'parse_error',
        reason: 'challenge_deck_structure_unreadable',
        decks: decks.filter(Boolean),
        hasDeckSignals,
      };
    }
    return { status: 'completed', reason: 'ok', decks, hasDeckSignals };
  }

  const decks = rawDecklists
    .filter((deck) => deck.wins === undefined || isLeague5_0(deck.wins))
    .map((deck) => convertEmbeddedDeck(deck, null, '5-0'));

  if (decks.length === 0) {
    return {
      status: 'pending_publication',
      reason: 'league_5_0_not_published',
      decks: [],
      hasDeckSignals,
    };
  }
  if (decks.some((deck) => !deck || deck.mainboardCount <= 0 || !deck.player)) {
    return {
      status: 'parse_error',
      reason: 'league_deck_structure_unreadable',
      decks: decks.filter(Boolean),
      hasDeckSignals,
    };
  }

  return { status: 'completed', reason: 'ok', decks, hasDeckSignals };
}

function convertEmbeddedDeck(deck, placement, record) {
  const mainboard = convertEmbeddedCards(deck.main_deck);
  const sideboard = convertEmbeddedCards(deck.sideboard_deck);
  const player = cleanupName(deck.player);

  if (!player) return null;

  return {
    id: slugify(
      `${placement || record || deck.decktournamentid || deck.instance_id || deck.loginplayeventcourseid || deck.loginid || 'deck'}-${player}`
    ),
    player,
    placement,
    record,
    mainboardCount: countCards(mainboard),
    sideboardCount: countCards(sideboard),
    mainboard,
    sideboard,
  };
}

function isLeague5_0(wins) {
  if (typeof wins === 'object' && wins !== null) {
    return Number(wins.wins) === 5 && Number(wins.losses) === 0;
  }
  if (typeof wins === 'string' && /^\s*5\s*-\s*0\s*$/.test(wins)) {
    return true;
  }
  return Number(wins) === 5;
}

function convertEmbeddedCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards
    .map((card) => ({
      quantity: Number(card.qty),
      nameEn: card.card_attributes?.card_name || card.card_name || card.name,
    }))
    .filter((card) => Number.isInteger(card.quantity) && card.quantity > 0 && card.nameEn);
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(\/?)(h[1-6]|p|div|li|tr|br|section|article|table|thead|tbody|ul|ol)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function splitDeckSections(text) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const sections = [];
  let current = [];

  for (const line of lines) {
    if (/^(decklist|player|place|finish|rank)\b/i.test(line) && current.length > 0) {
      sections.push(current.join('\n'));
      current = [line];
      continue;
    }
    if (/^(main deck|mainboard|deck)$/i.test(line) && current.some((l) => /sideboard/i.test(l))) {
      sections.push(current.join('\n'));
      current = [line];
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) sections.push(current.join('\n'));
  return sections.filter((section) => /main deck|mainboard|sideboard|\n\d+\s+\S+/i.test(section));
}

function parseDeckSection(section, index, eventType) {
  const lines = section.split('\n').map((line) => line.trim()).filter(Boolean);
  const player = extractPlayer(lines, index);
  const placement = eventType === 'challenge' ? extractPlacement(lines, index) : null;
  const record = eventType === 'league' ? extractRecord(lines) : null;
  const { mainboard, sideboard } = extractCards(lines);
  const mainboardCount = countCards(mainboard);
  const sideboardCount = countCards(sideboard);

  if (!player || mainboardCount <= 0) return null;
  if (eventType === 'challenge' && (!placement || placement < 1 || placement > 8)) return null;
  if (eventType === 'league' && record !== '5-0') return null;

  return {
    id: slugify(`${placement || record || index + 1}-${player}`),
    player,
    placement,
    record,
    mainboardCount,
    sideboardCount,
    mainboard,
    sideboard,
  };
}

function extractPlayer(lines, index) {
  for (const line of lines.slice(0, 8)) {
    const match = line.match(/(?:player|pilot)\s*:?\s*(.+)$/i);
    if (match) return cleanupName(match[1]);
  }
  const candidate = lines.find((line) => !/decklist|main deck|sideboard|place|finish|rank|record/i.test(line));
  return cleanupName(candidate || `Player ${index + 1}`);
}

function cleanupName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function extractPlacement(lines, index) {
  for (const line of lines.slice(0, 8)) {
    const match = line.match(/(?:place|finish|rank|#)\s*:?\s*(\d+)/i) || line.match(/^(\d+)(?:st|nd|rd|th)\b/i);
    if (match) return Number(match[1]);
  }
  return index + 1;
}

function extractRecord(lines) {
  const found = lines.find((line) => /\b5\s*-\s*0\b/.test(line));
  return found ? '5-0' : null;
}

function extractCards(lines) {
  const mainboard = [];
  const sideboard = [];
  let target = mainboard;

  for (const line of lines) {
    if (/sideboard/i.test(line)) {
      target = sideboard;
      continue;
    }
    if (/main deck|mainboard|\bdeck\b/i.test(line)) {
      target = mainboard;
      continue;
    }
    const match = line.match(CARD_LINE);
    if (!match) continue;
    const quantity = Number(match[1]);
    const nameEn = match[2].replace(/\s+\d+$/, '').trim();
    if (quantity > 0 && nameEn) {
      target.push({ quantity, nameEn });
    }
  }

  return { mainboard, sideboard };
}

function countCards(cards) {
  return cards.reduce((sum, card) => sum + card.quantity, 0);
}
