// Dean Reports: per-class helpers (class cards, membership, standing, attendance).
import { classStanding } from './deanStanding.ts';

export interface ClassCard {
  id: string;
  name: string;
  yearLevel: number | null;
  subjectCode?: string;
  subjectName?: string;
  instructorName?: string | null;
  finished?: boolean;
  students: any[];
  isArchived: boolean;
  activeCount: number;
  noGradeCount: number;
  remedialCount: number;
}

const enrollments = (student: any): any[] => student.enrolledSubjects ?? [];
const enrollmentIn = (student: any, classId: string): any | undefined => enrollments(student).find((item: any) => item.classId === classId);

/** One card per class from each student's enrollments; a student in two classes is in both. No enrollments: 'unassigned'. */
export function buildClassCards(students: any[], isArchivedFor: (student: any, enrollment?: any) => boolean): ClassCard[] {
  const map = new Map<string, ClassCard>();
  const add = (s: any, clsId: string, item?: any) => {
    let card = map.get(clsId);
    if (!card) {
      card = {
        id: clsId,
        name: item?.className || (clsId === 'unassigned' ? 'Unassigned' : `Class ${clsId}`),
        yearLevel: s.yearLevel ?? null,
        subjectCode: item?.code,
        subjectName: item?.name,
        instructorName: item?.instructorName ?? null,
        finished: Boolean(item?.classFinished),
        students: [],
        isArchived: isArchivedFor(s, item),
        activeCount: 0,
        noGradeCount: 0,
        remedialCount: 0,
      };
      map.set(clsId, card);
    }
    card.students.push(s);
    if (s.yearLevel && !card.yearLevel) card.yearLevel = s.yearLevel;
    const st = standingInClass(s, clsId);
    if (st === 'active' || st === 'cleared') card.activeCount++;
    else if (st === 'noGrade') card.noGradeCount++;
    else if (st === 'remedial') card.remedialCount++;
  };
  students.forEach((s: any) => {
    const items = enrollments(s).filter((item: any) => item.classId);
    if (items.length === 0) add(s, 'unassigned');
    else items.forEach((item: any) => add(s, String(item.classId), item));
  });
  return Array.from(map.values());
}

export function studentInClass(student: any, classId: string): boolean {
  if (classId === 'unassigned') return enrollments(student).length === 0;
  return enrollmentIn(student, classId) !== undefined;
}

/** Standing of the student's enrollment in that class; the student-level standing when there is none. */
export function standingInClass(student: any, classId: string): string {
  const item = enrollmentIn(student, classId);
  if (!item) return String(student.status);
  return classStanding({ status: item.retentionState, classGraded: item.grade !== null && item.grade !== undefined });
}

export function attendanceForClass(records: any[], classId: string): any[] {
  return records.filter(r => r.classId === classId);
}

/** Values on a class drill-down row (Student Summaries and Retention Reports). */
export function classRowValues(student: any, classId: string, fails: (sub: any) => boolean): { grade: number | null; pendingRemedials: number; flagged: number } {
  const sub = enrollmentIn(student, classId);
  const pendingRemedials = (student.remedialExams ?? []).filter((r: any) => r.status === 'pending' && (!sub || r.subjectCode === sub.code)).length;
  return {
    grade: sub?.grade ?? null,
    pendingRemedials,
    flagged: (sub ? [sub] : enrollments(student)).filter(fails).length,
  };
}
