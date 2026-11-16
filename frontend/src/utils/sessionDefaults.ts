import type { ClassMeeting } from '../services/apiClient';

export interface SessionTimes {
  openingTime: string;
  presentCutoff: string;
  lateCutoff: string;
  classEndTime: string;
  room: string;
}

export const FIXED_TIMES = { openingTime: '08:00', presentCutoff: '09:00', lateCutoff: '12:00', classEndTime: '13:00' } as const;

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayIndex = (day: string) => DAYS.findIndex(name => name.toLowerCase() === day.slice(0, 3).toLowerCase());
const toMinutes = (time: string) => { const [h, m] = time.split(':'); return Number(h) * 60 + Number(m); };
const toTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Meetings ordered Mon→Sun, then by start time. */
export const sortMeetings = (meetings: ClassMeeting[]): ClassMeeting[] =>
  [...meetings].sort((a, b) => dayIndex(a.day) - dayIndex(b.day) || toMinutes(a.startTime) - toMinutes(b.startTime));

/** Current weekday ("Mon"…) and minutes since midnight in Asia/Manila. */
export const manilaNow = (now: Date = new Date()): { day: string; minutes: number } => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '0';
  return { day: get('weekday'), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * One-tap start (ATT-001): the meeting under way now, else the next one within 7 days (Asia/Manila).
 * `date` is the YYYY-MM-DD of that meeting; null when the class has no meetings.
 */
export const pickSessionMeeting = (meetings: ClassMeeting[], now: Date = new Date()): { meeting: ClassMeeting; date: string } | null => {
  const sorted = sortMeetings(meetings);
  if (sorted.length === 0) return null;
  const { day, minutes } = manilaNow(now);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);
  const todayIndex = DAY_NAMES.findIndex(name => name === day);
  for (let offset = 0; offset <= 7; offset += 1) {
    const name = DAY_NAMES[(todayIndex + offset) % 7];
    const found = sorted.filter(m => dayIndex(m.day) === dayIndex(name)).find(m =>
      offset > 0 || minutes < toMinutes(m.endTime));
    if (found) {
      const date = new Date(`${today}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + offset);
      return { meeting: found, date: date.toISOString().slice(0, 10) };
    }
  }
  return null;
};

/** One-tap opening (Owner 2026-11-16): 15 minutes before the meeting starts, never before midnight. */
export const meetingOpening = (startTime: string): string => toTime(Math.max(0, toMinutes(startTime) - 15));

/** Next quarter hour after `minutes` (HH:MM, wraps past midnight). */
export const nextQuarterHour = (minutes: number): string => toTime((Math.ceil((minutes + 1) / 15) * 15) % 1440);
