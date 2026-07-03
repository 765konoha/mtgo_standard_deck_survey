import { dateTokyo } from './fs-utils.mjs';
import { classifyEvent, eventIdFromUrl } from './event-rules.mjs';

const MONTHS = new Map([
  ['january', 1], ['february', 2], ['march', 3], ['april', 4],
  ['may', 5], ['june', 6], ['july', 7], ['august', 8],
  ['september', 9], ['october', 10], ['november', 11], ['december', 12],
]);

export function parseLookbackDays(args = process.argv.slice(2), env = process.env) {
  let value = env.FORCE_BACKFILL === 'true' ? env.LOOKBACK_DAYS : null;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith('--lookback-days=')) value = args[index].split('=', 2)[1];
    if (args[index] === '--lookback-days') value = args[index + 1];
  }
  if (value == null || value === '') return null;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 366) {
    throw new Error(`lookback-days must be an integer from 1 to 366: ${value}`);
  }
  return days;
}

export function lookbackPeriod(lookbackDays, now = new Date()) {
  const endDate = dateTokyo(now);
  return {
    startDate: addDays(endDate, -(lookbackDays - 1)),
    endDate,
  };
}

export async function discoverEventPages({
  listUrl,
  lookbackDays = null,
  now = new Date(),
  fetchText,
}) {
  const period = lookbackDays ? lookbackPeriod(lookbackDays, now) : null;
  const urls = period
    ? archiveUrls(listUrl, addDays(period.startDate, -2), period.endDate)
    : [listUrl];
  const eventsById = new Map();

  for (const url of urls) {
    const html = await fetchText(url);
    for (const event of discoverEventsFromHtml(html, url, now)) {
      if (period && !isDateInRange(event.eventDate, period)) continue;
      eventsById.set(event.id, event);
    }
  }

  return {
    events: [...eventsById.values()],
    pagesScanned: urls.length,
    period,
  };
}

export function discoverEventsFromHtml(html, pageUrl, now = new Date()) {
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const events = [];
  let match;
  while ((match = linkPattern.exec(html))) {
    const sourceUrl = new URL(match[1], pageUrl).toString();
    if (!/\/decklist\//i.test(sourceUrl)) continue;
    const body = match[2];
    const heading = body.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1];
    const visibleText = stripHtml(body);
    const baseName = stripHtml(heading || visibleText);
    const eventType = classifyEvent(baseName);
    if (!eventType) continue;

    const visibleDate = extractNamedDate(visibleText);
    const datetime = body.match(/<time\b[^>]*datetime=["']([^"']+)/i)?.[1];
    const publishedDate = datetime && !Number.isNaN(new Date(datetime).getTime())
      ? dateTokyo(new Date(datetime))
      : null;
    const eventDate = visibleDate || extractDateFromUrl(sourceUrl) || publishedDate || dateTokyo(now);
    const datedName = visibleDate && !extractNamedDate(baseName)
      ? `${baseName} ${formatEnglishDate(visibleDate)}`
      : baseName;

    events.push({
      id: eventIdFromUrl(sourceUrl, datedName),
      name: datedName,
      eventType,
      eventDate,
      publishedDate: publishedDate || eventDate,
      sourceUrl,
    });
  }
  return events;
}

export function extractEventDateFromPage(html) {
  return html.match(/"starttime"\s*:\s*"(\d{4}-\d{2}-\d{2})/)?.[1] || null;
}

export function isDateInRange(date, { startDate, endDate }) {
  return Boolean(date && date >= startDate && date <= endDate);
}

export function shouldFetchEvent({
  status,
  force = false,
  hasValidCompletedJson = false,
}) {
  const supportedStatus = [
    'discovered',
    'pending_publication',
    'fetch_error',
    'parse_error',
    'publication_timeout',
    'completed',
  ].includes(status);
  if (!supportedStatus) return false;
  if (force) return true;
  return !hasValidCompletedJson;
}

export function addDays(date, amount) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function archiveUrls(listUrl, explorationStart, endDate) {
  const parsed = new URL(listUrl);
  const decklistsIndex = parsed.pathname.toLowerCase().indexOf('/decklists');
  const basePath = decklistsIndex >= 0
    ? parsed.pathname.slice(0, decklistsIndex + '/decklists'.length)
    : '/decklists';
  const months = [];
  let cursor = `${explorationStart.slice(0, 7)}-01`;
  const finalMonth = endDate.slice(0, 7);
  while (cursor.slice(0, 7) <= finalMonth) {
    const url = new URL(parsed);
    url.pathname = `${basePath}/${cursor.slice(0, 4)}/${cursor.slice(5, 7)}`;
    url.search = '';
    months.push(url.toString());
    cursor = addDays(`${cursor.slice(0, 7)}-28`, 4).slice(0, 7) + '-01';
  }
  return months.reverse();
}

function extractNamedDate(value) {
  const match = String(value).match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s+(\d{4})\b/i
  );
  if (!match) return null;
  const month = MONTHS.get(match[1].toLowerCase());
  const day = Number(match[2]);
  const date = `${match[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return addDays(date, 0) === date ? date : null;
}

function extractDateFromUrl(url) {
  const value = new URL(url).pathname;
  const separated = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (separated) return `${separated[1]}-${separated[2]}-${separated[3]}`;
  const compact = value.match(/(\d{4})(\d{2})(\d{2})(?:\D|$)/);
  return compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : null;
}

function formatEnglishDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  const monthName = [...MONTHS.entries()].find(([, value]) => value === month)?.[0] || '';
  return `${monthName[0].toUpperCase()}${monthName.slice(1)} ${day} ${year}`;
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
