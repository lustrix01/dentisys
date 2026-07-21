// src/services/mock/deadlineService.ts

import { ApiResponse, successResponse, errorResponse } from "../../utils/response";
import { delay } from "../../utils/delay";
import { MOCK_LATENCY_MIN, MOCK_LATENCY_MAX } from "../../config/mockConfig";
import { DeadlineInfo } from "../../types/dashboard";
import { deadlinesData } from "../../mock-data/deadlines";

/** Mock Deadline Service */
export const deadlineService = {
  async getUpcoming(): Promise<ApiResponse<DeadlineInfo[]>> {
    // For simplicity, return all upcoming deadlines sorted by date
    const upcoming = deadlinesData.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    return delay(successResponse(upcoming), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },
};
