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

/** S2: -15 / +15 / +30 / meeting end; a meeting under 30 min ends the Late cutoff at its end. */
export const meetingTimes = (meeting: ClassMeeting): SessionTimes => {
  const start = toMinutes(meeting.startTime);
  const end = toMinutes(meeting.endTime);
  const late = Math.min(start + 30, end);
  return {
    openingTime: toTime(Math.max(0, start - 15)),
    presentCutoff: toTime(Math.min(start + 15, late - 1)),
    lateCutoff: toTime(late),
    classEndTime: toTime(end),
    room: meeting.room,
  };
};

/** S1: today's meeting under way, else the next one later today; null when none. */
export const pickMeeting = (meetings: ClassMeeting[], day: string, minutes: number): ClassMeeting | null => {
  const today = sortMeetings(meetings).filter(meeting => dayIndex(meeting.day) === dayIndex(day));
  return today.find(m => toMinutes(m.startTime) <= minutes && minutes < toMinutes(m.endTime))
    ?? today.find(m => toMinutes(m.startTime) > minutes) ?? null;
};
