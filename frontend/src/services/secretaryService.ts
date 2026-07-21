import { request } from './apiClient';

export interface SecretaryDashboardData {
  success: boolean;
  assigned_class: {
    cs_id: number;
    cs_name: string;
    course_code: string;
    course_name: string;
    lab_room?: string;
    lec_room?: string;
    block?: string;
  } | null;
  stats: {
    total_students: number;
    today_present: number;
    today_late: number;
    today_absent: number;
    today_excused: number;
    total_overrides: number;
  };
}

export interface SecretaryClassData {
  success: boolean;
  class: {
    cs_id: number;
    cs_name: string;
    course_code: string;
    course_name: string;
    lab_room?: string;
    lec_room?: string;
    block?: string;
    semester?: string;
    school_year?: string;
  } | null;
  roster: Array<{
    student_id: number;
    student_number: string;
    first_name: string;
    last_name: string;
    middle_name?: string;
    bu_email?: string;
    enrollment_id: number;
  }>;
}

export interface CctvFeedData {
  success: boolean;
  cctv: {
    status: string;
    active_cameras: number;
    total_cameras: number;
    stream_url: string;
    detection_active: boolean;
    last_sync: string;
    cameras: Array<{
      id: string;
      name: string;
      status: string;
      fps: number;
      resolution: string;
    }>;
  };
}

export async function getSecretaryDashboard(): Promise<SecretaryDashboardData> {
  return request<SecretaryDashboardData>('GET', '/secretary/dashboard');
}

export async function getSecretaryAssignedClass(): Promise<SecretaryClassData> {
  return request<SecretaryClassData>('GET', '/secretary/class');
}

export async function getCctvStatus(): Promise<CctvFeedData> {
  return request<CctvFeedData>('GET', '/secretary/cctv');
}
