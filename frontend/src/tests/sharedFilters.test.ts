import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  SHARED_FILTERS_KEY,
  clearSharedFilters,
  pickSharedClass,
  readSharedFilters,
  sharedClassForPage,
  sharedCourseForPage,
  sharedYearForPage,
  writeSharedClass,
  writeSharedCourse,
  writeSharedFilters,
  writeSharedSchoolYear,
} from '../utils/sharedFilters.ts';

// Minimal in-memory sessionStorage; `broken` makes every call throw (storage blocked).
const store = new Map<string, string>();
let broken = false;
const guard = () => { if (broken) throw new Error('storage blocked'); };
(globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
  getItem: (key: string) => { guard(); return store.has(key) ? store.get(key)! : null; },
  setItem: (key: string, value: string) => { guard(); store.set(key, String(value)); },
  removeItem: (key: string) => { guard(); store.delete(key); },
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

beforeEach(() => { store.clear(); broken = false; });

const stored = () => JSON.parse(store.get(SHARED_FILTERS_KEY) ?? 'null');

const classes = [
  { id: '1', courseCode: 'CLIN401', schoolYear: '2025-2026' },
  { id: '2', courseCode: 'CLIN401', schoolYear: '2026-2027' },
  { id: '3', courseCode: 'CLIN402', schoolYear: '2026-2027' },
];

test('read returns {} with no data, for another user, for bad JSON and for a null user', () => {
  assert.deepEqual(readSharedFilters(7), {});
  writeSharedFilters(7, { schoolYear: '2026-2027' });
  assert.equal(readSharedFilters(7).schoolYear, '2026-2027');
  assert.deepEqual(readSharedFilters(8), {});
  assert.deepEqual(readSharedFilters(null), {});
  assert.deepEqual(readSharedFilters(undefined), {});
  store.set(SHARED_FILTERS_KEY, '{not json');
  assert.deepEqual(readSharedFilters(7), {});
  store.set(SHARED_FILTERS_KEY, 'null');
  assert.deepEqual(readSharedFilters(7), {});
});

test('read and write never throw when storage throws', () => {
  broken = true;
  assert.deepEqual(readSharedFilters(7), {});
  assert.doesNotThrow(() => writeSharedFilters(7, { classId: '5' }));
  assert.doesNotThrow(() => clearSharedFilters());
});

test('write ignores a missing user and merges patches', () => {
  writeSharedFilters(null, { schoolYear: '2026-2027' });
  assert.equal(store.size, 0);
  writeSharedFilters(7, { schoolYear: '2026-2027' });
  writeSharedFilters(7, { courseCode: 'CLIN401' });
  assert.deepEqual(readSharedFilters(7), { schoolYear: '2026-2027', courseCode: 'CLIN401', classId: undefined, lastClassId: undefined });
  assert.equal(stored().userId, '7');
});

test('write sets lastClassId only for a specific classId', () => {
  writeSharedFilters(7, { classId: '5' });
  assert.equal(readSharedFilters(7).lastClassId, '5');
  writeSharedFilters(7, { classId: 'all' });
  const after = readSharedFilters(7);
  assert.equal(after.classId, 'all');
  assert.equal(after.lastClassId, '5');
});

test('writeSharedSchoolYear resolves current and writes nothing without a current year', () => {
  writeSharedSchoolYear(7, 'current', '2026-2027');
  assert.equal(readSharedFilters(7).schoolYear, '2026-2027');
  store.clear();
  writeSharedSchoolYear(7, 'current');
  writeSharedSchoolYear(7, 'current', null);
  assert.equal(store.size, 0);
  writeSharedSchoolYear(7, 'all');
  assert.equal(readSharedFilters(7).schoolYear, 'all');
});

test('writeSharedCourse sets classId to all and keeps lastClassId', () => {
  writeSharedFilters(7, { classId: '5' });
  writeSharedCourse(7, 'CLIN402');
  const shared = readSharedFilters(7);
  assert.equal(shared.courseCode, 'CLIN402');
  assert.equal(shared.classId, 'all');
  assert.equal(shared.lastClassId, '5');
  writeSharedCourse(7, '');
  assert.equal(readSharedFilters(7).courseCode, 'all');
});

test('writeSharedClass writes class, course and year; null writes all and keeps lastClassId', () => {
  writeSharedClass(7, { id: '2', courseCode: 'CLIN401', schoolYear: '2026-2027' });
  assert.deepEqual(readSharedFilters(7), { schoolYear: '2026-2027', courseCode: 'CLIN401', classId: '2', lastClassId: '2' });
  writeSharedClass(7, { id: '9', courseCode: 'X1' });
  assert.equal(readSharedFilters(7).schoolYear, '2026-2027');
  assert.equal(readSharedFilters(7).lastClassId, '9');
  writeSharedClass(7, null);
  const shared = readSharedFilters(7);
  assert.equal(shared.classId, 'all');
  assert.equal(shared.lastClassId, '9');
  writeSharedClass(7, undefined);
  assert.equal(readSharedFilters(7).classId, 'all');
});

test('sharedYearForPage maps all, current token and unknown years', () => {
  const opts = { years: ['2025-2026', '2026-2027'], currentYear: '2026-2027' };
  assert.equal(sharedYearForPage({}, { ...opts, allowAll: true }), null);
  assert.equal(sharedYearForPage({ schoolYear: 'all' }, { ...opts, allowAll: true }), 'all');
  assert.equal(sharedYearForPage({ schoolYear: 'all' }, { ...opts, allowAll: false }), null);
  assert.equal(sharedYearForPage({ schoolYear: '2026-2027' }, { ...opts, allowAll: false, currentToken: true }), 'current');
  assert.equal(sharedYearForPage({ schoolYear: '2026-2027' }, { ...opts, allowAll: false }), '2026-2027');
  assert.equal(sharedYearForPage({ schoolYear: '2025-2026' }, { ...opts, allowAll: false, currentToken: true }), '2025-2026');
  assert.equal(sharedYearForPage({ schoolYear: '2024-2025' }, { ...opts, allowAll: true }), null);
  assert.equal(sharedYearForPage({ schoolYear: '2026-2027' }, { years: [], currentYear: '2026-2027', allowAll: false }), '2026-2027');
});

test('sharedCourseForPage honours allowAll and known codes', () => {
  const opts = { codes: ['CLIN401', 'CLIN402'] };
  assert.equal(sharedCourseForPage({}, { ...opts, allowAll: true }), null);
  assert.equal(sharedCourseForPage({ courseCode: 'all' }, { ...opts, allowAll: true }), 'all');
  assert.equal(sharedCourseForPage({ courseCode: 'all' }, { ...opts, allowAll: false }), null);
  assert.equal(sharedCourseForPage({ courseCode: 'CLIN402' }, { ...opts, allowAll: false }), 'CLIN402');
  assert.equal(sharedCourseForPage({ courseCode: 'NOPE' }, { ...opts, allowAll: true }), null);
});

test('sharedClassForPage returns all, a known id, or null', () => {
  const opts = { ids: ['1', '2'] };
  assert.equal(sharedClassForPage({}, opts), null);
  assert.equal(sharedClassForPage({ classId: 'all' }, opts), 'all');
  assert.equal(sharedClassForPage({ classId: '2' }, opts), '2');
  assert.equal(sharedClassForPage({ classId: '99' }, opts), null);
});

test('pickSharedClass order: classId, lastClassId, first class of the course, else null', () => {
  assert.equal(pickSharedClass(classes, { classId: '3', lastClassId: '1', courseCode: 'CLIN401' })?.id, '3');
  assert.equal(pickSharedClass(classes, { classId: '99', lastClassId: '1', courseCode: 'CLIN402' })?.id, '1');
  assert.equal(pickSharedClass(classes, { classId: 'all', lastClassId: '2', courseCode: 'CLIN402' })?.id, '2');
  assert.equal(pickSharedClass(classes, { classId: 'all', courseCode: 'CLIN402' })?.id, '3');
  assert.equal(pickSharedClass(classes, { classId: 'all', courseCode: 'all' }), null);
  assert.equal(pickSharedClass(classes, {}), null);
  assert.equal(pickSharedClass(classes, { courseCode: 'NOPE' }), null);
});

test('pickSharedClass filters by school year', () => {
  assert.equal(pickSharedClass(classes, { classId: '1' }, { schoolYear: '2026-2027' }), null);
  assert.equal(pickSharedClass(classes, { classId: '1', courseCode: 'CLIN401' }, { schoolYear: '2026-2027' })?.id, '2');
  assert.equal(pickSharedClass(classes, { classId: '1', lastClassId: '3' }, { schoolYear: '2026-2027' })?.id, '3');
  assert.equal(pickSharedClass(classes, { classId: '1' }, { schoolYear: '2025-2026' })?.id, '1');
});

test('clearSharedFilters removes the stored value', () => {
  writeSharedFilters(7, { classId: '5' });
  clearSharedFilters();
  assert.equal(store.has(SHARED_FILTERS_KEY), false);
  assert.deepEqual(readSharedFilters(7), {});
});
