// Dean Reports standing: Good Standing needs a final course grade (Owner ruling 2026-10-28).
// Remedial and Cleared come from retention_state and keep precedence.
export const STANDING_LABELS: Record<string, string> = {
  active: 'Good Standing',
  noGrade: 'No Grade Yet',
  remedial: 'Remedial',
  cleared: 'Cleared',
};

/** Standing for the class shown with the student (class cards, drill-downs, exports). */
export function classStanding(s: { status?: string | null; classGraded?: boolean }): string {
  const st = String(s.status || '').toLowerCase();
  if (st === 'remedial' || st === 'cleared') return st;
  return s.classGraded ? 'active' : 'noGrade';
}

/** Page-wide standing: any final grade in the school year counts. */
export function pageStanding(s: { status?: string; overallGWA?: number | null }): string {
  return s.status === 'noGrade' && s.overallGWA != null ? 'active' : String(s.status);
}
