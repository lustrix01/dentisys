import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { assessmentService } from '../services/mock/assessmentService';
import { auditLogService } from '../services/mock/auditLogService';
import { computeGrades } from '../services/gradeComputationService';
import type { Assessment, ComputedGrade, GradeManagementState, GradeStudent, GradingWeight, StudentScore } from '../types/gradeManagement';

type Action =
  | { type: 'SET_STATE'; payload: Partial<GradeManagementState> }
  | { type: 'SET_CELL'; payload: StudentScore }
  | { type: 'SET_ASSESSMENTS'; payload: Assessment[] }
  | { type: 'SET_WEIGHTS'; payload: GradingWeight[] }
  | { type: 'SET_COMPUTED_GRADES'; payload: ComputedGrade[] }
  | { type: 'SET_READONLY'; payload: boolean }
  | { type: 'TOGGLE_UI'; payload: { key: keyof GradeManagementState; value: boolean } }
  | { type: 'SET_SELECTED_STUDENT'; payload: string | null };

const initialState: GradeManagementState = {
  classInfo: null, assessments: [], weights: [], studentScores: [], computedGrades: [],
  isReadOnly: false, autosaveStatus: 'idle', showAssessmentDrawer: false, showWeightDrawer: false,
  showStudentSummaryDrawer: false, showPublishDialog: false, showImportDialog: false, showExportDialog: false,
  selectedStudentId: null, students: [], academicYear: '2026-2027', semester: 'First Semester',
  subjectCode: '', sectionId: '', searchTerm: '',
};

function reducer(state: GradeManagementState, action: Action): GradeManagementState {
  switch (action.type) {
    case 'SET_STATE': return { ...state, ...action.payload };
    case 'SET_CELL': {
      const found = state.studentScores.some(s => s.studentId === action.payload.studentId && s.assessmentId === action.payload.assessmentId);
      return { ...state, studentScores: found ? state.studentScores.map(s => s.studentId === action.payload.studentId && s.assessmentId === action.payload.assessmentId ? action.payload : s) : [...state.studentScores, action.payload] };
    }
    case 'SET_ASSESSMENTS': return { ...state, assessments: action.payload };
    case 'SET_WEIGHTS': return { ...state, weights: action.payload };
    case 'SET_COMPUTED_GRADES': return { ...state, computedGrades: action.payload };
    case 'SET_READONLY': return { ...state, isReadOnly: action.payload };
    case 'SET_SELECTED_STUDENT': return { ...state, selectedStudentId: action.payload };
    case 'TOGGLE_UI': return { ...state, [action.payload.key]: action.payload.value };
    default: return state;
  }
}

interface GradeManagementContextValue {
  state: GradeManagementState;
  dispatch: React.Dispatch<Action>;
  loadWorkspace: (academicYear: string, semester: string, subjectCode: string, sectionId: string) => Promise<void>;
  saveWorkspace: () => Promise<void>;
  publishWorkspace: () => Promise<void>;
  reopenWorkspace: (reason: string) => Promise<void>;
  canPublish: boolean;
  canReopen: boolean;
}
const GradeManagementContext = createContext<GradeManagementContextValue | undefined>(undefined);

const categoryComponent = (category: string) => {
  const value = category.toLowerCase();
  if (value.includes('quiz') || value.includes('activity') || value.includes('assignment')) return 'quizzes';
  if (value.includes('laboratory') || value.includes('practical') || value.includes('project')) return 'practicum';
  if (value.includes('attendance')) return 'attendance';
  return 'exams';
};

