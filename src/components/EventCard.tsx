import { ExternalLink, Trophy, Users } from 'lucide-react';
import type { Deck, Event, EventSummary, EventType } from '../types';
import { formatDate, getPlacementLabel } from '../utils/helpers';

interface EventCardProps {
  eventSummary: EventSummary;
  eventData: Event;
  onDeckSelect: (event: EventSummary, deckId: string) => void;
  selectedDeckId: string | null;
}

export function EventCard({
  eventSummary,
  eventData,
  onDeckSelect,
  selectedDeckId,
}: EventCardProps) {
  const { event, decks } = eventData;
  const isChallenge = event.eventType === 'challenge';
  const sortedDecks = isChallenge
    ? [...decks].sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99))
    : decks;

  return (
    <div className="card">
      <div className="px-4 py-3 border-b border-neutral-800">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              {isChallenge ? (
                <Trophy className="w-4 h-4 text-warning-500" />
              ) : (
                <Users className="w-4 h-4 text-primary-400" />
              )}
              <h3 className="text-base font-semibold text-neutral-100">
                {event.name}
              </h3>
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${
                  isChallenge
                    ? 'bg-warning-950 text-warning-400'
                    : 'bg-primary-950 text-primary-400'
                }`}
              >
                {isChallenge ? 'Challenge' : 'League'}
              </span>
            </div>
            <div className="text-xs text-neutral-500 mt-1 space-x-3">
              <span>開催: {formatDate(event.eventDate)}</span>
              <span>掲載: {formatDate(event.publishedDate)}</span>
              <span>{eventSummary.deckCount}デッキ</span>
            </div>
          </div>
          <a
            href={event.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors shrink-0"
            aria-label="MTGOの元ページを開く"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">元ページ</span>
          </a>
        </div>
      </div>

      <div className="divide-y divide-neutral-800">
        {sortedDecks.map((deck) => (
          <DeckRow
            key={deck.id}
            deck={deck}
            eventType={event.eventType}
            isSelected={selectedDeckId === deck.id}
            onClick={() => onDeckSelect(eventSummary, deck.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface DeckRowProps {
  deck: Deck;
  eventType: EventType;
  isSelected: boolean;
  onClick: () => void;
}

function DeckRow({ deck, eventType, isSelected, onClick }: DeckRowProps) {
  const isChallenge = eventType === 'challenge';
  const placement = getPlacementLabel(deck);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 transition-colors ${
        isSelected
          ? 'bg-primary-950/50 border-l-2 border-l-primary-500'
          : 'hover:bg-neutral-800/50'
      }`}
      aria-pressed={isSelected}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-8 text-sm font-medium ${
            isChallenge && deck.placement === 1
              ? 'text-warning-400'
              : deck.placement && deck.placement <= 4
                ? 'text-neutral-200'
                : 'text-neutral-400'
          }`}
        >
          {placement}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-neutral-200 truncate">
            {deck.player}
          </div>
          <div className="text-xs text-neutral-500">
            Main {deck.mainboardCount} / Side {deck.sideboardCount}
          </div>
        </div>
      </div>
    </button>
  );
}
