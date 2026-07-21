// src/services/mock/dashboardService.ts

import { ApiResponse, successResponse, errorResponse } from "../../utils/response";
import { delay } from "../../utils/delay";
import { MOCK_LATENCY_MIN, MOCK_LATENCY_MAX } from "../../config/mockConfig";

import { DashboardSummary, ClassInfo, AssessmentInfo, StudentAttentionInfo, NotificationInfo, DeadlineInfo, DashboardCharts } from "../../types/dashboard";

import { facultyService } from "./facultyService";
import { classService } from "./classService";
import { assessmentService } from "./assessmentService";
import { studentService } from "./studentService";
import { notificationService } from "./notificationService";
import { deadlineService } from "./deadlineService";
import { chartService } from "./chartService";

export const dashboardService = {
  async getDashboardSummary(): Promise<ApiResponse<DashboardSummary>> {
    try {
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
        classes.reduce((acc, cls) => acc + cls.attendanceRate, 0) / (classes.length || 1);

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
    const recent: AssessmentInfo[] = (res.data || [])
      .slice(0, 5)
      .map((a: any) => ({
        id: a.id,
        title: a.title || 'Assessment',
        subject: a.subject || 'DENT-101',
        dueDate: a.dueDate || new Date().toISOString(),
        status: a.status || 'Active',
        category: a.category || 'Quiz',
      }));
    return delay(successResponse(recent), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async getStudentsAtRisk(): Promise<ApiResponse<StudentAttentionInfo[]>> {
    const res = await studentService.getStudents();
    if (!res.success) return errorResponse<StudentAttentionInfo[]>('Failed to load students');
    const atRisk: StudentAttentionInfo[] = (res.data || [])
      .filter((s) => s.riskLevel === 'High' || s.riskLevel === 'Moderate')
      .map((s) => ({
        id: s.id,
        studentNumber: s.studentNumber,
        name: `${s.firstName} ${s.lastName}`,
        subject: s.assignedSubject ?? 'Clinical Dentistry',
        riskLevel: s.riskLevel as any,
        attendancePct: s.attendancePct ?? s.attendancePercentage ?? 100,
        gwa: s.gwa ?? s.currentGWA ?? 1.0,
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