export const GradeManagementProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { students, updateStudentGrade } = useApp();
  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('dentisys_user') ?? '{}') as { role?: string; name?: string; email?: string; assignedClasses?: string[]; assignedSubjects?: string[] }; }
    catch { return {}; }
  }, []);
  const role = currentUser.role?.toLowerCase();
  const canPublish = role === 'faculty' || role === 'admin' || role === 'dean';
  const canReopen = role === 'admin' || role === 'dean';

  const loadWorkspace = useCallback(async (academicYear: string, semester: string, subjectCode: string, sectionId: string) => {
    const inScope = students.filter(student => {
      const assignedClass = !currentUser.assignedClasses?.length || currentUser.assignedClasses.includes(student.classId ?? '');
      const assignedSubject = !currentUser.assignedSubjects?.length || currentUser.assignedSubjects.includes(subjectCode);
      return assignedClass && assignedSubject && student.classId === sectionId && student.enrolledSubjects.some(subject => subject.code === subjectCode);
    });
    const gradeStudents: GradeStudent[] = inScope.map(student => {
      const subject = student.enrolledSubjects.find(item => item.code === subjectCode)!;
      return { id: student.id, studentNumber: student.studentId, name: student.name, classId: student.classId ?? '', className: student.className ?? student.classId ?? '', subjectCode, subjectName: subject.name, attendancePercentage: subject.components.attendance };
    });
    const response = await assessmentService.getAssessments();
    if (!response.success || !response.data) { dispatch({ type: 'SET_STATE', payload: { error: response.message ?? 'Unable to load assessments' } }); return; }
    const categories = await assessmentService.getCategories();
    const categoryMap = new Map(categories.data?.map(category => [category.id, category.name]));
    const assessments = response.data.filter(item => !item.isArchived).map((item, index) => ({ id: item.id, name: item.title, category: categoryMap.get(item.categoryId) ?? 'Other', maxScore: item.totalPoints, dueDate: item.date, status: 'active' as const, displayOrder: index }));
    const weights = Array.from(new Set(assessments.map(item => item.category))).map(category => ({ category, weight: 0 }));
    if (weights.length) weights.forEach(weight => { weight.weight = Number((100 / weights.length).toFixed(2)); });
    if (weights.length) weights[weights.length - 1].weight += 100 - weights.reduce((total, weight) => total + weight.weight, 0);
    const scores: StudentScore[] = [];
    gradeStudents.forEach(student => {
      const subject = inScope.find(item => item.id === student.id)?.enrolledSubjects.find(item => item.code === subjectCode);
      if (!subject) return;
      assessments.forEach(assessment => {
        const component = categoryComponent(assessment.category);
        scores.push({ studentId: student.id, assessmentId: assessment.id, score: Number(((subject.components[component] / 100) * assessment.maxScore).toFixed(2)) });
      });
    });
    dispatch({ type: 'SET_STATE', payload: { academicYear, semester, subjectCode, sectionId, students: gradeStudents, assessments, weights, studentScores: scores, isReadOnly: false, error: undefined, autosaveStatus: 'saved', lastSaved: new Date() } });
  }, [currentUser.assignedClasses, currentUser.assignedSubjects, students]);

  const saveWorkspace = useCallback(async () => {
    if (!state.subjectCode || !state.sectionId || state.isReadOnly) return;
    dispatch({ type: 'SET_STATE', payload: { autosaveStatus: 'saving' } });
    state.students.forEach(student => {
      const subject = students.find(item => item.id === student.id)?.enrolledSubjects.find(item => item.code === state.subjectCode);
      if (!subject) return;
      const averages = state.assessments.reduce<Record<string, { score: number; max: number }>>((result, assessment) => {
        const key = categoryComponent(assessment.category); const score = state.studentScores.find(item => item.studentId === student.id && item.assessmentId === assessment.id)?.score;
        if (score != null) { result[key] ??= { score: 0, max: 0 }; result[key].score += score; result[key].max += assessment.maxScore; }
        return result;
      }, {});
      updateStudentGrade(student.id, state.subjectCode, { quizzes: averages.quizzes ? (averages.quizzes.score / averages.quizzes.max) * 100 : subject.components.quizzes, exams: averages.exams ? (averages.exams.score / averages.exams.max) * 100 : subject.components.exams, practicum: averages.practicum ? (averages.practicum.score / averages.practicum.max) * 100 : subject.components.practicum, attendance: averages.attendance ? (averages.attendance.score / averages.attendance.max) * 100 : subject.components.attendance });
    });
    dispatch({ type: 'SET_STATE', payload: { autosaveStatus: 'saved', lastSaved: new Date() } });
  }, [state, students, updateStudentGrade]);

  const latestSave = useRef(saveWorkspace);
  useEffect(() => { latestSave.current = saveWorkspace; }, [saveWorkspace]);
  useEffect(() => { dispatch({ type: 'SET_COMPUTED_GRADES', payload: computeGrades(state) }); }, [state.assessments, state.weights, state.studentScores]);
  useEffect(() => { if (!state.subjectCode || state.isReadOnly) return; const timer = window.setTimeout(() => { void latestSave.current(); }, 650); return () => window.clearTimeout(timer); }, [state.studentScores, state.isReadOnly, state.subjectCode]);

  const publishWorkspace = useCallback(async () => {
    if (!canPublish || state.weights.reduce((sum, weight) => sum + weight.weight, 0) !== 100) throw new Error('Invalid publish request');
    await saveWorkspace(); dispatch({ type: 'SET_READONLY', payload: true });
    await auditLogService.log({ action: 'grades_published', module: 'grade-management', performedBy: currentUser.email ?? currentUser.name ?? 'unknown', targetId: `${state.subjectCode}:${state.sectionId}`, newValue: { academicYear: state.academicYear, semester: state.semester } });
  }, [canPublish, currentUser.email, currentUser.name, saveWorkspace, state]);
  const reopenWorkspace = useCallback(async (reason: string) => {
    if (!canReopen || !reason.trim()) throw new Error('A reopening reason is required');
    dispatch({ type: 'SET_READONLY', payload: false });
    await auditLogService.log({ action: 'grades_reopened', module: 'grade-management', performedBy: currentUser.email ?? currentUser.name ?? 'unknown', targetId: `${state.subjectCode}:${state.sectionId}`, reason });
  }, [canReopen, currentUser.email, currentUser.name, state.sectionId, state.subjectCode]);

  return <GradeManagementContext.Provider value={{ state, dispatch, loadWorkspace, saveWorkspace, publishWorkspace, reopenWorkspace, canPublish, canReopen }}>{children}</GradeManagementContext.Provider>;
};

export const useGradeManagementContext = () => {
  const context = useContext(GradeManagementContext);
  if (!context) throw new Error('useGradeManagementContext must be used within GradeManagementProvider');
  return context;
};
