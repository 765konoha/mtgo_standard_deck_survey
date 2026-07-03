import { AlertCircle, AlertTriangle, Clock } from 'lucide-react';
import type { CardSearchEntry, EventSummary } from '../types';
import type { DeckMatch, ExpansionDeckMatch } from '../utils/cardSearch';
import { useEventData } from '../hooks/useData';
import { formatDate } from '../utils/helpers';
import { EventCard } from './EventCard';

interface EventListProps {
  events: EventSummary[];
  selectedDate: string | null;
  eventTypeFilter: 'all' | 'challenge' | 'league';
  onDeckSelect: (event: EventSummary, deckId: string) => void;
  selectedDeckId: string | null;
  selectedCard: CardSearchEntry | null;
  deckMatchIndex: Map<string, Map<string, DeckMatch>>;
  selectedExpansion: string | null;
  expansionDeckIndex: Map<string, Map<string, ExpansionDeckMatch>>;
  visibleDecks: Map<string, Set<string>> | null;
}

export function EventList({
  events,
  selectedDate,
  eventTypeFilter,
  onDeckSelect,
  selectedDeckId,
  selectedCard,
  deckMatchIndex,
  selectedExpansion,
  expansionDeckIndex,
  visibleDecks,
}: EventListProps) {
  const filteredEvents = events.filter((event) => {
    if (selectedDate && event.eventDate !== selectedDate) return false;
    if (eventTypeFilter !== 'all' && event.eventType !== eventTypeFilter) return false;
    // Card / expansion filters (AND): only events with a matching deck remain.
    if (visibleDecks && !visibleDecks.has(event.id)) return false;
    return true;
  });

  if (filteredEvents.length === 0) {
    if (selectedCard || selectedExpansion) {
      return (
        <div className="text-center py-12">
          <p className="text-neutral-300">
            {selectedCard
              ? '選択したカードを含むデッキはありません。'
              : '選択したエキスパンションのカードを含むデッキはありません。'}
          </p>
          <p className="text-sm text-neutral-500 mt-2">
            日付やイベント種別の条件を変更してください。
          </p>
        </div>
      );
    }
    return (
      <div className="text-center py-12">
        <p className="text-neutral-400">
          {selectedDate
            ? 'この日付には対象のイベントがありません。'
            : '指定した条件に一致するイベントがありません。'}
        </p>
      </div>
    );
  }

  const groupedByDate = filteredEvents.reduce(
    (acc, event) => {
      const date = event.eventDate;
      acc[date] = acc[date] || [];
      acc[date].push(event);
      return acc;
    },
    {} as Record<string, EventSummary[]>
  );

  Object.keys(groupedByDate).forEach((date) => {
    groupedByDate[date].sort((a, b) => {
      if (a.eventType === 'challenge' && b.eventType !== 'challenge') return -1;
      if (a.eventType !== 'challenge' && b.eventType === 'challenge') return 1;
      return a.name.localeCompare(b.name);
    });
  });

  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-6">
      {sortedDates.map((date) => (
        <div key={date}>
          <h2 className="text-lg font-semibold text-neutral-100 mb-4 sticky top-[120px] bg-neutral-950 py-2 z-20">
            {formatDate(date)}
          </h2>
          <div className="space-y-4">
            {groupedByDate[date].map((event) => (
              <EventCardWrapper
                key={event.id}
                event={event}
                onDeckSelect={onDeckSelect}
                selectedDeckId={selectedDeckId}
                deckMatches={selectedCard ? deckMatchIndex.get(event.id) ?? null : null}
                expansionCode={selectedExpansion}
                expansionMatches={
                  selectedExpansion ? expansionDeckIndex.get(event.id) ?? null : null
                }
                visibleDeckIds={visibleDecks ? visibleDecks.get(event.id) ?? new Set() : null}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface EventCardWrapperProps {
  event: EventSummary;
  onDeckSelect: (event: EventSummary, deckId: string) => void;
  selectedDeckId: string | null;
  deckMatches: Map<string, DeckMatch> | null;
  expansionCode: string | null;
  expansionMatches: Map<string, ExpansionDeckMatch> | null;
  visibleDeckIds: Set<string> | null;
}

function EventCardWrapper({
  event,
  onDeckSelect,
  selectedDeckId,
  deckMatches,
  expansionCode,
  expansionMatches,
  visibleDeckIds,
}: EventCardWrapperProps) {
  const { data, loading, error } = useEventData(event);

  if (event.status !== 'completed') {
    return <IncompleteEventCard event={event} />;
  }

  if (loading) {
    return (
      <div className="card p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-neutral-800 rounded w-1/3 mb-3" />
          <div className="space-y-2">
            <div className="h-3 bg-neutral-800 rounded w-full" />
            <div className="h-3 bg-neutral-800 rounded w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-4 border-error-800">
        <p className="text-error-400">
          イベントデータの読み込みに失敗しました。
        </p>
      </div>
    );
  }

  return (
    <EventCard
      eventSummary={event}
      eventData={data}
      onDeckSelect={onDeckSelect}
      selectedDeckId={selectedDeckId}
      deckMatches={deckMatches}
      expansionCode={expansionCode}
      expansionMatches={expansionMatches}
      visibleDeckIds={visibleDeckIds}
    />
  );
}

function IncompleteEventCard({ event }: { event: EventSummary }) {
  const config = {
    discovered: {
      icon: <Clock className="w-4 h-4" />,
      label: '検出済み',
      description: 'イベントリンクを検出しました。次回実行でデッキ公開を確認します。',
      color: 'text-primary-400',
    },
    pending_publication: {
      icon: <Clock className="w-4 h-4" />,
      label: '公開待ち',
      description: 'MTGO上でデッキリストがまだ公開されていません。',
      color: 'text-primary-400',
    },
    fetch_error: {
      icon: <AlertCircle className="w-4 h-4" />,
      label: '取得エラー',
      description: 'イベントページを取得できませんでした。既存データは保持されています。',
      color: 'text-error-400',
    },
    parse_error: {
      icon: <AlertTriangle className="w-4 h-4" />,
      label: '解析エラー',
      description: 'デッキリストらしき内容はありますが、現在の解析処理では読めませんでした。',
      color: 'text-warning-400',
    },
    publication_timeout: {
      icon: <AlertCircle className="w-4 h-4" />,
      label: '公開期限切れ',
      description: '発見から設定日数を超えてもデッキリストが公開されませんでした。',
      color: 'text-error-400',
    },
    completed: {
      icon: null,
      label: '',
      description: '',
      color: '',
    },
  }[event.status];

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={config.color}>{config.icon}</span>
            <h3 className="text-base font-semibold text-neutral-100">
              {event.name}
            </h3>
            <span className={`text-xs font-medium ${config.color}`}>
              {config.label}
            </span>
          </div>
          <p className="text-sm text-neutral-400 mt-2">{config.description}</p>
          <div className="text-xs text-neutral-500 mt-2">
            掲載日: {formatDate(event.publishedDate)}
          </div>
        </div>
        <a
          href={event.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary-400 hover:text-primary-300 shrink-0"
        >
          元ページ
        </a>
      </div>
    </div>
  );
}
