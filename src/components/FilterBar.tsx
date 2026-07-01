import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Languages } from 'lucide-react';
import type { CardNameDisplayMode } from '../types';
import { formatShortDate, formatDate } from '../utils/helpers';

interface FilterBarProps {
  availableDates: string[];
  selectedDate: string | null;
  onDateChange: (date: string | null) => void;
  eventTypeFilter: 'all' | 'challenge' | 'league';
  onEventTypeChange: (filter: 'all' | 'challenge' | 'league') => void;
  cardNameDisplay: CardNameDisplayMode;
  onCardNameDisplayChange: (mode: CardNameDisplayMode) => void;
}

export function FilterBar({
  availableDates,
  selectedDate,
  onDateChange,
  eventTypeFilter,
  onEventTypeChange,
  cardNameDisplay,
  onCardNameDisplayChange,
}: FilterBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('scroll', checkScroll);
      return () => el.removeEventListener('scroll', checkScroll);
    }
  }, [availableDates.length]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 120;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className="bg-neutral-900 border-b border-neutral-800 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex flex-col gap-3">
          {/* Date selector */}
          <div className="relative">
            {/* Desktop: scrollable tabs with arrows */}
            <div className="hidden sm:flex items-center gap-1">
              <button
                onClick={() => scroll('left')}
                disabled={!canScrollLeft}
                className="p-1.5 rounded-lg hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="前の日付"
              >
                <ChevronLeft className="w-5 h-5 text-neutral-400" />
              </button>
              <div
                ref={scrollRef}
                className="flex gap-1 overflow-x-auto scrollbar-thin py-1"
                role="tablist"
                aria-label="日付選択"
              >
                {availableDates.map((date) => (
                  <button
                    key={date}
                    onClick={() => onDateChange(date)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                      selectedDate === date
                        ? 'bg-primary-600 text-white'
                        : 'text-neutral-300 hover:text-neutral-100 hover:bg-neutral-800'
                    }`}
                    role="tab"
                    aria-selected={selectedDate === date}
                  >
                    {formatShortDate(date)}
                  </button>
                ))}
              </div>
              <button
                onClick={() => scroll('right')}
                disabled={!canScrollRight}
                className="p-1.5 rounded-lg hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="次の日付"
              >
                <ChevronRight className="w-5 h-5 text-neutral-400" />
              </button>
            </div>

            {/* Mobile: select dropdown */}
            <div className="sm:hidden">
              <select
                value={selectedDate || ''}
                onChange={(e) => onDateChange(e.target.value || null)}
                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                aria-label="日付選択"
              >
                {availableDates.map((date) => (
                  <option key={date} value={date}>
                    {formatDate(date)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Event type and card name display filters */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            {/* Event type filter */}
            <div className="flex items-center gap-1 bg-neutral-800 rounded-lg p-1">
              <button
                onClick={() => onEventTypeChange('all')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  eventTypeFilter === 'all'
                    ? 'bg-neutral-700 text-neutral-100'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                aria-pressed={eventTypeFilter === 'all'}
              >
                すべて
              </button>
              <button
                onClick={() => onEventTypeChange('challenge')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  eventTypeFilter === 'challenge'
                    ? 'bg-neutral-700 text-neutral-100'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                aria-pressed={eventTypeFilter === 'challenge'}
              >
                Challenge
              </button>
              <button
                onClick={() => onEventTypeChange('league')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  eventTypeFilter === 'league'
                    ? 'bg-neutral-700 text-neutral-100'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                aria-pressed={eventTypeFilter === 'league'}
              >
                League
              </button>
            </div>

            {/* Card name display selector */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-neutral-400">
                <Languages className="w-4 h-4" />
                <span className="text-xs hidden sm:inline">カード名</span>
              </div>
              <div className="flex items-center gap-1 bg-neutral-800 rounded-lg p-1">
                <button
                  onClick={() => onCardNameDisplayChange('ja')}
                  className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                    cardNameDisplay === 'ja'
                      ? 'bg-neutral-700 text-neutral-100'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                  aria-pressed={cardNameDisplay === 'ja'}
                >
                  日本語
                </button>
                <button
                  onClick={() => onCardNameDisplayChange('ja-en')}
                  className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                    cardNameDisplay === 'ja-en'
                      ? 'bg-neutral-700 text-neutral-100'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                  aria-pressed={cardNameDisplay === 'ja-en'}
                >
                  日+英
                </button>
                <button
                  onClick={() => onCardNameDisplayChange('en')}
                  className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                    cardNameDisplay === 'en'
                      ? 'bg-neutral-700 text-neutral-100'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                  aria-pressed={cardNameDisplay === 'en'}
                >
                  英語
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
