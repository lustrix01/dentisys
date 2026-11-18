import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { Modal } from './Modal';

type FeedbackKind = 'success' | 'error' | 'info';
type ToastDetail = { message: string; kind: FeedbackKind };
type ConfirmDetail = {
  message: string;
  title?: string;
  confirmLabel?: string;
  resolve: (confirmed: boolean) => void;
};

const TOAST_EVENT = 'dentisys:feedback';
const CONFIRM_EVENT = 'dentisys:confirm';

export function showFeedback(message: string, kind: FeedbackKind = 'info'): void {
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { message, kind } }));
}

export function requestConfirmation(message: string, title = 'Confirm action', confirmLabel = 'Confirm'): Promise<boolean> {
  return new Promise((resolve) => {
    window.dispatchEvent(
      new CustomEvent<ConfirmDetail>(CONFIRM_EVENT, {
        detail: { message, title, confirmLabel, resolve },
      }),
    );
  });
}

export const FeedbackCenter: React.FC = () => {
  const [toast, setToast] = useState<ToastDetail | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmDetail | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastDetail>).detail;
      setToast(detail);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setToast(null), 4500);
    };
    const onConfirm = (event: Event) => {
      setConfirmation((event as CustomEvent<ConfirmDetail>).detail);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    window.addEventListener(CONFIRM_EVENT, onConfirm);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      window.removeEventListener(CONFIRM_EVENT, onConfirm);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const settle = (confirmed: boolean) => {
    confirmation?.resolve(confirmed);
    setConfirmation(null);
  };

  const Icon = toast?.kind === 'success' ? CheckCircle2 : toast?.kind === 'error' ? AlertCircle : Info;
  const confirmationTone = confirmation
    ? /delete|remove|revoke|discard|cancel/i.test(`${confirmation.title ?? ''} ${confirmation.confirmLabel ?? ''}`)
      ? 'danger'
      : /archive|end session|new code|replace|conversion|reset|turn off/i.test(`${confirmation.title ?? ''} ${confirmation.confirmLabel ?? ''}`)
        ? 'caution'
        : 'standard'
    : 'standard';
  const ConfirmationIcon = confirmationTone === 'danger' ? TriangleAlert : confirmationTone === 'caution' ? AlertCircle : Info;
  const confirmationColors = confirmationTone === 'danger'
    ? {
        icon: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300',
        panel: 'border-rose-200/80 bg-rose-50/50 dark:border-rose-900/70 dark:bg-rose-950/20',
        button: 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500',
      }
    : confirmationTone === 'caution'
      ? {
          icon: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
          panel: 'border-amber-200/80 bg-amber-50/50 dark:border-amber-900/70 dark:bg-amber-950/20',
          button: 'bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-500',
        }
      : {
          icon: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
          panel: 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900',
          button: 'bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500',
        };

  return (
    <>
      {toast && (
        <div
          role={toast.kind === 'error' ? 'alert' : 'status'}
          className={`print:hidden fixed right-5 top-5 z-[100] flex max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 text-xs font-semibold shadow-xl ${
            toast.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
              : toast.kind === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300'
                : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300'
          }`}
        >
          <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} className="ml-auto opacity-60 hover:opacity-100" aria-label="Dismiss feedback">
            ×
          </button>
        </div>
      )}
      <Modal
        isOpen={Boolean(confirmation)}
        onClose={() => settle(false)}
        size="md"
        title={
          <span className="flex min-w-0 items-center gap-3">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${confirmationColors.icon}`}>
              <ConfirmationIcon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>{confirmation?.title || 'Confirm Action'}</span>
          </span>
        }
      >
        <div className="space-y-5">
          <div className={`rounded-2xl border p-4 sm:p-5 ${confirmationColors.panel}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Review this action</p>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700 dark:text-slate-200">{confirmation?.message}</p>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button type="button" onClick={() => settle(false)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
              Cancel
            </button>
            <button type="button" onClick={() => settle(true)} className={`min-h-11 rounded-xl px-5 text-sm font-semibold text-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${confirmationColors.button}`}>
              {confirmation?.confirmLabel || 'Confirm'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};
