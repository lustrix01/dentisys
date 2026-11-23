/**
 * Backlog 14.10: the school year, course or class section a user chooses in a page's top filter
 * carries to the same user's other pages (one sign-in, one browser tab). Only user choices are
 * written; a page's own automatic default must never be written here.
 */
export const SHARED_FILTERS_KEY = 'dentisys_shared_filters';

export interface SharedFilterValues {
  /** 'YYYY-YYYY' or 'all'. */
  schoolYear?: string;
  /** Course code or 'all'. */
  courseCode?: string;
  /** Class section id (csId as a string) or 'all'. */
  classId?: string;
  /** The last specific class section chosen on any page. */
  lastClassId?: string;
}

interface StoredSharedFilters extends SharedFilterValues {
  userId: string;
}

export interface SharedClassLike {
  id: string;
  courseCode: string;
  schoolYear?: string | null;
}

const isSpecific = (value: string | undefined): value is string => !!value && value !== 'all';

function userKey(userId: string | number | null | undefined): string {
  return userId === null || userId === undefined ? '' : String(userId);
}

export function readSharedFilters(userId: string | number | null | undefined): SharedFilterValues {
  try {
    const raw = sessionStorage.getItem(SHARED_FILTERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<StoredSharedFilters> | null;
    if (!parsed || typeof parsed !== 'object' || !userKey(userId) || parsed.userId !== userKey(userId)) return {};
    const text = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);
    return {
      schoolYear: text(parsed.schoolYear),
      courseCode: text(parsed.courseCode),
      classId: text(parsed.classId),
      lastClassId: text(parsed.lastClassId),
    };
  } catch {
    return {};
  }
}

export function writeSharedFilters(userId: string | number | null | undefined, patch: SharedFilterValues): void {
  const id = userKey(userId);
  if (!id) return;
  try {
    const next: StoredSharedFilters = { ...readSharedFilters(id), userId: id };
    if (patch.schoolYear !== undefined) next.schoolYear = patch.schoolYear;
    if (patch.courseCode !== undefined) next.courseCode = patch.courseCode;
    if (patch.classId !== undefined) {
      next.classId = patch.classId;
      if (isSpecific(patch.classId)) next.lastClassId = patch.classId;
    }
    if (patch.lastClassId !== undefined) next.lastClassId = patch.lastClassId;
    sessionStorage.setItem(SHARED_FILTERS_KEY, JSON.stringify(next));
  } catch {
    /* Storage may be unavailable; the filter then stays on its page. */
  }
}

export function clearSharedFilters(): void {
  try { sessionStorage.removeItem(SHARED_FILTERS_KEY); } catch { /* Storage may be unavailable. */ }
}

/** The user chose a school year (a 'current' token is resolved to the real year; without one nothing is written). */
export function writeSharedSchoolYear(userId: string | number | null | undefined, value: string, currentYear?: string | null): void {
  const year = value === 'current' ? currentYear : value;
  if (year) writeSharedFilters(userId, { schoolYear: year });
}

/** The user chose a course ('' or 'all' = all courses). */
export function writeSharedCourse(userId: string | number | null | undefined, courseCode: string): void {
  writeSharedFilters(userId, { courseCode: courseCode || 'all', classId: 'all' });
}

/** The user chose a class (null, '' or 'all' = all classes). */
export function writeSharedClass(userId: string | number | null | undefined, cls: SharedClassLike | null | undefined): void {
  if (!cls) { writeSharedFilters(userId, { classId: 'all' }); return; }
  writeSharedFilters(userId, {
    classId: cls.id,
    courseCode: cls.courseCode,
    ...(cls.schoolYear ? { schoolYear: cls.schoolYear } : {}),
  });
}

/**
 * The school year a page should start on, or null to keep its own default.
 * `currentToken`: the page shows the current year as 'current'. 'all' only where the page allows it.
 */
export function sharedYearForPage(
  shared: SharedFilterValues,
  opts: { years: string[]; currentYear?: string | null; allowAll: boolean; currentToken?: boolean },
): string | null {
  const year = shared.schoolYear;
  if (!year) return null;
  if (year === 'all') return opts.allowAll ? 'all' : null;
  if (opts.currentToken && opts.currentYear && year === opts.currentYear) return 'current';
  return opts.years.includes(year) || year === opts.currentYear ? year : null;
}

/** The course code a page should start on (null = keep its default); 'all' only where the page allows it. */
export function sharedCourseForPage(shared: SharedFilterValues, opts: { codes: string[]; allowAll: boolean }): string | null {
  const code = shared.courseCode;
  if (!code) return null;
  if (code === 'all') return opts.allowAll ? 'all' : null;
  return opts.codes.includes(code) ? code : null;
}

/** The class id a page that allows "All" should start on (null = keep its default). */
export function sharedClassForPage(shared: SharedFilterValues, opts: { ids: string[] }): string | null {
  const id = shared.classId;
  if (!id) return null;
  if (id === 'all') return 'all';
  return opts.ids.includes(id) ? id : null;
}

/**
 * Single-class pages: the specific class chosen anywhere (never "All"), else the last specific one,
 * else the first class of the carried course, else null (the page keeps its default).
 */
export function pickSharedClass<T extends SharedClassLike>(
  classes: T[],
  shared: SharedFilterValues,
  opts: { schoolYear?: string | null } = {},
): T | null {
  const inYear = (c: T) => !opts.schoolYear || !c.schoolYear || c.schoolYear === opts.schoolYear;
  const byId = (id: string | undefined) => (isSpecific(id) ? classes.find(c => c.id === id && inYear(c)) ?? null : null);
  return byId(shared.classId)
    ?? byId(shared.lastClassId)
    ?? (isSpecific(shared.courseCode) ? classes.find(c => c.courseCode === shared.courseCode && inYear(c)) ?? null : null);
}
