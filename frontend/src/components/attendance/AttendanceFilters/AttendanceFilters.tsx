// src/components/attendance/AttendanceFilters/AttendanceFilters.tsx

import React from 'react';
import { useAttendanceContext } from '../../../contexts/AttendanceContext';
import { useAuth } from '../../../contexts/AuthContext';

export const AttendanceFilters: React.FC = () => {
  const { state, setSearchTerm, setStatusFilter, setMethodFilter } = useAttendanceContext();
  const { hasPermission } = useAuth();

  return (
    <div className="flex flex-wrap gap-4 p-2 bg-slate-50 dark:bg-slate-900 rounded-lg shadow-sm">
      <input
        type="text"
        placeholder="Search student..."
        className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
        value={state.searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      <select
        className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
        value={state.statusFilter}
        onChange={(e) => setStatusFilter(e.target.value as any)}
      >
        <option value="">All Statuses</option>
        <option value="Present">Present</option>
        <option value="Late">Late</option>
        <option value="Absent">Absent</option>
        <option value="Excused">Excused</option>
      </select>
      <select
        className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
        value={state.methodFilter}
        onChange={(e) => setMethodFilter(e.target.value as any)}
      >
        <option value="">All Methods</option>
        <option value="Face Recognition">Face Recognition</option>
        <option value="Manual Entry">Manual Entry</option>
        <option value="Manual Correction">Manual Correction</option>
      </select>
      {/* RBAC example: show a button only for admins */}
      {hasPermission('attendance.correct') && (
        <button className="px-4 py-2 bg-clinical-600 text-white rounded-md hover:bg-clinical-700">
          Bulk Correct
        </button>
      )}
    </div>
  );
};
