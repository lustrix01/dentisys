// Official grade sheet (.xlsx) export: pure builder (contract docs/contracts/official-exports.md, X1-X13, X23-X26).
// Every grade cell holds a value DentiSys already computed on the server (X6); this file only lays them out.
import type { Assessment, AttendanceStatus, Student } from '../types/index.ts';
import type { FacultyGradeComputeResult, FacultyGradingCategoryItem, FacultyGradingConfiguration, FacultyPeriodBreakdown, FacultyRemedialProgression } from '../services/apiClient.ts';
import { extractPeriodEvaluation } from './periodGradingHelper.ts';
import type { StudentPeriodEvaluation } from './periodGradingHelper.ts';
import { buildReportSheet, termLine } from './reportWorkbook.ts';
import type { ReportColumn } from './reportWorkbook.ts';
import { effectiveAssessmentPercentage, formatGrade, percentageToGWAExact, roundPercent } from './gradeHelper.ts';
import { parseSemester } from './gradeSheetImport.ts';
import { downloadXlsx, ibuHeader, ibuTitleRow } from './xlsxDownload.ts';
import type { Cell, CellObject, XlsxSheet } from './xlsxDownload.ts';

type Period = 'Midterm' | 'Final';
type Comp = 'lecture' | 'laboratory';

export interface OfficialSheetStudent { id: string; name: string; studentId?: string; firstName?: string; middleName?: string | null; lastName?: string }

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

const INC: CellObject = { value: 'INC', fontWeight: 'bold', textColor: '#B42318', align: 'center' };
const UNIVERSITY_LINES = ['Republic of the Philippines', 'BICOL UNIVERSITY', 'COLLEGE OF DENTAL MEDICINE'];

const head = (value: string | number, extra: Partial<CellObject> = {}): CellObject =>
  ibuHeader({ value, align: 'center', alignVertical: 'center', wrap: true, ...extra });
const numCell = (value: number | null | undefined, format?: string): Cell =>
  typeof value !== 'number' || !Number.isFinite(value) ? INC : format ? { value, format } : { value };
const equiv = (percent: number | null | undefined, gwa?: number | null): Cell =>
  typeof percent !== 'number' ? INC : { value: typeof gwa === 'number' ? gwa : percentageToGWAExact(percent), format: '0.0#' };

const alnum = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
const fileToken = (text: string) => text.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '');

const lastNameOf = (s: OfficialSheetStudent) => s.lastName?.trim() || s.name.trim().split(/\s+/).pop() || s.name;
/** `LAST, First Middle` (X11). */
export const sheetName = (s: Pick<OfficialSheetStudent, 'name' | 'firstName' | 'middleName' | 'lastName'>) =>
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

/** Reports -> Grades & Assessments "Grade Summary" in iBU's columns (contract X28). */
export const IBU_SUMMARY_COLUMNS: ReportColumn[] = [
  { header: 'Student Number', width: 16 }, { header: 'Full Name', width: 32 }, { header: 'Status', width: 12 },
  { header: 'Midterm', width: 11, format: '0.0#' }, { header: 'Tentative', width: 11, format: '0.0#' }, { header: 'Final', width: 11, format: '0.0#' },
  { header: 'Completion', width: 18 }, { header: 'Notes', width: 32 },
];

export interface IbuGradeSummaryRow {
  studentNumber: string;
  fullName: string;
  status: 'Passed' | 'Failed' | 'Remedial' | 'INC' | '';
  /** Grades (MG, TFG and FG equivalents as on the official TFG sheet); 'INC' when incomplete, null while pending. */
  midterm: number | 'INC' | null;
  tentative: number | 'INC' | null;
  final: number | 'INC' | null;
  completion: string;
  notes: string;
}

