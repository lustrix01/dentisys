// Tidy-table and class-list workbooks (contract docs/contracts/official-exports.md, X15-X19).
import type { Cell, CellObject, Row, XlsxSheet } from './xlsxDownload';
import type { FacultyPeriodBreakdown } from '../services/apiClient';

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
  const head = ['#', 'Student No.', 'Program', 'Name', 'Sex', 'Year Level', 'Contact #'];

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

export interface AssessmentMatrixColumn {
  id: string;
  period: 'Midterm' | 'Finals';
  component: string;
  category: string;
  /** Grade Weights category id; null for an assessment outside every category (scores only, as in the matrix). */
  categoryId: number | null;
  weight: number | null;
  title: string;
  maxScore: number;
}
export interface AssessmentMatrixRow {
  studentNumber: string;
  studentName: string;
  scores: Array<number | null>;
  /** Percentage shown for an assessment outside every category. */
  effectivePercentages: Array<number | null>;
  /** The server's period breakdowns for the student (live preview or the breakdown saved with the grade). */
  periods?: { midterm?: FacultyPeriodBreakdown; final?: FacultyPeriodBreakdown };
}

/** Column groups of the Assessment Scores matrix: one per run of assessments in the same period, component and category. */
export function assessmentMatrixGroups(columns: AssessmentMatrixColumn[]) {
  type Group = { period: string; component: string; category: string; categoryId: number | null; weight: number | null; indexes: number[] };
  const groups: Group[] = [];
  columns.forEach((c, index) => {
    const last = groups[groups.length - 1];
    if (last && last.period === c.period && last.component === c.component && last.category === c.category && last.categoryId === c.categoryId) last.indexes.push(index);
    else groups.push({ period: c.period, component: c.component, category: c.category, categoryId: c.categoryId, weight: c.weight, indexes: [index] });
  });
  return groups;
}
type AssessmentGroup = ReturnType<typeof assessmentMatrixGroups>[number];

/** The server's values for one student's cells in a group: each assessment's % and Transmuted, then the category's Average % and Weighted. */
export function assessmentMatrixCells(a: { columns: AssessmentMatrixColumn[]; row: AssessmentMatrixRow; group: AssessmentGroup }) {
  const { columns, row, group: g } = a;
  const breakdown = row.periods?.[g.period === 'Finals' ? 'final' : 'midterm'];
  const stepFor = (i: number) => breakdown?.assessmentSteps?.find(s => String(s.assessmentId) === String(columns[i].id));
  const category = g.categoryId === null ? undefined : breakdown?.categories?.find(c => c.categoryId === g.categoryId);
  return {
    percent: (i: number) => stepFor(i)?.rawPercentage ?? null,
    /** A number (effective %), the text "Absent (0)", or null when the server has no value. */
    transmuted: (i: number): number | string | null => {
      const step = stepFor(i);
      if (typeof step?.rawPercentage !== 'number') return null;
      if (step.transmuted && step.attendanceStatus === 'absent') return 'Absent (0)';
      return step.effectivePercentage ?? null;
    },
    average: category?.earnedPoints ?? null,
    weighted: category?.contribution ?? null,
  };
}

/**
 * "Assessment Scores" sheet of the Grades & Assessments report: the Full Matrix View with "Show computation" on.
 * Each categorised assessment has Score, %, Transmuted; each category ends with Average % and Weighted.
 * Every computed cell is the server's value; nothing is recomputed here.
 */
