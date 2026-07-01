import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CardNameDisplayMode, Deck, EventSummary, ToastMessage } from './types';
import { useEventData, useIndexData, useLocalStorage } from './hooks/useData';
import { copyDeckToClipboard, getLastNDates } from './utils/helpers';
import { Header } from './components/Header';
import { FilterBar } from './components/FilterBar';
import { EventList } from './components/EventList';
import { DeckDetail } from './components/DeckDetail';
import { ProcessingStatusPanel } from './components/ProcessingStatusPanel';
import { UpdateStatus } from './components/UpdateStatus';
import { Toast } from './components/Toast';
import { EmptyState, ErrorState } from './components/ErrorState';

const DATE_RANGE = 10;

export default function App() {
  const { data, loading, error, refetch } = useIndexData();
  const [cardNameDisplay, setCardNameDisplay] =
    useLocalStorage<CardNameDisplayMode>('mtgo-card-display', 'ja');

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [eventTypeFilter, setEventTypeFilter] = useState<
    'all' | 'challenge' | 'league'
  >('all');
  const [selectedEvent, setSelectedEvent] = useState<EventSummary | null>(null);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const availableDates = useMemo(() => {
    const newestEventDate = data?.events
      .map((event) => event.eventDate)
      .sort((a, b) => b.localeCompare(a))[0];
    return getLastNDates(
      DATE_RANGE,
      newestEventDate ? new Date(`${newestEventDate}T12:00:00+09:00`) : new Date()
    );
  }, [data]);

  useEffect(() => {
    if (!selectedDate && availableDates.length > 0 && data) {
      setSelectedDate(availableDates[0]);
    }
  }, [selectedDate, availableDates, data]);

  const addToast = useCallback(
    (message: string, type: ToastMessage['type'] = 'success') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { id, message, type }]);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleDeckSelect = useCallback((event: EventSummary, deckId: string) => {
    setSelectedEvent(event);
    setSelectedDeckId(deckId);
  }, []);

  const handleCloseDeckDetail = useCallback(() => {
    setSelectedEvent(null);
    setSelectedDeckId(null);
  }, []);

  const handleCopyDeck = useCallback(
    async (deck: Deck, format: 'ja' | 'arena') => {
      try {
        await copyDeckToClipboard(deck, format);
        addToast('デッキリストをコピーしました', 'success');
      } catch {
        addToast('コピーに失敗しました', 'error');
      }
    },
    [addToast]
  );

  const { data: selectedEventData } = useEventData(selectedEvent);
  const selectedDeck = useMemo(() => {
    if (!selectedEventData || !selectedDeckId) return null;
    return selectedEventData.decks.find((d) => d.id === selectedDeckId) || null;
  }, [selectedEventData, selectedDeckId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="animate-pulse text-neutral-400">読み込み中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-950">
        <ErrorState error={error} onRetry={refetch} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-neutral-950">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <Header data={data} loading={loading} onRefetch={refetch} />

      <FilterBar
        availableDates={availableDates}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        eventTypeFilter={eventTypeFilter}
        onEventTypeChange={setEventTypeFilter}
        cardNameDisplay={cardNameDisplay}
        onCardNameDisplayChange={setCardNameDisplay}
      />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <UpdateStatus data={data} />

        <EventList
          events={data.events}
          selectedDate={selectedDate}
          eventTypeFilter={eventTypeFilter}
          onDeckSelect={handleDeckSelect}
          selectedDeckId={selectedDeckId}
        />

        <ProcessingStatusPanel data={data} />
      </main>

      {selectedEvent && selectedDeck && selectedEventData && (
        <DeckDetail
          eventSummary={selectedEvent}
          eventData={selectedEventData}
          deck={selectedDeck}
          cardNameDisplay={cardNameDisplay}
          onClose={handleCloseDeckDetail}
          onCopy={handleCopyDeck}
        />
      )}

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
