import type { ReportColumn, ReportValue } from './reportWorkbook';
import { ibuHeader, ibuTitleRow, type Cell, type XlsxSheet } from './xlsxDownload.ts';

export interface FacultyAcademicSummaryValues {
  studentNumber: string;
  studentName: string;
  midtermLecture?: string;
  midtermLaboratory?: string;
  midterm: string;
  finalsLecture?: string;
  finalsLaboratory?: string;
  finals: string;
  grade: string;
  remarks: string;
}

export interface FacultyAcademicSummaryTable {
  columns: ReportColumn[];
  rows: ReportValue[][];
}

/** Builds the same single table shown in Faculty Reports → Grades & Assessment Summary. */
export function buildFacultyAcademicSummaryTable(
  lectureLaboratory: boolean,
  values: FacultyAcademicSummaryValues[],
): FacultyAcademicSummaryTable {
  const columns: ReportColumn[] = [
    { header: 'Student No.', width: 14 },
    { header: 'Student Name', width: 24, wrap: true },
    ...(lectureLaboratory ? [
      { header: 'Midterm Lecture', width: 16 },
      { header: 'Midterm Laboratory', width: 18 },
    ] : []),
    { header: 'Midterm', width: 13 },
    ...(lectureLaboratory ? [
      { header: 'Finals Lecture', width: 16 },
      { header: 'Finals Laboratory', width: 18 },
    ] : []),
    { header: lectureLaboratory ? 'Finals' : 'Final', width: 13 },
    { header: 'Grade', width: 10 },
    { header: 'Remarks', width: 22 },
  ];
  const rows: ReportValue[][] = values.map(value => [
    value.studentNumber,
    value.studentName,
    ...(lectureLaboratory ? [value.midtermLecture ?? '', value.midtermLaboratory ?? ''] : []),
    value.midterm,
    ...(lectureLaboratory ? [value.finalsLecture ?? '', value.finalsLaboratory ?? ''] : []),
    value.finals,
    value.grade,
    value.remarks,
  ]);
  return { columns, rows };
}

/** Builds the Reports grade table in the same ledger layout used by Grade Computation exports. */
export function buildFacultyAcademicSummarySheet(input: {
  table: FacultyAcademicSummaryTable;
  lectureLaboratory: boolean;
  courseLabel: string;
  section: string;
  term: string;
  by: string;
  generated: string;
}): XlsxSheet {
  const width = input.table.columns.length;
  const blankRow = (): Cell[] => Array.from({ length: width }, () => null);
  const titleLines = [
    'Republic of the Philippines',
    'BICOL UNIVERSITY',
    'COLLEGE OF DENTAL MEDICINE',
    'CLASS GRADE LEDGER REPORT',
    input.courseLabel,
    `Section: ${input.section}`,
    input.term,
    `Date: ${input.generated} · Faculty: ${input.by}`,
  ];
  const data: Cell[][] = titleLines.map((value, index) => {
    const row = blankRow();
    row[0] = ibuTitleRow({ value, columnSpan: width, align: index < 3 ? 'center' : 'left' }, index) as Cell;
    return row;
  });
  data.push(blankRow());
  const header = blankRow();
  const headerCell = (value: string, span: number, rowSpan = 1) => ibuHeader({ value, columnSpan: span, rowSpan, align: 'center', wrap: true }) as Cell;
  if (input.lectureLaboratory) {
    header[0] = headerCell('STUDENT NO.', 1, 2);
    header[1] = headerCell('STUDENT NAME', 1, 2);
    header[2] = headerCell('MIDTERM', 3);
    header[5] = headerCell('FINALS', 3);
    header[8] = headerCell('FINAL GRADE', 1, 2);
    header[9] = headerCell('REMARKS', 1, 2);
    const detailHeader = blankRow();
    ['LECTURE %', 'LABORATORY %', 'MIDTERM %', 'LECTURE %', 'LABORATORY %', 'FINALS %'].forEach((label, index) => {
      detailHeader[index + 2] = headerCell(label, 1);
    });
    data.push(header, detailHeader);
  } else {
    input.table.columns.forEach((column, index) => { header[index] = headerCell(column.header, 1); });
    data.push(header);
  }
  for (const row of input.table.rows) data.push(row.map(value => value === null || value === undefined ? '' : value));

  return {
    sheet: 'Grade Ledger',
    data,
    columns: input.table.columns.map(column => ({ width: column.width })),
    stickyRowsCount: input.lectureLaboratory ? 11 : 10,
    stickyColumnsCount: 2,
    orientation: 'landscape',
  };
}
