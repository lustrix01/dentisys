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
  if (method === 'manual_secretary' || method === 'secretary_manual' || method === 'secretary_approved') return 'secretary';
  return null;
};

// Unrecorded rows (no status) never match a non-"all" filter.
export const matchesRollCallFilters = (row: RollCallRow, overridden: OverriddenFilter, recordedBy: RecordedByFilter): boolean => {
  if (overridden === 'all' && recordedBy === 'all') return true;
  if (!row.status || row.status === 'not_recorded') return false;
  if (overridden !== 'all' && Boolean(row.overrideReason) !== (overridden === 'overridden')) return false;
  return recordedBy === 'all' || recordedByOf(row.verificationMethod) === recordedBy;
};

// 13.6 Past Sessions tab: saved-status counts per session from the attendance sheet (revoked sessions are not in it).
export type SessionCounts = { present: number; late: number; absent: number; excused: number; notRecorded: number };

export const countsBySession = (sheet: {
  sessions: readonly { id: string }[];
  students: readonly unknown[];
  records: readonly { sessionId: string; status: string }[];
}): Map<string, SessionCounts> => {
  const counts = new Map<string, SessionCounts>();
  for (const session of sheet.sessions) {
    counts.set(String(session.id), { present: 0, late: 0, absent: 0, excused: 0, notRecorded: sheet.students.length });
  }
  for (const record of sheet.records) {
    const entry = counts.get(String(record.sessionId));
    const status = String(record.status).toLowerCase();
    if (!entry || !(status === 'present' || status === 'late' || status === 'absent' || status === 'excused')) continue;
    entry[status] += 1;
    entry.notRecorded = Math.max(0, entry.notRecorded - 1);
  }
  return counts;
};

type PastSession = HasStatus & { sessionDate?: string | null; openingTime?: string | null };

// Newest first; empty from/to means no bound; revoked sessions only when shown.
export const filterPastSessions = <T extends PastSession>(sessions: readonly T[], from: string, to: string, showRevoked: boolean): T[] =>
  visibleSessions(sessions, showRevoked)
    .filter(session => {
      const date = session.sessionDate ?? '';
      return (!from || date >= from) && (!to || date <= to);
    })
    .sort((a, b) => `${b.sessionDate ?? ''} ${b.openingTime ?? ''}`.localeCompare(`${a.sessionDate ?? ''} ${a.openingTime ?? ''}`));
