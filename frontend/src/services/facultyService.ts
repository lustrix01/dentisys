import { request } from './apiClient';

export interface FacultyDashboardData {
  success: boolean;
  stats: {
    total_students: number;
    at_risk_count: number;
    pending_remedials: number;
    attendance_rate: number;
  };
  classes: Array<{
    cs_id: number;
    cs_name: string;
    course_code: string;
    course_name: string;
    semester: string;
    school_year: string;
    year_level: number;
  }>;
}

export interface ClassSectionItem {
  cs_id: number;
  cs_name: string;
  course_id: number;
  course_code: string;
  course_name: string;
  semester: string;
  school_year: string;
  year_level: number;
  lab_room?: string;
  lec_room?: string;
  block?: string;
}

export interface ClassStudentItem {
  student_id: number;
  student_number: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  full_name: string;
  bu_email?: string;
  year_level?: number;
  enrollment_id: number;
  cs_id: number;
  final_percentage?: number | null;
  final_gwa?: number | null;
  grade_components?: {
    quizzes: number;
    exams: number;
    practicum: number;
    attendance: number;
  } | null;
  retention_state: string;
  remedial_state?: {
    remedial_score?: number | null;
    notes?: string;
    status?: string;
  } | null;
  clinic_hours_completed: number;
}

export interface RetentionRecordItem {
  enrollment_id: number;
  student_id: number;
  student_number: string;
  student_name: string;
  bu_email?: string;
  cs_id: number;
  cs_name: string;
  course_code: string;
  course_name: string;
  retention_state: string;
  final_gwa?: number | null;
  remedial_state?: {
    remedial_score?: number | null;
    notes?: string;
    status?: string;
  } | null;
}

export interface BiometricProfileItem {
  profile_id: number;
  student_id: number;
  consent_status: string;
  face_enrolled: number;
  enrolled_at?: string;
  student_number: string;
  first_name: string;
  last_name: string;
  bu_email?: string;
}

export interface EmailOutboxItem {
  email_id: number;
  sender_user_id?: number;
  recipient_email: string;
  recipient_name?: string;
  subject: string;
  email_type: string;
  status: string;
  sent_at?: string;
  created_at: string;
}

export async function getFacultyDashboard(): Promise<FacultyDashboardData> {
  return request<FacultyDashboardData>('GET', '/faculty/dashboard');
}

export async function getAssignedClasses(): Promise<{ success: boolean; classes: ClassSectionItem[] }> {
  return request<{ success: boolean; classes: ClassSectionItem[] }>('GET', '/faculty/classes');
}

export async function getClassStudents(csId: number): Promise<{ success: boolean; students: ClassStudentItem[] }> {
  return request<{ success: boolean; students: ClassStudentItem[] }>('GET', `/faculty/classes/${csId}/students`);
}

export async function getRetentionMonitoring(): Promise<{ success: boolean; retention_records: RetentionRecordItem[] }> {
  return request<{ success: boolean; retention_records: RetentionRecordItem[] }>('GET', '/faculty/retention');
}

export async function updateRemedialScore(payload: {
  enrollment_id: number;
  score?: number;
  notes?: string;
  status?: string;
}): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>('POST', '/faculty/remedials/update', payload);
}

export async function getBiometricProfiles(): Promise<{ success: boolean; biometric_profiles: BiometricProfileItem[] }> {
  return request<{ success: boolean; biometric_profiles: BiometricProfileItem[] }>('GET', '/faculty/biometrics');
}

export async function updateBiometricConsent(payload: {
  student_id: number;
  consent_status: string;
  face_enrolled?: boolean;
}): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>('POST', '/faculty/biometrics/consent', payload);
}

export async function getEmailOutbox(): Promise<{ success: boolean; emails: EmailOutboxItem[] }> {
  return request<{ success: boolean; emails: EmailOutboxItem[] }>('GET', '/faculty/emails');
}

export async function sendEmail(payload: {
  recipient_email: string;
  recipient_name?: string;
  subject: string;
  email_type?: string;
  message_body?: string;
}): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>('POST', '/faculty/emails/send', payload);
}
