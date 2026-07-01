import { useEffect, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import type { ToastMessage } from '../types';

interface ToastProps {
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
}

export function Toast({ toasts, removeToast }: ToastProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-auto"
      role="region"
      aria-label="通知"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
}

interface ToastItemProps {
  toast: ToastMessage;
  onRemove: (id: string) => void;
}

function ToastItem({ toast, onRemove }: ToastItemProps) {
  const handleClose = useCallback(() => {
    onRemove(toast.id);
  }, [onRemove, toast.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove(toast.id);
    }, 3000);
    return () => clearTimeout(timer);
  }, [onRemove, toast.id]);

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-success-400" />,
    error: <AlertCircle className="w-5 h-5 text-error-400" />,
    info: <Info className="w-5 h-5 text-primary-400" />,
  };

  const bgColors = {
    success: 'bg-success-950/95 border-success-800',
    error: 'bg-error-950/95 border-error-800',
    info: 'bg-primary-950/95 border-primary-800',
  };

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg animate-slide-up ${bgColors[toast.type]}`}
      role="alert"
    >
      {icons[toast.type]}
      <span className="text-sm text-neutral-100">{toast.message}</span>
      <button
        onClick={handleClose}
        className="ml-2 p-1 hover:bg-neutral-800 rounded transition-colors"
        aria-label="閉じる"
      >
        <X className="w-4 h-4 text-neutral-400" />
      </button>
    </div>
  );
}
