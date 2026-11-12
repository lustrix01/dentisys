import type {
  StudentActiveSession,
  StudentAttendanceLogRecord,
} from '../types/index.ts';
import { formatVisibleTime } from '../utils/timeDisplay.ts';

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}

function nullableStringValue(value: unknown): string | null {
  const result = stringValue(value).trim();
  return result.length > 0 ? result : null;
}

export function normalizeStudentActiveSession(value: unknown): StudentActiveSession {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const course = row.course && typeof row.course === 'object' ? row.course as Record<string, unknown> : {};
  const status = nullableStringValue(row.alreadyRecordedStatus ?? row.attendedStatus) as StudentActiveSession['alreadyRecordedStatus'];
  return {
    id: Number(row.id ?? row.sessionId ?? 0),
    courseCode: stringValue(row.courseCode ?? course.code),
    courseName: stringValue(row.courseName ?? course.name),
    room: nullableStringValue(row.room) ?? undefined,
    schedule: nullableStringValue(row.schedule) ?? undefined,
    instructorName: nullableStringValue(row.instructorName) ?? undefined,
    geofenceRequired: typeof row.geofenceRequired === 'boolean' ? row.geofenceRequired : undefined,
    geofenceEnabled: typeof row.geofenceEnabled === 'boolean' ? row.geofenceEnabled : undefined,
    isOpen: typeof row.captureOpen === 'boolean' ? row.captureOpen : typeof row.isOpen === 'boolean' ? row.isOpen : undefined,
    captureStatus: nullableStringValue(row.captureStatus),
    alreadyRecordedStatus: status,
    openingTime: nullableStringValue(row.openingTime),
    presentCutoff: nullableStringValue(row.presentCutoff),
    lateCutoff: nullableStringValue(row.lateCutoff),
    timingConfigured: typeof row.timingConfigured === 'boolean' ? row.timingConfigured : undefined,
    status: nullableStringValue(row.status) ?? undefined,
  };
}

export function normalizeStudentAttendanceLogRecord(value: unknown): StudentAttendanceLogRecord {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const course = row.course && typeof row.course === 'object' ? row.course as Record<string, unknown> : {};
  const classSection = row.classSection && typeof row.classSection === 'object'
    ? row.classSection as Record<string, unknown>
    : {};
  const recordedAt = nullableStringValue(row.recordedAt ?? row.timeRecorded);
  const statusValue = stringValue(row.status ?? row.attendanceStatus).toLowerCase();
  const verificationValue = stringValue(row.verificationMethod).toLowerCase();
  const status: StudentAttendanceLogRecord['status'] =
    statusValue === 'present' || statusValue === 'late' || statusValue === 'absent'
      || statusValue === 'excused' || statusValue === 'unresolved'
      ? statusValue
      : 'unresolved';
  const normalizedVerificationValue = verificationValue === 'manual_faculty'
    ? 'faculty_manual'
    : verificationValue === 'manual_secretary'
      ? 'secretary_manual'
      : verificationValue;
  const verificationMethod: StudentAttendanceLogRecord['verificationMethod'] =
    normalizedVerificationValue === 'biometric' || normalizedVerificationValue === 'faculty_manual' || normalizedVerificationValue === 'secretary_manual' || normalizedVerificationValue === 'secretary_approved' || normalizedVerificationValue === 'system_resolution'
      ? normalizedVerificationValue
      : 'unknown';
  const parsedId = Number(row.id ?? row.recordId ?? 0);
  const parsedSessionId = Number(row.sessionId ?? row.attendanceSessionId ?? 0);
  let time = stringValue(row.time);
  if (!time && recordedAt) {
    const parsed = new Date(recordedAt);
    time = Number.isNaN(parsed.getTime())
      ? formatVisibleTime(recordedAt)
      : formatVisibleTime(parsed.toISOString());
  }
  return {
    id: Number.isFinite(parsedId) ? parsedId : 0,
    sessionId: Number.isFinite(parsedSessionId) && parsedSessionId > 0 ? parsedSessionId : undefined,
    sessionCode: nullableStringValue(row.sessionCode) ?? undefined,
    classSection: nullableStringValue(classSection.id) && nullableStringValue(classSection.name)
      ? { id: stringValue(classSection.id), name: stringValue(classSection.name) }
      : undefined,
    courseCode: stringValue(row.courseCode ?? course.code),
    courseName: stringValue(row.courseName ?? course.name),
    room: nullableStringValue(row.room) ?? undefined,
    instructorName: nullableStringValue(row.instructorName) ?? undefined,
    date: stringValue(row.date ?? row.sessionDate),
    time,
    status,
    verificationMethod,
  };
}

/**
 * ATT-003: at the Late cutoff, biometric capture closes and the Student must be
 * directed to Secretary/Faculty for manual attendance. These reasons are a
 * session-timing outcome, never a camera or biometric-service failure.
 */
const CAPTURE_WINDOW_REJECTION_CODES = [
  'attendance_not_open',
  'attendance_capture_closed',
  'session_timing_unconfigured',
  'session_not_active',
  'session_revoked',
] as const;

type CaptureWindowSession = Pick<StudentActiveSession, 'captureStatus' | 'openingTime' | 'presentCutoff' | 'lateCutoff'>;

const MANUAL_ATTENDANCE_DIRECTION = 'Ask your course instructor or Class Secretary to record your attendance manually.';

export function isCaptureWindowRejection(reason: string | null | undefined): boolean {
  return typeof reason === 'string' && (CAPTURE_WINDOW_REJECTION_CODES as readonly string[]).includes(reason);
}

/**
 * Plain-language capture-window notice shared by the session card, the check-in
 * button and the challenge rejection handler. Returns null for any non-timing
 * reason, so real camera or biometric-service failures keep their own copy.
 */
export function captureWindowNotice(reason: string | null | undefined, session: CaptureWindowSession): string | null {
  if (!isCaptureWindowRejection(reason)) return null;
  if (reason === 'attendance_not_open' && session.openingTime) {
    return `Biometric capture opens at ${formatVisibleTime(session.openingTime)}. ${MANUAL_ATTENDANCE_DIRECTION}`;
  }
  if (reason === 'attendance_capture_closed' && session.lateCutoff) {
    return `Biometric capture closed at ${formatVisibleTime(session.lateCutoff)}. ${MANUAL_ATTENDANCE_DIRECTION}`;
  }
  if (reason === 'session_timing_unconfigured') {
    return `This session has no attendance window configured. ${MANUAL_ATTENDANCE_DIRECTION}`;
  }
  return `Biometric capture is no longer available for this session. ${MANUAL_ATTENDANCE_DIRECTION}`;
}
