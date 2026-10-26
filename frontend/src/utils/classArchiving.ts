// CLS-003: shared view-only and grouping rules for archived classes.
export type ArchiveReason = 'finished' | 'cancelled' | 'mistake';

type ArchivableClass = {
  isHistorical?: boolean;
  isCurrentSchoolYear?: boolean;
  isArchived?: boolean;
  archiveReason?: ArchiveReason | null;
};

export const isPastYearClass = (c: ArchivableClass | null | undefined) =>
  c?.isHistorical === true || c?.isCurrentSchoolYear === false;

// Past-year and archived classes are both view-only.
export const isViewOnlyClass = (c: ArchivableClass | null | undefined) =>
  isPastYearClass(c) || c?.isArchived === true || Boolean(c?.archiveReason);

// 'completed' = Finished or past-year; 'removed' = Cancelled / Created by mistake; null = active.
export function archiveGroup(c: ArchivableClass): 'completed' | 'removed' | null {
  if (isPastYearClass(c) || c.archiveReason === 'finished') return 'completed';
  if (c.archiveReason === 'cancelled' || c.archiveReason === 'mistake') return 'removed';
  return c.isArchived ? 'completed' : null;
}

// A2/A3: current-year classes for Faculty lists: active first, then Finished-archived; Cancelled/Created-by-mistake dropped.
export function orderCurrentYearClasses<T extends ArchivableClass>(classes: T[]): T[] {
  const isActive = (c: T) => !isViewOnlyClass(c);
  const isFinished = (c: T) => !isPastYearClass(c) && archiveGroup(c) === 'completed';
  return [...classes.filter(isActive), ...classes.filter(isFinished)];
}
export const isArchivedCurrentYear = (c: ArchivableClass | null | undefined) =>
  Boolean(c) && !isPastYearClass(c) && isViewOnlyClass(c);
