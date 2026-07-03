import { ExternalLink } from 'lucide-react';
import type { Card, CardNameDisplayMode } from '../types';
import { getCardDisplayName, groupCardsByCategory } from '../utils/helpers';

interface CardListProps {
  cards: Card[];
  displayMode: CardNameDisplayMode;
  showCategoryHeaders?: boolean;
}

export function CardList({
  cards,
  displayMode,
  showCategoryHeaders = false,
}: CardListProps) {
  if (cards.length === 0) {
    return <p className="text-sm text-neutral-500 italic">カードがありません</p>;
  }

  if (showCategoryHeaders) {
    const grouped = groupCardsByCategory(cards);
    return (
      <div className="space-y-4">
        {Array.from(grouped.entries()).map(([category, group]) => (
          <div key={category}>
            <h4 className="text-xs font-medium text-neutral-500 mb-2">
              {group.label} ({group.count}枚)
            </h4>
            <div className="space-y-0.5">
              {group.cards.map((card, idx) => (
                <CardRow
                  key={`${category}-${idx}-${card.nameEn}`}
                  card={card}
                  displayMode={displayMode}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {cards.map((card, idx) => (
        <CardRow
          key={`${card.nameEn}-${idx}`}
          card={card}
          displayMode={displayMode}
        />
      ))}
    </div>
  );
}

interface CardRowProps {
  card: Card;
  displayMode: CardNameDisplayMode;
}

function CardRow({ card, displayMode }: CardRowProps) {
  const { primary, secondary } = getCardDisplayName(card, displayMode);
  const hasDetailUrl = Boolean(card.detailUrl);
  const isUntranslated = card.translationStatus !== 'complete';

  const content = (
    <div className="flex items-start gap-2 py-1 px-2 -mx-2 rounded hover:bg-neutral-800/30 transition-colors group">
      <span className="text-sm text-neutral-400 font-mono w-6 text-right shrink-0">
        {card.quantity}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-neutral-200 group-hover:text-neutral-100">
          {primary}
          {isUntranslated && (
            <span className="ml-2 text-xs text-warning-500">
              日本語名未登録
            </span>
          )}
        </div>
        {secondary && (
          <div className="text-xs text-neutral-500 mt-0.5">{secondary}</div>
        )}
      </div>
      {hasDetailUrl && (
        <ExternalLink className="w-3.5 h-3.5 text-neutral-600 group-hover:text-primary-400 shrink-0 mt-1 transition-colors" />
      )}
    </div>
  );

  if (hasDetailUrl) {
    return (
      <a
        href={card.detailUrl!}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
        aria-label={`${primary}のカード詳細を開く`}
      >
        {content}
      </a>
    );
  }

  return content;
}