/** One Grade Summary row from the server-backed evaluation and the enrollment's remedial progression; nothing is recomputed differently from the TFG sheet. */
export function ibuGradeSummaryRow(a: {
  student: Pick<OfficialSheetStudent, 'name' | 'firstName' | 'middleName' | 'lastName'> & { studentId: string };
  evaluation: StudentPeriodEvaluation;
  progression?: FacultyRemedialProgression | null;
}): IbuGradeSummaryRow {
  const e = a.evaluation;
  // Same split as Reports.tsx courseRemark (~line 511): no overall grade yet is PENDING (blank), never INC.
  // INC only where a score was entered but another is missing (the server's "Missing Assessment Score" reason, X8).
  const missing = (reasons: string[]) => reasons.includes('Missing Assessment Score');
  const period = (status: string, pct: number | null, reasons: string[]): number | 'INC' | null =>
    status === 'computed' && pct !== null ? percentageToGWAExact(pct) : status === 'incomplete' && missing(reasons) ? 'INC' : null;
  const midterm = period(e.midtermStatus, e.midtermPercentage, e.midtermReasons);
  const tentative = period(e.finalStatus, e.finalPercentage, e.finalReasons);
  const final = e.overallGwa !== null ? e.overallGwa : midterm === 'INC' || tentative === 'INC' ? 'INC' : null;
  const p = a.progression;
  // A recorded remedial pass or passed cost recovery clears the course; Final stays the original grade.
  const status = (grade: number): IbuGradeSummaryRow['status'] =>
    p?.stage === 'passed' || p?.stage === 'cost_recovery_passed' ? 'Passed'
      : p?.stage === 'cost_recovery_failed' || grade === 5 ? 'Failed' : grade >= 2.5 ? 'Remedial' : 'Passed';
  const completion = p?.stage === 'passed' ? 'Remedial passed'
    : p?.costRecovery && (p.stage === 'cost_recovery_passed' || p.stage === 'cost_recovery_failed') ? formatGrade(p.costRecovery.finalGrade) : '';
  const remedialNote: Partial<Record<FacultyRemedialProgression['stage'], string>> = {
    attempt_1_pending: 'Remedial attempt 1 scheduled', attempt_2_available: 'Remedial attempt 1 failed', attempt_2_pending: 'Remedial attempt 2 scheduled',
    cost_recovery_required: 'Cost recovery required', cost_recovery_passed: 'Cost recovery passed', cost_recovery_failed: 'Cost recovery failed',
    passed: `Remedial attempt ${p?.passedAttempt ?? ''} passed`.replace('  ', ' '),
  };
  const notes = (p && remedialNote[p.stage])
    || (tentative === 'INC' ? 'Missing Finals scores' : midterm === 'INC' ? 'Missing Midterm scores' : '');
  return {
    studentNumber: a.student.studentId, fullName: sheetName(a.student),
    status: final === 'INC' ? 'INC' : final === null ? '' : status(final),
    midterm, tentative, final, completion, notes,
  };
}

