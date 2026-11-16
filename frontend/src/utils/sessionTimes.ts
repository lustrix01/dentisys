// Shared by the Start/Schedule pop-up and the Faculty Edit form (ATT-001, 2026-11-05 overnight amendment).
export interface TimeSet { openingTime: string; presentCutoff: string; lateCutoff: string; classEndTime: string }
export type TimeField = keyof TimeSet;

export const MAX_SESSION_MINUTES = 12 * 60;

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

/** Error text for the first problem, or null. Measured from Opening, a session may last at most 12 h. */
export const checkTimes = (times: TimeSet): string | null => {
  if (!complete(times)) return 'Fill in all four times.';
  if (rel(times, 'presentCutoff') <= 0) return 'Present cutoff must be after the opening time.';
  if (rel(times, 'lateCutoff') <= rel(times, 'presentCutoff')) return 'Late cutoff must be after the present cutoff.';
  if (rel(times, 'classEndTime') === 0) return 'Class end must be after the opening time.';
  if (rel(times, 'classEndTime') < rel(times, 'lateCutoff')) return 'Class end time must be at or after the late cutoff.';
  if (rel(times, 'classEndTime') > MAX_SESSION_MINUTES) return 'A session can last at most 12 hours.';
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

/** 'HH:MM' moved by `delta` minutes, wrapping past midnight. */
export const addMinutes = (time: string, delta: number): string => toTime(toMinutes(time) + delta);

/** Minutes from Opening to `time` (0-1439); a time before Opening counts as the next day. */
export const minutesAfter = (openingTime: string, time: string): number => mod(toMinutes(time) - toMinutes(openingTime));

/** `value` moved by `delta` inside min..max, looping at the ends (12 -> 1, 59 -> 0). */
export const stepLoop = (value: number, delta: number, min: number, max: number): number => {
  const size = max - min + 1;
  return min + ((((value - min + delta) % size) + size) % size);
};

/** 'HH:MM' to the 12-hour wheel values (hour 1-12). */
export const to12h = (time: string): { hour: number; minute: number; pm: boolean } => {
  const h = Number(time.slice(0, 2));
  return { hour: h % 12 || 12, minute: Number(time.slice(3, 5)), pm: h >= 12 };
};

/** Wheel values back to 'HH:MM'. */
export const from12h = (hour: number, minute: number, pm: boolean): string =>
  `${String((hour % 12) + (pm ? 12 : 0)).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

/** Digits typed on a focused column: a second digit extends the first, anything above `max` starts again. */
export const nextDigits = (buffer: string, digit: string, max: number): string => {
  const next = buffer.length >= 2 ? digit : buffer + digit;
  return Number(next) > max ? digit : next;
};

/**
 * Typed time to 'HH:MM', or null. "8", "830", "8:05", "1:30p", "1:30 pm", "19:00", "0730".
 * Without am/pm: 7-11 is AM, 12 is noon, 1-6 is PM, 0 and 13-23 are 24-hour.
 */
export const parseTypedTime = (text: string): string | null => {
  const t = text.trim().toLowerCase().replace(/\./g, '');
  const colon = /^(\d{1,2}):(\d{2})\s*(a|p|am|pm)?$/.exec(t);
  const plain = /^(\d{1,4})\s*(a|p|am|pm)?$/.exec(t);
  let h: number; let m: number; let suffix: string | undefined;
  if (colon) { h = Number(colon[1]); m = Number(colon[2]); suffix = colon[3]; }
  else if (plain) {
    const d = plain[1];
    h = Number(d.length <= 2 ? d : d.slice(0, d.length - 2)); m = d.length <= 2 ? 0 : Number(d.slice(-2)); suffix = plain[2];
  } else return null;
  if (m > 59 || h > 23) return null;
  if (suffix) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (suffix.startsWith('p') ? 12 : 0);
  } else if (h >= 1 && h <= 6) h += 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Four times from a meeting (or an opening and end): Present/Late cutoffs are the class's grace periods after the opening.
 * Late is capped at the class end when that still leaves it after Present; otherwise the cutoffs stay at opening + grace.
 */
export const timesFromGrace = (openingTime: string, classEndTime: string, presentGrace: number, lateGrace: number): TimeSet => {
  const endOffset = minutesAfter(openingTime, classEndTime);
  const lateOffset = lateGrace > endOffset && endOffset > presentGrace ? endOffset : lateGrace;
  return { openingTime, presentCutoff: addMinutes(openingTime, presentGrace), lateCutoff: addMinutes(openingTime, lateOffset), classEndTime };
};
