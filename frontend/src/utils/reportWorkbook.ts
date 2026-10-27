// Tidy-table and class-list workbooks (contract docs/contracts/official-exports.md, X15-X19).
import type { Cell, Row, XlsxSheet } from './xlsxDownload';

const UNIVERSITY = ['Republic of the Philippines', 'BICOL UNIVERSITY', 'COLLEGE OF DENTAL MEDICINE'];
const LILAC = '#E1BEE8';
const GREY = '#EEF1F4';
/** Rows above the header row in a tidy table: 3 university lines, report, filter, term, exported-by, blank. */
export const HEADER_ROW_INDEX = 8;

export type ReportValue = string | number | Date | null | undefined;
export interface ReportColumn {
  header: string;
  /** Width in characters. */
  width: number;
  /** Excel number format for numbers, e.g. '0.00'. */
  format?: string;
}

const manilaParts = (now: Date) => Object.fromEntries(
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map(p => [p.type, p.value]),
);

/** "Exported 27 Oct 2026 14:05 (Manila) by Dr. Ana Reyes" */
export function exportedLine(by: string, now: Date = new Date()): string {
  const p = manilaParts(now);
  return `Exported ${Number(p.day)} ${p.month} ${p.year} ${p.hour}:${p.minute} (Manila) by ${by}`;
}

/** A "YYYY-MM-DD" day as a real date (UTC midnight, which is how the library turns it into an Excel day). */
export function dayToDate(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}

const toCell = (value: ReportValue, format?: string): Cell => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return { value, type: Date, format: 'dd-mmm-yyyy', align: 'left' };
  if (typeof value === 'number') return { value, type: Number, ...(format ? { format } : {}), align: 'right' };
  return { value, type: String, align: 'left' };
};

const titleRows = (width: number, lines: string[]): Row[] =>
  lines.map((value, i) => [{ value, columnSpan: width, align: 'center', fontWeight: i === 1 || i === 2 ? 'bold' : undefined } as Cell]);

export interface ReportInput {
  sheet: string;
  title: string;
  /** Class or filter line. */
  filter: string;
  term: string;
  by: string;
  now?: Date;
  columns: ReportColumn[];
  rows: ReportValue[][];
}

/** One tidy table: title block, one bold header row (frozen), then the data. */
export function buildReportSheet(input: ReportInput): XlsxSheet {
  const width = input.columns.length;
  const line = (value: string, bold = false): Row => [{ value, columnSpan: width, align: 'left', fontWeight: bold ? 'bold' : undefined } as Cell];
  const data: Row[] = [
    ...titleRows(width, UNIVERSITY),
    line(input.title, true),
    line(input.filter),
    line(input.term),
    line(exportedLine(input.by, input.now)),
    [],
    input.columns.map(c => ({ value: c.header, fontWeight: 'bold', backgroundColor: GREY, align: 'left' }) as Cell),
    ...input.rows.map(r => input.columns.map((c, i) => toCell(r[i], c.format))),
  ];
  return {
    data,
    sheet: input.sheet,
    columns: input.columns.map(c => ({ width: c.width })),
    stickyRowsCount: HEADER_ROW_INDEX + 1,
    orientation: 'landscape',
  };
}

export interface ClassListStudent {
  studentId: string;
  name: string;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  email?: string | null;
  yearLevel?: number | null;
  /** Not in the Faculty roster API yet: left blank when absent. */
  gender?: string | null;
  contact?: string | null;
}

export interface ClassListInput {
  courseCode: string;
  courseTitle: string;
  /** Class section name, e.g. "DMD-3A". */
  section: string;
  yearLevel: number | string;
  units: number;
  lectureUnits?: number | null;
  labUnits?: number | null;
  faculty: string;
  schedules: string;
  semester: string;
  schoolYear: string;
  students: ClassListStudent[];
}

const semesterOf = (value: string): { title: string; file: string } => {
  const upper = value.toUpperCase();
  if (upper.includes('2ND') || upper.includes('SECOND')) return { title: '2ND SEMESTER', file: '2nd' };
  if (upper.includes('SUMMER')) return { title: 'SUMMER', file: 'Summer' };
  return { title: '1ST SEMESTER', file: '1st' };
};

/** "1ST SEMESTER, AY 2026-2027" */
export const termLine = (semester: string, schoolYear: string): string => `${semesterOf(semester).title}, AY ${schoolYear}`;

const lastFirst = (s: ClassListStudent): string => {
  if (!s.lastName) return s.name;
  return `${s.lastName}, ${[s.firstName, s.middleName].filter(Boolean).join(' ')}`.trim();
};

/** The class-list workbook laid out like the official PDF, plus its file name. */
export function buildClassList(input: ClassListInput): { fileName: string; sheet: XlsxSheet } {
  const term = semesterOf(input.semester);
  const width = 7;
  const units = input.lectureUnits != null && input.labUnits != null
    ? `Academic ${input.lectureUnits.toFixed(1)} · Lab ${input.labUnits.toFixed(1)} · Credit ${input.units.toFixed(1)}`
    : `Credit ${input.units.toFixed(1)}`;
  const info: Array<[string, string]> = [
    ['Course Code', input.courseCode], ['Course Title', input.courseTitle], ['Class Section', input.section],
    ['Year Level', String(input.yearLevel)], ['Units', units], ['Lab Hours', ''], // DentiSys does not store lab hours
    ['Faculty', input.faculty], ['Schedules', input.schedules],
  ];
  const students = [...input.students].sort((a, b) =>
    (a.lastName ?? a.name).localeCompare(b.lastName ?? b.name) || a.name.localeCompare(b.name));
  const program = input.section.split('-')[0];
  const head = ['#', 'Student No.', 'Program', 'Name', 'Gender', 'Year Level', 'Contact #'];

  const data: Row[] = [
    ...titleRows(width, [...UNIVERSITY, 'OFFICIAL LIST OF ENROLLED STUDENTS', termLine(input.semester, input.schoolYear)]),
    [],
    ...info.map(([key, value]): Row => [{ value: key, columnSpan: 2, fontWeight: 'bold', align: 'left' } as Cell, null, { value, columnSpan: 5, align: 'left' } as Cell]),
    [],
    head.map(h => ({ value: h, fontWeight: 'bold', backgroundColor: LILAC, align: 'center' }) as Cell),
    ...students.map((s, i): Row => [
      { value: i + 1, type: Number, align: 'right' },
      toCell(s.studentId),
      toCell(program),
      { value: `${lastFirst(s)}\n${s.email || 'No University Email'}`, type: String, wrap: true, align: 'left' },
      toCell(s.gender),
      toCell(s.yearLevel),
      toCell(s.contact),
    ]),
    [],
    [{ value: `Total Number of Students: ${students.length}`, columnSpan: 4, fontWeight: 'bold', align: 'left' } as Cell],
  ];
  const fileName = `${input.courseCode.replace(/\s+/g, '')}_${input.section}_Class_List_${input.schoolYear}_${term.file}.xlsx`;
  return {
    fileName,
    sheet: { data, sheet: 'Class List', columns: [6, 16, 10, 42, 10, 11, 16].map(w => ({ width: w })), orientation: 'landscape' },
  };
}
