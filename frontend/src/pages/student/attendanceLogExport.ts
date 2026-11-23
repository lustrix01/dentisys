// Student Attendance Logs export (backlog 14.5): the rows shown after search, filters and sort, with the
// same text the table shows, as Excel and as a print sheet.
import type { AttendanceRecord, AttendanceVerificationMethod, StudentAttendanceLogRecord } from '../../types';
import { formatVisibleTime } from '../../utils/timeDisplay.ts';
import { formatShortDate } from '../../utils/sessionDate.ts';

export const ATTENDANCE_LOG_EXPORT_HEADER = ['Date', 'Class Subject', 'Check-In Time', 'Verification Method', 'Session Location', 'Attendance Status'];

export function verificationMethodLabel(method: AttendanceVerificationMethod): string {
  switch (method) {
    case 'biometric': return 'Biometric 1:1 Verification';
    case 'faculty_manual': return 'Faculty Manual Entry';
    case 'secretary_manual': return 'Secretary Manual Entry';
    case 'secretary_approved': return 'Secretary (approved by Faculty)';
    case 'system_resolution': return 'Automatic System Resolution';
    case 'unknown': return 'Verification Method Unavailable';
    default: return 'Manual Entry';
  }
}

// Prototype records carry a method only on simulated check-ins; anything else stays blank.
export function mockVerificationMethodLabel(record: AttendanceRecord): string | null {
  switch (record.verificationType) {
    case 'facial_geofence': return 'Facial & geofence verified';
    case 'manual_override': return 'Manual override';
    case 'standard': return 'Standard verification';
    default: return null;
  }
}

export const attendanceStatusLabel = (status: string): string =>
  status === 'unresolved' ? 'Pending' : status.charAt(0).toUpperCase() + status.slice(1);

export function attendanceLogExportRow(record: StudentAttendanceLogRecord | AttendanceRecord): string[] {
  if ('courseCode' in record) {
    const method = verificationMethodLabel(record.verificationMethod);
    return [
      formatShortDate(record.date),
      `${record.courseCode} · ${record.courseName}`,
      record.time || '—',
      record.instructorName ? `${method} · By ${record.instructorName}` : method,
      record.room || '—',
      attendanceStatusLabel(record.status),
    ];
  }
  return [
    formatShortDate(record.date),
    record.subjectCode,
    formatVisibleTime(record.verifiedAt),
    mockVerificationMethodLabel(record) ?? '—',
    record.verifiedLocationName || '—',
    attendanceStatusLabel(record.status),
  ];
}

const STATUS_FILTER_LABELS: Record<string, string> = { present: 'Present', late: 'Late', excused: 'Excused', absent: 'Absent', unresolved: 'Pending resolution' };

export function attendanceLogFilterLabel(search: string, course: string, status: string): string {
  const parts = [
    course === 'all' ? 'All courses' : course,
    status === 'all' ? 'All statuses' : STATUS_FILTER_LABELS[status] ?? status,
  ];
  if (search.trim()) parts.push(`Search "${search.trim()}"`);
  return parts.join(' · ');
}

/** Attendance_Log_<StudentNumber>_<YYYY-MM-DD>.xlsx, with the date in Manila time. */
export function attendanceLogFileName(studentNumber: string, now: Date = new Date()): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const safeNumber = studentNumber.replace(/[^A-Za-z0-9-]+/g, '') || 'Student';
  return `Attendance_Log_${safeNumber}_${day}.xlsx`;
}
