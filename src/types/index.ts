// Status types
export type EventStatus =
  | 'completed'
  | 'pending_publication'
  | 'fetch_error'
  | 'parse_error'
  | 'publication_timeout';

export type OverallStatus = 'success' | 'partial' | 'failed' | 'pending';

export type TranslationStatus = 'complete' | 'missing';

export type EventType = 'challenge' | 'league';

export type CardNameDisplayMode = 'ja' | 'ja-en' | 'en';

// Card types
export interface Card {
  quantity: number;
  nameEn: string;
  nameJa: string | null;
  detailUrl: string | null;
  category: string;
  translationStatus: TranslationStatus;
}

// Deck types
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

// Event summary (from index.json)
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
  lastCheckedAt?: string;
}

// Full event (from event JSON)
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
  };
  decks: Deck[];
}

// Index.json structure
export interface IndexData {
  generatedAt: string;
  lastSuccessfulUpdateAt: string;
  overallStatus: OverallStatus;
  summary: {
    completedEvents: number;
    pendingEvents: number;
    fetchErrors: number;
    parseErrors: number;
    untranslatedCards: number;
  };
  events: EventSummary[];
}

// Processing status item for display
export interface ProcessingStatusItem {
  event: EventSummary;
  type: 'pending' | 'fetch_error' | 'parse_error' | 'publication_timeout';
}

// Toast notification
export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

// Filter state
export interface FilterState {
  selectedDate: string | null;
  eventType: 'all' | 'challenge' | 'league';
  cardNameDisplay: CardNameDisplayMode;
}

// Card category display names
export const CARD_CATEGORY_LABELS: Record<string, string> = {
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

// Status display labels
export const STATUS_LABELS: Record<EventStatus, string> = {
  completed: '完了',
  pending_publication: '公開待ち',
  fetch_error: '取得失敗',
  parse_error: '解析エラー',
  publication_timeout: '公開タイムアウト',
};

export const OVERALL_STATUS_LABELS: Record<OverallStatus, string> = {
  success: '正常',
  partial: '一部失敗',
  failed: '更新失敗',
  pending: '公開待ちあり',
};
