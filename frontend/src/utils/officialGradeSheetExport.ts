// Official grade sheet (.xlsx) export: pure builder (contract docs/contracts/official-exports.md, X1-X13, X23-X26).
// Every grade cell holds a value DentiSys already computed on the server (X6); this file only lays them out.
import type { Assessment, AttendanceStatus, Student } from '../types/index.ts';
import type { FacultyGradeComputeResult, FacultyGradingCategoryItem, FacultyGradingConfiguration, FacultyPeriodBreakdown } from '../services/apiClient.ts';
import { extractPeriodEvaluation } from './periodGradingHelper.ts';
import { buildReportSheet, termLine } from './reportWorkbook.ts';
import { effectiveAssessmentPercentage, percentageToGWAExact, roundPercent } from './gradeHelper.ts';
import { parseSemester } from './gradeSheetImport.ts';
import { downloadXlsx } from './xlsxDownload.ts';
import type { Cell, CellObject, XlsxSheet } from './xlsxDownload.ts';

type Period = 'Midterm' | 'Final';
type Comp = 'lecture' | 'laboratory';

export interface OfficialSheetStudent { id: string; name: string; firstName?: string; middleName?: string | null; lastName?: string }

export type OfficialSheetAssessment = Pick<Assessment, 'id' | 'title' | 'maxScore'> & Partial<Pick<Assessment,
  'gradingCategoryId' | 'gradingPeriod' | 'dueDate' | 'transmutationEnabled' | 'transmutationMinimumPercentage'
  | 'transmutationMaximumPercentage' | 'attendanceSessionDate' | 'attendanceSessionCode'>>;

/** The server's grade result for one student (live preview or the saved breakdown of a past class). */
export interface OfficialGradeResult {
  status?: string;
  percentage?: number | null;
  gwa?: number | null;
  periods?: { midterm?: FacultyPeriodBreakdown; final?: FacultyPeriodBreakdown };
}

export interface OfficialGradeSheetInput {
  course: { code: string; title: string; section: string; semester: string; schoolYear: string };
  /** The class's saved Grade Weights. */
  config: FacultyGradingConfiguration;
  /** Currently enrolled students only (X20); the builder sorts them. */
  students: OfficialSheetStudent[];
  assessments: OfficialSheetAssessment[];
  scores: Array<{ assessmentId: string; studentId: string; score: number }>;
  /** Server results by student id. */
  results: Record<string, OfficialGradeResult | undefined>;
  /** Attendance status behind an attendance-linked, transmuted assessment (GRD-001). */
  attendanceStatus?: (studentId: string, assessment: OfficialSheetAssessment) => AttendanceStatus | null | undefined;
}

const LILAC = '#E1BEE8';
const INC: CellObject = { value: 'INC', fontWeight: 'bold', textColor: '#B42318', align: 'center' };
const UNIVERSITY_LINES = ['Republic of the Philippines', 'BICOL UNIVERSITY', 'COLLEGE OF DENTAL MEDICINE'];

const head = (value: string | number, extra: Partial<CellObject> = {}): CellObject =>
  ({ value, fontWeight: 'bold', backgroundColor: LILAC, align: 'center', alignVertical: 'center', wrap: true, ...extra });
const numCell = (value: number | null | undefined, format?: string): Cell =>
  typeof value !== 'number' || !Number.isFinite(value) ? INC : format ? { value, format } : { value };
const equiv = (percent: number | null | undefined, gwa?: number | null): Cell =>
  typeof percent !== 'number' ? INC : { value: typeof gwa === 'number' ? gwa : percentageToGWAExact(percent), format: '0.0#' };

const alnum = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
const fileToken = (text: string) => text.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '');

