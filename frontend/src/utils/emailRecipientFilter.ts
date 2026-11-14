// Email Management recipient filters (5.7): Course -> Class Section -> Student.
// Pure helpers so the cascade is testable without React.

export interface FilterClass { id?: string | number; csId?: string | number; csName?: string; block?: string; courseCode?: string; courseTitle?: string; courseName?: string }
export interface FilterStudent { id: string; name?: string; studentId?: string; classSections?: Array<{ classId: string; className: string }> }

export const classIdOf = (c: FilterClass): string => String(c.csId || c.id || '');

/** Distinct courses, in the order their classes first appear. */
export const courseOptions = (classes: FilterClass[]): Array<{ code: string; title: string }> => {
  const seen = new Map<string, string>();
  for (const c of classes) {
    const code = c.courseCode || '';
    if (code && !seen.has(code)) seen.set(code, c.courseTitle || c.courseName || code);
  }
  return Array.from(seen, ([code, title]) => ({ code, title }));
};

/** Sections of the chosen course; every section while the course is 'all'. */
export const sectionOptions = <T extends FilterClass>(classes: T[], course: string): T[] =>
  course === 'all' ? classes : classes.filter(c => c.courseCode === course);

/** Students enrolled in the chosen section, else in any section of the chosen course, else in any listed class. */
export const studentOptions = <S extends FilterStudent>(students: S[], classes: FilterClass[], course: string, classId: string): S[] => {
  const scope = sectionOptions(classes, course).filter(c => classId === 'all' || classIdOf(c) === classId);
  return students
    .filter(s => s.classSections?.some(cs => scope.some(c => String(cs.classId) === classIdOf(c) || cs.className === c.csName || cs.className === c.block)))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
};
