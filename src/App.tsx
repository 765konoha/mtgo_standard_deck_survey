import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CardNameDisplayMode,
  CardSearchEntry,
  Deck,
  EventSummary,
  ToastMessage,
} from './types';
import {
  useCardSearchIndex,
  useEventData,
  useIndexData,
  useLocalStorage,
} from './hooks/useData';
import { DESKTOP_QUERY, useMediaQuery } from './hooks/useMediaQuery';
import {
  buildDeckRefIndex,
  buildExpansionDeckIndex,
  intersectDeckIndexes,
} from './utils/cardSearch';
import { ALL_DATES, copyDeckToClipboard, getLastNDates } from './utils/helpers';
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
  const { index: cardSearchIndex, error: cardSearchError } = useCardSearchIndex();
  const [cardNameDisplay, setCardNameDisplay] =
    useLocalStorage<CardNameDisplayMode>('mtgo-card-display', 'ja');

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [eventTypeFilter, setEventTypeFilter] = useState<
    'all' | 'challenge' | 'league'
  >('all');
  const [selectedCard, setSelectedCard] = useState<CardSearchEntry | null>(null);
  const [selectedExpansion, setSelectedExpansion] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventSummary | null>(null);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const deckMatchIndex = useMemo(
    () => buildDeckRefIndex(selectedCard),
    [selectedCard]
  );

  const expansionDeckIndex = useMemo(
    () => buildExpansionDeckIndex(cardSearchIndex, selectedExpansion),
    [cardSearchIndex, selectedExpansion]
  );

  // AND of the card filter and the expansion filter; null = no deck filtering.
  const visibleDecks = useMemo(
    () => intersectDeckIndexes(
      selectedCard ? deckMatchIndex : null,
      selectedExpansion ? expansionDeckIndex : null
    ),
    [selectedCard, deckMatchIndex, selectedExpansion, expansionDeckIndex]
  );

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

  // Card and expansion filters search the whole 10-day window, so widen the
  // date selection to match the deck counts shown in the suggestions.
  const handleCardSelect = useCallback((card: CardSearchEntry) => {
    setSelectedCard(card);
    setSelectedDate(ALL_DATES);
  }, []);

  const handleExpansionChange = useCallback((code: string | null) => {
    setSelectedExpansion(code);
    if (code) setSelectedDate(ALL_DATES);
  }, []);

  const handleCardClear = useCallback(() => {
    setSelectedCard(null);
  }, []);

  // Opening a deck adds a history entry so the browser/phone back button
  // closes the deck detail instead of leaving the site.
  const deckHistoryPushed = useRef(false);

  const closeDeckDetail = useCallback(() => {
    setSelectedEvent(null);
    setSelectedDeckId(null);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      if (!deckHistoryPushed.current) return;
      deckHistoryPushed.current = false;
      closeDeckDetail();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [closeDeckDetail]);

  const handleDeckSelect = useCallback((event: EventSummary, deckId: string) => {
    if (!deckHistoryPushed.current) {
      window.history.pushState({ deckDetail: true }, '');
      deckHistoryPushed.current = true;
    }
    setSelectedEvent(event);
    setSelectedDeckId(deckId);
  }, []);

  const handleCloseDeckDetail = useCallback(() => {
    if (deckHistoryPushed.current) {
      // popstate closes the detail and keeps the history stack in order.
      window.history.back();
    } else {
      closeDeckDetail();
    }
  }, [closeDeckDetail]);

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

  const isDesktop = useMediaQuery(DESKTOP_QUERY);
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

  const detailOpen = Boolean(selectedEvent && selectedDeck && selectedEventData);

  return (
    // On desktop the deck detail sits beside the list, so the page keeps
    // scrolling and the list is not hidden under the panel.
    <div className={`min-h-screen bg-neutral-950 ${detailOpen ? 'lg:pr-[calc(var(--deck-panel-width)+2rem)]' : ''}`}>
      <Header data={data} loading={loading} onRefetch={refetch} />

      <FilterBar
        availableDates={availableDates}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        eventTypeFilter={eventTypeFilter}
        onEventTypeChange={setEventTypeFilter}
        cardNameDisplay={cardNameDisplay}
        onCardNameDisplayChange={setCardNameDisplay}
        cardSearchIndex={cardSearchIndex}
        cardSearchError={cardSearchError}
        selectedCard={selectedCard}
        onCardSelect={handleCardSelect}
        onCardClear={handleCardClear}
        selectedExpansion={selectedExpansion}
        onExpansionChange={handleExpansionChange}
      />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <UpdateStatus data={data} />

        <EventList
          events={data.events}
          selectedDate={selectedDate === ALL_DATES ? null : selectedDate}
          eventTypeFilter={eventTypeFilter}
          onDeckSelect={handleDeckSelect}
          selectedDeckId={selectedDeckId}
          selectedCard={selectedCard}
          deckMatchIndex={deckMatchIndex}
          selectedExpansion={selectedExpansion}
          expansionDeckIndex={expansionDeckIndex}
          visibleDecks={visibleDecks}
        />

        <ProcessingStatusPanel data={data} />
      </main>

      {selectedEvent && selectedDeck && selectedEventData && (
        <DeckDetail
          eventSummary={selectedEvent}
          eventData={selectedEventData}
          deck={selectedDeck}
          cardNameDisplay={cardNameDisplay}
          selectedExpansion={selectedExpansion}
          isDesktop={isDesktop}
          onClose={handleCloseDeckDetail}
          onCopy={handleCopyDeck}
        />
      )}

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
