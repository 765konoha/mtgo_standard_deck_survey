export const eventRuleConfig = {
  leaguePatterns: [/standard\s+league/i],
  challengePatterns: [
    /standard\s+challenge/i,
    /standard\s+challenge\s+\d+/i,
  ],
  excludePatterns: [/pioneer/i, /modern/i, /legacy/i, /vintage/i, /pauper/i],
};

export function classifyEvent(name) {
  const normalized = String(name || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (eventRuleConfig.excludePatterns.some((pattern) => pattern.test(normalized))) {
    return null;
  }
  if (eventRuleConfig.leaguePatterns.some((pattern) => pattern.test(normalized))) {
    return 'league';
  }
  if (eventRuleConfig.challengePatterns.some((pattern) => pattern.test(normalized))) {
    return 'challenge';
  }
  return null;
}

export function eventIdFromUrl(url, name = 'event') {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split('/').filter(Boolean).pop() || name;
    return slugify(last);
  } catch {
    return slugify(name);
  }
}

// MTGO decklist slugs end with "<date><number>" (e.g. "...-2026-09-2312854542"
// or "...-2026-07-03-12846464"). For Challenges the number is MTGO's own event
// id, so it stays the same when MTGO re-publishes the page under a slug with a
// different date. League numbers are shared across days, so they are not unique.
export function mtgoEventNumber(id) {
  const match = String(id || '').match(/\d{4}-\d{2}-\d{2}-?(\d{5,})$/);
  return match ? match[1] : null;
}

// Identity used to collapse the same Challenge published under several URLs.
// Distinct Challenges held on the same day keep distinct numbers, so they
// never share a key.
export function eventIdentityKey({ id, eventType }) {
  const number = eventType === 'challenge' ? mtgoEventNumber(id) : null;
  return number ? `challenge:${number}` : `id:${id}`;
}

// Ordering used to choose which copy of a duplicated event is kept: completed
// first, then the copy whose slug date matches the event date, then the copy
// seen first.
export function compareDuplicateEvents(a, b) {
  const rank = (event) => [
    event.status === 'completed' ? 0 : 1,
    slugMatchesEventDate(event) ? 0 : 1,
  ];
  const [aCompleted, aSlug] = rank(a);
  const [bCompleted, bSlug] = rank(b);
  return aCompleted - bCompleted
    || aSlug - bSlug
    || String(a.firstSeenAt || '').localeCompare(String(b.firstSeenAt || ''))
    || String(a.id).localeCompare(String(b.id));
}

function slugMatchesEventDate({ id, eventDate }) {
  return Boolean(eventDate && String(id || '').includes(eventDate));
}

export function slugify(value) {
  return String(value || 'event')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

