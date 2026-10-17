import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { percentageToGWAExact } from '../utils/gradeHelper.ts';

type Props = {
  /** Percentage the grade equivalent is derived from; without a finite one nothing is wrapped. */
  percentage: number | null | undefined;
  /** Rendered text, exactly as the page showed it before. */
  children?: React.ReactNode;
  className?: string;
  /** Midterm period grades use the 3.1-4.0 band below 75%; default is Final / course grade. */
  period?: 'Midterm' | 'Final';
};

const BUBBLE =
  'pointer-events-none fixed left-0 top-0 z-[1000] whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[11px] font-medium normal-case text-white shadow-lg dark:bg-slate-100 dark:text-slate-900 print:hidden';

// Plain .ts (no JSX) so the node --test runner can import it directly.
/**
 * Shows a grade as-is; hover, focus or tap reveals the exact grade and percentage (UI-002).
 * The tooltip element (role="tooltip", the aria-describedby target) is always in the DOM as screen-reader-only
 * text; the visible bubble is an aria-hidden copy portalled to <body> with fixed coordinates so scroll
 * containers and overflow:hidden cards cannot clip it.
 */
export default function GradeValue({ percentage, children, className, period = 'Final' }: Props) {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(false);

  useLayoutEffect(() => {
    const trigger = triggerRef.current, bubble = bubbleRef.current;
    if (!shown || !trigger || !bubble) return;
    const t = trigger.getBoundingClientRect(), b = bubble.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const below = t.bottom + 4;
    const top = below + b.height > vh ? Math.max(0, t.top - 4 - b.height) : below; // flip above near the viewport bottom
    const left = Math.min(Math.max(4, t.left + t.width / 2 - b.width / 2), Math.max(4, vw - b.width - 4));
    bubble.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }, [shown]);

  useEffect(() => {
    if (!shown) return;
    const hide = () => setShown(false); // never leave a detached bubble after scroll/resize
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => { window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide); };
  }, [shown]);

  if (typeof percentage !== 'number' || !Number.isFinite(percentage)) return React.createElement(React.Fragment, null, children);
  const tip = `Exact: ${percentageToGWAExact(percentage, period).toFixed(1)} (${percentage.toFixed(2)}%)`;
  return React.createElement(
    'span',
    {
      ref: triggerRef,
      tabIndex: 0,
      'aria-describedby': id,
      className: `cursor-help outline-none ${className ?? ''}`,
      onMouseEnter: () => setShown(true),
      onMouseLeave: () => setShown(false),
      onFocus: () => setShown(true),
      onBlur: () => setShown(false),
    },
    children,
    React.createElement('span', { id, role: 'tooltip', hidden: true }, tip),
    shown && typeof document !== 'undefined'
      ? createPortal(React.createElement('span', { ref: bubbleRef, 'aria-hidden': true, 'data-grade-tip': '', className: BUBBLE }, tip), document.body)
      : null,
  );
}
