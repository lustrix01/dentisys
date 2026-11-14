import type { CatalogCourse } from '../../services/apiClient';

export type CourseFilters = { tab: 'active' | 'retired'; search: string; units: 'all' | 'lecture' | 'lab'; use: 'all' | 'current' | 'unused'; sort: 'code' | 'title' | 'classes' };

const byCode = (a: CatalogCourse, b: CatalogCourse) => a.courseCode.localeCompare(b.courseCode, undefined, { numeric: true });

export function filterCourses(courses: CatalogCourse[], f: CourseFilters): CatalogCourse[] {
  const q = f.search.trim().toLowerCase();
  const rows = courses.filter(c => c.status === f.tab
    && `${c.courseCode} ${c.name}`.toLowerCase().includes(q)
    && (f.units === 'all' || (f.units === 'lab' ? (c.labUnits ?? 0) > 0 : !c.labUnits))
    && (f.use === 'all' || (f.use === 'current' ? c.currentClassCount > 0 : c.classCount === 0)));
  return rows.sort(f.sort === 'title' ? (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })
    : f.sort === 'classes' ? (a, b) => b.classCount - a.classCount || byCode(a, b) : byCode);
}
