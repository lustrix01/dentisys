import React, { createContext, useContext, useState, useEffect } from 'react';
import { Student, AttendanceRecord, SystemSettings, RemedialExam, GradeComponents, EnrolledSubject, AttendanceStatus, Assessment, AssessmentScore, GradingComponentConfig, RetentionLog } from '../types';
import { recordAudit } from '../services/auditService';
import { computeSubjectGrade, computeOverallGWA, percentageToGWA } from '../utils/gradeHelper';

interface AppContextProps {
  students: Student[];
  attendanceRecords: AttendanceRecord[];
  settings: SystemSettings;
  assessments: Assessment[];
  assessmentScores: AssessmentScore[];
  gradingComponents: GradingComponentConfig[];
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
  
  // Assessment Actions
  addAssessment: (assessment: Omit<Assessment, 'id' | 'createdAt'>) => void;
  updateAssessment: (assessment: Assessment) => void;
  deleteAssessment: (id: string) => void;
  archiveAssessment: (id: string) => void;
  saveAssessmentScores: (assessmentId: string, scores: { studentId: string; score: number; remarks?: string }[]) => void;
  
  // Grading Components Actions
  updateSubjectGradingComponents: (subjectCode: string, configs: GradingComponentConfig[]) => void;
  
  // Retention Status Overrides
  overrideRetentionStatus: (studentId: string, status: Student['status'], remarks: string, changedBy: string) => void;
  
  // Face Enrollment
  enrollStudentFace: (studentId: string, images: string[]) => void;
  deleteStudentFace: (studentId: string) => void;
  updateFaceConsent: (studentId: string, status: 'approved' | 'declined') => void;
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

const initialAssessments: Assessment[] = [];
const initialAssessmentScores: AssessmentScore[] = [];
const initialStudents: Student[] = [];
const generateInitialAttendance = (): AttendanceRecord[] => [];

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isV3 = localStorage.getItem('dentisys_mock_version') === 'v3';

