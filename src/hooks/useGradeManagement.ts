import { useEffect, useState, useCallback } from 'react';
import { classGradeService } from '../../services/mock/classGradeService';
import { GradeManagementData, Assessment, StudentScore, GradeWeight, ClassRecord } from '../../types/gradeManagement';
import { ApiResponse } from '../../utils/response';

export const useGradeManagement = (facultyId: string, academicYear: string, semester: string, subjectId: string, sectionId: string) => {
  const [data, setData] = useState<GradeManagementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, classRes, assessmentsRes, weightsRes] = await Promise.all([
        classGradeService.getDashboardSummary(facultyId, academicYear, semester),
        classGradeService.getClassRecord(sectionId),
        classGradeService.getAssessments(sectionId),
        classGradeService.getWeights(),
      ]);

      if (!summaryRes.success) throw new Error(summaryRes.message);
      if (!classRes.success) throw new Error(classRes.message);
      if (!assessmentsRes.success) throw new Error(assessmentsRes.message);
      if (!weightsRes.success) throw new Error(weightsRes.message);

      setData({
        summary: summaryRes.data,
        classRecord: classRes.data,
        assessments: assessmentsRes.data,
        weights: weightsRes.data,
        // placeholder for scores, to be populated later
        studentScores: [],
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [facultyId, academicYear, semester, subjectId, sectionId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const updateScore = async (studentId: string, assessmentId: string, newScore: number) => {
    if (!data) return;
    // optimistic update
    const updatedScores = data.studentScores.map((s) =>
      s.studentId === studentId ? { ...s, scores: { ...s.scores, [assessmentId]: newScore } } : s
    );
    setData({ ...data, studentScores: updatedScores });
    // persist via service (mock)
    await classGradeService.updateStudentScore(sectionId, studentId, assessmentId, newScore);
  };

  const saveDraft = async () => {
    if (!data) return;
    await classGradeService.saveDraft(sectionId, data.studentScores);
  };

  const publishGrades = async () => {
    await classGradeService.publishGrades(sectionId);
  };

  return { data, loading, error, updateScore, saveDraft, publishGrades, refresh: fetchAll };
};
