import { ClassMeeting, FacultyClassItem } from '../services/apiClient';

export interface ClassSessionSlot {
  id: string;
  type: 'Lecture' | 'Laboratory';
  room: string;
  days: string[];
  startTime: string;
  endTime: string;
  dayTimes?: Record<string, { startTime: string; endTime: string; room?: string }>;
  lectureData?: { room: string; days: string[]; startTime: string; endTime: string };
  labData?: { room: string; days: string[]; startTime: string; endTime: string };
}

export const ROOM_CATEGORIES = [
  {
    category: 'Lecture Halls & Auditoriums',
    rooms: ['Lecture Hall A', 'Lecture Hall B', 'Auditorium'],
  },
  {
    category: 'Laboratories & Dental Clinics',
    rooms: [
      'Dental Clinic Lab 1',
      'Dental Clinic Lab 2',
      'Oral Anatomy Lab',
      'Prosthodontics Lab',
      'Periodontics Lab',
      'Simulation Lab',
    ],
  },
  {
    category: 'Standard Classrooms',
    rooms: [
      'Room 101',
      'Room 102',
      'Room 201',
      'Room 202',
      'Room 301',
      'Room 302',
    ],
  },
];

export const ROOM_OPTIONS = ROOM_CATEGORIES.flatMap(c => c.rooms);

export const SCHEDULE_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const SCHEDULE_PRESETS = [
  { label: 'Mon/Wed', days: ['Mon', 'Wed'] },
  { label: 'Tue/Thu', days: ['Tue', 'Thu'] },
  { label: 'Mon/Wed/Fri', days: ['Mon', 'Wed', 'Fri'] },
  { label: 'Sat', days: ['Sat'] },
];

export const SCHEDULE_TIME_SLOTS = [
  '07:00 AM', '07:30 AM', '08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM',
  '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM',
  '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM', '07:00 PM'
];

export const parseTimeToMinutes = (timeStr: string): number | null => {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
};

export interface ParsedSession {
  room: string;
  days: string[];
  start: number;
  end: number;
  rawStr: string;
}

