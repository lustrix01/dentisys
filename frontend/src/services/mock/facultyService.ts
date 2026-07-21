// src/services/mock/facultyService.ts

import { ApiResponse, successResponse, errorResponse } from "../../utils/response";
import { delay } from "../../utils/delay";
import { MOCK_LATENCY_MIN, MOCK_LATENCY_MAX } from "../../config/mockConfig";
import { Faculty } from "../../types/faculty";
import { facultyData } from "../../mock-data/faculty";

/** Simple mock Faculty Service */
export const facultyService = {
  /** Returns the currently logged‑in faculty. In the mock, we just return the first faculty record. */
  async getCurrentFaculty(): Promise<ApiResponse<Faculty>> {
    const faculty = facultyData[0];
    if (!faculty) return errorResponse<Faculty>('No faculty found');
    return delay(successResponse(faculty), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },
};
