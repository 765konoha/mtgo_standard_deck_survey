import { useState } from 'react';
import { ChevronDown, ChevronUp, Clock, AlertCircle, AlertTriangle, ExternalLink } from 'lucide-react';
import type { EventSummary, IndexData } from '../types';
import { formatDateTime } from '../utils/helpers';

interface ProcessingStatusPanelProps {
  data: IndexData;
}

export function ProcessingStatusPanel({ data }: ProcessingStatusPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const pendingEvents = data.events.filter(
    (e) => e.status === 'pending_publication'
  );
  const errorEvents = data.events.filter(
    (e) => e.status === 'fetch_error' || e.status === 'parse_error'
  );

  const hasIssues = pendingEvents.length > 0 || errorEvents.length > 0;

  if (!hasIssues) return null;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg mt-6">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-300">取得状況</span>
          {pendingEvents.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-primary-950 text-primary-400 rounded">
              公開待ち {pendingEvents.length}
            </span>
          )}
          {errorEvents.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-error-950 text-error-400 rounded">
              エラー {errorEvents.length}
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
          {pendingEvents.map((event) => (
            <StatusItem key={event.id} event={event} />
          ))}
          {errorEvents.map((event) => (
            <StatusItem key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

interface StatusItemProps {
  event: EventSummary;
}

function StatusItem({ event }: StatusItemProps) {
  const config = {
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
      description: 'ページ構造を解析できませんでした。',
    },
    fetch_error: {
      icon: <AlertCircle className="w-4 h-4" />,
      color: 'text-error-400',
      bg: 'bg-error-950/50',
      label: '取得失敗',
      description: 'MTGOイベントページを取得できませんでした。',
    },
    publication_timeout: {
      icon: <AlertCircle className="w-4 h-4" />,
      color: 'text-error-400',
      bg: 'bg-error-950/50',
      label: '公開タイムアウト',
      description: 'デッキリストの公開がタイムアウトしました。',
    },
    completed: {
      icon: null,
      color: '',
      bg: '',
      label: '',
      description: '',
    },
  };

  const statusConfig = config[event.status] || config.completed;

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
          最終確認：
          {event.lastCheckedAt
            ? formatDateTime(event.lastCheckedAt)
            : '---'}
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
