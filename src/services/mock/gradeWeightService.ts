// src/services/mock/gradeWeightService.ts
import { GradeWeight } from "../../types/gradeWeight";
import { gradeWeightsData } from "../../mock-data/gradeWeights";
import { delay } from "../../utils/delay";
import { successResponse, errorResponse, ApiResponse } from "../../utils/response";
import { MOCK_LATENCY_MIN, MOCK_LATENCY_MAX } from "../../config/mockConfig";

export const gradeWeightService = {
  async getWeights(): Promise<ApiResponse<GradeWeight[]>> {
    return delay(successResponse([...gradeWeightsData]), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async updateWeights(newWeights: GradeWeight[]): Promise<ApiResponse<GradeWeight[]>> {
    const total = newWeights.reduce((sum, w) => sum + w.weight, 0);
    if (total !== 100) {
      return delay(errorResponse<GradeWeight[]>('Total weight must equal 100%'), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
    }
    // replace existing
    gradeWeightsData.length = 0;
    gradeWeightsData.push(...newWeights);
    return delay(successResponse([...gradeWeightsData], 'Weights updated'), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },
};
