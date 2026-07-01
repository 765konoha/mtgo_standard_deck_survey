import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  error: Error;
  onRetry: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <AlertCircle className="w-12 h-12 text-error-500 mb-4" />
      <h2 className="text-lg font-semibold text-neutral-200 mb-2">
        データの読み込みに失敗しました
      </h2>
      <p className="text-sm text-neutral-400 mb-4 max-w-md">
        {error.message || '不明なエラーが発生しました。'}
      </p>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        再読み込み
      </button>
    </div>
  );
}

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <Inbox className="w-12 h-12 text-neutral-600 mb-4" />
      <h2 className="text-lg font-semibold text-neutral-200 mb-2">
        デッキリストはまだ取得されていません
      </h2>
      <p className="text-sm text-neutral-400">
        データが読み込まれるまでお待ちください。
      </p>
    </div>
  );
}
