export type AuditStatus = 'Success' | 'Failed' | 'Warning';
export type AuditRole = 'admin' | 'faculty' | 'secretary';
export interface AuditLog { id: string; timestamp: string; userName: string; userRole: AuditRole; action: string; module: string; description: string; status: AuditStatus; ipAddress: string; device: string; }
type AuditInput = Omit<AuditLog, 'id' | 'timestamp' | 'userName' | 'userRole' | 'ipAddress' | 'device'> & { userName?: string; userRole?: string; timestamp?: string; ipAddress?: string; device?: string };
const key = 'dentisys_audit_logs';
const mock: AuditLog[] = [
  { id: 'audit-1', timestamp: '2026-07-15T09:15:00.000Z', userName: 'Dr. Marcus Aurelius', userRole: 'admin', action: 'Updated retention criteria', module: 'Retention Criteria', description: 'Updated clinical passing limit to 2.5.', status: 'Success', ipAddress: 'Frontend placeholder', device: 'Browser placeholder' },
  { id: 'audit-2', timestamp: '2026-07-15T08:42:00.000Z', userName: 'Dr. Eleanor Vance', userRole: 'faculty', action: 'Created assessment', module: 'Grade Computation', description: 'Created a clinical assessment for CLIN401.', status: 'Success', ipAddress: 'Frontend placeholder', device: 'Browser placeholder' },
  { id: 'audit-3', timestamp: '2026-07-14T16:20:00.000Z', userName: 'Miss Clara Oswald', userRole: 'secretary', action: 'Overrode attendance', module: 'Manual Override', description: 'Updated attendance with a documented reason.', status: 'Warning', ipAddress: 'Frontend placeholder', device: 'Browser placeholder' },
];
const currentUser = () => { try { return JSON.parse(localStorage.getItem('dentisys_user') || '{}'); } catch { return {}; } };
export const getAuditLogs = (): AuditLog[] => { try { const stored = JSON.parse(localStorage.getItem(key) || 'null'); return Array.isArray(stored) ? stored : mock; } catch { return mock; } };
export const recordAudit = (input: AuditInput) => { const user = currentUser(); const entry: AuditLog = { id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: input.timestamp || new Date().toISOString(), userName: input.userName || user.name || 'System User', userRole: (input.userRole || user.role || 'admin') as AuditRole, action: input.action, module: input.module, description: input.description, status: input.status, ipAddress: input.ipAddress || 'Frontend placeholder', device: input.device || navigator.userAgent || 'Browser placeholder' }; const logs = [entry, ...getAuditLogs()]; localStorage.setItem(key, JSON.stringify(logs.slice(0, 1000))); return entry; };
export const auditForCurrentUser = () => { const user = currentUser(); const logs = getAuditLogs(); return user.role === 'admin' ? logs : logs.filter(log => log.userName === user.name && log.userRole === user.role); };
