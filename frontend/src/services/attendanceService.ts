import { request } from './apiClient';

export interface AttendanceRecordItem {
  record_id: number;
  enrollment_id: number;
  student_id: number;
  student_number: string;
  student_name: string;
  cs_id: number;
  session_date: string;
  session_code?: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  verification_method?: string;
  secretary_user_id?: number | null;
  override_reason?: string | null;
  override_by_user_id?: number | null;
  time_recorded?: string;
}

export async function getAttendanceRecords(params?: {
  cs_id?: number;
  date?: string;
}): Promise<{ success: boolean; attendance_records: AttendanceRecordItem[] }> {
  const queryParts: string[] = [];
  if (params?.cs_id) queryParts.push(`cs_id=${params.cs_id}`);
  if (params?.date) queryParts.push(`date=${encodeURIComponent(params.date)}`);
  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

  return request<{ success: boolean; attendance_records: AttendanceRecordItem[] }>('GET', `/attendance${queryString}`);
}

export async function recordAttendance(payload: {
  enrollment_id: number;
  session_date?: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  session_code?: string;
  verification_method?: string;
}): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>('POST', '/attendance', payload);
}

export async function overrideAttendance(payload: {
  record_id?: number;
  enrollment_id?: number;
  session_date?: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  reason: string;
}): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>('POST', '/attendance/override', payload);
}
