import type {
  StudentActiveSession,
  StudentAttendanceLogRecord,
} from '../types/index.ts';

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
    normalizedVerificationValue === 'biometric' || normalizedVerificationValue === 'faculty_manual' || normalizedVerificationValue === 'secretary_manual' || normalizedVerificationValue === 'system_resolution'
      ? normalizedVerificationValue
      : 'unknown';
  const parsedId = Number(row.id ?? row.recordId ?? 0);
  const parsedSessionId = Number(row.sessionId ?? row.attendanceSessionId ?? 0);
  let time = stringValue(row.time);
  if (!time && recordedAt) {
    const parsed = new Date(recordedAt);
    time = Number.isNaN(parsed.getTime())
      ? recordedAt
      : parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' });
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
