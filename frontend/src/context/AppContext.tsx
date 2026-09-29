import React, { createContext, useContext, useState, useEffect } from 'react';
import { Student, AttendanceRecord, SystemSettings, Assessment, AssessmentScore } from '../types';
import { recordAudit } from '../services/auditService';
import { getFacultyAssessmentScoresApi, getFacultyAssessmentsApi, getFacultyAttendanceApi, getFacultyStudentsApi } from '../services/apiClient';
import { useAuth } from './AuthContext';

/**
 * Shared Faculty data loaded from the server. Grades, retention status and
 * remedial state come only from the server (ACA-001); nothing here recomputes
 * them, and roster, attendance, assessment and score data are never written
 * to browser storage.
 */
interface AppContextProps {
  students: Student[];
  attendanceRecords: AttendanceRecord[];
  settings: SystemSettings;
  assessments: Assessment[];
  assessmentScores: AssessmentScore[];
  /** Development-only attendance simulation; kept in memory, never persisted. */
  addAttendanceRecord: (record: Omit<AttendanceRecord, 'id'>) => void;
  updateSettings: (settings: SystemSettings) => void;
  /** Apply a theme immediately without recording a settings audit entry. */
  applyTheme: (theme: 'light' | 'dark') => void;
  refreshAssessments: () => Promise<Assessment[]>;
  /** Mirror scores that the server has already saved. */
  saveAssessmentScores: (assessmentId: string, scores: { studentId: string; score: number | null; remarks?: string }[]) => void;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

const defaultSettings: SystemSettings = {
  retentionThreshold: 2.5,
  weights: {
    quizzes: 20,
    exams: 30,
    practicum: 40, // 40% clinical/practicum weight for dentistry program
    attendance: 10,
  },
  theme: 'light',
  transmutationDefaults: {
    minimumPercentage: 50,
    maximumPercentage: 100,
  },
};

// Academic data older builds copied into browser storage. It is removed on
// load and on sign-out so it cannot outlive the session or be mistaken for
// server data.
const LEGACY_ACADEMIC_STORAGE_KEYS = [
  'dentisys_students',
  'dentisys_attendance',
  'dentisys_assessments',
  'dentisys_assessment_scores',
  'dentisys_grading_components',
  'dentisys_mock_version',
  'dentisys_secretary_invitations',
  'dentisys_email_logs',
];

const clearLegacyAcademicStorage = () => {
  for (const key of LEGACY_ACADEMIC_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage may be unavailable; there is nothing to clear then.
    }
  }
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { phase, user } = useAuth();

  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [assessmentScores, setAssessmentScores] = useState<AssessmentScore[]>([]);

  useEffect(() => {
    clearLegacyAcademicStorage();
  }, []);