/** Plain values of a sheet (merged-cell fillers are null): what the importer reads back, and what tests compare. */
export function sheetValues(sheet: XlsxSheet): Array<Array<string | number | boolean | null>> {
  return sheet.data.map((row: any[]) => row.map((c: any) => {
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

/** One combined grading matrix for Excel and the matching PDF (Owner-approved replacement for the legacy four-tab layout). */
export function buildOfficialGradeSheet(input: OfficialGradeSheetInput): XlsxSheet[] {
  const { config, course } = input;
  if (!isOfficialLayout(config)) throw new Error('Set up and save the grade weights (Midterm and Finals) before exporting the grade sheet.');
  const split = config.componentMode === 'lecture_laboratory';
  const midShare = Number(config.termRatio?.midterm ?? 50);
  const finalShare = Number(config.termRatio?.final ?? 50);
  const components: Array<{ key: Comp; label: string }> = split
    ? [{ key: 'lecture', label: 'Lecture' }, { key: 'laboratory', label: 'Laboratory' }]
    : [{ key: 'lecture', label: 'Lecture' }];
  const sorted = [...input.students].sort((a, b) => lastNameOf(a).toLowerCase().localeCompare(lastNameOf(b).toLowerCase()) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  const rows: Row[] = sorted.map((student, index) => ({ index, student, result: input.results[student.id] }));
  const scoreOf = new Map(input.scores.map(s => [`${s.studentId}|${s.assessmentId}`, s.score]));
  const periods: Array<{ key: Period; label: string }> = [{ key: 'Midterm', label: 'Midterm' }, { key: 'Final', label: 'Finals' }];
  const periodOf = (r: Row, p: Period) => r.result?.periods?.[p === 'Midterm' ? 'midterm' : 'final'];
  const periodGrade = (r: Row, p: Period): number | null => {
    const value = periodOf(r, p)?.percentage;
    return typeof value === 'number' ? value : null;
  };
  const courseGrade = (r: Row): number | null => r.result?.status === 'computed' && typeof r.result.percentage === 'number' ? r.result.percentage : null;
  const categoriesOf = (p: Period, comp: Comp) => [...((p === 'Midterm' ? config.midtermCategories : config.finalCategories) ?? [])]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .filter(category => {
      if (!split) return true;
      const component = (category.component ?? 'Lecture').toLowerCase();
      return comp === 'lecture' ? component === 'lecture' : component === 'laboratory' || component === 'lab';
    });
  const groups = periods.flatMap(period => components.flatMap(component => categoriesOf(period.key, component.key).map(category => {
    const assessments = input.assessments
      .filter(a => category.sourceKind !== 'attendance' && category.id != null && String(a.gradingCategoryId ?? '') === String(category.id) && (a.gradingPeriod ?? 'Midterm') === period.key)
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || a.title.localeCompare(b.title));
    const categoryCells = assessments.length ? assessments.map(assessment => ({ title: assessment.title, max: assessment.maxScore, assessment })) : [{ title: category.name, max: null, assessment: null }];
    return { period: period.key, periodLabel: period.label, component: component.key, componentLabel: component.label, category, assessments, categoryCells };
  })));
  type MatrixGroup = typeof groups[number];
  const groupWidth = (g: MatrixGroup) => g.categoryCells.length * 3 + 2;
  const resultWidth = 6;
  const totalWidth = 2 + groups.reduce((sum, group) => sum + groupWidth(group), 0) + resultWidth;
  const blank = (): Cell[] => Array.from({ length: totalWidth }, () => null);
  const periodHeader = blank(), componentHeader = blank(), categoryHeader = blank(), assessmentHeader = blank(), detailHeader = blank();
  periodHeader[0] = head('Student No.', { rowSpan: 5 });
  periodHeader[1] = head('Full Name', { rowSpan: 5 });
  const spans = (row: Cell[], same: (a: MatrixGroup, b: MatrixGroup) => boolean, label: (g: MatrixGroup) => string) => {
    let i = 0, offset = 2;
    while (i < groups.length) {
      let end = i + 1, span = groupWidth(groups[i]);
      while (end < groups.length && same(groups[i], groups[end])) span += groupWidth(groups[end++]);
      row[offset] = head(label(groups[i]), { columnSpan: span });
      offset += span;
      i = end;
    }
  };
  spans(periodHeader, (a, b) => a.period === b.period, g => g.periodLabel);
  spans(componentHeader, (a, b) => a.period === b.period && a.component === b.component, g => g.componentLabel);
  let at = 2;
  for (const group of groups) {
    const categoryTitle = `${group.category.name} (${Number(group.category.weight)}%)`;
    categoryHeader[at] = head(categoryTitle, { columnSpan: groupWidth(group) });
    for (const item of group.categoryCells) {
      const assessment = item.assessment;
      assessmentHeader[at] = head(assessment ? `${item.title} (Max ${item.max})` : item.title, { columnSpan: 3 });
      detailHeader[at] = head('Score');
      detailHeader[at + 1] = head('%');
      detailHeader[at + 2] = head('Transmuted');
      at += 3;
    }
    assessmentHeader[at] = head('Average %', { rowSpan: 2 });
    assessmentHeader[at + 1] = head(`Weighted (${Number(group.category.weight)}%)`, { rowSpan: 2 });
    at += 2;
  }
  const resultGroups = [
    { title: 'Midterm Results', labels: ['Midterm %', 'Grade Eq.'] },
    { title: 'Finals Results', labels: ['Finals %', 'Grade Eq.'] },
    { title: 'Overall Result', labels: ['Final Grade %', 'Grade Eq.'] },
  ];
  for (const resultGroup of resultGroups) {
    periodHeader[at] = head(resultGroup.title, { columnSpan: 2 });
    componentHeader[at] = head('Summary', { columnSpan: 2 });
    categoryHeader[at] = head('Grade', { columnSpan: 2 });
    assessmentHeader[at] = head(resultGroup.labels[0]);
    assessmentHeader[at + 1] = head(resultGroup.labels[1]);
    at += 2;
  }
  const titleTerm = `${parseSemester(course.semester) === 'SUMMER' ? 'SUMMER' : `${parseSemester(course.semester) ?? course.semester.toUpperCase()} SEMESTER`}, AY ${course.schoolYear}`;
  const titleRows: Cell[][] = [...UNIVERSITY_LINES, `${course.title.toUpperCase()} · COMPREHENSIVE GRADE SHEET`, `${course.section} · ${titleTerm}`].map((title, index) => {
    const row = blank();
    row[0] = ibuTitleRow({ value: title, columnSpan: totalWidth, align: 'center' }, index) as Cell;
    return row;
  });
  const body = rows.map(row => {
    const cells: Cell[] = [{ value: row.student.studentId ?? '' }, { value: sheetName(row.student), align: 'left' }];
    for (const group of groups) {
      const detail = periodOf(row, group.period)?.categories?.find(item => String(item.categoryId) === String(group.category.id));
      for (const item of group.categoryCells) {
        const assessment = item.assessment;
        if (!assessment) {
          const points = detail?.earnedPoints;
          const ratio = detail?.ratio;
          cells.push(numCell(points, '0.##'), numCell(ratio === undefined ? null : ratio * 100, '0.00'), numCell(ratio === undefined ? null : ratio * 100, '0.00'));
          continue;
        }
        const score = scoreOf.get(`${row.student.id}|${assessment.id}`);
        const raw = score === undefined || !assessment.maxScore ? null : score / assessment.maxScore * 100;
        const linked = Boolean(assessment.attendanceSessionDate && assessment.attendanceSessionCode);
        const effective = score === undefined ? null : effectiveAssessmentPercentage(score, assessment.maxScore, assessment,
          linked ? input.attendanceStatus?.(row.student.id, assessment) ?? null : 'unlinked');
        cells.push(score === undefined ? null : { value: score, format: '0.##' }, raw === null ? null : numCell(raw, '0.00'), effective === null ? null : numCell(effective, '0.00'));
      }
      cells.push(numCell(detail?.earnedPoints, '0.00'), numCell(detail?.contribution, '0.00'));
    }
    const midterm = periodGrade(row, 'Midterm'), finals = periodGrade(row, 'Final'), overall = courseGrade(row);
    cells.push(numCell(midterm, '0.00'), equiv(midterm), numCell(finals, '0.00'), equiv(finals), numCell(overall, '0.00'), equiv(overall, row.result?.gwa));
    return cells;
  });
  return [{
    sheet: 'Grade Sheet',
    data: [...titleRows, periodHeader, componentHeader, categoryHeader, assessmentHeader, detailHeader, ...body],
    columns: [{ width: 17 }, { width: 30 }, ...groups.flatMap(group => [
      ...group.categoryCells.flatMap(() => [{ width: 11 }, { width: 10 }, { width: 12 }]), { width: 11 }, { width: 12 },
    ]), { width: 13 }, { width: 11 }, { width: 13 }, { width: 11 }, { width: 14 }, { width: 11 }],
    stickyRowsCount: titleRows.length + 5, stickyColumnsCount: 2, orientation: 'landscape',
  }];
}

/** Print-only pages divide the wide matrix by period; Export Excel keeps its single combined worksheet. */
export function buildGradeSheetPdfPeriods(sheets: XlsxSheet[]): XlsxSheet[] {
  const matrix = sheets.find(sheet => sheet.sheet === 'Grade Sheet');
  if (!matrix) return sheets;
  const data = matrix.data as Cell[][];
  const periodHeaderRow = data[5] ?? [];
  const resultHeaderRow = data[8] ?? [];
  const assessmentHeaderRow = data[8] ?? [];
  const resultsStart = resultHeaderRow.findIndex(cell => cell && typeof cell === 'object' && (cell as CellObject).value === 'Midterm %');
  if (resultsStart < 0) return sheets;
  const valueOf = (cell: Cell) => cell && typeof cell === 'object' ? (cell as CellObject).value : cell;
  const spanOf = (cell: Cell) => cell && typeof cell === 'object' && typeof (cell as CellObject).columnSpan === 'number' ? Number((cell as CellObject).columnSpan) : 1;
    const headers = data.slice(5, 10);
  const bodyRows = data.slice(10);
  const periods = [
    { key: 'Midterm', resultIndexes: [resultsStart, resultsStart + 1] },
    { key: 'Finals', resultIndexes: [resultsStart + 2, resultsStart + 3, resultsStart + 4, resultsStart + 5] },
  ];
  return periods.flatMap(period => {
    const periodCellIndex = periodHeaderRow.findIndex(cell => valueOf(cell) === period.key);
    if (periodCellIndex < 0) return [];
    const periodStart = periodCellIndex;
    const periodEnd = periodStart + spanOf(periodHeaderRow[periodCellIndex]);
    const assessmentColumns: number[] = [];
    for (let column = periodStart; column < periodEnd;) {
      const headerCell = assessmentHeaderRow[column];
      const span = spanOf(headerCell);
      if (headerCell !== null && headerCell !== undefined) assessmentColumns.push(column);
      column += span;
    }
    const selectedColumns = [...new Set([
      0, 1,
      ...assessmentColumns,
      ...period.resultIndexes,
    ])].sort((a, b) => a - b);
    const positions = new Map(selectedColumns.map((column, index) => [column, index]));
    const pageWidth = selectedColumns.length;
    const pageHeaders = headers.map(row => {
      const next: Cell[] = Array.from({ length: pageWidth }, () => null);
      for (let oldColumn = 0; oldColumn < row.length;) {
        const cell = row[oldColumn];
        const cellSpan = spanOf(cell);
        if (cell !== null && cell !== undefined) {
          const kept = selectedColumns.filter(column => column >= oldColumn && column < oldColumn + cellSpan);
          if (kept.length) {
            const newColumn = positions.get(kept[0])!;
            next[newColumn] = { ...(cell as CellObject), columnSpan: kept.length };
          }
        }
        oldColumn += cellSpan;
      }
      return next;
    });
    const pageBody = bodyRows.map(row => selectedColumns.map(column => row[column] ?? null));
    const columns = selectedColumns.map(column => matrix.columns?.[column] ?? { width: 10 });
    return [{
      sheet: `${period.key} Grade Sheet`,
      data: [...pageHeaders, ...pageBody],
      columns,
      stickyRowsCount: pageHeaders.length,
      stickyColumnsCount: 2,
      orientation: 'landscape',
    } as XlsxSheet];
  });
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
      return [student.studentId, sheetName(student), pct(e.midtermPercentage, e.midtermStatus, e.midtermReasons), pct(e.finalPercentage, e.finalStatus, e.finalReasons), grade, e.statusText];
    }
    const c = subj?.components as Record<string, unknown> | undefined;
    const part = (k: string) => (typeof c?.[k] === 'number' ? (c[k] as number) : '—');
    const graded = subj && typeof subj.grade === 'number' && subj.grade > 0;
    return [student.studentId, sheetName(student), part('quizzes'), part('practicum'), part('exams'), part('attendance'), graded ? subj!.grade : '—', graded ? (subj!.grade === 5 ? 'FAILED' : 'PASS') : 'UNCOMPUTED'];
  });
  const columns = a.periodMode
    ? [{ header: 'Student Number', width: 18 }, { header: 'Student Name', width: 32 }, { header: 'Midterm %', width: 16, format: '0.00' }, { header: 'Final %', width: 16, format: '0.00' }, { header: 'Overall Grade', width: 16, format: '0.0#' }, { header: 'Status', width: 14 }]
    : [{ header: 'Student Number', width: 18 }, { header: 'Student Name', width: 32 }, { header: 'Quizzes', width: 12, format: '0.0' }, { header: 'Practicum', width: 12, format: '0.0' }, { header: 'Exams', width: 12, format: '0.0' }, { header: 'Attendance', width: 12, format: '0.0' }, { header: 'Overall Grade', width: 16, format: '0.0#' }, { header: 'Remarks', width: 14 }];
  return buildReportSheet({
    sheet: 'Grade Summary', title: 'GRADE SUMMARY', filter: `${a.course.code} · ${a.course.title} · ${a.course.section}`,
    term: termLine(a.course.semester, a.course.schoolYear), by: a.by, columns, rows,
  });
}
