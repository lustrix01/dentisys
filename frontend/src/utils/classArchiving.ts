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