  useEffect(() => {
    let ignore = false;
    if (phase !== 'authenticated' || user?.role !== 'faculty') {
      setStudents([]);
      setAttendanceRecords([]);
      setAssessments([]);
      setAssessmentScores([]);
      if (phase !== 'authenticated') clearLegacyAcademicStorage();
      return () => {
        ignore = true;
      };
    }
    setAssessmentScores([]);
    const syncFacultyData = async () => {
      try {
        const [data, assessmentData, attendanceData] = await Promise.all([
          getFacultyStudentsApi(),
          getFacultyAssessmentsApi(),
          getFacultyAttendanceApi(),
        ]);
        if (ignore) return;

        if (Array.isArray(data)) {
          const mapped: Student[] = data.map(s => ({
            id: String(s.id),
            studentId: s.studentId,
            name: s.name,
            email: s.email,
            yearLevel: (s.yearLevel || 4) as 1 | 2 | 3 | 4,
            status: (s.status || 'active') as Student['status'],
            ...(typeof s.retentionThreshold === 'number' ? { retentionThreshold: s.retentionThreshold } : {}),
            classSections: s.classSections,
            overallGWA: s.overallGWA ?? 0,
            clinicHoursCompleted: s.clinicHoursCompleted ?? 0,
            faceEnrolled: s.faceEnrolled,
            consentStatus: (s.consentStatus || 'pending') as Student['consentStatus'],
            remedialExams: [],
            enrolledSubjects: s.enrolledSubjects ?? [],
          }));
          const persistedRetentionThreshold = data.find(
            student => typeof student.retentionThreshold === 'number'
          )?.retentionThreshold;
          if (typeof persistedRetentionThreshold === 'number') {
            setSettings(prev => ({ ...prev, retentionThreshold: persistedRetentionThreshold }));
          }
          setStudents(mapped);
        }
        const loadedAssessments = Array.isArray(assessmentData) ? assessmentData as Assessment[] : [];
        setAssessments(loadedAssessments);
        setAttendanceRecords(attendanceData.records as AttendanceRecord[]);

        // Bounded concurrency: fast enough for dozens of assessments without
        // flooding the API with one burst of parallel requests that starves
        // the route-specific API calls.
        const SCORE_FETCH_CONCURRENCY = 4;
        const scoreCollections: AssessmentScore[][] = loadedAssessments.map(() => []);
        let nextAssessmentIndex = 0;
        const loadScores = async (): Promise<void> => {
          while (!ignore && nextAssessmentIndex < loadedAssessments.length) {
            const index = nextAssessmentIndex;
            nextAssessmentIndex += 1;
            const assessment = loadedAssessments[index];
            try {
              const response = await getFacultyAssessmentScoresApi(assessment.id);
              scoreCollections[index] = response.scores.map(score => ({
                id: score.id,
                assessmentId: assessment.id,
                studentId: score.studentId,
                score: Number(score.score),
                remarks: score.remarks,
                submittedAt: score.submittedAt,
              }));
            } catch (err) {
              console.warn(`Backend score sync warning for assessment ${assessment.id}:`, err);
            }
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(SCORE_FETCH_CONCURRENCY, loadedAssessments.length) }, () => loadScores()),
        );
        if (ignore) return;
        setAssessmentScores(scoreCollections.flat());
      } catch (err) {
        if (!ignore) console.warn('Backend student sync warning:', err);
      }
    };
    void syncFacultyData();
    return () => {
      ignore = true;
    };
  }, [phase, user?.role, user?.user_id]);

  useEffect(() => {
    localStorage.setItem('dentisys_settings', JSON.stringify(settings));
    // Apply dark mode class to html element
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings]);

  const addAttendanceRecord = (record: Omit<AttendanceRecord, 'id'>) => {
    const newRecord: AttendanceRecord = {
      ...record,
      id: `att-${Math.random().toString(36).substr(2, 9)}`,
    };
    setAttendanceRecords(prev => [...prev, newRecord]);
  };

  const applyTheme = (theme: 'light' | 'dark') => {
    setSettings(prev => (prev.theme === theme ? prev : { ...prev, theme }));
  };

  const updateSettings = (newSettings: SystemSettings) => {
    setSettings(newSettings);
    recordAudit({ action: 'Updated settings', module: 'Settings', description: 'Updated permitted system or workspace settings.', status: 'Success' });
  };

  const refreshAssessments = async (): Promise<Assessment[]> => {
    try {
      const data = await getFacultyAssessmentsApi();
      const loaded = Array.isArray(data) ? (data as Assessment[]) : [];
      setAssessments(loaded);
      return loaded;
    } catch (err) {
      console.warn('Failed to refresh assessments from server:', err);
      return [];
    }
  };

  const saveAssessmentScores = (assId: string, inputScores: { studentId: string; score: number | null; remarks?: string }[]) => {
    setAssessmentScores(prev => {
      const savedStudentIds = new Set(inputScores.map(is => is.studentId));
      const filtered = prev.filter(s => s.assessmentId !== assId || !savedStudentIds.has(s.studentId));
      const newScores: AssessmentScore[] = inputScores.flatMap(is => is.score === null ? [] : [{
        id: `sc-${Math.random().toString(36).substr(2, 9)}`,
        assessmentId: assId,
        studentId: is.studentId,
        score: is.score,
        submittedAt: new Date().toISOString().split('T')[0],
        remarks: is.remarks
      }]);
      return [...filtered, ...newScores];
    });
  };

  return (
    <AppContext.Provider
      value={{
        students,
        attendanceRecords,
        settings,
        assessments,
        assessmentScores,
        addAttendanceRecord,
        updateSettings,
        applyTheme,
        refreshAssessments,
        saveAssessmentScores,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