export const extractSessionFromText = (text: string, defaultRoom: string = ''): ParsedSession | null => {
  if (!text) return null;
  const timeMatch = text.match(/(\d{1,2}:\d{2}\s*[APap][Mm])\s*-\s*(\d{1,2}:\d{2}\s*[APap][Mm])/);
  if (!timeMatch) return null;

  const start = parseTimeToMinutes(timeMatch[1]);
  const end = parseTimeToMinutes(timeMatch[2]);
  if (start === null || end === null) return null;

  const foundDays = SCHEDULE_DAYS.filter(d => new RegExp('\\b' + d + '\\b', 'i').test(text));
  if (foundDays.length === 0) return null;

  let room = defaultRoom;
  const parenMatch = text.match(/^([^(]+)\s*\(/);
  if (parenMatch) {
    room = parenMatch[1].trim();
  }

  return { room, days: foundDays, start, end, rawStr: text };
};

export const checkScheduleConflicts = (
  slots: ClassSessionSlot[],
  classes: FacultyClassItem[],
  currentSchoolYear: string,
  excludeCsId?: number | string
): string | null => {
  slots = slots.flatMap(slot => slot.days.length ? slot.days.map((day, index) => ({ ...slot, days: [day],
    room: slot.dayTimes?.[meetingDayKey(slot.days, index)]?.room ?? slot.room,
    startTime: slot.dayTimes?.[meetingDayKey(slot.days, index)]?.startTime ?? slot.startTime,
    endTime: slot.dayTimes?.[meetingDayKey(slot.days, index)]?.endTime ?? slot.endTime })) : [slot]);
  if (slots.length === 0) return 'At least one session is required.';

  // 1. Validate each slot individually
  const parsedSlots: Array<{ label: string; room: string; days: string[]; start: number; end: number }> = [];

  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const label = `${s.type} (Session ${i + 1})`;

    if (!s.room.trim()) {
      return `Please choose what room to use for ${label}.`;
    }
    if (s.days.length === 0) {
      return `Please select at least one day for ${label}.`;
    }

    const start = parseTimeToMinutes(s.startTime);
    const end = parseTimeToMinutes(s.endTime);
    if (start === null || end === null || start >= end) {
      return `Invalid time range for ${label}: End time must be after start time.`;
    }

    parsedSlots.push({
      label,
      room: s.room.trim().toLowerCase(),
      days: s.days,
      start,
      end,
    });
  }

  // 2. Check internal conflicts between slots of the same class
  for (let i = 0; i < parsedSlots.length; i++) {
    for (let j = i + 1; j < parsedSlots.length; j++) {
      const a = parsedSlots[i];
      const b = parsedSlots[j];
      const commonDays = a.days.filter(d => b.days.includes(d));
      if (commonDays.length > 0 && a.start < b.end && b.start < a.end) {
        return `Internal Conflict: ${a.label} and ${b.label} overlap on ${commonDays.join('/')} at the same time.`;
      }
    }
  }

  // 3. Check against existing classes for current school year
  for (const cls of classes) {
    if (excludeCsId && (String(cls.csId) === String(excludeCsId) || String(cls.id) === String(excludeCsId))) {
      continue;
    }
    if (currentSchoolYear && cls.schoolYear && cls.schoolYear !== currentSchoolYear) {
      continue;
    }

    const existingSessions: Array<{ room: string; days: string[]; start: number; end: number; raw: string }> = [];

    for (const meeting of cls.meetings ?? []) {
      const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
      existingSessions.push({ room: meeting.room.toLowerCase(), days: [meeting.day], start: minutes(meeting.startTime), end: minutes(meeting.endTime),
        raw: `${meeting.day} ${meeting.startTime} - ${meeting.endTime}` });
    }
    const parsedLec = cls.meetings?.length ? null : extractSessionFromText(cls.lecRoom || '', cls.lecRoom || '');
    if (parsedLec) {
      existingSessions.push({
        room: parsedLec.room.toLowerCase(),
        days: parsedLec.days,
        start: parsedLec.start,
        end: parsedLec.end,
        raw: parsedLec.rawStr,
      });
    }

    const parsedLab = cls.meetings?.length ? null : extractSessionFromText(cls.labRoom || '', cls.labRoom || '');
    if (parsedLab) {
      existingSessions.push({
        room: parsedLab.room.toLowerCase(),
        days: parsedLab.days,
        start: parsedLab.start,
        end: parsedLab.end,
        raw: parsedLab.rawStr,
      });
    }

    for (const prop of parsedSlots) {
      for (const exist of existingSessions) {
        const overlapDays = prop.days.filter(d => exist.days.some(ed => ed.toLowerCase() === d.toLowerCase()));
        if (overlapDays.length === 0) continue;

        const timesOverlap = prop.start < exist.end && exist.start < prop.end;
        if (!timesOverlap) continue;

        // Room conflict
        if (prop.room && exist.room && prop.room === exist.room) {
          return `Room Conflict: "${prop.room}" is already booked by ${cls.courseCode} (${cls.csName || cls.block}) on ${overlapDays.join('/')} (${exist.raw}). Overriding schedules is not allowed.`;
        }

        // Instructor conflict
        return `Schedule Conflict: Your ${prop.label} conflicts with ${cls.courseCode} (${cls.csName || cls.block}) on ${overlapDays.join('/')} (${exist.raw}). Overriding schedules is not allowed.`;
      }
    }
  }

  return null;
};

// Keep the identity of repeated same-component meetings on one day.
export const meetingDayKey = (days: string[], index: number): string => {
  const day = days[index];
  const occurrence = days.slice(0, index).filter(value => value === day).length;
  return occurrence ? `${day}:${occurrence}` : day;
};

export const displayMeetingTime = (time: string): string => {
  const [hours, minutes] = time.split(':').map(Number);
  return `${String(hours % 12 || 12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
};

export const formatSessionsForSubmission = (slots: ClassSessionSlot[]): { lecRoom: string; labRoom: string; meetings: ClassMeeting[] } => {
  const clock = (value: string) => {
    const minutes = parseTimeToMinutes(value);
    if (minutes === null) return '';
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  };
  return {
    lecRoom: slots.find(slot => slot.type === 'Lecture')?.room.trim() ?? '',
    labRoom: slots.find(slot => slot.type === 'Laboratory')?.room.trim() ?? '',
    meetings: slots.flatMap(slot => slot.days.map((day, index) => ({ component: slot.type, day, room: slot.dayTimes?.[meetingDayKey(slot.days, index)]?.room ?? slot.room.trim(),
      startTime: clock(slot.dayTimes?.[meetingDayKey(slot.days, index)]?.startTime ?? slot.startTime), endTime: clock(slot.dayTimes?.[meetingDayKey(slot.days, index)]?.endTime ?? slot.endTime) }))),
  };
};
