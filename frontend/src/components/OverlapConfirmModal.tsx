import React, { useEffect, useRef } from 'react';
import { CalendarDays, Clock, MapPin, UserRound } from 'lucide-react';
import { Modal } from './Modal';
import { ApiError } from '../services/apiClient';
import { formatDayLabel, formatTime12 } from '../utils/sessionTimes';

export interface BookingOverlap {
  kind: 'session' | 'schedule';
  reason: 'room' | 'faculty' | 'room_faculty';
  classId: string | number;
  classCode: string;
  /** Section name, e.g. ANAT-1A (classCode is the course code). */
  className?: string;
  classTitle: string;
  facultyName: string;
  isOwn: boolean;
  room: string;
  date?: string;
  weekday?: string;
  start: string;
  end: string;
}

const FULL_DAY: Record<string, string> = { Mon: 'Mondays', Tue: 'Tuesdays', Wed: 'Wednesdays', Thu: 'Thursdays', Fri: 'Fridays', Sat: 'Saturdays', Sun: 'Sundays' };
const REASON = { room: ['Same room'], faculty: ['Same Faculty'], room_faculty: ['Same room', 'Same Faculty'] } as const;

/** The server's overlap list when this error is a 409 with the given code, else null. */
export const overlapsFrom = (err: unknown, code: 'SESSION_OVERLAP' | 'CLASS_SESSION_OVERLAP'): BookingOverlap[] | null => {
  if (!(err instanceof ApiError) || err.status !== 409 || err.code !== code) return null;
  const list = err.details?.overlaps;
  return Array.isArray(list) && list.length > 0 ? (list as BookingOverlap[]) : null;
};

interface Props {
  overlaps: BookingOverlap[] | null;
  /** Class form wording: "This schedule overlaps with:" / "Save anyway". */
  forClass?: boolean;
  /** Same accent as the Start Session pop-up that opens this one (Secretary flows pass 'blue'). */
  accent?: 'emerald' | 'blue';
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const OverlapConfirmModal: React.FC<Props> = ({ overlaps, forClass, accent = 'emerald', busy, onCancel, onConfirm }) => {
  const backRef = useRef<HTMLButtonElement>(null);
  // Modal focuses its own panel after mount, so ask for the safe button one tick later.
  useEffect(() => { if (!overlaps) return undefined; const t = window.setTimeout(() => backRef.current?.focus()); return () => window.clearTimeout(t); }, [overlaps]);
  const others = [...new Set((overlaps ?? []).filter(o => !o.isOwn).map(o => o.facultyName))];
  const kindChip = (o: BookingOverlap) => `rounded-full px-2 py-0.5 text-[11px] font-semibold ${o.kind === 'session' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'}`;
  const reasonChip = 'rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  const day = (o: BookingOverlap) => (o.date ? formatDayLabel(o.date) : (o.weekday ? FULL_DAY[o.weekday] ?? o.weekday : ''));
  const metaItem = 'inline-flex items-center gap-1 whitespace-nowrap';
  const icon = 'h-3.5 w-3.5 shrink-0';
  // Same classes as the Start Session pop-up's submit button, per accent.
  const primary = accent === 'blue' ? 'bg-blue-600 shadow-blue-600/20' : 'bg-emerald-600 shadow-emerald-600/20';
  return (
    <Modal isOpen={!!overlaps} onClose={onCancel} title={forClass ? 'This schedule overlaps with:' : 'This booking overlaps with:'} size="sm">
      {overlaps && (
        <div className="space-y-4" data-testid="overlap-confirm">
          <ul className={`space-y-2 ${overlaps.length > 1 ? 'max-h-[50vh] overflow-y-auto' : ''}`}>
            {overlaps.map((o, i) => (
              <li key={i} className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <p><strong>{o.className || o.classCode}</strong> · {o.classTitle}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span className={kindChip(o)}>{o.kind === 'session' ? 'Booked session' : 'Regular schedule'}</span>
                  {REASON[o.reason].map(label => <span key={label} className={reasonChip}>{label}</span>)}
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500 dark:text-slate-400">
                  <span className={metaItem}><UserRound className={icon} aria-hidden="true" />{o.isOwn ? 'You' : o.facultyName}</span>
                  <span className={metaItem}><MapPin className={icon} aria-hidden="true" />{o.room}</span>
                  <span className={metaItem}><CalendarDays className={icon} aria-hidden="true" />{day(o)}</span>
                  <span className={metaItem}><Clock className={icon} aria-hidden="true" />{formatTime12(o.start)}–{formatTime12(o.end)}</span>
                </p>
              </li>
            ))}
          </ul>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {others.length ? `${others.join(', ')} will be notified.` : 'This overlaps only your own booking, so nobody else is notified.'}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" ref={backRef} disabled={busy} onClick={onCancel} className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200">Go back</button>
            <button type="button" disabled={busy} onClick={onConfirm} className={`inline-flex items-center gap-1.5 rounded-xl ${primary} px-4 py-2 text-xs font-bold text-white shadow-md disabled:opacity-50`}>{forClass ? 'Save anyway' : 'Book anyway'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
};
