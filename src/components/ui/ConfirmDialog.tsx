import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  /** When set, the confirm button stays disabled until the exact text is typed. */
  requiredText?: string;
  requiredTextLabel?: string;
  isBusy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  requiredText,
  requiredTextLabel,
  isBusy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setTyped('');
      return;
    }
    const target = requiredText ? inputRef.current : confirmRef.current;
    target?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, requiredText, isBusy, onCancel]);

  if (!open) return null;

  const canConfirm = !isBusy && (!requiredText || typed === requiredText);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => { if (!isBusy) onCancel(); }}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-confirm-title"
        aria-describedby="admin-confirm-message"
        className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={isBusy}
          aria-label={cancelLabel}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-text-light cursor-pointer hover:bg-surface-secondary disabled:cursor-not-allowed"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-4 flex items-start gap-3">
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', danger ? 'bg-error-light text-error' : 'bg-accent-light text-accent')}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 id="admin-confirm-title" className="text-lg font-black text-text-main">{title}</h3>
            <p id="admin-confirm-message" className="mt-1 text-sm text-text-muted">{message}</p>
          </div>
        </div>

        {requiredText && (
          <label className="mb-5 block">
            <span className="mb-1.5 block text-[11px] font-bold text-text-muted">
              {requiredTextLabel}
            </span>
            <input
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="w-full rounded-xl border-2 border-border bg-surface px-3 py-2 text-sm font-mono text-text-main outline-none focus:border-accent"
            />
          </label>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="flex-1 rounded-xl border border-border bg-surface-secondary px-4 py-2.5 text-sm font-bold text-text-muted cursor-pointer disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className={cn(
              'flex-1 rounded-xl px-4 py-2.5 text-sm font-black uppercase tracking-wider text-white cursor-pointer transition-all disabled:cursor-not-allowed disabled:opacity-40',
              danger ? 'bg-error hover:scale-[1.02] active:scale-[0.98]' : 'bg-accent hover:scale-[1.02] active:scale-[0.98]'
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
