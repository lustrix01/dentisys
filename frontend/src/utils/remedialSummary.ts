// Remedial summary (contract docs/contracts/official-exports.md, X32): every enrollment that entered remedial, one row each.
// Pure builder over per-enrollment rows; the Faculty and Dean pages each adapt their own data to RemedialSummaryRow.
import type { FacultyRemedialProgression, FacultyRetentionRecord } from '../services/apiClient.ts';
import { dayToDate } from './reportWorkbook.ts';
import type { ReportColumn, ReportValue } from './reportWorkbook.ts';

export interface RemedialSummaryRow {
  studentNumber: string | null;
  /** Already `LAST, First Middle`. */
  studentName: string;
  courseCode: string | null;
  section: string | null;
  finalGrade: number | null;
  /** Server retention state of the enrollment: remedial, irregular_reenrollment, cleared, ... */
  state: string | null;
  progression?: FacultyRemedialProgression | null;
}

export interface RemedialSummaryTable {
  fileName: string;
  title: string;
  filter: string;
  term: string;
  columns: ReportColumn[];
  rows: ReportValue[][];
}

/** An enrollment is in the summary once it entered remedial: now, or at any time before (attempt or cost recovery recorded). */
export const enteredRemedial = (row: RemedialSummaryRow): boolean =>
  row.state === 'remedial' || row.state === 'irregular_reenrollment'
  || (row.progression?.attempts.length ?? 0) > 0 || Boolean(row.progression?.costRecovery);

/** True when a faculty retention record represents current or historical retention/remedial involvement. */
export const hasRetentionOrRemedialHistory = (record: FacultyRetentionRecord): boolean =>
  record.state === 'remedial'
  || record.state === 'irregular_reenrollment'
  || record.state === 'cleared'
  || (record.remedialProgression?.attempts?.length ?? 0) > 0
  || Boolean(record.remedialProgression?.costRecovery)
  || Boolean(record.remedialProgression?.cleared)
  || (Boolean(record.remedialProgression?.stage) && record.remedialProgression?.stage !== 'none')
  || Boolean(record.remedial && Object.keys(record.remedial).length > 0);

/** Filters a student list to students with a matching retention or remedial record for the selected school year and class. */
export function filterRetentionListStudents<T extends { id: string | number }>(
  students: T[],
  retentionRecords: FacultyRetentionRecord[],
  selectedSchoolYear: string,
  selectedClassId?: string,
): T[] {
  const qualifyingIds = new Set<string>(
    retentionRecords
      .filter(record =>
        (selectedSchoolYear === 'all' || !record.schoolYear || record.schoolYear === selectedSchoolYear)
        && (!selectedClassId || String(record.classId) === selectedClassId)
        && hasRetentionOrRemedialHistory(record),
      )
      .map(record => String(record.studentId)),
  );
  return students.filter(student => qualifyingIds.has(String(student.id)));
}

/** Same wording as the Faculty Remedial Record. */
export function remedialStatusText(row: RemedialSummaryRow): string {
  if (row.state === 'irregular_reenrollment') return 'Irregular reenrollment';
  switch (row.progression?.stage) {
    case 'attempt_1_pending': return 'Attempt 1 pending';
    case 'attempt_2_pending': return 'Attempt 2 pending';
    case 'passed':
    case 'cost_recovery_passed': return 'Passed';
    case 'cost_recovery_required': return 'Cost recovery required';
    case 'cost_recovery_failed': return 'Failed cost recovery';
    default: return 'Not yet scheduled';
  }
}

const capital = (text: string | null | undefined) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : null);

export function buildRemedialSummaryTable(input: { schoolYear: string; filter: string; rows: RemedialSummaryRow[] }): RemedialSummaryTable {
  const rows = input.rows
    .filter(enteredRemedial)
    .sort((a, b) => a.studentName.localeCompare(b.studentName) || (a.courseCode ?? '').localeCompare(b.courseCode ?? ''))
    .map((row): ReportValue[] => {
      const attempt = (n: 1 | 2) => {
        const found = row.progression?.attempts.find(a => a.attemptNumber === n);
        return [found?.scheduledDate ? dayToDate(found.scheduledDate) : null, found?.percentage ?? null, capital(found?.outcome)];
      };
      const cost = row.progression?.costRecovery;
      return [
        row.studentNumber, row.studentName, row.courseCode, row.section, row.finalGrade,
        ...attempt(1), ...attempt(2),
        cost?.finalGrade ?? null, capital(cost?.outcome),
        remedialStatusText(row),
      ];
    });
  return {
    fileName: `Remedial_Summary_${input.schoolYear.replace(/[\/:*?"<>|\s]+/g, '-')}.xlsx`,
    title: 'REMEDIAL SUMMARY',
    filter: input.filter,
    term: /^\d/.test(input.schoolYear) ? `AY ${input.schoolYear}` : input.schoolYear,
    columns: [
      { header: 'Student No.', width: 14 }, { header: 'Student Name', width: 32 }, { header: 'Course Code', width: 13 }, { header: 'Class Section', width: 14 },
      { header: 'Final Grade', width: 11, format: '0.00' },
      { header: 'Attempt 1 Date', width: 15 }, { header: 'Attempt 1 %', width: 12, format: '0.##' }, { header: 'Attempt 1 Result', width: 15 },
      { header: 'Attempt 2 Date', width: 15 }, { header: 'Attempt 2 %', width: 12, format: '0.##' }, { header: 'Attempt 2 Result', width: 15 },
      { header: 'Cost Recovery Grade', width: 15, format: '0.00' }, { header: 'Cost Recovery Result', width: 17 },
      { header: 'Status', width: 24 },
    ],
    rows,
  };
}
