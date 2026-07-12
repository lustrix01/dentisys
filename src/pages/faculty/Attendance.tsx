// src/pages/faculty/Attendance.tsx
import React, { useEffect, useState } from 'react';
import { useAttendanceContext } from '../../contexts/AttendanceContext';
import { AttendanceSummaryCards } from '../../components/attendance/AttendanceSummaryCards/AttendanceSummaryCards';
import { AttendanceFilters } from '../../components/attendance/AttendanceFilters/AttendanceFilters';
import { AttendanceTable } from '../../components/attendance/AttendanceTable/AttendanceTable';
import { AttendanceHistoryDrawer } from '../../components/attendance/AttendanceHistoryDrawer/AttendanceHistoryDrawer';
import { toast } from 'react-hot-toast';

export const AttendancePage: React.FC = () => {
  const { state, loadAttendance } = useAttendanceContext();
  const [loading, setLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Load attendance on mount
  useEffect(() => {
    const fetch = async () => {
      try {
        await loadAttendance();
        toast.success('Attendance data loaded');
      } catch (e) {
        toast.error('Failed to load attendance');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  if (loading) return <div className="p-4">Loading attendance...</div>;

  return (
    <div className="p-6 space-y-6">
      <AttendanceSummaryCards />
      <AttendanceFilters />
      <AttendanceTable onRowSelect={(studentId) => setSelectedStudentId(studentId)} />
      {selectedStudentId && (
        <AttendanceHistoryDrawer
          studentId={selectedStudentId}
          open={true}
          onClose={() => setSelectedStudentId(null)}
        />
      )}
    </div>
  );
};

export default AttendancePage;