  const [students, setStudents] = useState<Student[]>(() => {
    if (!isV3) return initialStudents;
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
    if (!isV3) return generateInitialAttendance();
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
    if (!isV3) return defaultSettings;
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

  const [assessments, setAssessments] = useState<Assessment[]>(() => {
    if (!isV3) return initialAssessments;
    const localData = localStorage.getItem('dentisys_assessments');
    if (localData) {
      try {
        return JSON.parse(localData);
      } catch (e) {
        console.error('Failed parsing assessments cache', e);
      }
    }
    return initialAssessments;
  });

  const [assessmentScores, setAssessmentScores] = useState<AssessmentScore[]>(() => {
    if (!isV3) return initialAssessmentScores;
    const localData = localStorage.getItem('dentisys_assessment_scores');
    if (localData) {
      try {
        return JSON.parse(localData);
      } catch (e) {
        console.error('Failed parsing assessment scores cache', e);
      }
    }
    return initialAssessmentScores;
  });

  const [gradingComponents, setGradingComponents] = useState<GradingComponentConfig[]>(() => {
    if (!isV3) return [];
    const localData = localStorage.getItem('dentisys_grading_components');
    if (localData) {
      try {
        return JSON.parse(localData);
      } catch (e) {
        console.error('Failed parsing grading components cache', e);
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('dentisys_mock_version', 'v3');
  }, []);

  useEffect(() => {
    localStorage.setItem('dentisys_students', JSON.stringify(students));
  }, [students]);

  useEffect(() => {
    localStorage.setItem('dentisys_attendance', JSON.stringify(attendanceRecords));
  }, [attendanceRecords]);

  useEffect(() => {
    localStorage.setItem('dentisys_assessments', JSON.stringify(assessments));
  }, [assessments]);

  useEffect(() => {
    localStorage.setItem('dentisys_assessment_scores', JSON.stringify(assessmentScores));
  }, [assessmentScores]);

  useEffect(() => {
    localStorage.setItem('dentisys_grading_components', JSON.stringify(gradingComponents));
  }, [gradingComponents]);

  useEffect(() => {
    localStorage.setItem('dentisys_settings', JSON.stringify(settings));
    // Apply dark mode class to html element
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings]);

  // Compute Grade Components helper
  const computeStudentGradesForSubject = (
    studentId: string,
    subjectCode: string,
    scores: AssessmentScore[],
    assList: Assessment[],
    compList: GradingComponentConfig[],
    attendanceRate: number
  ): GradeComponents => {
    const subjectAssessments = assList.filter(a => a.subjectCode === subjectCode && a.status !== 'Archived');
    
    const getWeightAndMax = (category: string) => {
      const config = compList.find(c => c.subjectCode === subjectCode && c.category === category);
      if (config) return { weight: config.weight, maxScore: config.maxScore };
      
      const defaults: Record<string, { weight: number; maxScore: number }> = {
        'Quiz': { weight: 15, maxScore: 50 },
        'Activity': { weight: 15, maxScore: 50 },
        'Assignment': { weight: 10, maxScore: 100 },
        'Laboratory': { weight: 30, maxScore: 100 },
        'Midterm Exam': { weight: 10, maxScore: 100 },
        'Final Exam': { weight: 10, maxScore: 100 },
        'Attendance': { weight: 10, maxScore: 100 }
      };
      return defaults[category] || { weight: 0, maxScore: 100 };
    };

    const categories = ['Quiz', 'Activity', 'Assignment', 'Laboratory', 'Midterm Exam', 'Final Exam'];
    const catSums: Record<string, { earned: number; max: number }> = {};
    
    categories.forEach(cat => {
      catSums[cat] = { earned: 0, max: 0 };
    });

    subjectAssessments.forEach(ass => {
      const studentScore = scores.find(s => s.assessmentId === ass.id && s.studentId === studentId);
      if (studentScore && studentScore.score !== undefined) {
        catSums[ass.type].earned += studentScore.score;
        catSums[ass.type].max += ass.maxScore;
      }
    });

    const catPercentages: Record<string, number> = {};
    categories.forEach(cat => {
      if (catSums[cat].max > 0) {
        catPercentages[cat] = (catSums[cat].earned / catSums[cat].max) * 100;
      } else {
        // Find existing mock percentages for initial students so we do not break layout on fresh load
        const rawStud = students.find(s => s.id === studentId);
        const rawSubj = rawStud?.enrolledSubjects.find(su => su.code === subjectCode);
        if (rawSubj) {
          if (cat === 'Laboratory') return catPercentages[cat] = rawSubj.components.practicum;
          if (cat === 'Quiz') return catPercentages[cat] = rawSubj.components.quizzes;
          if (cat === 'Midterm Exam' || cat === 'Final Exam') return catPercentages[cat] = rawSubj.components.exams;
        }
        catPercentages[cat] = 80; // default placeholder
      }
    });

    const wQuiz = getWeightAndMax('Quiz').weight;
    const wAct = getWeightAndMax('Activity').weight;
    const wAsg = getWeightAndMax('Assignment').weight;
    const quizSumWeight = wQuiz + wAct + wAsg;
    let quizzesPct = 80;
    if (quizSumWeight > 0) {
      quizzesPct = (catPercentages['Quiz'] * wQuiz + catPercentages['Activity'] * wAct + catPercentages['Assignment'] * wAsg) / quizSumWeight;
    }

    const wMid = getWeightAndMax('Midterm Exam').weight;
    const wFin = getWeightAndMax('Final Exam').weight;
    const examSumWeight = wMid + wFin;
    let examsPct = 80;
    if (examSumWeight > 0) {
      examsPct = (catPercentages['Midterm Exam'] * wMid + catPercentages['Final Exam'] * wFin) / examSumWeight;
    }

    const wLab = getWeightAndMax('Laboratory').weight;
    let practicumPct = catPercentages['Laboratory'];

    return {
      quizzes: Math.round(quizzesPct * 100) / 100,
      exams: Math.round(examsPct * 100) / 100,
      practicum: Math.round(practicumPct * 100) / 100,
      attendance: Math.round(attendanceRate * 100) / 100
    };
  };

  const syncStudentGrades = (
    studentList: Student[],
    assList: Assessment[],
    scList: AssessmentScore[],
    compList: GradingComponentConfig[],
    attList: AttendanceRecord[]
  ): Student[] => {
    return studentList.map(student => {
      const updatedSubjects = student.enrolledSubjects.map(subj => {
        const passedRem = student.remedialExams.find(
          rem => rem.subjectCode === subj.code && rem.status === 'passed'
        );
        if (passedRem && passedRem.remedialGrade !== null) {
          return {
            ...subj,
            grade: passedRem.remedialGrade,
            hasRemedial: false,
          };
        }

        const subjRecords = attList.filter(
          r => r.studentId === student.id && r.subjectCode === subj.code
        );
        let attRate = 90; // Default
        const rawStud = students.find(s => s.id === student.id);
        const rawSub = rawStud?.enrolledSubjects.find(u => u.code === subj.code);
        if (rawSub) {
          attRate = rawSub.components.attendance;
        }
        if (subjRecords.length > 0) {
          const presents = subjRecords.filter(r => r.status === 'present' || r.status === 'late').length;
          attRate = (presents / subjRecords.length) * 100;
        }

        const components = computeStudentGradesForSubject(
          student.id,
          subj.code,
          scList,
          assList,
          compList,
          attRate
        );

        let computedGrade = computeSubjectGrade(components, settings.weights);

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

      const overallGWA = computeOverallGWA(updatedSubjects);

      const remedialExams = [...student.remedialExams];
      updatedSubjects.forEach(subj => {
        const hasRemedialTriggered = subj.hasRemedial;
        const alreadyHasExam = remedialExams.some(
          rem => rem.subjectCode === subj.code && rem.status === 'pending'
        );

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
            examDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            status: 'pending',
            notes: `Automatic remediation scheduled due to grade of ${subj.grade} in ${subj.name}.`,
          });
        } else if (!hasRemedialTriggered) {
          const index = remedialExams.findIndex(
            rem => rem.subjectCode === subj.code && rem.status === 'pending'
          );
          if (index !== -1) {
            remedialExams.splice(index, 1);
          }
        }
      });

      const clinicalFails = updatedSubjects.filter(
        subj => subj.isClinical && subj.grade > settings.retentionThreshold
      );
      const outrightFails = updatedSubjects.filter(subj => subj.grade === 5.0);
      const pendingRemedials = remedialExams.filter(rem => rem.status === 'pending');

      let status: Student['status'] = student.status;

      if (pendingRemedials.length > 0) {
        status = 'remedial';
      } else if (outrightFails.length > 0 || clinicalFails.length > 0) {
        status = clinicalFails.length >= 2 || outrightFails.length >= 2 ? 'critical' : 'warning';
      } else if (remedialExams.some(rem => rem.status === 'failed')) {
        status = 'critical';
      } else {
        status = 'active';
      }

      return {
        ...student,
        enrolledSubjects: updatedSubjects,
        remedialExams,
        overallGWA,
        status,
      };
    });
  };

  // Keep students state updated when scores/assessments change
  useEffect(() => {
    setStudents(prev => {
      const synced = syncStudentGrades(prev, assessments, assessmentScores, gradingComponents, attendanceRecords);
      if (JSON.stringify(synced) !== JSON.stringify(prev)) {
        return synced;
      }
      return prev;
    });
  }, [assessments, assessmentScores, gradingComponents, attendanceRecords, settings.weights, settings.retentionThreshold]);

  const addStudent = (newStudent: Omit<Student, 'id' | 'overallGWA' | 'remedialExams' | 'status'>) => {
    const created: Student = {
      ...newStudent,
      id: Math.random().toString(36).substr(2, 9),
      status: 'active',
      overallGWA: computeOverallGWA(newStudent.enrolledSubjects),
      remedialExams: [],
    };
    setStudents(prev => syncStudentGrades([...prev, created], assessments, assessmentScores, gradingComponents, attendanceRecords));
    recordAudit({ action: 'Created student', module: 'Student Management', description: `Created student record for ${created.name}.`, status: 'Success' });
  };

  const updateStudent = (updatedStudent: Student) => {
    setStudents(prev => {
      const list = prev.map(s => (s.id === updatedStudent.id ? updatedStudent : s));
      return syncStudentGrades(list, assessments, assessmentScores, gradingComponents, attendanceRecords);
    });
    recordAudit({ action: 'Updated student', module: 'Student Management', description: `Updated student record for ${updatedStudent.name}.`, status: 'Success' });
  };

  const deleteStudent = (id: string) => {
    setStudents(prev => prev.filter(s => s.id !== id));
    recordAudit({ action: 'Deleted student', module: 'Student Management', description: `Deleted student record ${id}.`, status: 'Warning' });
  };

  const updateStudentGrade = (studentId: string, subjectCode: string, components: GradeComponents) => {
    // Legacy support: We simulate creating/updating assessments for components to fit recalculator
    setStudents(prev => {
      const updated = prev.map(student => {
        if (student.id !== studentId) return student;

        const updatedSubjects = student.enrolledSubjects.map(subj => {
          if (subj.code !== subjectCode) return subj;
          let computedGrade = computeSubjectGrade(components, settings.weights);
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

        return { ...student, enrolledSubjects: updatedSubjects };
      });
      return syncStudentGrades(updated, assessments, assessmentScores, gradingComponents, attendanceRecords);
    });
    recordAudit({ action: 'Modified grade', module: 'Grade Computation', description: `Updated grade components for ${studentId} in ${subjectCode}.`, status: 'Success' });
  };

  const addAttendanceRecord = (record: Omit<AttendanceRecord, 'id'>) => {
    const newRecord: AttendanceRecord = {
      ...record,
      id: `att-${Math.random().toString(36).substr(2, 9)}`,
    };
    setAttendanceRecords(prev => [...prev, newRecord]);
    recordAudit({ action: 'Created attendance record', module: 'Attendance', description: `Recorded ${record.status} attendance for ${record.studentId}.`, status: 'Success' });
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
    recordAudit({ action: 'Overrode attendance', module: 'Attendance', description: `Applied ${status} attendance override for ${studentId}.`, status: 'Warning' });
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
      return syncStudentGrades(updated, assessments, assessmentScores, gradingComponents, attendanceRecords);
    });
  };

  const updateRemedialExam = (remedialId: string, score: number, notes?: string) => {
    setStudents(prev => {
      const updated = prev.map(student => {
        const examIndex = student.remedialExams.findIndex(rem => rem.id === remedialId);
        if (examIndex === -1) return student;

        const originalExam = student.remedialExams[examIndex];
        const isPassed = score >= 75;
        const status = isPassed ? 'passed' : 'failed';

        let resolvedGrade: number;
        const subj = student.enrolledSubjects.find(s => s.code === originalExam.subjectCode);
        const isClinical = subj?.isClinical ?? false;

        if (isPassed) {
          resolvedGrade = isClinical ? 2.5 : 3.0; // Pass cap
        } else {
          resolvedGrade = originalExam.originalGrade;
        }

        const updatedExam: RemedialExam = {
          ...originalExam,
          remedialScore: score,
          remedialGrade: resolvedGrade,
          status,
          notes: notes || `Remediation exam resolved. Score: ${score}%. Status: ${status.toUpperCase()}.`,
        };

        const updatedExams = [...student.remedialExams];
        updatedExams[examIndex] = updatedExam;

        const updatedSubjects = student.enrolledSubjects.map(s => {
          if (s.code === originalExam.subjectCode) {
            return {
              ...s,
              grade: resolvedGrade,
              hasRemedial: !isPassed,
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

      return syncStudentGrades(updated, assessments, assessmentScores, gradingComponents, attendanceRecords);
    });
    recordAudit({ action: 'Resolved remedial exam', module: 'Retention Monitoring', description: `Recorded remedial score for ${remedialId}.`, status: 'Success' });
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
      return syncStudentGrades(updated, assessments, assessmentScores, gradingComponents, attendanceRecords);
    });
  };

  const updateSettings = (newSettings: SystemSettings) => {
    setSettings(newSettings);
    recordAudit({ action: 'Updated settings', module: 'Settings', description: 'Updated permitted system or workspace settings.', status: 'Success' });
  };

  // Assessment Actions
  const addAssessment = (newAss: Omit<Assessment, 'id' | 'createdAt'>) => {
    const created: Assessment = {
      ...newAss,
      id: `as-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString().split('T')[0]
    };
    setAssessments(prev => [...prev, created]);
    recordAudit({ action: 'Created assessment', module: 'Grade Computation', description: `Created assessment ${created.title}.`, status: 'Success' });
  };

  const updateAssessment = (updated: Assessment) => {
    setAssessments(prev => prev.map(a => a.id === updated.id ? updated : a));
    recordAudit({ action: 'Updated assessment', module: 'Grade Computation', description: `Updated assessment ${updated.title}.`, status: 'Success' });
  };

  const deleteAssessment = (id: string) => {
    setAssessments(prev => prev.filter(a => a.id !== id));
    setAssessmentScores(prev => prev.filter(s => s.assessmentId !== id));
    recordAudit({ action: 'Deleted assessment', module: 'Grade Computation', description: `Deleted assessment ${id}.`, status: 'Warning' });
  };

  const archiveAssessment = (id: string) => {
    setAssessments(prev => prev.map(a => a.id === id ? { ...a, status: 'Archived' } : a));
  };

  const saveAssessmentScores = (assId: string, inputScores: { studentId: string; score: number; remarks?: string }[]) => {
    setAssessmentScores(prev => {
      const filtered = prev.filter(s => s.assessmentId !== assId);
      const newScores: AssessmentScore[] = inputScores.map(is => ({
        id: `sc-${Math.random().toString(36).substr(2, 9)}`,
        assessmentId: assId,
        studentId: is.studentId,
        score: is.score,
        submittedAt: new Date().toISOString().split('T')[0],
        remarks: is.remarks
      }));
      return [...filtered, ...newScores];
    });
    recordAudit({ action: 'Saved assessment scores', module: 'Grade Computation', description: `Saved ${inputScores.length} scores for assessment ${assId}.`, status: 'Success' });
  };

  // Grading Components Actions
  const updateSubjectGradingComponents = (subCode: string, configs: GradingComponentConfig[]) => {
    setGradingComponents(prev => {
      const filtered = prev.filter(c => c.subjectCode !== subCode);
      return [...filtered, ...configs];
    });
    recordAudit({ action: 'Updated grading components', module: 'Grade Computation', description: `Updated grading components for ${subCode}.`, status: 'Success' });
  };

  // Retention Override
  const overrideRetentionStatus = (studId: string, newStatus: Student['status'], remarks: string, changedBy: string) => {
    setStudents(prev => prev.map(s => {
      if (s.id !== studId) return s;
      const log: RetentionLog = {
        id: `ret-log-${Math.random().toString(36).substr(2, 9)}`,
        studentId: studId,
        date: new Date().toISOString().split('T')[0],
        previousStatus: s.status,
        newStatus,
        remarks,
        changedBy
      };
      return {
        ...s,
        status: newStatus,
        retentionHistory: [...(s.retentionHistory || []), log]
      };
    }));
    recordAudit({ action: 'Overrode retention status', module: 'Retention Monitoring', description: `Changed retention status for ${studId} to ${newStatus}.`, status: 'Warning' });
  };

  // Facial Recognition Enrollment
  const enrollStudentFace = (studId: string, images: string[]) => {
    setStudents(prev => prev.map(s => {
      if (s.id !== studId) return s;
      return {
        ...s,
        faceEnrolled: true,
        faceEnrollmentDetails: {
          images,
          status: 'Enrolled & Verified',
          enrolledAt: new Date().toISOString().split('T')[0]
        }
      };
    }));
  };

  const deleteStudentFace = (studId: string) => {
    setStudents(prev => prev.map(s => {
      if (s.id !== studId) return s;
      return {
        ...s,
        faceEnrolled: false,
        faceEnrollmentDetails: undefined
      };
    }));
  };

  const updateFaceConsent = (studId: string, status: 'approved' | 'declined') => {
    setStudents(prev => prev.map(s => s.id === studId ? {
      ...s,
      consentStatus: status,
      consentRespondedAt: new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
    } : s));
    recordAudit({ action: `Facial recognition consent ${status}`, module: 'Email Management', description: `Recorded ${status} consent for ${studId}.`, status: 'Success' });
  };

  return (
    <AppContext.Provider
      value={{
        students,
        attendanceRecords,
        settings,
        assessments,
        assessmentScores,
        gradingComponents,
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
        addAssessment,
        updateAssessment,
        deleteAssessment,
        archiveAssessment,
        saveAssessmentScores,
        updateSubjectGradingComponents,
        overrideRetentionStatus,
        enrollStudentFace,
        deleteStudentFace,
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
