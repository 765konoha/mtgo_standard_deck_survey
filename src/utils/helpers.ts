import type { Card, CardNameDisplayMode, CardTypeGroup, Deck } from '../types';
import { CARD_CATEGORY_LABELS } from '../types';

const DISPLAY_LOCALE = 'ja-JP';

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(DISPLAY_LOCALE, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString(DISPLAY_LOCALE, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(DISPLAY_LOCALE, {
    month: 'short',
    day: 'numeric',
  });
}

export function getLastNDates(n: number, baseDate = new Date()): string[] {
  const dates: string[] = [];
  for (let i = 0; i < n; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }
  return dates;
}

export function getCardCategory(card: Card): CardTypeGroup {
  return card.typeGroup || card.category || 'other';
}

export function groupCardsByCategory(
  cards: Card[]
): Map<CardTypeGroup, { label: string; cards: Card[]; count: number }> {
  const grouped = new Map<
    CardTypeGroup,
    { label: string; cards: Card[]; count: number }
  >();

  for (const card of cards) {
    const category = getCardCategory(card);
    if (!grouped.has(category)) {
      grouped.set(category, {
        label: CARD_CATEGORY_LABELS[category] || category,
        cards: [],
        count: 0,
      });
    }
    const group = grouped.get(category)!;
    group.cards.push(card);
    group.count += card.quantity;
  }

  return grouped;
}

export function getCardDisplayName(
  card: Card,
  displayMode: CardNameDisplayMode
): { primary: string; secondary: string | null } {
  switch (displayMode) {
    case 'ja':
      return {
        primary: card.nameJa || card.nameEn,
        secondary: null,
      };
    case 'ja-en':
      return {
        primary: card.nameJa || card.nameEn,
        secondary: card.nameJa ? card.nameEn : '日本語名未登録',
      };
    case 'en':
      return {
        primary: card.nameEn,
        secondary: null,
      };
  }
}

export function copyDeckToClipboard(
  deck: Deck,
  format: 'ja' | 'arena'
): Promise<void> {
  const text = format === 'ja' ? formatDeckAsJapaneseList(deck) : formatDeckAsArena(deck);
  return navigator.clipboard.writeText(text);
}

function formatDeckAsJapaneseList(deck: Deck): string {
  const lines: string[] = [];

  lines.push(`メインデッキ (${deck.mainboardCount}枚)`);
  const mainGrouped = groupCardsByCategory(deck.mainboard);
  mainGrouped.forEach((group) => {
    lines.push(`${group.label} (${group.count}枚)`);
    for (const card of group.cards) {
      lines.push(`${card.quantity} ${card.nameJa || card.nameEn}`);
    }
    lines.push('');
  });

  lines.push(`サイドボード (${deck.sideboardCount}枚)`);
  const sideGrouped = groupCardsByCategory(deck.sideboard);
  sideGrouped.forEach((group) => {
    lines.push(`${group.label} (${group.count}枚)`);
    for (const card of group.cards) {
      lines.push(`${card.quantity} ${card.nameJa || card.nameEn}`);
    }
    lines.push('');
  });

  return lines.join('\n').trim();
}

function formatDeckAsArena(deck: Deck): string {
  const lines: string[] = ['Deck'];

  for (const card of deck.mainboard) {
    lines.push(`${card.quantity} ${card.nameEn}`);
  }

  lines.push('', 'Sideboard');
  for (const card of deck.sideboard) {
    lines.push(`${card.quantity} ${card.nameEn}`);
  }

  return lines.join('\n');
}

export function getPlacementLabel(deck: Deck): string {
  if (deck.placement !== null) {
    return `${deck.placement}位`;
  }
  if (deck.record === '5-0') {
    return '5-0';
  }
  return deck.record || '';
}
