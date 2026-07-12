// src/components/attendance/AttendanceCorrectionDialog/AttendanceCorrectionDialog.tsx
import React, { useState } from 'react';
import { Modal } from '../../shared/Modal/Modal';
import { useAttendanceContext } from '../../../contexts/AttendanceContext';
import { useAuth } from '../../../contexts/AuthContext';
import { toast } from 'react-hot-toast';

interface Props {
  recordId: string;
  currentStatus: string;
  open: boolean;
  onClose: () => void;
}

export const AttendanceCorrectionDialog: React.FC<Props> = ({ recordId, currentStatus, open, onClose }) => {
  const { correctAttendance } = useAttendanceContext();
  const { hasPermission } = useAuth();
  const [newStatus, setNewStatus] = useState(currentStatus);
  const [reason, setReason] = useState('');

  const handleSubmit = async () => {
    if (!hasPermission('attendance.correct')) {
      toast.error('You do not have permission to correct attendance');
      return;
    }
    try {
      await correctAttendance(recordId, newStatus as any, reason);
      toast.success('Attendance corrected');
      onClose();
    } catch (e) {
      toast.error('Correction failed');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Correct Attendance">
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">New Status</span>
          <select
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
            value={newStatus}
            onChange={e => setNewStatus(e.target.value)}
          >
            <option value="Present">Present</option>
            <option value="Late">Late</option>
            <option value="Excused">Excused</option>
            <option value="Absent">Absent</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Reason</span>
          <textarea
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Reason for correction"
          />
        </label>
        <div className="flex justify-end space-x-2">
          <button
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
            onClick={handleSubmit}
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
};
