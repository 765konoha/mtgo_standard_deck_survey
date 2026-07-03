export type EventStatus =
  | 'discovered'
  | 'pending_publication'
  | 'completed'
  | 'fetch_error'
  | 'parse_error'
  | 'publication_timeout';

export type OverallStatus = 'success' | 'partial' | 'failed' | 'pending';

export type TranslationStatus = 'complete' | 'partial' | 'missing';
export type TranslationSource =
  | 'scryfall_printed_name'
  | 'scryfall_card_faces'
  | 'manual_override'
  | null;

export type EventType = 'challenge' | 'league';

export type CardNameDisplayMode = 'ja' | 'ja-en' | 'en';

export type CardTypeGroup =
  | 'creature'
  | 'planeswalker'
  | 'instant'
  | 'sorcery'
  | 'enchantment'
  | 'artifact'
  | 'battle'
  | 'land'
  | 'other';

export interface Card {
  quantity: number;
  nameEn: string;
  nameJa: string | null;
  detailUrl: string | null;
  typeGroup?: CardTypeGroup | null;
  category?: CardTypeGroup | null;
  translationStatus: TranslationStatus;
  translationSource?: TranslationSource;
  oracleId?: string | null;
}

export interface Deck {
  id: string;
  player: string;
  placement: number | null;
  record: string | null;
  mainboardCount: number;
  sideboardCount: number;
  mainboard: Card[];
  sideboard: Card[];
}

export interface EventSummary {
  id: string;
  name: string;
  eventType: EventType;
  eventDate: string;
  publishedDate: string;
  status: EventStatus;
  deckCount: number;
  sourceUrl: string;
  dataFile: string;
  firstSeenAt?: string;
  lastCheckedAt?: string;
  completedAt?: string | null;
}

export interface Event {
  schemaVersion: number;
  event: {
    id: string;
    name: string;
    eventType: EventType;
    eventDate: string;
    publishedDate: string;
    sourceUrl: string;
    status: EventStatus;
    firstSeenAt?: string;
    fetchedAt?: string;
  };
  decks: Deck[];
}

export interface IndexData {
  schemaVersion?: number;
  generatedAt: string;
  lastSuccessfulUpdateAt: string | null;
  overallStatus: OverallStatus;
  summary: {
    completedEvents: number;
    pendingEvents: number;
    fetchErrors: number;
    parseErrors: number;
    timedOutEvents?: number;
    untranslatedCards: number;
  };
  events: EventSummary[];
}

export interface DeckSearchReference {
  eventId: string;
  deckId: string;
  mainboardQuantity: number;
  sideboardQuantity: number;
}

export interface CardSearchEntry {
  key: string;
  nameEn: string;
  nameJa: string | null;
  normalizedNameEn: string;
  normalizedNameJa: string | null;
  deckCount: number;
  deckRefs: DeckSearchReference[];
}

export interface CardSearchIndex {
  schemaVersion: number;
  generatedAt?: string;
  period?: { startDate: string; endDate: string; lookbackDays: number };
  cards: CardSearchEntry[];
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface FilterState {
  selectedDate: string | null;
  eventType: 'all' | 'challenge' | 'league';
  cardNameDisplay: CardNameDisplayMode;
}

export const CARD_CATEGORY_LABELS: Record<CardTypeGroup, string> = {
  creature: 'クリーチャー',
  planeswalker: 'プレインズウォーカー',
  instant: 'インスタント',
  sorcery: 'ソーサリー',
  enchantment: 'エンチャント',
  artifact: 'アーティファクト',
  battle: 'バトル',
  land: '土地',
  other: 'その他',
};

export const STATUS_LABELS: Record<EventStatus, string> = {
  discovered: '検出済み',
  pending_publication: '公開待ち',
  completed: '完了',
  fetch_error: '取得エラー',
  parse_error: '解析エラー',
  publication_timeout: '公開期限切れ',
};

export const OVERALL_STATUS_LABELS: Record<OverallStatus, string> = {
  success: '正常',
  partial: '一部未完了',
  failed: '更新失敗',
  pending: '公開待ちあり',
};
