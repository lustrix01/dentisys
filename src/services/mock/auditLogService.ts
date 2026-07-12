// src/services/mock/auditLogService.ts

/** Simple in‑memory audit log service used during development.
 * Stores log entries in a module‑level array. In a real implementation
 * this would persist to a backend/database.
 */
export interface AuditLog {
  id: string;
  action: string;
  module: string;
  performedBy: string;
  timestamp: Date;
  targetId: string;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
}

let logs: AuditLog[] = [];

export const auditLogService = {
  /** Record an audit log entry */
  log(entry: Omit<AuditLog, 'id' | 'timestamp'>) {
    const logEntry: AuditLog = {
      ...entry,
      id: crypto.randomUUID?.() ?? Math.random().toString(36).substring(2),
      timestamp: new Date(),
    };
    logs.push(logEntry);
    // For dev feedback we also console.log
    console.log('AuditLog:', logEntry);
    return Promise.resolve(logEntry);
  },

  /** Retrieve all logs (read‑only) */
  getAll() {
    return Promise.resolve([...logs]);
  },
};
