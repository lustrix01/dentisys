// src/types/attendance.ts

export interface Attendance {
  id: string;
  studentId: string;
  date: string;
  status: string;
  courseId?: string;
  sectionId?: string;
  present?: number;
  attendancePct?: number;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentNumber: string;
  studentName: string;
  subject: string;
  section: string;
  date: string;
  timeIn: string | null;
  status: 'Present' | 'Late' | 'Absent' | 'Excused' | 'Manual Correction';
  method: 'Face Recognition' | 'Manual Entry' | 'Manual Correction' | string;
  verification: 'Verified' | 'Pending' | 'Corrected' | string;
  correctionHistory?: AttendanceCorrection[];
}

export interface AttendanceCorrection {
  correctedAt: string;
  previousStatus: AttendanceRecord['status'];
  newStatus: AttendanceRecord['status'];
  reason: string;
  correctedBy: string;
}

export interface EnrollmentRecord {
  id: string;
  studentId: string;
  studentNumber: string;
  studentName: string;
  subject: string;
  section: string;
  status: 'Not Enrolled' | 'Enrollment Pending' | 'Enrolled' | 'Failed' | 'Updated' | 'Removed';
  imagesCaptured: number;
  totalImages: number;
  lastUpdated: string;
  deviceUsed?: string;
}
