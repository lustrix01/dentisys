import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceForClass, buildClassCards, standingInClass, studentInClass } from '../pages/admin/deanClasses.ts';

const item = (classId: string, className: string, retentionState: string, grade: number | null) => ({
  classId, className, code: `C-${classId}`, name: `Course ${classId}`, instructorName: `Prof ${classId}`, classFinished: false, retentionState, grade,
});

// Student-level fields mimic the API: classId/className are the LAST enrollment; status is already the page-level standing.
const two = {
  id: 'a', yearLevel: 4, status: 'remedial', classId: '20', className: 'CLASS-20',
  enrolledSubjects: [item('10', 'CLASS-10', 'active', 2.0), item('20', 'CLASS-20', 'remedial', 3.5)],
};
const one = { id: 'b', yearLevel: 4, status: 'noGrade', classId: '10', className: 'CLASS-10', enrolledSubjects: [item('10', 'CLASS-10', 'active', null)] };
const none = { id: 'c', yearLevel: 1, status: 'noGrade', classId: null, className: null, enrolledSubjects: [] };
const never = () => false;

test('a student enrolled in classes 10 and 20 appears in both cards', () => {
  const cards = buildClassCards([two, one, none], never);
  const byId = Object.fromEntries(cards.map(c => [c.id, c]));
  assert.deepEqual(byId['10'].students.map(s => s.id), ['a', 'b']);
  assert.deepEqual(byId['20'].students.map(s => s.id), ['a']);
  assert.deepEqual(byId['unassigned'].students.map(s => s.id), ['c']);
  assert.equal(byId['10'].name, 'CLASS-10');
  assert.equal(byId['10'].subjectCode, 'C-10');
  assert.equal(byId['10'].instructorName, 'Prof 10');
});

test('studentInClass is true for each enrolled class and unassigned only without enrollments', () => {
  assert.equal(studentInClass(two, '10'), true);
  assert.equal(studentInClass(two, '20'), true);
  assert.equal(studentInClass(two, '30'), false);
  assert.equal(studentInClass(two, 'unassigned'), false);
  assert.equal(studentInClass(none, 'unassigned'), true);
});

test('card counts include students whose last enrollment is another class (15 vs 12 style)', () => {
  const lastElsewhere = ['x1', 'x2', 'x3'].map(id => ({
    id, yearLevel: 4, status: 'active', classId: '99', className: 'OTHER',
    enrolledSubjects: [item('10', 'CLASS-10', 'active', 1.5), item('99', 'OTHER', 'active', 1.5)],
  }));
  const own = Array.from({ length: 12 }, (_, i) => ({
    id: `o${i}`, yearLevel: 4, status: 'active', classId: '10', className: 'CLASS-10', enrolledSubjects: [item('10', 'CLASS-10', 'active', 1.5)],
  }));
  const card = buildClassCards([...own, ...lastElsewhere], never).find(c => c.id === '10')!;
  assert.equal(card.students.length, 15);
  assert.equal(card.activeCount, 15);
});

test('card standing counts use that class enrollment', () => {
  const cards = buildClassCards([two, one], never);
  const c10 = cards.find(c => c.id === '10')!;
  const c20 = cards.find(c => c.id === '20')!;
  assert.deepEqual([c10.activeCount, c10.noGradeCount, c10.remedialCount], [1, 1, 0]);
  assert.deepEqual([c20.activeCount, c20.noGradeCount, c20.remedialCount], [0, 0, 1]);
});

test('standing per class: active+graded in 10, remedial in 20', () => {
  assert.equal(standingInClass(two, '10'), 'active');
  assert.equal(standingInClass(two, '20'), 'remedial');
  assert.equal(standingInClass(one, '10'), 'noGrade');
});

test('attendance for class 10 excludes the same student class-20 records', () => {
  const records = [
    { id: 'r1', studentId: 'a', classId: '10' },
    { id: 'r2', studentId: 'a', classId: '20' },
    { id: 'r3', studentId: 'b', classId: '10' },
  ];
  assert.deepEqual(attendanceForClass(records, '10').map(r => r.id), ['r1', 'r3']);
  assert.deepEqual(attendanceForClass(records, '20').map(r => r.id), ['r2']);
});
