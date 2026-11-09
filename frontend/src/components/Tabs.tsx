import React, { useRef } from 'react';
import { nextTabIndex } from '../utils/tabKeys';

export type TabsColor = 'accent' | 'clinical' | 'emerald' | 'blue';

export interface TabItem<T extends string> {
  id: T;
  label: React.ReactNode;
  shortLabel?: string;
  icon?: React.ReactNode;
  count?: number;
  countTone?: 'amber' | 'rose'; // alert colour on the count badge while the tab is not selected
}

const COUNT_TONE = {
  amber: 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200',
  rose: 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-200',
};

export interface TabsProps<T extends string> {
  variant: 'section' | 'switch';
  color: TabsColor;
  label: string;
  value: T;
  onChange: (id: T) => void;
  tabs: TabItem<T>[];
  className?: string;
}

// Literal class maps: Tailwind only generates classes it can see in source.
const SWITCH_SELECTED: Record<TabsColor, string> = {
  accent: 'text-accent-600 dark:text-accent-400',
  clinical: 'text-clinical-600 dark:text-clinical-400',
  emerald: 'text-emerald-700 dark:text-emerald-400',
  blue: 'text-blue-600 dark:text-blue-400',
};
const SWITCH_BADGE: Record<TabsColor, string> = {
  accent: 'bg-accent-100 dark:bg-accent-950/60 text-accent-700 dark:text-accent-300',
  clinical: 'bg-clinical-100 dark:bg-clinical-950/60 text-clinical-700 dark:text-clinical-300',
  emerald: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
  blue: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300',
};
const SECTION_SELECTED: Record<TabsColor, string> = {
  accent: 'bg-accent-600',
  clinical: 'bg-clinical-600',
  emerald: 'bg-emerald-700',
  blue: 'bg-blue-600',
};

export default function Tabs<T extends string>({ variant, color, label, value, onChange, tabs, className = '' }: TabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const isSwitch = variant === 'switch';

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const next = nextTabIndex(e.key, index, tabs.length);
    if (next === null) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };

  const container = isSwitch
    ? 'flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl w-full sm:w-fit'
    : 'flex flex-wrap xl:flex-nowrap gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 rounded-2xl shadow-sm';
  const button = isSwitch
    ? 'flex-1 sm:flex-initial flex items-center justify-center gap-2 max-sm:gap-1.5 px-4 max-sm:px-2.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap'
    : 'flex-1 min-w-fit xl:min-w-[auto] whitespace-nowrap py-2 px-3 max-sm:px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer';
  const selected = isSwitch
    ? `bg-white dark:bg-slate-800 shadow-xs ring-[1.5px] ring-inset ring-current ${SWITCH_SELECTED[color]}`
    : `${SECTION_SELECTED[color]} text-white shadow-md`;
  const idle = isSwitch
    ? 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40';
  const badge = isSwitch ? 'ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold' : 'px-1.5 py-0.5 rounded-full text-[10px] font-bold';
  const badgeIdle = isSwitch
    ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300';

  return (
    <div role="tablist" aria-label={label} className={`${container} ${className}`.trim()}>
      {tabs.map((tab, i) => {
        const active = tab.id === value;
        // The full label and count stay the accessible name on every width, including
        // when a short visible label replaces it below sm.
        const ariaLabel = typeof tab.label === 'string'
          ? `${tab.label}${tab.count !== undefined ? ` ${tab.count}` : ''}`
          : undefined;
        // A warning count keeps its amber or rose tone when the tab is selected.
        const selectedBadge = tab.countTone
          ? (isSwitch ? COUNT_TONE[tab.countTone] : tab.countTone === 'rose' ? 'bg-white text-rose-700' : 'bg-white text-amber-800')
          : (isSwitch ? SWITCH_BADGE[color] : 'bg-white/25 text-white');
        return (
          <button
            key={tab.id}
            ref={el => { refs.current[i] = el; }}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={ariaLabel}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={e => onKeyDown(e, i)}
            className={`${button} ${active ? selected : idle}`}
          >
            {tab.icon}
            {tab.shortLabel ? (
              <>
                <span className="sm:hidden">{tab.shortLabel}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </>
            ) : tab.label}
            {tab.count !== undefined && (
              <span className={`${badge} ${active ? selectedBadge : tab.countTone ? COUNT_TONE[tab.countTone] : badgeIdle}`}>{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
