// src/pages/faculty/FacialEnrollment.tsx

import React, { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { useFacialEnrollmentContext } from "../../contexts/FacialEnrollmentContext";
import { EnrollmentTable } from "../../components/enrollment/EnrollmentTable/EnrollmentTable";
import { CaptureProgress } from "../../components/enrollment/CaptureProgress/CaptureProgress";
import { EnrollmentHistoryDrawer } from "../../components/enrollment/EnrollmentHistoryDrawer/EnrollmentHistoryDrawer";
import { StudentEnrollmentDrawer } from "../../components/enrollment/StudentEnrollmentDrawer/StudentEnrollmentDrawer";

export const FacialEnrollmentPage: React.FC = () => {
  const { state, loadEnrollments } = useFacialEnrollmentContext();
  const { loading, enrollmentRecords } = state;
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  // Load data on mount
  useEffect(() => {
    const fetch = async () => {
      try {
        await loadEnrollments();
        toast.success("Facial enrollment data loaded");
      } catch (e) {
        toast.error("Failed to load enrollment data");
      }
    };
    fetch();
  }, []);

  const openHistory = (studentId: string) => {
    setSelectedStudent(studentId);
    setHistoryOpen(true);
  };

  const openDetails = (studentId: string) => {
    setSelectedStudent(studentId);
    setDetailOpen(true);
  };

  const selectedRecord = enrollmentRecords.find((r) => r.studentId === selectedStudent);

  if (loading) return <div className="p-4">Loading enrollment...</div>;

  return (
    <div className="p-6 space-y-6">
      {selectedRecord && (
        <CaptureProgress captured={selectedRecord.imagesCaptured} total={selectedRecord.totalImages} />
      )}
      <EnrollmentTable onRowSelect={(id) => { openDetails(id); openHistory(id); }} />
      {selectedStudent && (
        <>
          <EnrollmentHistoryDrawer
            studentId={selectedStudent}
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
          />
          <StudentEnrollmentDrawer
            studentId={selectedStudent}
            open={detailOpen}
            onClose={() => setDetailOpen(false)}
          />
        </>
      )}
    </div>
  );
};

export default FacialEnrollmentPage;
