import React, { useState, useMemo } from 'react';
import { useAttendanceContext } from '../../../contexts/AttendanceContext';
import { Card } from '../../shared/Card/Card';
import { toast } from 'react-hot-toast';

// Simple pagination helper
const PAGE_SIZE = 25;

export const AttendanceTable: React.FC<{ onRowSelect?: (studentId: string) => void }> = ({ onRowSelect }) => {
  const { state, correctAttendance } = useAttendanceContext();
  const { attendanceRecords, loading, error, searchTerm, statusFilter, methodFilter } = state;

  const [currentPage, setCurrentPage] = useState(1);

  // Filtered records memoized
  const filtered = useMemo(() => {
    let data = attendanceRecords;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      data = data.filter(
        (r) =>
          r.studentName.toLowerCase().includes(term) ||
          r.studentId.toLowerCase().includes(term) ||
          r.studentNumber.toLowerCase().includes(term)
      );
    }
    if (statusFilter) data = data.filter((r) => r.status === statusFilter);
    if (methodFilter) data = data.filter((r) => r.method === methodFilter);
    return data;
  }, [attendanceRecords, searchTerm, statusFilter, methodFilter]);

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const handleStatusChange = async (recordId: string, newStatus: typeof paginated[number]['status']) => {
    try {
      await correctAttendance(recordId, newStatus, 'Status updated via UI');
      toast.success('Attendance corrected');
    } catch {
      toast.error('Failed to correct attendance');
    }
  };

  if (loading) return <p className="text-center">Loading attendance...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <Card className="overflow-hidden shadow-sm">
      <table className="w-full table-auto text-sm">
        <thead className="bg-slate-100 dark:bg-slate-800">
          <tr>
            <th className="px-4 py-2 text-left">Student</th>
            <th className="px-4 py-2 text-left">ID</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-left">Method</th>
            <th className="px-4 py-2 text-left">Verification</th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((rec) => (
            <tr key={rec.id} className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/30 cursor-pointer" onClick={() => onRowSelect && onRowSelect(rec.studentId)}>
              <td className="px-4 py-2">{rec.studentName}</td>
              <td className="px-4 py-2">{rec.studentId}</td>
              <td className="px-4 py-2 space-x-1">
                {(['Present', 'Late', 'Excused', 'Absent'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(rec.id, s)}
                    className={`px-2 py-0.5 rounded text-xs font-medium ${rec.status === s ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-800'} transition`}
                  >
                    {s}
                  </button>
                ))}
              </td>
              <td className="px-4 py-2">{rec.method}</td>
              <td className="px-4 py-2">{rec.verification}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Pagination controls */}
      <div className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
        <span className="text-xs text-slate-600 dark:text-slate-300">
          Page {currentPage} of {pageCount}
        </span>
        <div className="space-x-2">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 disabled:opacity-50"
          >
            Prev
          </button>
          <button
            disabled={currentPage === pageCount}
            onClick={() => setCurrentPage((p) => Math.min(p + 1, pageCount))}
            className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </Card>
  );
};
