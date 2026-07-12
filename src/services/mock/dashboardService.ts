// src/services/mock/dashboardService.ts

import { ApiResponse, successResponse, errorResponse } from "../../utils/response";
import { delay } from "../../utils/delay";
import { MOCK_LATENCY_MIN, MOCK_LATENCY_MAX } from "../../config/mockConfig";

import { DashboardSummary, ClassInfo, AssessmentInfo, StudentAttentionInfo, NotificationInfo, DeadlineInfo, DashboardCharts } from "../../types/dashboard";

// Import existing mock services to compose higher‑level data
import { facultyService } from "./facultyService"; // will create if missing (placeholder)
import { classService } from "./classService"; // placeholder
import { assessmentService } from "./assessmentService";
import { studentService } from "./studentService";
import { notificationService } from "./notificationService"; // placeholder
import { deadlineService } from "./deadlineService"; // placeholder
import { chartService } from "./chartService"; // placeholder

/**
 * Dashboard Service – aggregates data required by the Faculty Dashboard.
 * All methods return a standardized ApiResponse<T> wrapped in a simulated latency.
 */
export const dashboardService = {
  async getDashboardSummary(): Promise<ApiResponse<DashboardSummary>> {
    try {
      // Example aggregations using existing services – adjust as needed.
      const [facultyRes, classRes] = await Promise.all([
        facultyService.getCurrentFaculty(),
        classService.getClassesByFaculty(),
      ]);
      if (!facultyRes.success || !classRes.success) {
        return errorResponse<DashboardSummary>('Failed to fetch summary data');
      }

      const faculty = facultyRes.data!;
      const classes = classRes.data!;
      const totalStudents = classes.reduce((acc, cls) => acc + cls.studentCount, 0);
      const attendanceRate =
        classes.reduce((acc, cls) => acc + cls.attendanceRate, 0) / classes.length;

      const summary: DashboardSummary = {
        assignedClasses: classes.length,
        assignedSubjects: new Set(classes.map((c) => c.subject)).size,
        totalStudents,
        attendanceRate: Math.round(attendanceRate),
        publishedGrades: faculty.publishedGrades ?? 0,
        pendingDrafts: faculty.pendingDrafts ?? 0,
        studentsUnderRemedial: faculty.remedialCount ?? 0,
        studentsAtRisk: faculty.atRiskCount ?? 0,
      };
      return delay(successResponse(summary), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
    } catch (e) {
      return errorResponse<DashboardSummary>('Unexpected error');
    }
  },

  async getAssignedClasses(): Promise<ApiResponse<ClassInfo[]>> {
    const res = await classService.getClassesByFaculty();
    if (!res.success) return errorResponse<ClassInfo[]>('Failed to load classes');
    return delay(successResponse(res.data!), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async getRecentAssessments(): Promise<ApiResponse<AssessmentInfo[]>> {
    const res = await assessmentService.getAssessments();
    if (!res.success) return errorResponse<AssessmentInfo[]>('Failed to load assessments');
    // Sort by dueDate descending and take the most recent 5
    const recent = (res.data || [])
      .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())
      .slice(0, 5);
    return delay(successResponse(recent), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async getStudentsAtRisk(): Promise<ApiResponse<StudentAttentionInfo[]>> {
    const res = await studentService.getStudents();
    if (!res.success) return errorResponse<StudentAttentionInfo[]>('Failed to load students');
    const atRisk = (res.data || [])
      .filter((s) => s.riskLevel === 'High' || s.riskLevel === 'Moderate')
      .map((s) => ({
        id: s.id,
        studentNumber: s.studentNumber,
        name: `${s.firstName} ${s.lastName}`,
        subject: s.assignedSubject ?? '',
        riskLevel: s.riskLevel as any,
        attendancePct: s.attendancePct,
        gwa: s.gwa,
        retentionStatus: s.retentionStatus ?? 'Good Standing',
      }));
    return delay(successResponse(atRisk), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async getNotifications(): Promise<ApiResponse<NotificationInfo[]>> {
    const res = await notificationService.getLatest();
    if (!res.success) return errorResponse<NotificationInfo[]>('Failed to load notifications');
    return delay(successResponse(res.data!), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async getUpcomingDeadlines(): Promise<ApiResponse<DeadlineInfo[]>> {
    const res = await deadlineService.getUpcoming();
    if (!res.success) return errorResponse<DeadlineInfo[]>('Failed to load deadlines');
    return delay(successResponse(res.data!), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async getDashboardCharts(): Promise<ApiResponse<DashboardCharts>> {
    const res = await chartService.getAllCharts();
    if (!res.success) return errorResponse<DashboardCharts>('Failed to load chart data');
    return delay(successResponse(res.data!), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },
};
