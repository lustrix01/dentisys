import { formatGrade } from '../../utils/gradeHelper.ts';

/** Grade shown in the Dean report export: the selected class's course, else the first course, else the overall GWA. */
export function exportGradeOf(s: any, selectedSubjectCode?: string | null): string {
  const sub = s.enrolledSubjects?.find((item: any) => item.code === selectedSubjectCode) || s.enrolledSubjects?.[0];
  const gradeVal = sub?.grade ?? (s.overallGWA !== null && s.overallGWA !== undefined ? Number(s.overallGWA) : null);
  return gradeVal !== null && gradeVal !== undefined && Number(gradeVal) > 0 ? formatGrade(Number(gradeVal)) : 'N/A';
}
