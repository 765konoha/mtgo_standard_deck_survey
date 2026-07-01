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

export function slugify(value) {
  return String(value || 'event')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

