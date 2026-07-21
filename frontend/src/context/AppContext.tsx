import React, { createContext, useContext, useState, useEffect } from 'react';
import { Student, AttendanceRecord, SystemSettings, RemedialExam, GradeComponents, EnrolledSubject, AttendanceStatus } from '../types';
import { computeSubjectGrade, computeOverallGWA, percentageToGWA } from '../utils/gradeHelper';

interface AppContextProps {
  students: Student[];
  attendanceRecords: AttendanceRecord[];
  settings: SystemSettings;
  addStudent: (student: Omit<Student, 'id' | 'overallGWA' | 'remedialExams' | 'status'>) => void;
  updateStudent: (student: Student) => void;
  deleteStudent: (id: string) => void;
  updateStudentGrade: (studentId: string, subjectCode: string, components: GradeComponents) => void;
  addAttendanceRecord: (record: Omit<AttendanceRecord, 'id'>) => void;
  overrideAttendanceRecord: (params: {
    recordId?: string;
    studentId: string;
    date: string;
    subjectCode: string;
    status: Exclude<AttendanceStatus, 'excused'>;
    reason: string;
    changedBy: string;
    changedByName: string;
    assignedClassId?: string;
  }) => void;
  addRemedialExam: (remedial: Omit<RemedialExam, 'id' | 'status' | 'remedialScore' | 'remedialGrade'>) => void;
  updateRemedialExam: (remedialId: string, score: number, notes?: string) => void;
  deleteRemedialExam: (remedialId: string) => void;
  updateSettings: (settings: SystemSettings) => void;
  updateFaceConsent?: (studentId: string, status: string) => void;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

const defaultSettings: SystemSettings = {
  retentionThreshold: 2.5,
  weights: {
    quizzes: 20,
    exams: 30,
    practicum: 40,
    attendance: 10,
  },
  theme: 'light',
};

const initialStudents: Student[] = [
  {
    id: '1',
    studentId: 'DENT-2022-0051',
    studentNumber: 'DENT-2022-0051',
    firstName: 'Sarah Jane',
    lastName: 'Ramos',
    courseId: 'DENT',
    sectionId: 'CLINIC-A',
    attendancePercentage: 92,
    currentGWA: 2.33,
    retentionStatus: 'warning',
    riskLevel: 'Low',
    name: 'Sarah Jane V. Ramos',
    email: 'sarah.ramos@dentisys.edu',
    classId: 'CLINIC-A',
    className: 'Clinical Rotation A',
    yearLevel: 4,
    status: 'warning',
    clinicHoursCompleted: 280,
    enrolledSubjects: [
      {
        code: 'CLIN401',
        name: 'Clinical Dentistry I (Endodontics focus)',
        units: 6,
        isClinical: true,
        components: { quizzes: 72, exams: 74, practicum: 78, attendance: 90 },
        grade: 2.75,
        hasRemedial: true,
      },
      {
        code: 'CLIN402',
        name: 'Restorative Dentistry Clinic',
        units: 4,
        isClinical: true,
        components: { quizzes: 84, exams: 85, practicum: 88, attendance: 95 },
        grade: 2.0,
        hasRemedial: false,
      },
      {
        code: 'ODON401',
        name: 'Dental Jurisprudence & Ethics',
        units: 2,
        isClinical: false,
        components: { quizzes: 88, exams: 90, practicum: 0, attendance: 95 },
        grade: 1.75,
        hasRemedial: false,
      }
    ],
    overallGWA: 2.33,
    remedialExams: [
      {
        id: 'rem-1',
        studentId: '1',
        studentName: 'Sarah Jane V. Ramos',
        subjectCode: 'CLIN401',
        subjectName: 'Clinical Dentistry I (Endodontics focus)',
        originalGrade: 2.75,
        remedialScore: null,
        remedialGrade: null,
        examDate: '2026-06-25',
        status: 'pending',
        notes: 'Needs practical clinical re-evaluation on molar root canal instrumentation.',
      }
    ],
  },
];

const generateInitialAttendance = (): AttendanceRecord[] => {
  return [];
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [students, setStudents] = useState<Student[]>(() => {
    const localData = localStorage.getItem('dentisys_students');
    if (localData) {
      try {
        return JSON.parse(localData);
      } catch (e) {
        console.error('Failed parsing students cache', e);
      }
    }
    return initialStudents;
  });

  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() => {
    const localData = localStorage.getItem('dentisys_attendance');
    if (localData) {
      try {
        return JSON.parse(localData);
      } catch (e) {
        console.error('Failed parsing attendance cache', e);
      }
    }
    return generateInitialAttendance();
  });

