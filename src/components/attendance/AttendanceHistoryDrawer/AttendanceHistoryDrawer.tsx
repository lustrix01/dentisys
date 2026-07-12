// src/components/attendance/AttendanceHistoryDrawer/AttendanceHistoryDrawer.tsx
import React from 'react';
import { useAttendanceContext } from '../../../contexts/AttendanceContext';

interface Props {
  studentId: string;
  open: boolean;
  onClose: () => void;
}

export const AttendanceHistoryDrawer: React.FC<Props> = ({ studentId, open, onClose }) => {
  const { state } = useAttendanceContext();
  const records = state.attendanceRecords.filter((r) => r.studentId === studentId);

  return (
    <div
      className={`fixed inset-0 z-40 transition-opacity ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      {/* Drawer */}
      <div
        className={`absolute right-0 top-0 h-full w-80 bg-white/80 backdrop-blur-md shadow-lg transform transition-transform ${open ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="p-4 flex items-center justify-between border-b border-slate-200">
          <h2 className="text-lg font-semibold">Attendance History</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800">
            ✕
          </button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[calc(100vh-4rem)]">
          {records.length === 0 ? (
            <p className="text-slate-600">No attendance records for this student.</p>
          ) : (
            <ul className="space-y-2">
              {records.map((rec) => (
                <li key={rec.id} className="p-2 border border-slate-200 rounded-md bg-white/60 backdrop-blur-sm">
                  <p className="text-sm"><span className="font-medium">Date:</span> {new Date(rec.date).toLocaleDateString()}</p>
                  <p className="text-sm"><span className="font-medium">Status:</span> {rec.status}</p>
                  <p className="text-sm"><span className="font-medium">Method:</span> {rec.method}</p>
                  <p className="text-sm"><span className="font-medium">Verification:</span> {rec.verification}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
