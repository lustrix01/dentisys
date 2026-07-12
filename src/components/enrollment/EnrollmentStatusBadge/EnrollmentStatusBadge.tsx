// src/components/enrollment/EnrollmentStatusBadge/EnrollmentStatusBadge.tsx
import React from 'react';
import { EnrollmentRecord } from '../../../../types/attendance';

interface Props {
  status: EnrollmentRecord['status'];
}

const statusColors: Record<EnrollmentRecord['status'], string> = {
  'Not Enrolled': 'bg-gray-500/10 text-gray-800',
  'Enrollment Pending': 'bg-amber-500/10 text-amber-800',
  'Enrolled': 'bg-emerald-500/10 text-emerald-800',
  'Failed': 'bg-rose-500/10 text-rose-800',
  'Updated': 'bg-sky-500/10 text-sky-800',
  'Removed': 'bg-slate-500/10 text-slate-800',
};

export const EnrollmentStatusBadge: React.FC<Props> = ({ status }) => {
  const classes = statusColors[status] || 'bg-slate-200/10 text-slate-800';
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${classes}`}>{status}</span>
  );
};
