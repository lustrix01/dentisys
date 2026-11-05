import React, { useEffect, useRef } from 'react';
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
const REASON = { room: 'same room', faculty: 'same Faculty', room_faculty: 'same room and same Faculty' } as const;

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
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const OverlapConfirmModal: React.FC<Props> = ({ overlaps, forClass, busy, onCancel, onConfirm }) => {
  const backRef = useRef<HTMLButtonElement>(null);
  // Modal focuses its own panel after mount, so ask for the safe button one tick later.
  useEffect(() => { if (!overlaps) return undefined; const t = window.setTimeout(() => backRef.current?.focus()); return () => window.clearTimeout(t); }, [overlaps]);
  const others = [...new Set((overlaps ?? []).filter(o => !o.isOwn).map(o => o.facultyName))];
  return (
    <Modal isOpen={!!overlaps} onClose={onCancel} title={forClass ? 'This schedule overlaps with:' : 'This booking overlaps with:'} size="sm">
      {overlaps && (
        <div className="space-y-4" data-testid="overlap-confirm">
          <ul className="space-y-2">
            {overlaps.map((o, i) => (
              <li key={i} className="text-xs text-slate-700 dark:text-slate-200">
                <span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${o.kind === 'session' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'}`}>
                  {o.kind === 'session' ? 'Booked session' : 'Regular schedule'}
                </span>
                <span className="font-semibold">{REASON[o.reason]}</span>
                <span className="mt-0.5 block">
                  {o.className || o.classCode} · {o.classTitle} ({o.isOwn ? 'you' : o.facultyName}) · {o.room} · {o.date ? formatDayLabel(o.date) : (o.weekday ? FULL_DAY[o.weekday] ?? o.weekday : '')} · {formatTime12(o.start)}–{formatTime12(o.end)}
                </span>
              </li>
            ))}
          </ul>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {others.length ? `${others.join(', ')} will be notified.` : 'This overlaps only your own booking, so nobody else is notified.'}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" ref={backRef} disabled={busy} onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold dark:border-slate-700">Go back</button>
            <button type="button" disabled={busy} onClick={onConfirm} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{forClass ? 'Save anyway' : 'Book anyway'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
};
