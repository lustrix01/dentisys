import React from 'react'; import { AuditTrailPage } from '../../components/AuditTrailPage';
export const SuperadminAuditTrail: React.FC = () => <AuditTrailPage role="admin" title="System Audit Trail" subtitle="Review accountable activity and class work across all DentiSYS roles and modules." allLogs superadmin accent="accent" />;
