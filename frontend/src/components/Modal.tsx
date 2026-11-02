import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Below the sm breakpoint the dialog fills the screen (audit details). */
  fullScreenOnMobile?: boolean;
}

const openModals: object[] = [];
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  fullScreenOnMobile = false,
}) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined; // not open: no cleanup, so overflow is never wrongly cleared
    // Stacked modals: only the topmost reacts to Escape, and the page stays locked until the last one closes.
    const token = {};
    openModals.push(token);
    const opener = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    const handleKeys = (e: KeyboardEvent) => {
      if (openModals[openModals.length - 1] !== token) return;
      if (e.key === 'Escape') { onCloseRef.current(); return; }
      // aria-modal promises the page behind is out of reach, so Tab and Shift+Tab wrap inside the panel.
      const panel = panelRef.current;
      if (e.key !== 'Tab' || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) { e.preventDefault(); panel.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel || !panel.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !panel.contains(active))) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handleKeys);
    return () => {
      window.removeEventListener('keydown', handleKeys);
      openModals.splice(openModals.indexOf(token), 1);
      if (openModals.length === 0) document.body.style.overflow = '';
      opener?.focus?.();
    };
  }, [isOpen]);

  // Early return is now handled above the JSX block

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  };

  if (!isOpen) return null;

  return createPortal(
    <div className={`fixed inset-0 z-50 flex items-center justify-center overflow-y-auto ${fullScreenOnMobile ? 'p-0 sm:p-4' : 'p-2 sm:p-4'}`}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative w-full outline-none min-w-0 ${sizeClasses[size]} bg-white dark:bg-slate-900 shadow-2xl border border-slate-200/60 dark:border-slate-800/60 overflow-hidden transform transition-all duration-300 scale-100 flex flex-col ${fullScreenOnMobile ? 'h-full max-h-full rounded-none sm:h-auto sm:max-h-[90dvh] sm:rounded-3xl' : 'max-h-[90dvh] rounded-2xl sm:rounded-3xl'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5 border-b border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
          <h3 id={titleId} className="min-w-0 text-lg sm:text-xl font-semibold font-heading tracking-tight text-slate-800 dark:text-slate-100 break-words">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 min-h-11 min-w-11 flex items-center justify-center rounded-full text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="min-w-0 px-4 py-4 sm:px-6 sm:py-6 overflow-y-auto flex-1 bg-white dark:bg-slate-950">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

