// src/components/enrollment/StudentEnrollmentDrawer/StudentEnrollmentDrawer.tsx
import React from 'react';
import { useFacialEnrollmentContext } from '../../../contexts/FacialEnrollmentContext';
import { EnrollmentStatusBadge } from '../EnrollmentStatusBadge/EnrollmentStatusBadge';
import { CaptureProgress } from '../CaptureProgress/CaptureProgress';
import type { EnrollmentRecord } from '../../../types/attendance';

interface Props {
  studentId: string;
  open: boolean;
  onClose: () => void;
}

export const StudentEnrollmentDrawer: React.FC<Props> = ({ studentId, open, onClose }) => {
  const { state, updateEnrollment } = useFacialEnrollmentContext();
  const record = state.enrollmentRecords.find((r) => r.studentId === studentId);

  const handleStatusChange = async (newStatus: EnrollmentRecord['status']) => {
    if (!record) return;
    await updateEnrollment(record.id, newStatus);
  };

  if (!record) return null;

  return (
    <div
      className={`fixed inset-0 z-40 transition-opacity ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      {/* Drawer */}
      <div
        className={`absolute right-0 top-0 h-full w-96 bg-white/80 backdrop-blur-md shadow-lg transform transition-transform ${open ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="p-4 flex items-center justify-between border-b border-slate-200">
          <h2 className="text-lg font-semibold">{record.studentName} Details</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800">✕</button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-4rem)]">
          <div>
            <p className="text-sm font-medium">Student ID:</p>
            <p className="text-sm">{record.studentId}</p>
          </div>
          <div>
            <p className="text-sm font-medium">Status:</p>
            <EnrollmentStatusBadge status={record.status} />
          </div>
          <div>
            <p className="text-sm font-medium">Capture Progress:</p>
            <CaptureProgress captured={record.imagesCaptured} total={record.totalImages} />
          </div>
          <div className="flex space-x-2">
            <select
              value={record.status}
              onChange={(e) => handleStatusChange(e.target.value as EnrollmentRecord['status'])}
              className="border rounded px-2 py-1"
            >
              <option value="Not Enrolled">Not Enrolled</option>
              <option value="Enrollment Pending">Pending</option>
              <option value="Enrolled">Enrolled</option>
              <option value="Failed">Failed</option>
              <option value="Updated">Updated</option>
              <option value="Removed">Removed</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
