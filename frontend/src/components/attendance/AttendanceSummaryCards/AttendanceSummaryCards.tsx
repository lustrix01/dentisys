// src/components/attendance/AttendanceSummaryCards/AttendanceSummaryCards.tsx
import React from 'react';
import { useAttendanceContext } from '../../../contexts/AttendanceContext';
import { Card } from '../../shared/Card/Card';
import { toast } from 'react-hot-toast';

export const AttendanceSummaryCards: React.FC = () => {
  const { state } = useAttendanceContext();
  const total = state.attendanceRecords.length;
  const present = state.attendanceRecords.filter(r => r.status === 'Present').length;
  const late = state.attendanceRecords.filter(r => r.status === 'Late').length;
  const absent = state.attendanceRecords.filter(r => r.status === 'Absent').length;
  const excused = state.attendanceRecords.filter(r => r.status === 'Excused').length;
  const attendanceRate = total ? Math.round(((present + late) / total) * 100) : 0;

  // Defensive toast for unexpected zero division (should not happen)
  if (total && !attendanceRate) {
    toast.error('Attendance rate calculation error');
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
      <Card className="bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 p-4 rounded-xl shadow-lg">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Total Records</h3>
        <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{total}</p>
      </Card>
      <Card className="bg-emerald-500/10 p-4 rounded-xl shadow-md">
        <h3 className="text-sm font-medium text-emerald-700">Present</h3>
        <p className="text-xl font-bold text-emerald-800">{present}</p>
      </Card>
      <Card className="bg-amber-500/10 p-4 rounded-xl shadow-md">
        <h3 className="text-sm font-medium text-amber-700">Late</h3>
        <p className="text-xl font-bold text-amber-800">{late}</p>
      </Card>
      <Card className="bg-rose-500/10 p-4 rounded-xl shadow-md">
        <h3 className="text-sm font-medium text-rose-700">Absent</h3>
        <p className="text-xl font-bold text-rose-800">{absent}</p>
      </Card>
      <Card className="bg-sky-500/10 p-4 rounded-xl shadow-md">
        <h3 className="text-sm font-medium text-sky-700">Excused</h3>
        <p className="text-xl font-bold text-sky-800">{excused}</p>
      </Card>
      <Card className="bg-gradient-to-r from-clinical-500 to-accent-500 text-white p-4 rounded-xl shadow-lg col-span-2 md:col-span-1">
        <h3 className="text-sm font-medium">Attendance %</h3>
        <p className="text-3xl font-extrabold">{attendanceRate}%</p>
      </Card>
    </div>
  );
};
