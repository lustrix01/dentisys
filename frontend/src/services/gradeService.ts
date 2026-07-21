import { request } from './apiClient';

export interface AssessmentItem {
  assessment_id: number;
  cs_id: number;
  title: string;
  type: string;
  grading_period?: string;
  max_score: number;
  weight?: number | null;
  due_date?: string | null;
  instructions?: string;
  status: string;
}

export interface AssessmentScoreItem {
  score_id: number;
  assessment_id: number;
  student_id: number;
  student_number: string;
  student_name: string;
  score: number;
  submitted_at?: string;
  remarks?: string;
}

export async function getAssessments(csId?: number): Promise<{ success: boolean; assessments: AssessmentItem[] }> {
  const query = csId ? `?cs_id=${csId}` : '';
  return request<{ success: boolean; assessments: AssessmentItem[] }>('GET', `/grades/assessments${query}`);
}

export async function createAssessment(payload: {
  cs_id: number;
  title: string;
  type: string;
  grading_period?: string;
  max_score?: number;
  weight?: number;
  due_date?: string;
  instructions?: string;
}): Promise<{ success: boolean; message: string; assessment_id: number }> {
  return request<{ success: boolean; message: string; assessment_id: number }>('POST', '/grades/assessments', payload);
}

export async function getAssessmentScores(params?: {
  assessment_id?: number;
  student_id?: number;
}): Promise<{ success: boolean; scores: AssessmentScoreItem[] }> {
  const queryParts: string[] = [];
  if (params?.assessment_id) queryParts.push(`assessment_id=${params.assessment_id}`);
  if (params?.student_id) queryParts.push(`student_id=${params.student_id}`);
  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

  return request<{ success: boolean; scores: AssessmentScoreItem[] }>('GET', `/grades/scores${queryString}`);
}

export async function saveAssessmentScores(payload: {
  assessment_id: number;
  scores: Array<{
    student_id: number;
    score: number;
    remarks?: string;
  }>;
}): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>('POST', '/grades/scores', payload);
}

export async function computeClassGrades(csId: number): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>('POST', '/grades/compute', { cs_id: csId });
}
