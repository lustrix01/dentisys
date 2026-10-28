import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Below the sm breakpoint the dialog fills the screen (audit details). */
  fullScreenOnMobile?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  fullScreenOnMobile = false,
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEscape);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleEscape);
      };
    }

    // Not open — do nothing, return no cleanup so overflow is never wrongly cleared
    return undefined;
  }, [isOpen, onClose]);

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
        className={`relative w-full min-w-0 ${sizeClasses[size]} bg-white dark:bg-slate-900 shadow-2xl border border-slate-200/60 dark:border-slate-800/60 overflow-hidden transform transition-all duration-300 scale-100 flex flex-col ${fullScreenOnMobile ? 'h-full max-h-full rounded-none sm:h-auto sm:max-h-[90vh] sm:rounded-3xl' : 'max-h-[90vh] rounded-2xl sm:rounded-3xl'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5 border-b border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
          <h3 className="min-w-0 text-lg sm:text-xl font-semibold font-heading tracking-tight text-slate-800 dark:text-slate-100 break-words">
            {title}
          </h3>
          <button
            onClick={onClose}
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

