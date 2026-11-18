export interface ExportEnrollmentRow { student: any; className: string; courseCode: string; grade: number | null }

/** Dean Students/Retention exports: one row per course enrollment. With a class name, only that class's enrollments. */
export function exportEnrollmentRows(students: any[], className?: string | null): ExportEnrollmentRow[] {
  const rows: ExportEnrollmentRow[] = [];
  for (const s of students) {
    const items = (s.enrolledSubjects || [])
      .filter((item: any) => !className || item.className === className)
      .sort((a: any, b: any) => String(a.code || '').localeCompare(String(b.code || '')));
    if (items.length === 0) {
      rows.push({ student: s, className: s.className || '—', courseCode: '—', grade: null });
      continue;
    }
    for (const item of items) {
      rows.push({
        student: s,
        className: item.className || s.className || '—',
        courseCode: item.code || '—',
        grade: item.grade > 0 ? Number(item.grade) : null,
      });
    }
  }
  return rows;
}

/** e.g. "90 students · 180 course enrollments". */
export function exportCountLine(rows: ExportEnrollmentRow[]): string {
  const students = new Set(rows.map(r => r.student.id)).size;
  return `${students} student${students === 1 ? '' : 's'} · ${rows.length} course enrollment${rows.length === 1 ? '' : 's'}`;
}
