// src/types/attendance.ts

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentNumber: string;
  studentName: string;
  subject: string;
  section: string;
  date: string; // ISO date string
  timeIn: string | null; // time string or null
  status: 'Present' | 'Late' | 'Absent' | 'Excused' | 'Manual Correction';
  method: 'Face Recognition' | 'Manual Entry' | 'Manual Correction';
  verification: 'Verified' | 'Pending' | 'Corrected';
  correctionHistory?: AttendanceCorrection[];
}

export interface AttendanceCorrection {
  correctedAt: string; // ISO timestamp
  previousStatus: AttendanceRecord['status'];
  newStatus: AttendanceRecord['status'];
  reason: string;
  correctedBy: string; // user id or role identifier
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
  lastUpdated: string; // ISO timestamp
  deviceUsed?: string;
}
