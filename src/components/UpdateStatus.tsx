import type { IndexData } from '../types';

interface UpdateStatusProps {
  data: IndexData;
}

export function UpdateStatus({ data }: UpdateStatusProps) {
  const { summary } = data;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 mb-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-neutral-400">取得済みイベント：</span>
          <span className="font-medium text-neutral-200">
            {summary.completedEvents}件
          </span>
        </div>
        {summary.pendingEvents > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-neutral-400">公開待ち：</span>
            <span className="font-medium text-primary-400">
              {summary.pendingEvents}件
            </span>
          </div>
        )}
        {summary.fetchErrors > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-neutral-400">取得エラー：</span>
            <span className="font-medium text-error-400">
              {summary.fetchErrors}件
            </span>
          </div>
        )}
        {summary.parseErrors > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-neutral-400">解析エラー：</span>
            <span className="font-medium text-warning-400">
              {summary.parseErrors}件
            </span>
          </div>
        )}
        {summary.untranslatedCards > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-neutral-400">未変換カード：</span>
            <span className="font-medium text-warning-400">
              {summary.untranslatedCards}件
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
