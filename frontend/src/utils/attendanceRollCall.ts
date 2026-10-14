// Shared by the Faculty and Secretary roll calls: revoked-session visibility and the Overridden / Recorded by filters.
export const REVOKED_SESSION_VIEW_ONLY_NOTE = 'Revoked sessions cannot be overridden.';

type HasStatus = { status?: string | null };

export const countRevokedSessions = (sessions: readonly HasStatus[]): number =>
  sessions.filter(session => session.status === 'revoked').length;

export const visibleSessions = <T extends HasStatus>(sessions: readonly T[], showRevoked: boolean): T[] =>
  showRevoked ? [...sessions] : sessions.filter(session => session.status !== 'revoked');

export const revokedHiddenText = (hidden: number): string =>
  `No sessions to show on this date. ${hidden} revoked session${hidden === 1 ? ' is' : 's are'} hidden.`;

export type OverriddenFilter = 'all' | 'overridden' | 'original';
export type RecordedByFilter = 'all' | 'biometric' | 'faculty' | 'secretary';

type RollCallRow = {
  status?: string | null;
  verificationMethod?: string | null;
  overrideReason?: string | null;
};

const recordedByOf = (method?: string | null): RecordedByFilter | null => {
  if (method === 'biometric') return 'biometric';
  if (method === 'manual_faculty' || method === 'faculty_manual') return 'faculty';
  if (method === 'manual_secretary' || method === 'secretary_manual') return 'secretary';
  return null;
};

// Unrecorded rows (no status) never match a non-"all" filter.
export const matchesRollCallFilters = (row: RollCallRow, overridden: OverriddenFilter, recordedBy: RecordedByFilter): boolean => {
  if (overridden === 'all' && recordedBy === 'all') return true;
  if (!row.status || row.status === 'not_recorded') return false;
  if (overridden !== 'all' && Boolean(row.overrideReason) !== (overridden === 'overridden')) return false;
  return recordedBy === 'all' || recordedByOf(row.verificationMethod) === recordedBy;
};
