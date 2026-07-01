import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
} from 'lucide-react';
import type { EventStatus, EventSummary, IndexData } from '../types';
import { formatDateTime } from '../utils/helpers';

interface ProcessingStatusPanelProps {
  data: IndexData;
}

export function ProcessingStatusPanel({ data }: ProcessingStatusPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const issueEvents = data.events.filter((e) => e.status !== 'completed');
  if (issueEvents.length === 0) return null;

  const pendingCount = issueEvents.filter(
    (e) => e.status === 'pending_publication' || e.status === 'discovered'
  ).length;
  const errorCount = issueEvents.length - pendingCount;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg mt-6">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-300">取得状態</span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-primary-950 text-primary-400 rounded">
              公開待ち {pendingCount}
            </span>
          )}
          {errorCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-error-950 text-error-400 rounded">
              要確認 {errorCount}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-neutral-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-neutral-400" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-neutral-800 pt-3">
          {issueEvents.map((event) => (
            <StatusItem key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusItem({ event }: { event: EventSummary }) {
  const statusConfig = getStatusConfig(event.status);

  return (
    <div className={`p-3 rounded-lg border border-neutral-800 ${statusConfig.bg}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={statusConfig.color}>{statusConfig.icon}</div>
        <span className={`text-sm font-medium ${statusConfig.color}`}>
          {statusConfig.label}
        </span>
      </div>
      <div className="text-sm text-neutral-200 font-medium">{event.name}</div>
      <p className="text-xs text-neutral-400 mt-1">{statusConfig.description}</p>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-neutral-700/50">
        <span className="text-xs text-neutral-500">
          最終確認: {formatDateTime(event.lastCheckedAt)}
        </span>
        <a
          href={event.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300"
        >
          <ExternalLink className="w-3 h-3" />
          元ページ
        </a>
      </div>
    </div>
  );
}

function getStatusConfig(status: EventStatus) {
  const base = {
    discovered: {
      icon: <Clock className="w-4 h-4" />,
      color: 'text-primary-400',
      bg: 'bg-primary-950/50',
      label: '検出済み',
      description: 'イベント一覧でリンクを検出しました。',
    },
    pending_publication: {
      icon: <Clock className="w-4 h-4" />,
      color: 'text-primary-400',
      bg: 'bg-primary-950/50',
      label: '公開待ち',
      description: 'デッキリストはまだ掲載されていません。',
    },
    parse_error: {
      icon: <AlertTriangle className="w-4 h-4" />,
      color: 'text-warning-400',
      bg: 'bg-warning-950/50',
      label: '解析エラー',
      description: 'HTML構造が想定と異なり、デッキを解析できませんでした。',
    },
    fetch_error: {
      icon: <AlertCircle className="w-4 h-4" />,
      color: 'text-error-400',
      bg: 'bg-error-950/50',
      label: '取得エラー',
      description: 'MTGOイベントページを取得できませんでした。',
    },
    publication_timeout: {
      icon: <AlertCircle className="w-4 h-4" />,
      color: 'text-error-400',
      bg: 'bg-error-950/50',
      label: '公開期限切れ',
      description: '設定日数を超えてもデッキリストが公開されませんでした。',
    },
    completed: {
      icon: null,
      color: '',
      bg: '',
      label: '',
      description: '',
    },
  };
  return base[status];
}
