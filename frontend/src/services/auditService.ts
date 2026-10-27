export type AuditStatus = 'Success' | 'Failed' | 'Warning';
export type AuditRole = 'admin' | 'faculty' | 'secretary' | 'student';

export interface AuditLog {
  id: string;
  timestamp: string;
  userName: string;
  userRole: AuditRole;
  action: string;
  module: string;
  description: string;
  status: AuditStatus;
  /** Null when the event recorded no request details. */
  ipAddress: string | null;
  device: string | null;
  /** Dean audit trail only: identity as recorded at the time, and the change. */
  userEmail?: string | null;
  userDisplayName?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  reason?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
}

type AuditInput = Omit<
  AuditLog,
  'id' | 'timestamp' | 'userName' | 'userRole' | 'ipAddress' | 'device'
> & {
  userName?: string;
  userRole?: string;
  timestamp?: string;
  ipAddress?: string;
  device?: string;
};

export function setAuditIdentity(_name: string, _role: string): void {
  // Identity is verified and recorded by the backend for persisted operations.
}

export function clearAuditIdentity(): void {
  // Kept for compatibility with existing callers.
}

export const getAuditLogs = (): AuditLog[] => [];

export const recordAudit = (_input: AuditInput): null => {
  // Browser-generated audit history is intentionally disabled. Audit events
  // are appended only by successful backend transactions.
  return null;
};

export const auditForCurrentUser = (): AuditLog[] => [];

// ---- Audit read API (docs/contracts/audit-logging.md section 4) ----

export interface AuditEntry {
  id: string;
  occurredAt: string;
  who: { name: string; email: string | null; role: string; roleLabel: string } | null;
  whoText: string | null;
  what: string;
  area: string;
  record: string;
  change: string;
  status: AuditStatus;
  isSignIn: boolean;
  batch: null | { count: number; members: Array<{ record: string; change: string }> };
  details: {
    fromWhere: { ip: string | null; device: string | null };
    reason: string | null;
    changes: Array<{ field: string; before: string; after: string }>;
    technical?: { actionCode: string; module: string; operationUuid: string | null; before: unknown; after: unknown };
  };
}

export interface AuditListResponse {
  status: string;
  entries: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  areas: string[];
  attention?: { failedSignIns: number; securityAlerts: number; mfaTurnedOff: number };
}

export interface AuditQuery {
  q?: string; area?: string; from?: string; to?: string; status?: string; role?: string;
  cls?: string; signins?: boolean; sort?: 'newest' | 'oldest'; page?: number;
  /** Dean attention card: failedSignIns | securityAlerts | mfaTurnedOff. */
  card?: string;
}

/** Only non-empty filters are sent; the server defaults the rest. */
export function auditQueryString(params: AuditQuery = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || value === false) continue;
    if (key === 'page' && value === 1) continue;
    if (key === 'sort' && value === 'newest') continue;
    search.set(key, value === true ? '1' : String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

const MANILA = 'Asia/Manila';
const dayKeyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: MANILA });
const dayFormat = new Intl.DateTimeFormat('en-US', { timeZone: MANILA, month: 'short', day: 'numeric' });
const dayYearFormat = new Intl.DateTimeFormat('en-US', { timeZone: MANILA, month: 'short', day: 'numeric', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: MANILA, hour: 'numeric', minute: '2-digit' });
const clean = (text: string) => text.replace(/[  ]/g, ' ');

/** YYYY-MM-DD of the Asia/Manila calendar day. */
export const manilaDayKey = (iso: string | Date): string => dayKeyFormat.format(new Date(iso));

/** "Oct 17, 2026 · 10:16 AM", always Manila time. */
export function formatManilaWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${clean(dayYearFormat.format(d))} · ${clean(timeFormat.format(d))}`;
}

/** Today / Yesterday / "Oct 15" (year added when it is not the current year). */
export function manilaDayLabel(dayKey: string, now: Date = new Date()): string {
  const today = manilaDayKey(now);
  if (dayKey === today) return 'Today';
  if (dayKey === manilaDayKey(new Date(now.getTime() - 86_400_000))) return 'Yesterday';
  const d = new Date(`${dayKey}T12:00:00+08:00`);
  return clean((dayKey.slice(0, 4) === today.slice(0, 4) ? dayFormat : dayYearFormat).format(d));
}

/** Entries are already sorted by the server; consecutive entries of one Manila day share a header. */
export function groupByDay(entries: AuditEntry[], now: Date = new Date()): Array<{ key: string; label: string; entries: AuditEntry[] }> {
  const groups: Array<{ key: string; label: string; entries: AuditEntry[] }> = [];
  for (const entry of entries) {
    const key = manilaDayKey(entry.occurredAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, label: manilaDayLabel(key, now), entries: [entry] });
  }
  return groups;
}

export const auditWho = (entry: AuditEntry): string =>
  entry.who ? `${entry.who.name} · ${entry.who.roleLabel}` : entry.whoText ?? '—';

export type DatePreset = 'all' | 'today' | '7' | 'term' | 'custom';

/** Date preset to an inclusive Asia/Manila from/to pair. */
export function auditDateRange(
  preset: DatePreset,
  custom: { from: string; to: string },
  term: { startDate: string | null; endDate: string | null } | null,
  now: Date = new Date(),
): { from: string; to: string } {
  const today = manilaDayKey(now);
  if (preset === 'today') return { from: today, to: today };
  if (preset === '7') return { from: manilaDayKey(new Date(now.getTime() - 6 * 86_400_000)), to: today };
  if (preset === 'term' && term?.startDate && term.endDate) return { from: term.startDate, to: term.endDate };
  if (preset === 'custom') return custom;
  return { from: '', to: '' };
}

/** The term whose dates contain today (Manila), or null. */
export function currentTerm<T extends { startDate: string | null; endDate: string | null }>(terms: T[], now: Date = new Date()): T | null {
  const today = manilaDayKey(now);
  return terms.find(t => t.startDate && t.endDate && t.startDate <= today && today <= t.endDate) ?? null;
}

export const AUDIT_EXPORT_HEADER = ['When', 'Who', 'What', 'Record', 'Change', 'Status'];

/** Same columns as the screen; a batch becomes one line per member. */
export function auditCsvRows(entries: AuditEntry[]): string[][] {
  return entries.flatMap(e => {
    const base = [formatManilaWhen(e.occurredAt), auditWho(e), e.what];
    return e.batch && e.batch.members.length
      ? e.batch.members.map(m => [...base, m.record, m.change, e.status])
      : [[...base, e.record, e.change, e.status]];
  });
}