  const [settings, setSettings] = useState<SystemSettings>(() => {
    const localData = localStorage.getItem('dentisys_settings');
    if (localData) {
      try {
        return JSON.parse(localData);
      } catch (e) {
        console.error('Failed parsing settings cache', e);
      }
    }
    return defaultSettings;
  });

  useEffect(() => {
    localStorage.setItem('dentisys_students', JSON.stringify(students));
  }, [students]);

  useEffect(() => {
    localStorage.setItem('dentisys_attendance', JSON.stringify(attendanceRecords));
  }, [attendanceRecords]);

  useEffect(() => {
    localStorage.setItem('dentisys_settings', JSON.stringify(settings));
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings]);

  const updateStudentStatuses = (studentList: Student[]): Student[] => {
    return studentList.map(student => {
      const overallGWA = computeOverallGWA(student.enrolledSubjects || []);
      return {
        ...student,
        overallGWA,
      };
    });
  };

  const addStudent = (newStudent: Omit<Student, 'id' | 'overallGWA' | 'remedialExams' | 'status'>) => {
    const created: Student = {
      ...newStudent,
      id: Math.random().toString(36).substr(2, 9),
      status: 'active',
      overallGWA: computeOverallGWA(newStudent.enrolledSubjects || []),
      remedialExams: [],
    };
    setStudents(prev => updateStudentStatuses([...prev, created]));
  };

  const updateStudent = (updatedStudent: Student) => {
    setStudents(prev => {
      const list = prev.map(s => (s.id === updatedStudent.id ? updatedStudent : s));
      return updateStudentStatuses(list);
    });
  };

  const deleteStudent = (id: string) => {
    setStudents(prev => prev.filter(s => s.id !== id));
  };

  const updateStudentGrade = (studentId: string, subjectCode: string, components: GradeComponents) => {
    setStudents(prev => {
      const updated = prev.map(student => {
        if (student.id !== studentId) return student;
        const updatedSubjects = (student.enrolledSubjects || []).map(subj => {
          if (subj.code !== subjectCode) return subj;
          const computedGrade = computeSubjectGrade(components, settings.weights);
          return {
            ...subj,
            components,
            grade: computedGrade,
          };
        });
        return {
          ...student,
          enrolledSubjects: updatedSubjects,
        };
      });
      return updateStudentStatuses(updated);
    });
  };

  const addAttendanceRecord = (record: Omit<AttendanceRecord, 'id'>) => {
    const newRecord: AttendanceRecord = {
      ...record,
      id: `att-${Math.random().toString(36).substr(2, 9)}`,
    };
    setAttendanceRecords(prev => [...prev, newRecord]);
  };

  const overrideAttendanceRecord: AppContextProps['overrideAttendanceRecord'] = ({
    recordId,
    studentId,
    date,
    subjectCode,
    status,
    reason,
    changedBy,
    changedByName,
  }) => {
    setAttendanceRecords(prev => [...prev]);
  };

  const addRemedialExam = (newRem: Omit<RemedialExam, 'id' | 'status' | 'remedialScore' | 'remedialGrade'>) => {};
  const updateRemedialExam = (remedialId: string, score: number, notes?: string) => {};
  const deleteRemedialExam = (remedialId: string) => {};

  const updateSettings = (newSettings: SystemSettings) => {
    setSettings(newSettings);
  };

  const updateFaceConsent = (studentId: string, status: string) => {
    setStudents(prev =>
      prev.map(s => (s.id === studentId ? { ...s, consentStatus: status, consentRespondedAt: new Date().toISOString() } : s))
    );
  };

  return (
    <AppContext.Provider
      value={{
        students,
        attendanceRecords,
        settings,
        addStudent,
        updateStudent,
        deleteStudent,
        updateStudentGrade,
        addAttendanceRecord,
        overrideAttendanceRecord,
        addRemedialExam,
        updateRemedialExam,
        deleteRemedialExam,
        updateSettings,
        updateFaceConsent,
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
