import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { Modal } from './Modal';

type FeedbackKind = 'success' | 'error' | 'info';
type ToastDetail = { message: string; kind: FeedbackKind };
type ConfirmDetail = {
  message: string;
  title?: string;
  resolve: (confirmed: boolean) => void;
};

const TOAST_EVENT = 'dentisys:feedback';
const CONFIRM_EVENT = 'dentisys:confirm';

export function showFeedback(message: string, kind: FeedbackKind = 'info'): void {
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { message, kind } }));
}

export function requestConfirmation(message: string, title = 'Confirm action'): Promise<boolean> {
  return new Promise((resolve) => {
    window.dispatchEvent(
      new CustomEvent<ConfirmDetail>(CONFIRM_EVENT, {
        detail: { message, title, resolve },
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

  return (
    <>
      {toast && (
        <div
          role={toast.kind === 'error' ? 'alert' : 'status'}
          className={`fixed right-5 top-5 z-[100] flex max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 text-xs font-semibold shadow-xl ${
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
        title={confirmation?.title || 'Confirm action'}
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p className="whitespace-pre-line">{confirmation?.message}</p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => settle(false)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              Cancel
            </button>
            <button type="button" onClick={() => settle(true)} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700">
              Confirm
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};
