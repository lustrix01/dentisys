// Table sorting rules shared by components/SortableHeader.tsx and plain .ts helpers (docs/frontend.md "Table sorting").
export type SortDir = 'asc' | 'desc';
export type SortState<K extends string> = { key: K; dir: SortDir };

export const ariaSort = <K extends string>(sort: SortState<K>, key: K): 'ascending' | 'descending' | 'none' =>
  sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';

/** Next state after clicking `key`; `first` is the direction a column starts in (dates usually 'desc'). */
export const nextSort = <K extends string>(sort: SortState<K>, key: K, first: SortDir = 'asc'): SortState<K> =>
  sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: first };

/** Compare helper for client-side sorting: strings by locale (numbers inside sort naturally), empty values last. */
export function compareValues(a: unknown, b: unknown, dir: SortDir): number {
  if (a == null || a === '') return b == null || b === '' ? 0 : 1;
  if (b == null || b === '') return -1;
  const r = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  return dir === 'asc' ? r : -r;
}
