import React from 'react'; import { AuditTrailPage } from '../../components/AuditTrailPage';
export const SuperadminAuditTrail: React.FC = () => <AuditTrailPage role="admin" title="System Audit Trail" subtitle="Review accountable activity and class work across all DentiSYS roles and modules." allLogs superadmin accent="accent" />;
export const DeanAuditTrail: React.FC = () => <AuditTrailPage role="admin" title="My Activity" subtitle="Review actions performed through your Dean account." own accent="accent" />;
