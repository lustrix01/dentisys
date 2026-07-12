// src/services/mock/retentionService.ts
import { RetentionRecord } from "../../types/retention";
import { retentionData } from "../../mock-data/retention";
import { delay } from "../../utils/delay";
import { successResponse, errorResponse, ApiResponse } from "../../utils/response";
import { MOCK_LATENCY_MIN, MOCK_LATENCY_MAX } from "../../config/mockConfig";

export const retentionService = {
  async getRetentionStatus(studentId: string): Promise<ApiResponse<RetentionRecord | null>> {
    const record = retentionData.find((r) => r.studentId === studentId) || null;
    return delay(successResponse(record), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async updateRetentionStatus(updated: RetentionRecord): Promise<ApiResponse<RetentionRecord>> {
    const idx = retentionData.findIndex((r) => r.id === updated.id);
    if (idx === -1) return delay(errorResponse<RetentionRecord>('Retention record not found'), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
    retentionData[idx] = { ...updated };
    return delay(successResponse(retentionData[idx], 'Retention updated'), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async getRetentionHistory(studentId: string): Promise<ApiResponse<RetentionRecord[]>> {
    const history = retentionData.filter((r) => r.studentId === studentId);
    return delay(successResponse(history), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },
};
