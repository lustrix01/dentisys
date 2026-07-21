// src/components/enrollment/EnrollmentTable/EnrollmentTable.tsx
import React, { useMemo } from 'react';
import { useFacialEnrollmentContext } from '../../../contexts/FacialEnrollmentContext';
import { EnrollmentStatusBadge } from '../EnrollmentStatusBadge/EnrollmentStatusBadge';
import { Card } from '../../shared/Card/Card';
import { toast } from 'react-hot-toast';

export const EnrollmentTable: React.FC<{ onRowSelect?: (studentId: string) => void }> = ({ onRowSelect }) => {
  const { state, updateEnrollment } = useFacialEnrollmentContext();
  const { enrollmentRecords, loading, error } = state;

  const handleStatusChange = async (id: string, newStatus: any) => {
    try {
      await updateEnrollment(id, newStatus);
      toast.success('Enrollment status updated');
    } catch (e) {
      toast.error('Failed to update enrollment');
    }
  };

  if (loading) return <p className="text-center">Loading enrollment...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <Card className="overflow-hidden shadow-sm">
      <table className="w-full table-auto text-sm">
        <thead className="bg-slate-100 dark:bg-slate-800">
          <tr>
            <th className="px-4 py-2 text-left">Student</th>
            <th className="px-4 py-2 text-left">ID</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-left">Images</th>
          </tr>
        </thead>
        <tbody>
          {enrollmentRecords.map((rec) => (
            <tr
              key={rec.id}
              className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/30 cursor-pointer"
              onClick={() => onRowSelect && onRowSelect(rec.studentId)}
            >
              <td className="px-4 py-2">{rec.studentName}</td>
              <td className="px-4 py-2">{rec.studentId}</td>
              <td className="px-4 py-2">
                <EnrollmentStatusBadge status={rec.status} />
                {/* Simple dropdown for demo */}
                <select
                  className="ml-2"
                  value={rec.status}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleStatusChange(rec.id, e.target.value as any);
                  }}
                >
                  <option value="Not Enrolled">Not Enrolled</option>
                  <option value="Enrollment Pending">Pending</option>
                  <option value="Enrolled">Enrolled</option>
                  <option value="Failed">Failed</option>
                  <option value="Updated">Updated</option>
                  <option value="Removed">Removed</option>
                </select>
              </td>
              <td className="px-4 py-2">
                {rec.imagesCaptured}/{rec.totalImages}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
};