const lastNameOf = (s: OfficialSheetStudent) => s.lastName?.trim() || s.name.trim().split(/\s+/).pop() || s.name;
/** `LAST, First Middle` (X11). */
const sheetName = (s: OfficialSheetStudent) =>
  s.lastName?.trim() && s.firstName?.trim()
    ? `${s.lastName.trim().toUpperCase()}, ${[s.firstName.trim(), s.middleName?.trim()].filter(Boolean).join(' ')}`
    : s.name.trim();

/** `DM116_DMD-3A_Grade_Sheet_2026-2027_1st.xlsx` (X13). */
export function officialGradeSheetFileName(c: { code: string; section: string; schoolYear: string; semester: string }): string {
  const sem = parseSemester(c.semester);
  const semToken = sem === 'SUMMER' ? 'Summer' : sem ? sem.toLowerCase() : fileToken(c.semester);
  return [c.code.replace(/\s+/g, ''), fileToken(c.section), 'Grade_Sheet', fileToken(c.schoolYear), semToken]
    .filter(Boolean).join('_').replace(/_(Grade_Sheet)_/, '_$1_') + '.xlsx';
}

/** Plain values of a sheet (merged-cell fillers are null): what the importer reads back, and what tests compare. */
export function sheetValues(sheet: XlsxSheet): Array<Array<string | number | boolean | null>> {
  return sheet.data.map(row => row.map(c => {
    const v = c !== null && typeof c === 'object' ? (c as { value?: unknown }).value : c;
    return (v ?? null) as string | number | boolean | null;
  }));
}

/** Result of a past class, rebuilt from the breakdown saved with the grade (the live preview refuses past classes). */
export function savedGradeResult(subject: { grade?: number; components?: unknown } | null | undefined): OfficialGradeResult | undefined {
  const comps = subject?.components as { calculationMode?: string; percentage?: number; periods?: OfficialGradeResult['periods'] } | undefined;
  if (comps?.calculationMode !== 'authoritative_periods' || !comps.periods) return undefined;
  const complete = typeof comps.percentage === 'number' && typeof subject?.grade === 'number' && subject.grade > 0;
  return { status: complete ? 'computed' : 'incomplete', percentage: complete ? comps.percentage : null, gwa: complete ? subject!.grade : null, periods: comps.periods };
}

interface Col {
  width: number;
  h7?: Cell; h8?: Cell; h9?: Cell;
  value: (s: Row) => Cell;
}
interface Row { index: number; student: OfficialSheetStudent; result: OfficialGradeResult | undefined }

/** True when the saved Grade Weights fit the official Lecture (+ Laboratory) layout; other classes get the plain grade summary. */
export function isOfficialLayout(config: FacultyGradingConfiguration | null | undefined): boolean {
  return !!config && config.schemaMode === 'periods' && (config.componentMode === 'lecture_laboratory' || config.componentMode === 'lecture')
    && !!(config.midtermCategories?.length || config.finalCategories?.length);
}

