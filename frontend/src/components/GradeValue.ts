import React, { useId } from 'react';
import { percentageToGWAExact } from '../utils/gradeHelper.ts';

type Props = {
  /** Percentage the grade equivalent is derived from; without a finite one nothing is wrapped. */
  percentage: number | null | undefined;
  /** Rendered text, exactly as the page showed it before. */
  children?: React.ReactNode;
  className?: string;
};

// Plain .ts (no JSX) so the node --test runner can import it directly.
/** Shows a grade as-is; hover, focus or tap reveals the exact grade and percentage (UI-002). */
export default function GradeValue({ percentage, children, className }: Props) {
  const id = useId();
  if (typeof percentage !== 'number' || !Number.isFinite(percentage)) return React.createElement(React.Fragment, null, children);
  const tip = `Exact: ${(Math.round((percentageToGWAExact(percentage) + 1e-12) * 10000) / 10000).toFixed(4)} (${percentage.toFixed(2)}%)`;
  return React.createElement(
    'span',
    { tabIndex: 0, 'aria-describedby': id, className: `group relative cursor-help outline-none ${className ?? ''}` },
    children,
    React.createElement(
      'span',
      {
        id,
        role: 'tooltip',
        className:
          'pointer-events-none absolute left-1/2 top-full z-50 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[11px] font-medium normal-case text-white shadow-lg group-hover:block group-focus:block dark:bg-slate-100 dark:text-slate-900 print:!hidden',
      },
      tip,
    ),
  );
}
