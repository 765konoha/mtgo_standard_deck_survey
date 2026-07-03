import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { CardSearchEntry, CardSearchIndex } from '../types';
import { rankCardSuggestions } from '../utils/cardSearch';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 150;
const MAX_SUGGESTIONS = 10;

interface CardSearchBoxProps {
  index: CardSearchIndex | null;
  indexError: Error | null;
  selectedCard: CardSearchEntry | null;
  onSelect: (card: CardSearchEntry) => void;
  onClear: () => void;
  expansionFilter?: string | null;
}

export function CardSearchBox({
  index,
  indexError,
  selectedCard,
  onSelect,
  onClear,
  expansionFilter = null,
}: CardSearchBoxProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const trimmedLength = debounced.trim().length;

  const suggestions = useMemo(() => {
    if (!index || trimmedLength < MIN_QUERY_LENGTH) return [];
    // When an expansion is selected, only suggest cards from that expansion.
    const candidates = expansionFilter
      ? index.cards.filter((card) => (card.setCodes ?? []).includes(expansionFilter))
      : index.cards;
    return rankCardSuggestions(candidates, debounced, MAX_SUGGESTIONS);
  }, [index, debounced, trimmedLength, expansionFilter]);

  const showList = open && trimmedLength >= MIN_QUERY_LENGTH;

  useEffect(() => {
    setActiveIndex(-1);
  }, [suggestions]);

  useEffect(() => {
    if (!showList) return;
    const handleOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showList]);

  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const option = listRef.current.children[activeIndex] as HTMLElement | undefined;
    option?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const commit = (card: CardSearchEntry) => {
    onSelect(card);
    setQuery('');
    setDebounced('');
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && !showList && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!showList) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((i) => (suggestions.length === 0 ? -1 : Math.min(i + 1, suggestions.length - 1)));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          event.preventDefault();
          commit(suggestions[activeIndex]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
        break;
      default:
        break;
    }
  };

  if (indexError) {
    return (
      <div className="w-full sm:w-72">
        <div className="flex items-center gap-2 px-3 py-2 bg-neutral-800/60 border border-neutral-700 rounded-lg text-xs text-warning-400">
          <Search className="w-4 h-4 shrink-0" />
          <span>カード検索データを読み込めませんでした。</span>
        </div>
      </div>
    );
  }

  const activeOptionId = activeIndex >= 0 ? `${baseId}-option-${activeIndex}` : undefined;

  return (
    <div className="w-full sm:w-72" ref={containerRef}>
      <div className="relative">
        <div
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          aria-owns={listboxId}
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder="カード名で検索"
              className="w-full pl-9 pr-8 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
              role="searchbox"
              aria-label="カード名で検索"
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId}
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setDebounced('');
                  inputRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-neutral-700 text-neutral-500 hover:text-neutral-300"
                aria-label="入力をクリア"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {showList && (
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label="カード候補"
            className="absolute z-40 mt-1 w-full max-h-72 overflow-y-auto bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl scrollbar-thin"
          >
            {suggestions.length === 0 ? (
              <li className="px-3 py-3 text-sm text-neutral-400" role="presentation">
                該当するカードがありません。
              </li>
            ) : (
              suggestions.map((card, i) => (
                <li
                  key={card.key}
                  id={`${baseId}-option-${i}`}
                  role="option"
                  aria-selected={activeIndex === i}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => {
                    // Prevent input blur before the click registers.
                    e.preventDefault();
                    commit(card);
                  }}
                  className={`px-3 py-2.5 cursor-pointer flex items-center justify-between gap-3 ${
                    activeIndex === i ? 'bg-primary-950/70' : 'hover:bg-neutral-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm text-neutral-100 truncate">
                      {card.nameJa || card.nameEn}
                    </div>
                    {card.nameJa && (
                      <div className="text-xs text-neutral-500 truncate">{card.nameEn}</div>
                    )}
                  </div>
                  <span className="text-xs text-neutral-400 whitespace-nowrap shrink-0 flex items-center gap-1.5">
                    {(card.primarySetCode || (card.setCodes ?? [])[0]) && (
                      <span
                        className="text-[10px] font-mono text-neutral-500 border border-neutral-700 rounded px-1 py-px"
                        title={(card.setCodes ?? []).join(', ')}
                      >
                        {card.primarySetCode || (card.setCodes ?? [])[0]}
                      </span>
                    )}
                    {card.deckCount}デッキ
                  </span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {selectedCard && (
        <div className="mt-2 flex items-start gap-2 px-2.5 py-1.5 bg-primary-950/60 border border-primary-800 rounded-lg">
          <div className="min-w-0 flex-1 text-xs">
            <span className="text-primary-300 font-medium">選択中: </span>
            <span className="text-neutral-100">{selectedCard.nameJa || selectedCard.nameEn}</span>
            {selectedCard.nameJa && (
              <span className="text-neutral-400"> / {selectedCard.nameEn}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 p-1 rounded hover:bg-primary-900 text-primary-300 hover:text-primary-100"
            aria-label="カード検索を解除"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