export function buildOfficialGradeSheet(input: OfficialGradeSheetInput): XlsxSheet[] {
  const { config, course } = input;
  const split = config.componentMode === 'lecture_laboratory';
  const lectureOnly = config.componentMode === 'lecture';
  if (!isOfficialLayout(config)) {
    throw new Error('Set up and save the Grade Weights (Midterm and Finals) before exporting the grade sheet.');
  }
  const midShare = Number(config.termRatio?.midterm ?? 50);
  const finShare = Number(config.termRatio?.final ?? 50);
  const compShare = { lecture: Number(config.componentWeights?.lecture ?? 60), laboratory: Number(config.componentWeights?.laboratory ?? 40) };

  const sorted = [...input.students].sort((a, b) =>
    lastNameOf(a).toLowerCase().localeCompare(lastNameOf(b).toLowerCase()) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  const rows: Row[] = sorted.map((student, index) => ({ index, student, result: input.results[student.id] }));
  const scoreOf = new Map(input.scores.map(s => [`${s.studentId}|${s.assessmentId}`, s.score]));

  const periodOf = (r: Row, p: Period): FacultyPeriodBreakdown | undefined => r.result?.periods?.[p === 'Midterm' ? 'midterm' : 'final'];
  /** The component's whole-percent grade for a period (X24); Lecture-only has just the period grade. */
  const compGrade = (r: Row, p: Period, comp: Comp): number | null => {
    const pb = periodOf(r, p);
    const v = lectureOnly ? pb?.percentage : pb?.components?.[comp]?.percentage;
    return typeof v === 'number' ? v : null;
  };
  const periodGrade = (r: Row, p: Period): number | null => {
    const v = periodOf(r, p)?.percentage;
    return typeof v === 'number' ? v : null;
  };
  const courseGrade = (r: Row): number | null =>
    r.result?.status === 'computed' && typeof r.result.percentage === 'number' ? r.result.percentage : null;
  const courseGwa = (r: Row) => (courseGrade(r) === null ? null : r.result?.gwa);

  const categoriesOf = (p: Period, comp: Comp): FacultyGradingCategoryItem[] =>
    [...((p === 'Midterm' ? config.midtermCategories : config.finalCategories) ?? [])]
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .filter(c => {
        if (lectureOnly) return true;
        const k = (c.component ?? 'Lecture').toLowerCase();
        return comp === 'lecture' ? k === 'lecture' : k === 'laboratory' || k === 'lab';
      });
  const itemsOf = (cat: FacultyGradingCategoryItem, p: Period) =>
    input.assessments
      .filter(a => cat.sourceKind !== 'attendance' && cat.id != null && String(a.gradingCategoryId ?? '') === String(cat.id) && (a.gradingPeriod ?? 'Midterm') === p)
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || a.title.localeCompare(b.title));
  const detailOf = (r: Row, p: Period, cat: FacultyGradingCategoryItem) =>
    periodOf(r, p)?.categories?.find(d => String(d.categoryId) === String(cat.id));
  const itemPercent = (r: Row, a: OfficialSheetAssessment): number | null => {
    const score = scoreOf.get(`${r.student.id}|${a.id}`);
    if (score === undefined) return null;
    const linked = Boolean(a.attendanceSessionDate && a.attendanceSessionCode);
    return effectiveAssessmentPercentage(score, a.maxScore, a, linked ? input.attendanceStatus?.(r.student.id, a) ?? null : 'unlinked');
  };

  // ---------- LEC / LAB ----------
  const componentSheet = (comp: Comp): XlsxSheet => {
    const cols: Col[] = [
      { width: 9.5, h7: head('No.', { rowSpan: 3 }), value: r => ({ value: r.index + 1 }) },
      { width: 51, h7: head('Names', { rowSpan: 3 }), value: r => ({ value: sheetName(r.student), align: 'left' }) },
    ];
    const periodTail = (p: Period) => {
      const share = p === 'Midterm' ? midShare : finShare;
      const grade = (r: Row) => compGrade(r, p, comp);
      const part = (r: Row): Cell => {
        const g = grade(r);
        if (g === null) return INC;
        return lectureOnly ? { value: g * share / 100, format: '0.0' } : { value: roundPercent(g * share / 100), format: '0' };
      };
      // Over All FG of one component (X24); a Lecture-only course shows the course grade itself.
      const overall = (r: Row): number | null => {
        if (lectureOnly) return courseGrade(r);
        const m = compGrade(r, 'Midterm', comp), f = compGrade(r, 'Final', comp);
        return m === null || f === null ? null : roundPercent(roundPercent(m * midShare / 100) + roundPercent(f * finShare / 100));
      };
      if (p === 'Midterm') {
        cols.push({ width: 12, h7: head('MIDTERM GRADE', { rowSpan: 3 }), value: r => numCell(grade(r), '0') });
        cols.push({ width: 9, h7: head('EQUIV.', { rowSpan: 3 }), value: r => equiv(grade(r)) });
        cols.push({ width: 12, h7: head(`Midterm ${midShare}%`, { rowSpan: 3 }), value: part });
      } else {
        cols.push({ width: 12, h7: head('FINAL GRADE', { rowSpan: 3 }), value: r => numCell(grade(r), '0') });
        cols.push({ width: 12, h7: head(`Final ${finShare}%`, { rowSpan: 3 }), value: part });
        cols.push({ width: 9, h7: head('EQUIV.', { rowSpan: 3 }), value: r => equiv(grade(r)) });
        cols.push({ width: 12, h7: head('Over All FG', { rowSpan: 3 }), value: r => numCell(overall(r), '0') });
        cols.push({ width: 9, h7: head('EQUIV.', { rowSpan: 3 }), value: r => equiv(overall(r), lectureOnly ? courseGwa(r) : undefined) });
      }
    };

    (['Midterm', 'Final'] as const).forEach(p => {
      for (const cat of categoriesOf(p, comp)) {
        const items = itemsOf(cat, p);
        const weightHead = head(Math.round(Number(cat.weight) * 100) / 10000, { rowSpan: 3, format: '0.0#' });
        const weightCol: Col = { width: 9, h7: weightHead, value: r => numCell(detailOf(r, p, cat)?.contribution, '0.00') };
        const only = items[0];
        const percentEntry = items.length === 1 && only.maxScore === 100 && !only.transmutationEnabled && alnum(only.title) === alnum(cat.name);
        if (!items.length || percentEntry) {
          // Recitation / Lab Performance: one percent entry, no max (the sheet's own layout).
          cols.push({
            width: 14, h7: head(cat.name.toUpperCase(), { rowSpan: 3 }),
            value: r => percentEntry
              ? (scoreOf.has(`${r.student.id}|${only.id}`) ? { value: scoreOf.get(`${r.student.id}|${only.id}`)! } : null)
              : numCell(detailOf(r, p, cat)?.earnedPoints, '0.00'),
          });
        } else {
          items.forEach((a, i) => {
            cols.push({
              width: 10, h7: i === 0 ? head(cat.name.toUpperCase(), { columnSpan: items.length * 2 }) : null,
              h8: head(a.title, { columnSpan: 2 }), h9: head(a.maxScore),
              value: r => scoreOf.has(`${r.student.id}|${a.id}`) ? { value: scoreOf.get(`${r.student.id}|${a.id}`)! } : null,
            });
            cols.push({
              width: 9, h9: head('%'),
              value: r => { const v = itemPercent(r, a); return v === null ? null : { value: v, format: '0.00' }; },
            });
          });
          if (items.length > 1) cols.push({ width: 10, h7: head('AVE.', { rowSpan: 3 }), value: r => numCell(detailOf(r, p, cat)?.earnedPoints, '0.00') });
        }
        cols.push(weightCol);
      }
      periodTail(p);
    });

    const width = cols.length;
    const blank = (): Cell[] => Array.from({ length: width }, () => null);
    const sem = parseSemester(course.semester);
    const term = `${sem === 'SUMMER' ? 'SUMMER' : sem ? `${sem} SEMESTER` : course.semester.toUpperCase()}, AY ${course.schoolYear}`;
    const titles = [...UNIVERSITY_LINES, `${course.title.toUpperCase()} (${comp === 'lecture' ? 'LEC' : 'LAB'})`, term];
    const data: Cell[][] = titles.map((t, i) => {
      const row = blank();
      row[0] = { value: t, columnSpan: width, align: 'center', ...(i > 0 ? { fontWeight: 'bold' as const } : {}) };
      return row;
    });
    const sectionRow = blank();
    sectionRow[0] = { value: course.section, fontWeight: 'bold', align: 'left' };
    const r7 = blank(), r8 = blank(), r9 = blank();
    cols.forEach((c, i) => { r7[i] = c.h7 ?? null; r8[i] = c.h8 ?? null; r9[i] = c.h9 ?? null; });
    data.push(sectionRow, r7, r8, r9, ...rows.map(r => cols.map(c => c.value(r))));
    return { sheet: comp === 'lecture' ? 'LEC' : 'LAB', data, columns: cols.map(c => ({ width: c.width })), stickyRowsCount: 9, stickyColumnsCount: 2, orientation: 'landscape' };
  };

  // ---------- TFG ----------
  const tfgSheet = (): XlsxSheet => {
    const cols: Array<{ title: string; width: number; value: (r: Row) => Cell }> = [
      { title: 'No.', width: 9.5, value: r => ({ value: r.index + 1 }) },
      { title: 'NAME', width: 51, value: r => ({ value: sheetName(r.student), align: 'left' }) },
    ];
    const M = (r: Row) => periodGrade(r, 'Midterm'), F = (r: Row) => periodGrade(r, 'Final');
    if (split) {
      // Component grade x its share with 2 decimals, as the official TFG, so TOTAL adds up (X25).
      const part = (p: Period, comp: Comp) => (r: Row): Cell => {
        const g = compGrade(r, p, comp);
        return g === null ? INC : { value: g * compShare[comp] / 100, format: '0.00' };
      };
      const half = (grade: (r: Row) => number | null, share: number) => (r: Row): Cell => {
        const g = grade(r);
        return g === null ? INC : { value: roundPercent(g * share / 100), format: '0' };
      };
      cols.push(
        { title: 'MIDTERM LEC GRADE', width: 14, value: part('Midterm', 'lecture') },
        { title: 'MIDTERM LAB GRADE', width: 14, value: part('Midterm', 'laboratory') },
        { title: 'TOTAL', width: 10, value: r => numCell(M(r), '0') },
        { title: `MG (${midShare}%)`, width: 11, value: half(M, midShare) },
        { title: 'FINAL LEC GRADE', width: 14, value: part('Final', 'lecture') },
        { title: 'FINAL LAB GRADE', width: 14, value: part('Final', 'laboratory') },
        { title: 'TOTAL', width: 10, value: r => numCell(F(r), '0') },
        { title: `TFG (${finShare}%)`, width: 11, value: half(F, finShare) },
      );
    } else {
      // A Lecture-only course rounds once, so MG and TFG keep one decimal and the row adds up (X9).
      const half = (grade: (r: Row) => number | null, share: number) => (r: Row): Cell => {
        const g = grade(r);
        return g === null ? INC : { value: g * share / 100, format: '0.0' };
      };
      cols.push(
        { title: 'MIDTERM GRADE', width: 14, value: r => numCell(M(r), '0') },
        { title: `MG (${midShare}%)`, width: 11, value: half(M, midShare) },
        { title: 'FINAL GRADE', width: 14, value: r => numCell(F(r), '0') },
        { title: `TFG (${finShare}%)`, width: 11, value: half(F, finShare) },
      );
    }
    cols.push(
      { title: 'FG (100%)', width: 11, value: r => numCell(courseGrade(r), '0') },
      { title: 'MG EQUIV', width: 11, value: r => equiv(M(r)) },
      { title: 'TFG EQUIV', width: 11, value: r => equiv(F(r)) },
      { title: 'FG EQUIV', width: 11, value: r => equiv(courseGrade(r), courseGwa(r)) },
    );
    return {
      sheet: 'TFG',
      data: [cols.map(c => head(c.title)), ...rows.map(r => cols.map(c => c.value(r)))],
      columns: cols.map(c => ({ width: c.width })), stickyRowsCount: 1, stickyColumnsCount: 2, orientation: 'landscape',
    };
  };

  // ---------- DATA (X10) ----------
  const dataSheet = (): XlsxSheet => ({
    sheet: 'DATA',
    data: [
      [head('PERCENT %'), head('PS')],
      ...Array.from({ length: 101 }, (_v, p): Cell[] => [{ value: p, format: '0' }, { value: percentageToGWAExact(p), format: '0.0#' }]),
    ],
    columns: [{ width: 12 }, { width: 8 }], stickyRowsCount: 1,
  });

  return [componentSheet('lecture'), ...(split ? [componentSheet('laboratory')] : []), tfgSheet(), dataSheet()];
}

