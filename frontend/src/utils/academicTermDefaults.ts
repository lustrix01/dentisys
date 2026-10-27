export type Semester = '1ST' | '2ND' | 'Summer';

const SEMESTERS: Semester[] = ['1ST', '2ND', 'Summer'];
const LABELS: Record<Semester, string> = { '1ST': '1st Semester', '2ND': '2nd Semester', Summer: 'Summer' };

export const semesterLabel = (semester: string): string => LABELS[semester as Semester] ?? semester;

/** Add-term defaults: first semester not yet defined for the year, else 1ST of the next school year. */
export function newTermDefaults(schoolYear: string, definedSemesters: string[]): { schoolYear: string; semester: Semester } {
  const free = SEMESTERS.find((s) => !definedSemesters.includes(s));
  if (free) return { schoolYear, semester: free };
  const m = /^(\d{4})-(\d{4})$/.exec(schoolYear);
  return { schoolYear: m ? `${+m[1] + 1}-${+m[2] + 1}` : schoolYear, semester: '1ST' };
}
