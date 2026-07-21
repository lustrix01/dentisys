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

export const classGradeService = {
  async getDashboardSummary(facultyId: string, academicYear: string, semester: string): Promise<ApiResponse<any>> {
    return delay(successResponse({ facultyId, academicYear, semester, totalClasses: 4, averageGWA: 1.75 }), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async getClassRecord(sectionId: string): Promise<ApiResponse<any>> {
    return delay(successResponse({ sectionId, name: 'Section A', code: 'DENT-101' }), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async getAssessments(sectionId?: string): Promise<ApiResponse<any>> {
    const res = await assessmentService.getAssessments();
    return res;
  },

  async getWeights(): Promise<ApiResponse<any>> {
    const res = await gradeWeightService.getWeights();
    return res;
  },

  async updateStudentScore(sectionId: string, studentId: string, assessmentId: string, newScore: number): Promise<ApiResponse<any>> {
    return delay(successResponse(null, 'Score updated'), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async saveDraft(sectionId: string, scores: StudentScore[]): Promise<ApiResponse<any>> {
    return delay(successResponse(null, 'Draft saved'), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async loadWorkspace(
    academicYear: string,
    semester: string,
    subjectId: string,
    sectionId: string
  ): Promise<ApiResponse<GradeManagementState>> {
    try {
      const facRes = await facultyService.getCurrentFaculty();
      if (!facRes.success) return errorResponse('Failed to load faculty');

      const classRes = await classService.getClassesByFaculty();
      if (!classRes.success) return errorResponse('Failed to load classes');

      const classInfo: ClassInfo = {
        id: sectionId,
        subjectId,
        sectionId,
        academicYear,
        semester,
        instructorId: facRes.data?.id || 'fac-001',
        name: 'Clinical Dentistry 101'
      };

      const assessRes = await assessmentService.getAssessments();
      if (!assessRes.success) return errorResponse('Failed to load assessments');
      const assessments: Assessment[] = (assessRes.data || []).map((a: any, idx: number) => ({
        id: a.id,
        name: a.title || 'Assessment',
        category: a.category || 'Quiz',
        maxScore: a.maxScore || 100,
        dueDate: a.dueDate || new Date().toISOString(),
        weight: 10,
        status: 'active',
        displayOrder: idx + 1
      }));

      const weightRes = await gradeWeightService.getWeights();
      if (!weightRes.success) return errorResponse('Failed to load weights');

      const studRes = await studentService.getStudentsByClass(sectionId);
      if (!studRes.success) return errorResponse('Failed to load students');
      const students = studRes.data!;

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

      const computedGrades: ComputedGrade[] = students.map((s) => ({
        studentId: s.id,
        weightedPercentage: 0,
        gwa: 0,
        remarks: 'Not graded',
        retentionStatus: 'Good Standing',
      }));

      const state: GradeManagementState = {
        classInfo,
        assessments,
        weights: (weightRes.data || []).map((w: any) => ({ category: w.category || w.categoryId || 'General', weight: w.weight || 10 })),
        studentScores,
        computedGrades,
        isReadOnly: false,
        autosaveStatus: 'idle',
        showAssessmentDrawer: false,
        showWeightDrawer: false,
        showStudentSummaryDrawer: false,
        showPublishDialog: false,
        showImportDialog: false,
        showExportDialog: false,
        selectedStudentId: null,
        students: [],
        academicYear,
        semester,
        subjectCode: subjectId,
        sectionId,
        searchTerm: ''
      };

      return delay(successResponse(state), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
    } catch (e) {
      return errorResponse('Unexpected error while loading workspace');
    }
  },

  async saveGrades(state: GradeManagementState): Promise<ApiResponse<null>> {
    return delay(successResponse(null, 'Grades saved'), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async publishGrades(sectionId: string | GradeManagementState): Promise<ApiResponse<null>> {
    return delay(successResponse(null, 'Grades published'), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async updateAssessment(updated: Assessment): Promise<ApiResponse<Assessment>> {
    return delay(successResponse(updated, 'Assessment updated'), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async updateWeights(newWeights: { category: string; weight: number }[]): Promise<ApiResponse<any>> {
    return (gradeWeightService as any).updateWeights(newWeights);
  },

  async importCsv(csvContent: string, state: GradeManagementState): Promise<ApiResponse<GradeManagementState>> {
    const lines = csvContent.trim().split('\n');
    const header = lines[0].split(',');
    const assessmentCols = header.slice(2);
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
