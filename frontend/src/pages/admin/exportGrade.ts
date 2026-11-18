import { classStanding } from './deanStanding.ts';

export interface ExportEnrollmentRow { student: any; className: string; courseCode: string; grade: number | null; standing: string }

/** Dean Students/Retention exports: one row per course enrollment. With a class id, only that class's enrollments. */
export function exportEnrollmentRows(students: any[], classId?: string | null): ExportEnrollmentRow[] {
  const rows: ExportEnrollmentRow[] = [];
  for (const s of students) {
    const items = (s.enrolledSubjects || [])
      .filter((item: any) => !classId || item.classId === classId)
      .sort((a: any, b: any) => String(a.code || '').localeCompare(String(b.code || '')));
    if (items.length === 0) {
      rows.push({ student: s, className: s.className || '—', courseCode: '—', grade: null, standing: String(s.status) });
      continue;
    }
    for (const item of items) {
      rows.push({
        student: s,
        className: item.className || s.className || '—',
        courseCode: item.code || '—',
        grade: item.grade > 0 ? Number(item.grade) : null,
        standing: classStanding({ status: item.retentionState, classGraded: item.grade !== null && item.grade !== undefined }),
      });
    }
  }
  return rows;
}

/** e.g. "90 students · 180 course enrollments". */
export function exportCountLine(rows: ExportEnrollmentRow[]): string {
  const students = new Set(rows.map(r => r.student.id)).size;
  const enrollments = rows.filter(r => r.courseCode !== '—').length;
  return `${students} student${students === 1 ? '' : 's'} · ${enrollments} course enrollment${enrollments === 1 ? '' : 's'}`;
}
