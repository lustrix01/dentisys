import type { CatalogCourse } from '../../services/apiClient';
import { compareValues } from '../../utils/sort.ts';
import type { SortState } from '../../utils/sort.ts';

export type CourseSortKey = 'code' | 'title' | 'units' | 'classes';
export type CourseFilters = { tab: 'active' | 'retired'; search: string; units: 'all' | 'lecture' | 'lab'; use: 'all' | 'current' | 'unused'; sort: SortState<CourseSortKey> };
export const DEFAULT_COURSE_SORT: SortState<CourseSortKey> = { key: 'code', dir: 'asc' };

const byCode = (a: CatalogCourse, b: CatalogCourse) => compareValues(a.courseCode, b.courseCode, 'asc');
const value = (c: CatalogCourse, key: CourseSortKey) => (key === 'title' ? c.name : key === 'units' ? c.units : key === 'classes' ? c.classCount : c.courseCode);

export function filterCourses(courses: CatalogCourse[], f: CourseFilters): CatalogCourse[] {
  const q = f.search.trim().toLowerCase();
  const rows = courses.filter(c => c.status === f.tab
    && `${c.courseCode} ${c.name}`.toLowerCase().includes(q)
    && (f.units === 'all' || (f.units === 'lab' ? (c.labUnits ?? 0) > 0 : !c.labUnits))
    && (f.use === 'all' || (f.use === 'current' ? c.currentClassCount > 0 : c.classCount === 0)));
  return rows.sort((a, b) => compareValues(value(a, f.sort.key), value(b, f.sort.key), f.sort.dir) || byCode(a, b));
}