/** Builds the workbook and saves it (Grade Computation and Reports -> Academic, X1). */
export function downloadOfficialGradeSheet(input: OfficialGradeSheetInput): Promise<void> {
  return downloadXlsx(officialGradeSheetFileName({ ...input.course, code: input.course.code }), buildOfficialGradeSheet(input));
}

/**
 * One-sheet Grade Summary for classes whose Grade Weights are not the official layout (combined or not set up):
 * the same columns and values the CSV ledger had, as numbers where they are numbers.
 */
export function buildGradeSummarySheet(a: {
  students: Student[];
  subjectCode: string;
  periodMode: boolean;
  /** Server results by student id; empty for past classes (their saved grade is read instead). */
  results: Record<string, FacultyGradeComputeResult | undefined>;
  course: { code: string; title: string; section: string; semester: string; schoolYear: string };
  by: string;
}): XlsxSheet {
  const sorted = [...a.students].sort((x, y) => (x.lastName?.trim() || x.name).toLowerCase().localeCompare((y.lastName?.trim() || y.name).toLowerCase()) || x.name.localeCompare(y.name));
  const pct = (v: number | null, status: string, reasons: string[]) =>
    v !== null ? v : status === 'pending' ? 'Pending' : reasons.length ? `Incomplete (${reasons[0]})` : 'Incomplete';
  const rows = sorted.map(student => {
    const subj = student.enrolledSubjects.find(sub => sub.code === a.subjectCode);
    if (a.periodMode) {
      const e = extractPeriodEvaluation(subj, a.results[student.id], true);
      const grade = e.overallGwa !== null ? e.overallGwa
        : e.historicalGwa !== null ? `Prior: ${e.historicalGwa} (Historical)` : e.statusText === 'PENDING' ? 'Pending' : 'Incomplete';
      return [student.studentId, student.name, pct(e.midtermPercentage, e.midtermStatus, e.midtermReasons), pct(e.finalPercentage, e.finalStatus, e.finalReasons), grade, e.statusText];
    }
    const c = subj?.components as Record<string, unknown> | undefined;
    const part = (k: string) => (typeof c?.[k] === 'number' ? (c[k] as number) : '—');
    const graded = subj && typeof subj.grade === 'number' && subj.grade > 0;
    return [student.studentId, student.name, part('quizzes'), part('practicum'), part('exams'), part('attendance'), graded ? subj!.grade : '—', graded ? (subj!.grade === 5 ? 'FAILED' : 'PASS') : 'UNCOMPUTED'];
  });
  const columns = a.periodMode
    ? [{ header: 'Student Number', width: 18 }, { header: 'Student Name', width: 32 }, { header: 'Midterm %', width: 16, format: '0.00' }, { header: 'Final %', width: 16, format: '0.00' }, { header: 'Overall Grade', width: 16, format: '0.0#' }, { header: 'Status', width: 14 }]
    : [{ header: 'Student Number', width: 18 }, { header: 'Student Name', width: 32 }, { header: 'Quizzes', width: 12, format: '0.0' }, { header: 'Practicum', width: 12, format: '0.0' }, { header: 'Exams', width: 12, format: '0.0' }, { header: 'Attendance', width: 12, format: '0.0' }, { header: 'Overall Grade', width: 16, format: '0.0#' }, { header: 'Remarks', width: 14 }];
  return buildReportSheet({
    sheet: 'Grade Summary', title: 'GRADE SUMMARY', filter: `${a.course.code} · ${a.course.title} · ${a.course.section}`,
    term: termLine(a.course.semester, a.course.schoolYear), by: a.by, columns, rows,
  });
}
