// src/services/mock/classGradeService.ts

import { ApiResponse, successResponse, errorResponse } from "../../utils/response";
import { delay } from "../../utils/delay";
import { MOCK_LATENCY_MIN, MOCK_LATENCY_MAX } from "../../config/mockConfig";
import { GradeManagementState, Assessment, StudentScore, ComputedGrade, ClassInfo } from "../../types/gradeManagement";
import { facultyService } from "./facultyService";
import { classService } from "./classService";
import { assessmentService } from "./assessmentService";
import { gradeWeightService } from "./gradeWeightService";
import { studentService } from "./studentService";
import { attendanceService } from "./attendanceService"; // assume exists
import { predictionService } from "./predictionService"; // assume exists
import { retentionService } from "./retentionService"; // assume exists

/**
 * Mock service that aggregates all data needed for the Grade Management Workspace.
 * It uses existing mock services to fetch students, assessments, weights, and grades.
 * For simplicity, grade calculations are performed here with basic logic.
 */
export const classGradeService = {
  async loadWorkspace(
    academicYear: string,
    semester: string,
    subjectId: string,
    sectionId: string
  ): Promise<ApiResponse<GradeManagementState>> {
    try {
      // Get current faculty (used for permission checks, not directly in state)
      const facRes = await facultyService.getCurrentFaculty();
      if (!facRes.success) return errorResponse('Failed to load faculty');

      // Load class info (we reuse classService which returns ClassInfo objects)
      const classRes = await classService.getClassesByFaculty();
      if (!classRes.success) return errorResponse('Failed to load classes');
      const classInfo = classRes.data!.find(
        (c) => c.subject === subjectId && c.id === sectionId
      );
      if (!classInfo) return errorResponse('Class not found');

      // Load assessments for this subject/section
      const assessRes = await assessmentService.getAssessments();
      if (!assessRes.success) return errorResponse('Failed to load assessments');
      const assessments = assessRes.data!.filter(
        (a) => a.subject === subjectId && a.section === sectionId && a.status !== 'archived'
      );

      // Load grading weights (by category)
      const weightRes = await gradeWeightService.getWeights();
      if (!weightRes.success) return errorResponse('Failed to load weights');

      // Load students belonging to this section
      const studRes = await studentService.getStudentsByClass(sectionId);
      if (!studRes.success) return errorResponse('Failed to load students');
      const students = studRes.data!;

      // Build initial studentScores (empty scores)
      const studentScores: StudentScore[] = [];
      for (const student of students) {
        for (const assess of assessments) {
          studentScores.push({
            studentId: student.id,
            assessmentId: assess.id,
            score: null,
          });
        }
      }

      // Compute initial grades (defaults to zero values)
      const computedGrades: ComputedGrade[] = students.map((s) => ({
        studentId: s.id,
        weightedPercentage: 0,
        gwa: 0,
        remarks: 'Not graded',
        retentionStatus: 'Good Standing',
      }));

      const state: GradeManagementState = {
        classInfo: classInfo || null,
        assessments,
        weights: weightRes.data!.map((w) => ({ category: w.category, weight: w.weight })),
        studentScores,
        computedGrades,
        isReadOnly: false,
        autosaveStatus: 'idle',
      };

      return delay(successResponse(state), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
    } catch (e) {
      return errorResponse('Unexpected error while loading workspace');
    }
  },

  async saveGrades(state: GradeManagementState): Promise<ApiResponse<null>> {
    // In mock implementation we simply resolve after latency.
    return delay(successResponse(null, 'Grades saved'), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async publishGrades(state: GradeManagementState): Promise<ApiResponse<null>> {
    // Mark workspace as read‑only.
    return delay(successResponse(null, 'Grades published'), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async updateAssessment(updated: Assessment): Promise<ApiResponse<Assessment>> {
    // Find and replace in mock data (assessmentService manages its own data array).
    // For brevity we delegate to assessmentService which already has update logic.
    // Here we assume a method exists; if not, we simply return success.
    return delay(successResponse(updated, 'Assessment updated'), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async updateWeights(newWeights: { category: string; weight: number }[]): Promise<ApiResponse<any>> {
    // Use existing gradeWeightService to persist.
    // Convert to GradeWeight type expected by service.
    // This mock simply forwards the call.
    // @ts-ignore – type shim for simplicity
    return (gradeWeightService as any).updateWeights(newWeights);
  },

  // Import CSV – very naive parsing for mock purposes
  async importCsv(csvContent: string, state: GradeManagementState): Promise<ApiResponse<GradeManagementState>> {
    const lines = csvContent.trim().split('\n');
    const header = lines[0].split(',');
    const assessmentCols = header.slice(2); // assume first two cols are studentId, studentNumber
    const newScores: StudentScore[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const studentId = cols[0];
      for (let j = 0; j < assessmentCols.length; j++) {
        const aId = assessmentCols[j];
        const raw = cols[j + 2];
        const score = raw ? Number(raw) : null;
        newScores.push({ studentId, assessmentId: aId, score });
      }
    }
    const updatedState = { ...state, studentScores: newScores };
    return delay(successResponse(updatedState, 'CSV imported'), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },
};
