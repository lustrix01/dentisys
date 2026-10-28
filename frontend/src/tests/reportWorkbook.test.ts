import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClassList, buildReportSheet, dayToDate, exportedLine, HEADER_ROW_INDEX } from '../utils/reportWorkbook.ts';

const cellValue = (c: unknown) => (c && typeof c === 'object' ? (c as { value?: unknown }).value : c);
const rowValues = (row: unknown[]) => row.map(cellValue);
// 27 Oct 2026 06:05 UTC = 14:05 in Manila.
const NOW = new Date(Date.UTC(2026, 9, 27, 6, 5));

test('exported line uses Manila time', () => {
  assert.equal(exportedLine('Dr. Ana Reyes', NOW), 'Exported 27 Oct 2026 14:05 (Manila) by Dr. Ana Reyes');
});

test('tidy table: title block, one frozen bold header, real numbers and dates', () => {
  const sheet = buildReportSheet({
    sheet: 'Attendance', title: 'ATTENDANCE REPORT', filter: 'DM 116 · DMD-3A', term: '1ST SEMESTER, AY 2026-2027', by: 'Dr. Ana Reyes', now: NOW,
    columns: [{ header: 'Date', width: 14 }, { header: 'Student Number', width: 16 }, { header: 'Grade', width: 8, format: '0.00' }],
    rows: [[dayToDate('2026-10-27'), '2023-0101', 1.5], [null, '2023-0102', null]],
  });
  const d = sheet.data;
  assert.deepEqual(d.slice(0, 3).map(r => cellValue(r[0])), ['Republic of the Philippines', 'BICOL UNIVERSITY', 'COLLEGE OF DENTAL MEDICINE']);
  assert.deepEqual(d.slice(3, 7).map(r => cellValue(r[0])), ['ATTENDANCE REPORT', 'DM 116 · DMD-3A', '1ST SEMESTER, AY 2026-2027', 'Exported 27 Oct 2026 14:05 (Manila) by Dr. Ana Reyes']);
  assert.equal((d[3][0] as { fontWeight?: string }).fontWeight, 'bold');
  assert.equal(d[7].length, 0);
  assert.deepEqual(rowValues(d[HEADER_ROW_INDEX]), ['Date', 'Student Number', 'Grade']);
  assert.equal((d[HEADER_ROW_INDEX][0] as { fontWeight?: string }).fontWeight, 'bold');
  assert.equal(sheet.stickyRowsCount, HEADER_ROW_INDEX + 1);
  assert.equal(sheet.orientation, 'landscape');
  const first = d[HEADER_ROW_INDEX + 1] as Array<{ value: unknown; type: unknown; format?: string }>;
  assert.ok(first[0].value instanceof Date);
  assert.equal(first[0].type, Date);
  assert.equal(first[1].value, '2023-0101');
  assert.equal(first[2].type, Number);
  assert.equal(first[2].format, '0.00');
  assert.equal(d[HEADER_ROW_INDEX + 2][0], null);
  assert.equal(d[HEADER_ROW_INDEX + 2][2], null);
});

const classInput = {
  courseCode: 'DM 116', courseTitle: 'Operative Dentistry 1', section: 'DMD-3A', yearLevel: 3, units: 3, lectureUnits: 2, labUnits: 1,
  faculty: 'Dr. Ana Reyes', schedules: 'Mon 8:00-10:00 AM', semester: '1ST', schoolYear: '2026-2027',
  students: [
    { studentId: '2023-0102', name: 'Ben Zamora', firstName: 'Ben', middleName: 'L.', lastName: 'Zamora', email: null, yearLevel: 3 },
    { studentId: '2023-0101', name: 'Ana Cruz', firstName: 'Ana', middleName: null, lastName: 'Cruz', email: 'ana@bicol-u.edu.ph', yearLevel: 3, gender: 'F', contact: '0917' },
  ],
};

test('class list: header block, columns, name cell, total line, program and file name', () => {
  const { fileName, sheet } = buildClassList(classInput);
  assert.equal(fileName, 'DM116_DMD-3A_Class_List_2026-2027_1st.xlsx');
  const d = sheet.data;
  assert.deepEqual(d.slice(0, 5).map(r => cellValue(r[0])), ['Republic of the Philippines', 'BICOL UNIVERSITY', 'COLLEGE OF DENTAL MEDICINE', 'OFFICIAL LIST OF ENROLLED STUDENTS', '1ST SEMESTER, AY 2026-2027']);
  const info = d.slice(6, 14).map(r => [cellValue(r[0]), cellValue(r[2])]);
  assert.deepEqual(info, [
    ['Course Code', 'DM 116'], ['Course Title', 'Operative Dentistry 1'], ['Class Section', 'DMD-3A'], ['Year Level', '3'],
    ['Units', 'Academic 2.0 · Lab 1.0 · Credit 3.0'], ['Lab Hours', ''], ['Faculty', 'Dr. Ana Reyes'], ['Schedules', 'Mon 8:00-10:00 AM'],
  ]);
  const head = d.findIndex(r => cellValue(r[0]) === '#');
  assert.deepEqual(rowValues(d[head]), ['#', 'Student No.', 'Program', 'Name', 'Sex', 'Year Level', 'Contact #']);
  // Sorted by last name; program from the section; name + email on two lines.
  assert.deepEqual(rowValues(d[head + 1]), [1, '2023-0101', 'DMD', 'Cruz, Ana\nana@bicol-u.edu.ph', 'F', 3, '0917']);
  assert.equal((d[head + 1][3] as { wrap?: boolean }).wrap, true);
  assert.deepEqual(rowValues(d[head + 2]), [2, '2023-0102', 'DMD', 'Zamora, Ben L.\nNo University Email', null, 3, null]);
  assert.equal(cellValue(d[d.length - 1][0]), 'Total Number of Students: 2');
  assert.equal(sheet.orientation, 'landscape');
});
