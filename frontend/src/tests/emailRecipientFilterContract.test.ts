import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { courseOptions, sectionOptions, studentOptions } from '../utils/emailRecipientFilter.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(here, '../pages/faculty/EmailManagement.tsx'), 'utf8');

const classes = [
  { csId: 1, csName: 'A', courseCode: 'DENT1', courseTitle: 'Anatomy' },
  { csId: 2, csName: 'B', courseCode: 'DENT1', courseTitle: 'Anatomy' },
  { csId: 3, csName: 'C', courseCode: 'DENT2', courseTitle: 'Pathology' },
];
const students = [
  { id: '10', name: 'Zed', classSections: [{ classId: '1', className: 'A' }] },
  { id: '11', name: 'Ana', classSections: [{ classId: '2', className: 'B' }, { classId: '3', className: 'C' }] },
];

test('5.7 courses are distinct; sections list only the chosen course', () => {
  assert.deepEqual(courseOptions(classes).map(c => c.code), ['DENT1', 'DENT2']);
  assert.deepEqual(sectionOptions(classes, 'DENT1').map(c => c.csId), [1, 2]);
  assert.equal(sectionOptions(classes, 'all').length, 3);
});

test('5.7 students narrow to the chosen section, then course, and sort by name', () => {
  assert.deepEqual(studentOptions(students, classes, 'DENT1', '1').map(s => s.id), ['10']);
  assert.deepEqual(studentOptions(students, classes, 'DENT1', 'all').map(s => s.id), ['11', '10']);
  assert.deepEqual(studentOptions(students, classes, 'DENT2', 'all').map(s => s.id), ['11']);
});

test('5.7 the page resets a section or student that no longer belongs to the cascade', () => {
  assert.match(page, /setSelectedClassId\('all'\)/);
  assert.match(page, /setSelectedStudentId\('all'\)/);
  assert.match(page, /aria-label="Course"/);
  assert.match(page, /aria-label="Student"/);
});
