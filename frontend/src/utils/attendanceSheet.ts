// Attendance sheet (contract docs/contracts/official-exports.md, X31): one class, whole term, students x session dates.
// Pure builder: lays out what the server returned; the rate is the only computed value.
import type { AttendanceSheetData } from '../services/apiClient.ts';
import { sheetName } from './officialGradeSheetExport.ts';
import { semesterOf, termLine } from './reportWorkbook.ts';
import type { ReportColumn, ReportValue } from './reportWorkbook.ts';
import { formatVisibleTime } from './timeDisplay.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LETTERS: Record<string, string> = { present: 'P', late: 'L', absent: 'A', excused: 'E' };

/** "2026-11-15" -> "Nov 15". */
export const sessionDateLabel = (day: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  return match ? `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}` : day;
};

export interface AttendanceSheetTable {
  fileName: string;
  /** Title rows of the workbook and the PDF. */
  title: string;
  filter: string;
  term: string;
  columns: ReportColumn[];
  rows: ReportValue[][];
}

export function buildAttendanceSheetTable(data: AttendanceSheetData): AttendanceSheetTable {
  const { class: cls, sessions, students, records } = data;
  const perDate = new Map<string, number>();
  sessions.forEach(s => perDate.set(s.date, (perDate.get(s.date) ?? 0) + 1));
  const sessionHeader = (s: AttendanceSheetData['sessions'][number]) =>
    (perDate.get(s.date) ?? 0) > 1 && s.openingTime ? `${sessionDateLabel(s.date)} ${formatVisibleTime(s.openingTime)}` : sessionDateLabel(s.date);

  const statusOf = new Map(records.map(r => [`${r.enrollmentId}:${r.sessionId}`, LETTERS[String(r.status).toLowerCase()] ?? '']));
  const named = students
    .map(s => ({ s, name: sheetName({ name: `${s.firstName} ${s.lastName}`, firstName: s.firstName, middleName: s.middleName, lastName: s.lastName }) }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.s.studentNumber.localeCompare(b.s.studentNumber));

  const rows = named.map(({ s, name }, index): ReportValue[] => {
    const marks = sessions.map(session => statusOf.get(`${s.enrollmentId}:${session.id}`) || '');
    const count = (letter: string) => marks.filter(m => m === letter).length;
    const [present, late, absent, excused] = ['P', 'L', 'A', 'E'].map(count);
    const resolved = present + late + absent + excused;
    return [index + 1, name, ...marks, present, late, absent, excused, resolved === 0 ? null : `${Math.round(((present + late + excused) / resolved) * 100)}%`];
  });

  const section = cls.sectionName;
  const school = cls.schoolYear ?? '';
  const semester = cls.semester ?? '';
  const token = (text: string) => text.replace(/[\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '');
  return {
    fileName: `${cls.courseCode.replace(/\s+/g, '')}_${token(section)}_Attendance_Sheet_${token(school)}_${semesterOf(semester).file}.xlsx`,
    title: 'ATTENDANCE SHEET',
    filter: `${cls.courseCode} · ${section}`,
    term: termLine(semester, school),
    columns: [
      { header: 'No.', width: 6 },
      { header: 'Student Name', width: 34 },
      ...sessions.map(s => ({ header: sessionHeader(s), width: 11 })),
      { header: 'Present', width: 9 }, { header: 'Late', width: 7 }, { header: 'Absent', width: 9 }, { header: 'Excused', width: 9 },
      { header: 'Attendance rate', width: 16 },
    ],
    rows,
  };
}
