// src/services/mock/chartService.ts

import { ApiResponse, successResponse, errorResponse } from "../../utils/response";
import { delay } from "../../utils/delay";
import { MOCK_LATENCY_MIN, MOCK_LATENCY_MAX } from "../../config/mockConfig";
import { DashboardCharts } from "../../types/dashboard";
import {
  attendanceTrendData,
  gradeDistributionData,
  retentionDistributionData,
  riskDistributionData,
  assessmentPerformanceData,
} from "../../mock-data/charts";

/** Mock Chart Service – provides all chart datasets for the dashboard */
export const chartService = {
  async getAllCharts(): Promise<ApiResponse<DashboardCharts>> {
    const charts: DashboardCharts = {
      attendanceTrend: attendanceTrendData,
      gradeDistribution: gradeDistributionData,
      retentionDistribution: retentionDistributionData,
      riskDistribution: riskDistributionData,
      assessmentPerformance: assessmentPerformanceData,
    };
    // In a real scenario we might filter based on faculty, but mock returns all.
    return delay(successResponse(charts), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },
};
