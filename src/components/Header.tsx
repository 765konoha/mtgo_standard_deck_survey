import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
} from 'lucide-react';
import type { IndexData, OverallStatus } from '../types';
import { formatDateTime } from '../utils/helpers';

interface HeaderProps {
  data: IndexData | null;
  loading: boolean;
  onRefetch: () => void;
}

export function Header({ data, loading, onRefetch }: HeaderProps) {
  const statusConfig = getStatusConfig(data?.overallStatus ?? 'failed');

  return (
    <header className="bg-neutral-900 border-b border-neutral-800">
      <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-neutral-100">
              MTGO Standard Results
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              Standard League 5-0 / Standard Challenge Top 8
            </p>
          </div>

          <div className="flex flex-col sm:items-end gap-2">
            {data && (
              <>
                <div className="text-sm text-neutral-300">
                  最終生成:
                  <span className="font-medium text-neutral-100 ml-1">
                    {formatDateTime(data.generatedAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-300">取得状態:</span>
                  <div
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-sm font-medium ${statusConfig.bg} ${statusConfig.text}`}
                  >
                    {statusConfig.icon}
                    {statusConfig.label}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-800">
          <div className="text-sm text-neutral-400">直近10日間</div>
          <button
            onClick={onRefetch}
            disabled={loading}
            className="flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors disabled:opacity-50"
            aria-label="データを再読み込み"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">
              {loading ? '読み込み中...' : '再読み込み'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

function getStatusConfig(status: OverallStatus) {
  switch (status) {
    case 'success':
      return {
        label: '正常',
        icon: <CheckCircle className="w-4 h-4" />,
        bg: 'bg-success-950',
        text: 'text-success-400',
      };
    case 'partial':
      return {
        label: '一部未完了',
        icon: <AlertTriangle className="w-4 h-4" />,
        bg: 'bg-warning-950',
        text: 'text-warning-400',
      };
    case 'failed':
      return {
        label: '更新失敗',
        icon: <AlertCircle className="w-4 h-4" />,
        bg: 'bg-error-950',
        text: 'text-error-400',
      };
    case 'pending':
      return {
        label: '公開待ちあり',
        icon: <Clock className="w-4 h-4" />,
        bg: 'bg-primary-950',
        text: 'text-primary-400',
      };
  }
}
