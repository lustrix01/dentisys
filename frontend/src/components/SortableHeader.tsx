import React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

// Table sorting standard (docs/frontend.md "Page patterns"): the column label is a button; the active column
// shows ▲/▼ and its <th> carries aria-sort. Clicking the active column flips the direction; another column
// starts in that column's first direction. Use inside an existing <th>, keeping the th's own classes.
import { nextSort } from '../utils/sort.ts';
import type { SortDir, SortState } from '../utils/sort.ts';

export { ariaSort, compareValues, nextSort } from '../utils/sort.ts';
export type { SortDir, SortState } from '../utils/sort.ts';

export function SortableHeader<K extends string>({ label, sortKey, sort, onSort, first = 'asc', align = 'left' }: {
  label: string; sortKey: K; sort: SortState<K>; onSort: (next: SortState<K>) => void; first?: SortDir; align?: 'left' | 'right' | 'center';
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(nextSort(sort, sortKey, first))}
      className={`inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded uppercase tracking-wider hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:hover:text-slate-100 ${align === 'right' ? 'flex-row-reverse' : ''} ${active ? 'text-slate-800 dark:text-slate-100' : ''}`}
    >
      {label}
      <Icon aria-hidden="true" className={`h-3 w-3 shrink-0 ${active ? '' : 'opacity-40'}`} />
    </button>
  );
}
