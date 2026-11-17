import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, FileSpreadsheet, FileText, type LucideIcon } from 'lucide-react';

export interface ExportMenuItem {
  label: string;
  onSelect: () => void;
  /** When set, the item stays visible but cannot be used; the reason is shown under the label. */
  disabledReason?: string;
}

// Panel and item classes copied from ActionsMenu/RowMenu in pages/admin/PeopleAndAccounts.tsx.
const menuItemClass = 'w-full px-3 py-2 text-left flex items-center gap-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold transition-colors cursor-pointer';
const PANEL_WIDTH = 224; // w-56

type ExportKind = 'excel' | 'pdf';
const kindStyle = {
  excel: { Icon: FileSpreadsheet, iconClass: 'text-emerald-600 dark:text-emerald-400', hover: 'hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-300' },
  pdf: { Icon: FileText, iconClass: 'text-rose-600 dark:text-rose-400', hover: 'hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300' },
} as const;

/** The bordered Excel + PDF pair, each side a dropdown of reports. Same container as the plain button pair. */
export function ExportPair({ excelItems, pdfItems, excelLabel = 'Export Excel', pdfLabel = 'Export PDF', excelIcon, pdfIcon }: {
  excelItems: ExportMenuItem[]; pdfItems: ExportMenuItem[]; excelLabel?: string; pdfLabel?: string; excelIcon?: LucideIcon; pdfIcon?: LucideIcon;
}) {
  return (
    <div className="no-print flex shrink-0 items-center rounded-xl border border-slate-200/90 bg-white p-0.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
      <ExportMenu kind="excel" icon={excelIcon} label={excelLabel} items={excelItems} />
      <div className="mx-0.5 h-3.5 w-px bg-slate-200 dark:bg-slate-800" />
      <ExportMenu kind="pdf" icon={pdfIcon} label={pdfLabel} items={pdfItems} />
    </div>
  );
}

/** One export dropdown; its trigger keeps the look of the plain export buttons. */
export function ExportMenu({ kind, label, items, icon }: { kind: ExportKind; label: string; items: ExportMenuItem[]; icon?: LucideIcon }) {
  const { Icon: defaultIcon, iconClass, hover } = kindStyle[kind];
  const Icon = icon ?? defaultIcon;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const enabledItems = () => Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
  const closeAndRefocus = () => { setOpen(false); triggerRef.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    enabledItems()[0]?.focus();
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAndRefocus(); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const list = enabledItems();
    if (list.length === 0) return;
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? (at + 1) % list.length : (at <= 0 ? list.length - 1 : at - 1);
    list[next].focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation(); // the document listener added on open must not see this click
          if (open) { setOpen(false); return; }
          const r = e.currentTarget.getBoundingClientRect();
          // Right-align to the trigger, but keep the panel inside the viewport (phones).
          const left = Math.max(8, Math.min(r.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8));
          // Open upward when the menu does not fit below.
          setPos(window.innerHeight - r.bottom < 200 && r.top > window.innerHeight - r.bottom
            ? { bottom: window.innerHeight - r.top + 6, left }
            : { top: r.bottom + 6, left });
          setOpen(true);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${open
          ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white'
          : `text-slate-700 dark:text-slate-200 ${hover}`}`}
      >
        <Icon className={`h-3.5 w-3.5 ${iconClass}`} />
        <span>{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition-transform dark:text-slate-400 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && pos && createPortal(
        <div
          ref={panelRef}
          role="menu"
          style={pos}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onPanelKeyDown}
          className="fixed w-56 max-w-[calc(100vw-1rem)] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-900/10 py-1.5 z-[60] text-xs text-left"
        >
          {items.map(item => {
            const disabled = Boolean(item.disabledReason);
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={disabled || undefined}
                onClick={() => { if (disabled) return; closeAndRefocus(); item.onSelect(); }}
                className={disabled ? menuItemClass.replace('cursor-pointer', 'cursor-not-allowed').replace('hover:bg-slate-50 dark:hover:bg-slate-800 ', '') + ' opacity-60' : menuItemClass}
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 ${iconClass}`} />
                <span className="min-w-0">
                  <span className="block">{item.label}</span>
                  {disabled && <span className="block text-[10px] font-normal text-slate-500 dark:text-slate-400">{item.disabledReason}</span>}
                </span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
