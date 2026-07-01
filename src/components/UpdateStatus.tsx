import type { IndexData } from '../types';

interface UpdateStatusProps {
  data: IndexData;
}

export function UpdateStatus({ data }: UpdateStatusProps) {
  const { summary } = data;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 mb-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <StatusValue label="取得済みイベント" value={summary.completedEvents} />
        {summary.pendingEvents > 0 && (
          <StatusValue
            label="公開待ち"
            value={summary.pendingEvents}
            className="text-primary-400"
          />
        )}
        {summary.fetchErrors > 0 && (
          <StatusValue
            label="取得エラー"
            value={summary.fetchErrors}
            className="text-error-400"
          />
        )}
        {summary.parseErrors > 0 && (
          <StatusValue
            label="解析エラー"
            value={summary.parseErrors}
            className="text-warning-400"
          />
        )}
        {(summary.timedOutEvents ?? 0) > 0 && (
          <StatusValue
            label="公開期限切れ"
            value={summary.timedOutEvents ?? 0}
            className="text-error-400"
          />
        )}
        {summary.untranslatedCards > 0 && (
          <StatusValue
            label="未変換カード"
            value={summary.untranslatedCards}
            className="text-warning-400"
          />
        )}
      </div>
    </div>
  );
}

function StatusValue({
  label,
  value,
  className = 'text-neutral-200',
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-neutral-400">{label}:</span>
      <span className={`font-medium ${className}`}>{value}件</span>
    </div>
  );
}
