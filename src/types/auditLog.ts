// src/types/auditLog.ts
export interface AuditLog {
  id: string;
  timestamp: string; // ISO date
  userId: string;
  action: string; // e.g., 'create', 'update', 'delete'
  entity: string; // e.g., 'assessment', 'student'
  previousValue?: any;
  newValue?: any;
}
