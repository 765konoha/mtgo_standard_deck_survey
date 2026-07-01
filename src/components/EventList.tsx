import type { EventSummary } from '../types';
import { useEventData } from '../hooks/useData';
import { formatDate } from '../utils/helpers';
import { EventCard } from './EventCard';

interface EventListProps {
  events: EventSummary[];
  selectedDate: string | null;
  eventTypeFilter: 'all' | 'challenge' | 'league';
  onDeckSelect: (event: EventSummary, deckId: string) => void;
  selectedDeckId: string | null;
}

export function EventList({
  events,
  selectedDate,
  eventTypeFilter,
  onDeckSelect,
  selectedDeckId,
}: EventListProps) {
  const filteredEvents = events.filter((event) => {
    if (event.status !== 'completed') return false;
    if (selectedDate && event.publishedDate !== selectedDate) return false;
    if (eventTypeFilter !== 'all' && event.eventType !== eventTypeFilter)
      return false;
    return true;
  });

  if (filteredEvents.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-neutral-400">
          {selectedDate
            ? 'この日付には対象のデッキリストがありません。'
            : '指定した条件に一致するデッキがありません。'}
        </p>
      </div>
    );
  }

  // Group by published date
  const groupedByDate = filteredEvents.reduce(
    (acc, event) => {
      const date = event.publishedDate;
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(event);
      return acc;
    },
    {} as Record<string, EventSummary[]>
  );

  // Sort events within each date: challenge first, then league
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
}

function EventCardWrapper({
  event,
  onDeckSelect,
  selectedDeckId,
}: EventCardWrapperProps) {
  const { data, loading, error } = useEventData(event);

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
        <p className="text-error-400">イベントデータの読み込みに失敗しました</p>
      </div>
    );
  }

  return (
    <EventCard
      eventSummary={event}
      eventData={data}
      onDeckSelect={onDeckSelect}
      selectedDeckId={selectedDeckId}
    />
  );
}
