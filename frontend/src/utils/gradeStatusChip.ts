// GRD-004 class card chip (docs/contracts/grade-submission.md "Screens"): label and tone from the Faculty class list fields.
type ChipInput = { gradeChangeStatus?: string | null; gradeDeadlineStatus?: string | null };

const SLATE_TONE = 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
const EMERALD_TONE = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300';

/** Label and tone of the grade status chip on a class card (first match wins). */
export function gradeStatusChip(cls: ChipInput): { label: string; tone: string } {
  if (cls.gradeChangeStatus === 'draft') return { label: 'Grade change draft', tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' };
  if (cls.gradeChangeStatus === 'pending') return { label: 'Awaiting Dean approval', tone: SLATE_TONE };
  if (cls.gradeDeadlineStatus === 'submitted') return { label: 'Submitted', tone: EMERALD_TONE };
  if (cls.gradeDeadlineStatus === 'submitted_late') return { label: 'Submitted late', tone: EMERALD_TONE };
  if (cls.gradeDeadlineStatus === 'late') return { label: 'Late', tone: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300' };
  return { label: 'Not submitted', tone: SLATE_TONE };
}
