import React from 'react';
import { Search, X } from 'lucide-react';
import type { TabsColor } from './Tabs';

// List toolbar and search box used where a list switch shares its row with search and actions
// (docs/frontend.md "Page patterns", rule R6).

const card = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl shadow-sm';

/** One toolbar per list. left: switch, search, filters. right: count, export, the list's main action. below: e.g. "More filters" row. */
export const ListToolbar: React.FC<{ left?: React.ReactNode; right?: React.ReactNode; below?: React.ReactNode; className?: string }> = ({ left, right, below, className = '' }) => (
  <div className={`${card} space-y-3 ${className}`.trim()}>
    <div className="flex flex-col lg:flex-row lg:items-center gap-3">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 lg:flex-1 min-w-0">{left}</div>
      {right && <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">{right}</div>}
    </div>
    {below && <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 border-t border-slate-100 dark:border-slate-800 pt-3">{below}</div>}
  </div>
);

const FOCUS: Record<TabsColor, string> = {
  accent: 'focus:ring-accent-500',
  clinical: 'focus:ring-clinical-500',
  emerald: 'focus:ring-emerald-500',
  blue: 'focus:ring-blue-500',
};

/** The one search box. Grows to fill the toolbar row; full width on phones. */
export const SearchField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel?: string;
  color?: TabsColor;
  className?: string;
  maxLength?: number;
  /** Lets the box shrink further when a row is crowded. */
  compact?: boolean;
}> = ({ value, onChange, placeholder, ariaLabel, color = 'clinical', className = '', maxLength, compact }) => (
  <div className={`relative w-full sm:flex-1 ${compact ? 'sm:min-w-[8rem]' : 'sm:min-w-[12rem]'} ${className}`.trim()}>
    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    <input
      type="search"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      aria-label={ariaLabel ?? placeholder.replace(/…|\.\.\.$/, '')}
      className={`w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:ring-2 [&::-webkit-search-cancel-button]:hidden ${FOCUS[color]}`}
    />
    {value && (
      <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
        <X className="w-3.5 h-3.5" />
      </button>
    )}
  </div>
);
