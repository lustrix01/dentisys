// Shared by the Start/Schedule pop-up and the Faculty Edit form (ATT-001, 2026-11-05 overnight amendment).
export interface TimeSet { openingTime: string; presentCutoff: string; lateCutoff: string; classEndTime: string }
export type TimeField = keyof TimeSet;

export const LONG_SESSION_MINUTES = 12 * 60;

const DAY = 1440;
const mod = (n: number) => ((n % DAY) + DAY) % DAY;
export const toMinutes = (time: string): number => { const [h, m] = time.split(':'); return Number(h) * 60 + Number(m); };
const toTime = (minutes: number): string => { const m = mod(minutes); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const rel = (times: TimeSet, field: TimeField): number => mod(toMinutes(times[field]) - toMinutes(times.openingTime));
const complete = (times: TimeSet): boolean => Object.values(times).every(Boolean);

/** A time earlier than the Opening time is on the next day. */
export const isNextDay = (openingTime: string, time: string | null | undefined): boolean =>
  !!openingTime && !!time && toMinutes(time) < toMinutes(openingTime);

/** Minutes from Opening to Class end, or null while a time is missing. */
export const sessionMinutes = (times: TimeSet): number | null => (complete(times) ? rel(times, 'classEndTime') : null);

/** Opening moves the other three by the same amount; a cutoff only pushes later fields that would fall before it. */
export const applyTimeChange = (times: TimeSet, field: TimeField, value: string): TimeSet => {
  const prev = times[field];
  const next: TimeSet = { ...times, [field]: value };
  if (!value) return next;
  if (field === 'openingTime') {
    if (!prev) return next;
    const delta = toMinutes(value) - toMinutes(prev);
    for (const key of ['presentCutoff', 'lateCutoff', 'classEndTime'] as const) if (next[key]) next[key] = toTime(toMinutes(next[key]) + delta);
    return next;
  }
  if (!next.openingTime) return next;
  if (field === 'presentCutoff' && next.lateCutoff && rel(next, 'presentCutoff') > 0 && rel(next, 'lateCutoff') <= rel(next, 'presentCutoff')) {
    next.lateCutoff = toTime(toMinutes(value) + 1);
  }
  if ((field === 'presentCutoff' || field === 'lateCutoff') && next.lateCutoff && next.classEndTime && rel(next, 'lateCutoff') > 0 && rel(next, 'classEndTime') < rel(next, 'lateCutoff')) {
    next.classEndTime = next.lateCutoff;
  }
  return next;
};

/** Error text for the first problem, or null. Measured from Opening, so the session is always under 24 h. */
export const checkTimes = (times: TimeSet): string | null => {
  if (!complete(times)) return 'Fill in all four times.';
  if (rel(times, 'presentCutoff') <= 0) return 'Present cutoff must be after the Opening time.';
  if (rel(times, 'lateCutoff') <= rel(times, 'presentCutoff')) return 'Late cutoff must be after the Present cutoff.';
  if (rel(times, 'classEndTime') < rel(times, 'lateCutoff')) return 'Class end time must be at or after the Late cutoff.';
  return null;
};

export const formatTime12 = (time: string): string => {
  const m = toMinutes(time);
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

export const formatDuration = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
};

/** "Fri, Nov 6" for a YYYY-MM-DD date moved by `addDays`. */
export const formatDayLabel = (date: string, addDays = 0): string => {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + addDays);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(d);
};

const DAY_MS = DAY * 60000;
/** End moment of a session: the server flag when sent, else the end-before-opening rule. */
export const sessionEndOffsetMs = (openingTime: string | null | undefined, classEndTime: string | null | undefined, flag?: boolean): number =>
  (flag ?? isNextDay(openingTime ?? '', classEndTime)) ? DAY_MS : 0;
