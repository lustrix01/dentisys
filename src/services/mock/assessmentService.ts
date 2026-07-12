// src/services/mock/assessmentService.ts
import { Assessment, AssessmentCategory } from "../../types/assessment";
import { assessmentsData, assessmentCategoriesData } from "../../mock-data/assessments";
import { delay } from "../../utils/delay";
import { successResponse, errorResponse, ApiResponse } from "../../utils/response";
import { MOCK_LATENCY_MIN, MOCK_LATENCY_MAX } from "../../config/mockConfig";

/**
 * Mock Assessment Service
 * Provides CRUD operations on assessments and categories.
 */
export const assessmentService = {
  async getAssessments(): Promise<ApiResponse<Assessment[]>> {
    return delay(successResponse([...assessmentsData]), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async getAssessment(id: string): Promise<ApiResponse<Assessment>> {
    const assessment = assessmentsData.find((a) => a.id === id);
    if (!assessment) return delay(errorResponse<Assessment>('Assessment not found'), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
    return delay(successResponse({ ...assessment }), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async createAssessment(newAssessment: Omit<Assessment, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<Assessment>> {
    const id = `assess-${Date.now()}`;
    const now = new Date().toISOString().split('T')[0];
    const assessment: Assessment = { ...newAssessment, id, createdAt: now, updatedAt: now } as Assessment;
    assessmentsData.push(assessment);
    return delay(successResponse(assessment, 'Assessment created'), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async updateAssessment(id: string, updates: Partial<Omit<Assessment, 'id' | 'createdAt'>>): Promise<ApiResponse<Assessment>> {
    const idx = assessmentsData.findIndex((a) => a.id === id);
    if (idx === -1) return delay(errorResponse<Assessment>('Assessment not found'), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
    const updated = { ...assessmentsData[idx], ...updates, updatedAt: new Date().toISOString().split('T')[0] } as Assessment;
    assessmentsData[idx] = updated;
    return delay(successResponse(updated, 'Assessment updated'), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async archiveAssessment(id: string): Promise<ApiResponse<Assessment>> {
    return this.updateAssessment(id, { isArchived: true } as Partial<Assessment>);
  },

  async restoreAssessment(id: string): Promise<ApiResponse<Assessment>> {
    return this.updateAssessment(id, { isArchived: false } as Partial<Assessment>);
  },

  async getCategories(): Promise<ApiResponse<AssessmentCategory[]>> {
    return delay(successResponse([...assessmentCategoriesData]), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },
};
