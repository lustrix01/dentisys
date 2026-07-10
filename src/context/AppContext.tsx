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
};

const initialStudents: Student[] = [
  {
    id: '1',
    studentId: 'DENT-2022-0051',
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
        components: { quizzes: 72, exams: 74, practicum: 78, attendance: 90 }, // average: 76.2% -> 2.75 grade (fails clinical retention!)
        grade: 2.75,
        hasRemedial: true,
      },
      {
        code: 'CLIN402',
        name: 'Restorative Dentistry Clinic',
        units: 4,
        isClinical: true,
        components: { quizzes: 84, exams: 85, practicum: 88, attendance: 95 }, // average: 86.2% -> 2.0 grade
        grade: 2.0,
        hasRemedial: false,
      },
      {
        code: 'ODON401',
        name: 'Dental Jurisprudence & Ethics',
        units: 2,
        isClinical: false,
        components: { quizzes: 88, exams: 90, practicum: 0, attendance: 95 }, // average: 89% (ignoring practicum since it's lecture-only)
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
  {
    id: '2',
    studentId: 'DENT-2023-0104',
    name: 'Mark Jayson T. Santos',
    email: 'mark.santos@dentisys.edu',
    classId: 'CLINIC-A',
    className: 'Clinical Rotation A',
    yearLevel: 3,
    status: 'active',
    clinicHoursCompleted: 155,
    enrolledSubjects: [
      {
        code: 'CLIN301',
        name: 'Endodontics I Clinic',
        units: 3,
        isClinical: true,
        components: { quizzes: 86, exams: 82, practicum: 85, attendance: 95 },
        grade: 2.0,
        hasRemedial: false,
      },
      {
        code: 'CLIN302',
        name: 'Prosthodontics Clinic I',
        units: 4,
        isClinical: true,
        components: { quizzes: 88, exams: 84, practicum: 86, attendance: 98 },
        grade: 2.0,
        hasRemedial: false,
      },
      {
        code: 'ODON303',
        name: 'Oral Pathology II',
        units: 3,
        isClinical: false,
        components: { quizzes: 92, exams: 90, practicum: 0, attendance: 95 },
        grade: 1.5,
        hasRemedial: false,
      }
    ],
    overallGWA: 1.85,
    remedialExams: [],
  },
  {
    id: '3',
    studentId: 'DENT-2024-0012',
    name: 'Patricia Claire M. Lopez',
    email: 'claire.lopez@dentisys.edu',
    classId: 'DENT-2A',
    className: 'Second Year Section A',
    yearLevel: 2,
    status: 'active',
    clinicHoursCompleted: 0,
    enrolledSubjects: [
      {
        code: 'ODON202',
        name: 'Oral Histology & Embryology',
        units: 4,
        isClinical: false,
        components: { quizzes: 85, exams: 82, practicum: 80, attendance: 92 },
        grade: 2.25,
        hasRemedial: false,
      },
      {
        code: 'ANAT101',
        name: 'Head & Neck Anatomy',
        units: 4,
        isClinical: false,
        components: { quizzes: 94, exams: 90, practicum: 88, attendance: 96 },
        grade: 1.5,
        hasRemedial: false,
      }
    ],
    overallGWA: 1.88,
    remedialExams: [],
  },
  {
    id: '4',
    studentId: 'DENT-2025-0199',
    name: 'Jude Christian D. Reyes',
    email: 'jude.reyes@dentisys.edu',
    classId: 'DENT-1A',
    className: 'First Year Section A',
    yearLevel: 1,
    status: 'remedial',
    clinicHoursCompleted: 0,
    enrolledSubjects: [
      {
        code: 'BIO102',
        name: 'Dental Biochemistry',
        units: 3,
        isClinical: false,
        components: { quizzes: 60, exams: 55, practicum: 65, attendance: 80 }, // Average ~ 60.5% -> 5.0 Grade (Failing)
        grade: 5.0,
        hasRemedial: true,
      },
      {
        code: 'ODON101',
        name: 'Oral Anatomy',
        units: 3,
        isClinical: false,
        components: { quizzes: 84, exams: 80, practicum: 82, attendance: 90 },
        grade: 2.25,
        hasRemedial: false,
      }
    ],
    overallGWA: 3.63,
    remedialExams: [
      {
        id: 'rem-2',
        studentId: '4',
        studentName: 'Jude Christian D. Reyes',
        subjectCode: 'BIO102',
        subjectName: 'Dental Biochemistry',
        originalGrade: 5.0,
        remedialScore: 82, // Scored 82% on remediation
        remedialGrade: 3.0, // Capped passing grade for non-clinical
        examDate: '2026-06-18',
        status: 'passed',
        notes: 'Passed the written remediation exam on second attempt. Grade updated to passing 3.0.',
      }
    ],
  }
];

// Pre-fill attendance logs for the past few days for the subjects
const generateInitialAttendance = (): AttendanceRecord[] => {
  const records: AttendanceRecord[] = [];
  const studentsList = ['1', '2', '3', '4'];
  const dates = ['2026-06-18', '2026-06-19', '2026-06-22'];
  
  dates.forEach(date => {
    studentsList.forEach(sid => {
      // Find what subjects they are in
      const s = initialStudents.find(x => x.id === sid);
      if (s) {
        s.enrolledSubjects.forEach(subj => {
          // Generate a semi-random status (mostly present, some late/absent)
          const rand = Math.random();
          let status: 'present' | 'absent' | 'late' | 'excused' = 'present';
          if (rand > 0.95) status = 'absent';
          else if (rand > 0.88) status = 'late';
          else if (rand > 0.97) status = 'excused';

          records.push({
            id: `att-${sid}-${subj.code}-${date}`,
            studentId: sid,
            date,
            subjectCode: subj.code,
            status,
          });
        });
      }
    });
  });

  return records;
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
    // Apply dark mode class to html element
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings]);

  // Recalculates student's GWA and warning statuses
  const updateStudentStatuses = (studentList: Student[]): Student[] => {
    return studentList.map(student => {
      // 1. Calculate overall GWA
      const overallGWA = computeOverallGWA(student.enrolledSubjects);

      // 2. Assess status based on retention thresholds (no grade worse than 2.5 in clinical subjects)
      // Check if student has clinical grades > 2.5 (e.g. 2.75, 3.0, 5.0)
      const clinicalFails = student.enrolledSubjects.filter(
        subj => subj.isClinical && subj.grade > settings.retentionThreshold
      );

      // Check if they failed any subjects outright (grade === 5.0)
      const outrightFails = student.enrolledSubjects.filter(subj => subj.grade === 5.0);

      // Check if there are active remedial exams that are pending
      const pendingRemedials = student.remedialExams.filter(rem => rem.status === 'pending');

      let status: Student['status'] = 'active';

      if (outrightFails.length > 0 || clinicalFails.length > 0) {
        if (pendingRemedials.length > 0) {
          status = 'remedial';
        } else {
          status = clinicalFails.length >= 2 || outrightFails.length >= 2 ? 'critical' : 'warning';
        }
      } else if (student.remedialExams.some(rem => rem.status === 'failed')) {
        status = 'critical'; // Failed remediation triggers critical status
      }

      return {
        ...student,
        overallGWA,
        status,
      };
    });
  };

  const addStudent = (newStudent: Omit<Student, 'id' | 'overallGWA' | 'remedialExams' | 'status'>) => {
    const created: Student = {
      ...newStudent,
      id: Math.random().toString(36).substr(2, 9),
      status: 'active',
      overallGWA: computeOverallGWA(newStudent.enrolledSubjects),
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

        const updatedSubjects = student.enrolledSubjects.map(subj => {
          if (subj.code !== subjectCode) return subj;

          // Compute grade from components & settings weights
          let computedGrade = computeSubjectGrade(components, settings.weights);
          
          // Check if it violates retention rules (worse than 2.5) OR is failing outright
          const isClinicalViolation = subj.isClinical && computedGrade > settings.retentionThreshold;
          const isFailing = computedGrade === 5.0;
          const needsRemedial = isClinicalViolation || isFailing;

          return {
            ...subj,
            components,
            grade: computedGrade,
            hasRemedial: needsRemedial,
          };
        });

        // Sync remedial exam status. If a subject now needs remedial, add it if not already present.
        const remedialExams = [...student.remedialExams];
        updatedSubjects.forEach(subj => {
          const hasRemedialTriggered = subj.hasRemedial;
          const alreadyHasExam = remedialExams.some(rem => rem.subjectCode === subj.code && rem.status === 'pending');
          
          if (hasRemedialTriggered && !alreadyHasExam) {
            remedialExams.push({
              id: `rem-${Math.random().toString(36).substr(2, 9)}`,
              studentId: student.id,
              studentName: student.name,
              subjectCode: subj.code,
              subjectName: subj.name,
              originalGrade: subj.grade,
              remedialScore: null,
              remedialGrade: null,
              examDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 week from now
              status: 'pending',
              notes: `Automatic remediation scheduled due to grade of ${subj.grade} in ${subj.name}.`,
            });
          } else if (!hasRemedialTriggered) {
            // Remove pending exam if grade has been corrected to passing
            const index = remedialExams.findIndex(rem => rem.subjectCode === subj.code && rem.status === 'pending');
            if (index !== -1) {
              remedialExams.splice(index, 1);
            }
          }
        });

        return {
          ...student,
          enrolledSubjects: updatedSubjects,
          remedialExams,
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
    assignedClassId,
  }) => {
    const cleanedReason = reason.trim().replace(/\s+/g, ' ');
    const allowedStatuses: AttendanceStatus[] = ['present', 'late', 'absent'];
    const targetStudent = students.find(student => student.id === studentId);

    if (!targetStudent) {
      throw new Error('Attendance override rejected: student record was not found.');
    }

    if (assignedClassId && targetStudent.classId !== assignedClassId) {
      throw new Error('Attendance override rejected: student is outside the assigned class.');
    }

    if (!allowedStatuses.includes(status)) {
      throw new Error('Attendance override rejected: invalid attendance status.');
    }

    if (cleanedReason.length < 8 || cleanedReason.length > 240) {
      throw new Error('Attendance override rejected: reason must be 8 to 240 characters.');
    }

    setAttendanceRecords(prev => {
      const existingIndex = prev.findIndex(record =>
        (recordId && record.id === recordId) ||
        (!recordId && record.studentId === studentId && record.date === date && record.subjectCode === subjectCode)
      );

      if (existingIndex === -1) {
        const createdAt = new Date().toISOString();
        return [
          ...prev,
          {
            id: `att-${Math.random().toString(36).substr(2, 9)}`,
            studentId,
            date,
            subjectCode,
            status,
            overrideReason: cleanedReason,
            overrideBy: changedBy,
            overrideByName: changedByName,
            overrideAt: createdAt,
            auditTrail: [{
              id: `audit-${Math.random().toString(36).substr(2, 9)}`,
              previousStatus: 'absent',
              newStatus: status,
              reason: cleanedReason,
              changedBy,
              changedByName,
              changedAt: createdAt,
            }],
          },
        ];
      }

      const next = [...prev];
      const existing = next[existingIndex];
      const changedAt = new Date().toISOString();
      next[existingIndex] = {
        ...existing,
        status,
        overrideReason: cleanedReason,
        overrideBy: changedBy,
        overrideByName: changedByName,
        overrideAt: changedAt,
        auditTrail: [
          ...(existing.auditTrail || []),
          {
            id: `audit-${Math.random().toString(36).substr(2, 9)}`,
            previousStatus: existing.status,
            newStatus: status,
            reason: cleanedReason,
            changedBy,
            changedByName,
            changedAt,
          },
        ],
      };
      return next;
    });
  };

  const addRemedialExam = (newRem: Omit<RemedialExam, 'id' | 'status' | 'remedialScore' | 'remedialGrade'>) => {
    const exam: RemedialExam = {
      ...newRem,
      id: `rem-${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending',
      remedialScore: null,
      remedialGrade: null,
    };

    setStudents(prev => {
      const updated = prev.map(student => {
        if (student.id !== exam.studentId) return student;
        return {
          ...student,
          remedialExams: [...student.remedialExams, exam],
        };
      });
      return updateStudentStatuses(updated);
    });
  };

  const updateRemedialExam = (remedialId: string, score: number, notes?: string) => {
    setStudents(prev => {
      const updated = prev.map(student => {
        const examIndex = student.remedialExams.findIndex(rem => rem.id === remedialId);
        if (examIndex === -1) return student;

        const originalExam = student.remedialExams[examIndex];
        const isPassed = score >= 75; // 75% or above is passing for remediation
        const status = isPassed ? 'passed' : 'failed';

        // Dentistry rules: Remedial pass caps the grade at 2.5 for clinical, and 3.0 for non-clinical
        // If they fail, the grade remains the failing grade (or original grade)
        let resolvedGrade: number;
        const subj = student.enrolledSubjects.find(s => s.code === originalExam.subjectCode);
        const isClinical = subj?.isClinical ?? false;

        if (isPassed) {
          resolvedGrade = isClinical ? 2.5 : 3.0; // Pass cap
        } else {
          resolvedGrade = originalExam.originalGrade; // Remain failed
        }

        // Create the updated exam object
        const updatedExam: RemedialExam = {
          ...originalExam,
          remedialScore: score,
          remedialGrade: resolvedGrade,
          status,
          notes: notes || `Remediation exam resolved. Score: ${score}%. Status: ${status.toUpperCase()}.`,
        };

        const updatedExams = [...student.remedialExams];
        updatedExams[examIndex] = updatedExam;

        // Also update the subject's grade in the student's enrolled subjects!
        const updatedSubjects = student.enrolledSubjects.map(s => {
          if (s.code === originalExam.subjectCode) {
            return {
              ...s,
              grade: resolvedGrade,
              hasRemedial: !isPassed, // No longer needs remedial if passed
            };
          }
          return s;
        });

        return {
          ...student,
          enrolledSubjects: updatedSubjects,
          remedialExams: updatedExams,
        };
      });

      return updateStudentStatuses(updated);
    });
  };

  const deleteRemedialExam = (remedialId: string) => {
    setStudents(prev => {
      const updated = prev.map(student => {
        const exam = student.remedialExams.find(rem => rem.id === remedialId);
        if (!exam) return student;

        const updatedExams = student.remedialExams.filter(rem => rem.id !== remedialId);
        const updatedSubjects = student.enrolledSubjects.map(s => {
          if (s.code === exam.subjectCode) {
            return { ...s, hasRemedial: false };
          }
          return s;
        });

        return {
          ...student,
          enrolledSubjects: updatedSubjects,
          remedialExams: updatedExams,
        };
      });
      return updateStudentStatuses(updated);
    });
  };

  const updateSettings = (newSettings: SystemSettings) => {
    setSettings(newSettings);
    // Re-evaluate student warning statuses when settings change
    setStudents(prev => updateStudentStatuses(prev));
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
