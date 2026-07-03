import { useEffect, useRef } from 'react';
import { AlertTriangle, Copy, ExternalLink, Globe, X } from 'lucide-react';
import type { CardNameDisplayMode, Deck, Event, EventSummary } from '../types';
import { formatDate, getPlacementLabel } from '../utils/helpers';
import { CardList } from './CardList';

interface DeckDetailProps {
  eventSummary: EventSummary;
  eventData: Event;
  deck: Deck;
  cardNameDisplay: CardNameDisplayMode;
  onClose: () => void;
  onCopy: (deck: Deck, format: 'ja' | 'arena') => void;
}

export function DeckDetail({
  eventSummary,
  eventData,
  deck,
  cardNameDisplay,
  onClose,
  onCopy,
}: DeckDetailProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    container.addEventListener('keydown', handleTab);
    firstElement?.focus();
    return () => container.removeEventListener('keydown', handleTab);
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const placement = getPlacementLabel(deck);
  const hasUntranslatedCards =
    deck.mainboard.some((c) => c.translationStatus !== 'complete') ||
    deck.sideboard.some((c) => c.translationStatus !== 'complete');

  return (
    <>
      <div
        className="fixed inset-0 bg-black/70 z-40 lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={containerRef}
        className="fixed inset-0 z-50 bg-neutral-950 overflow-y-auto sm:inset-y-4 sm:right-4 sm:left-auto sm:max-w-2xl sm:rounded-xl sm:border sm:border-neutral-800"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deck-detail-title"
      >
        <div className="sticky top-0 z-10 bg-neutral-950 border-b border-neutral-800">
          <div className="px-4 py-3 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2
                id="deck-detail-title"
                className="text-lg font-semibold text-neutral-100 truncate"
              >
                {deck.player}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-neutral-400">
                <span className="font-medium text-neutral-200">{placement}</span>
                <span className="text-neutral-600">|</span>
                <span>{eventData.event.name}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-neutral-800 rounded-lg transition-colors shrink-0"
              aria-label="閉じる"
            >
              <X className="w-5 h-5 text-neutral-400" />
            </button>
          </div>

          <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
            <div className="text-xs text-neutral-500">
              {formatDate(eventData.event.eventDate)}
            </div>

            <a
              href={eventSummary.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              元ページ
            </a>

            <button
              onClick={() => onCopy(deck, 'ja')}
              className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              <Copy className="w-3 h-3" />
              日本語コピー
            </button>

            <button
              onClick={() => onCopy(deck, 'arena')}
              className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              <Globe className="w-3 h-3" />
              Arena形式
            </button>

            {hasUntranslatedCards && (
              <div className="flex items-center gap-1 text-xs text-warning-500">
                <AlertTriangle className="w-3 h-3" />
                未変換カードあり
              </div>
            )}
          </div>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-neutral-300 mb-3">
                メインデッキ{' '}
                <span className="font-normal text-neutral-500">
                  ({deck.mainboardCount}枚)
                </span>
              </h3>
              <CardList
                cards={deck.mainboard}
                displayMode={cardNameDisplay}
                showCategoryHeaders
              />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-neutral-300 mb-3">
                サイドボード{' '}
                <span className="font-normal text-neutral-500">
                  ({deck.sideboardCount}枚)
                </span>
              </h3>
              <CardList
                cards={deck.sideboard}
                displayMode={cardNameDisplay}
                showCategoryHeaders
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
