/** On-screen school year (spec UI-001 Wording): "2026-2027" -> "S.Y. 2026–2027" (en dash). Stored values stay "2026-2027". */
export const formatSchoolYear = (schoolYear: string | null | undefined): string =>
  schoolYear ? `S.Y. ${schoolYear.replace(/\s*[-–]\s*/, '–')}` : '';