export function buildAssessmentScoresSheet(a: { columns: AssessmentMatrixColumn[]; rows: AssessmentMatrixRow[]; titleLines: string[] }): XlsxSheet {
  const groups = assessmentMatrixGroups(a.columns);
  const perAssessment = (g: AssessmentGroup) => (g.categoryId === null ? 2 : 3);
  const width = (g: AssessmentGroup) => g.indexes.length * perAssessment(g) + (g.categoryId === null ? 0 : 2);
  const total = 2 + groups.reduce((sum, g) => sum + width(g), 0);
  const head = (value: string | number, extra: Partial<CellObject> = {}): CellObject =>
    ({ value, fontWeight: 'bold', backgroundColor: LILAC, align: 'center', alignVertical: 'center', wrap: true, ...extra });
  const blank = (): Cell[] => Array.from({ length: total }, () => null);

  const rows: Cell[][] = a.titleLines.map((value, index) => {
    const row = blank();
    row[0] = { value, columnSpan: total, align: 'center', fontWeight: index >= 1 && index <= 3 ? 'bold' : undefined };
    return row;
  });
  const [periodRow, componentRow, categoryRow, assessmentRow, subRow] = [blank(), blank(), blank(), blank(), blank()];
  periodRow[0] = head('Student Number', { rowSpan: 5 });
  periodRow[1] = head('Student Name', { rowSpan: 5 });
  const spans = (row: Cell[], same: (x: AssessmentGroup, y: AssessmentGroup) => boolean, label: (g: AssessmentGroup) => string) => {
    let start = 0, offset = 2;
    while (start < groups.length) {
      let end = start + 1, span = width(groups[start]);
      while (end < groups.length && same(groups[start], groups[end])) span += width(groups[end++]);
      row[offset] = head(label(groups[start]), { columnSpan: span });
      offset += span;
      start = end;
    }
  };
  spans(periodRow, (x, y) => x.period === y.period, g => g.period);
  spans(componentRow, (x, y) => x.period === y.period && x.component === y.component, g => g.component);
  spans(categoryRow, () => false, g => `${g.component} · ${g.category}`);
  let at = 2;
  for (const g of groups) {
    const per = perAssessment(g);
    for (const i of g.indexes) {
      const c = a.columns[i];
      assessmentRow[at] = head(`${c.title} (Max ${c.maxScore})`, { columnSpan: per });
      subRow[at] = head('Score');
      subRow[at + 1] = head('%');
      if (per === 3) subRow[at + 2] = head('Transmuted');
      at += per;
    }
    if (g.categoryId !== null) {
      assessmentRow[at] = head('Average %', { rowSpan: 2 });
      assessmentRow[at + 1] = head(`Weighted (${Number(g.weight ?? 0)}%)`, { rowSpan: 2 });
      at += 2;
    }
  }

  const pct = (value: number | null | undefined): Cell => (typeof value === 'number' && Number.isFinite(value) ? { value: value / 100, format: '0.00%' } : null);
  const num = (value: number | null | undefined): Cell => (typeof value === 'number' && Number.isFinite(value) ? { value, format: '0.00' } : null);
  const body = a.rows.map(row => {
    const cells: Cell[] = [{ value: row.studentNumber }, { value: row.studentName, align: 'left' as const }];
    for (const g of groups) {
      const server = assessmentMatrixCells({ columns: a.columns, row, group: g });
      for (const i of g.indexes) {
        const score = row.scores[i];
        cells.push(score === null ? null : { value: score, format: '0.##' });
        if (g.categoryId === null) {
          cells.push(pct(row.effectivePercentages[i]));
          continue;
        }
        cells.push(pct(server.percent(i)));
        const transmuted = server.transmuted(i);
        cells.push(typeof transmuted === 'string' ? { value: transmuted, align: 'center' as const } : pct(transmuted));
      }
      if (g.categoryId !== null) cells.push(num(server.average), num(server.weighted));
    }
    return cells;
  });

  return {
    sheet: 'Assessment Scores',
    data: [...rows, periodRow, componentRow, categoryRow, assessmentRow, subRow, ...body],
    columns: [{ width: 16 }, { width: 28 }, ...groups.flatMap(g => [
      ...g.indexes.flatMap(() => (g.categoryId === null ? [{ width: 12 }, { width: 10 }] : [{ width: 12 }, { width: 10 }, { width: 12 }])),
      ...(g.categoryId === null ? [] : [{ width: 11 }, { width: 13 }]),
    ])],
    stickyRowsCount: a.titleLines.length + 5,
    stickyColumnsCount: 2,
    orientation: 'landscape',
  };
}
