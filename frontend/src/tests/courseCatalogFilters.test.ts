import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCourses, type CourseFilters } from '../pages/admin/courseCatalogFilters.ts';
import type { CatalogCourse } from '../services/apiClient.ts';

const c = (id: number, courseCode: string, name: string, labUnits: number | null, classCount: number, currentClassCount: number, status: 'active' | 'retired' = 'active') =>
  ({ id, courseCode, name, units: 3, lectureUnits: 3, labUnits, status, classCount, currentClassCount }) as CatalogCourse;
const data = [
  c(1, 'DENT 10', 'Anatomy', 1, 5, 2),
  c(2, 'DENT 2', 'Zoology', null, 0, 0),
  c(3, 'DENT 3', 'Biology', 0, 3, 0),
  c(4, 'DENT 4', 'Old course', 0, 1, 0, 'retired'),
];
const base: CourseFilters = { tab: 'active', search: '', units: 'all', use: 'all', sort: 'code' };
const ids = (f: Partial<CourseFilters>) => filterCourses(data, { ...base, ...f }).map(x => x.id);

test('tab and search', () => {
  assert.deepEqual(ids({}), [2, 3, 1]);
  assert.deepEqual(ids({ tab: 'retired' }), [4]);
  assert.deepEqual(ids({ search: ' biol ' }), [3]);
});
test('units', () => {
  assert.deepEqual(ids({ units: 'lecture' }), [2, 3]);
  assert.deepEqual(ids({ units: 'lab' }), [1]);
});
test('use', () => {
  assert.deepEqual(ids({ use: 'current' }), [1]);
  assert.deepEqual(ids({ use: 'unused' }), [2]);
});
test('sort', () => {
  assert.deepEqual(ids({ sort: 'title' }), [1, 3, 2]);
  assert.deepEqual(ids({ sort: 'classes' }), [1, 3, 2]);
  assert.deepEqual(filterCourses([c(5, 'B', 'x', 0, 1, 0), c(6, 'A', 'y', 0, 1, 0)], { ...base, sort: 'classes' }).map(x => x.id), [6, 5]);
});
test('combination', () => {
  assert.deepEqual(ids({ units: 'lecture', use: 'unused', search: 'zoo', sort: 'title' }), [2]);
  assert.deepEqual(ids({ units: 'lab', use: 'unused' }), []);
});
