export type AuditStatus = 'Success' | 'Failed' | 'Warning';
export type AuditRole = 'admin' | 'faculty' | 'secretary';

export interface AuditLog {
  id: string;
  timestamp: string;
  userName: string;
  userRole: AuditRole;
  action: string;
  module: string;
  description: string;
  status: AuditStatus;
  ipAddress: string;
  device: string;
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
