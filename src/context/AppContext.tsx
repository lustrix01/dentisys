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

const initialAssessments: Assessment[] = [
  {
    id: 'as-1',
    title: 'Root Canal Access Preparation',
    type: 'Laboratory',
    subjectCode: 'CLIN401',
    classId: 'CLINIC-A',
    gradingPeriod: 'Midterm',
    maxScore: 100,
    dueDate: '2026-06-15',
    status: 'Active',
    createdAt: '2026-06-01',
    instructions: 'Prepare access cavity on a typodont molar.'
  },
  {
    id: 'as-2',
    title: 'Midterm Exam - Endodontic Diagnosis',
    type: 'Midterm Exam',
    subjectCode: 'CLIN401',
    classId: 'CLINIC-A',
    gradingPeriod: 'Midterm',
    maxScore: 100,
    dueDate: '2026-06-20',
    status: 'Active',
    createdAt: '2026-06-01'
  },
  {
    id: 'as-3',
    title: 'Quiz 1: Molar Anatomy',
    type: 'Quiz',
    subjectCode: 'CLIN401',
    classId: 'CLINIC-A',
    gradingPeriod: 'Midterm',
    maxScore: 50,
    dueDate: '2026-06-08',
    status: 'Active',
    createdAt: '2026-06-01'
  },
  {
    id: 'as-4',
    title: 'Class II Amalgam Restoration',
    type: 'Laboratory',
    subjectCode: 'CLIN402',
    classId: 'CLINIC-A',
    gradingPeriod: 'Midterm',
    maxScore: 100,
    dueDate: '2026-06-16',
    status: 'Active',
    createdAt: '2026-06-01'
  },
  {
    id: 'as-5',
    title: 'Restorative Materials Quiz',
    type: 'Quiz',
    subjectCode: 'CLIN402',
    classId: 'CLINIC-A',
    gradingPeriod: 'Midterm',
    maxScore: 20,
    dueDate: '2026-06-10',
    status: 'Active',
    createdAt: '2026-06-01'
  }
];

const initialAssessmentScores: AssessmentScore[] = [
  // Sarah Ramos (id: '1') scores
  { id: 'sc-1', assessmentId: 'as-1', studentId: '1', score: 78, submittedAt: '2026-06-16' }, // Practicum: 78%
  { id: 'sc-2', assessmentId: 'as-2', studentId: '1', score: 74, submittedAt: '2026-06-21' }, // Exam: 74%
  { id: 'sc-3', assessmentId: 'as-3', studentId: '1', score: 36, submittedAt: '2026-06-09' }, // Quiz: 36/50 = 72%
  
  // Mark Santos (id: '2') scores
  { id: 'sc-4', assessmentId: 'as-1', studentId: '2', score: 85, submittedAt: '2026-06-16' },
  { id: 'sc-5', assessmentId: 'as-2', studentId: '2', score: 82, submittedAt: '2026-06-21' },
  { id: 'sc-6', assessmentId: 'as-3', studentId: '2', score: 43, submittedAt: '2026-06-09' },

  // Ariel Mendoza (id: '5') scores
  { id: 'sc-7', assessmentId: 'as-1', studentId: '5', score: 87, submittedAt: '2026-06-16' },
  { id: 'sc-8', assessmentId: 'as-2', studentId: '5', score: 85, submittedAt: '2026-06-21' },
  { id: 'sc-9', assessmentId: 'as-3', studentId: '5', score: 44, submittedAt: '2026-06-09' },
  { id: 'sc-10', assessmentId: 'as-4', studentId: '5', score: 90, submittedAt: '2026-06-16' },
  { id: 'sc-11', assessmentId: 'as-5', studentId: '5', score: 18, submittedAt: '2026-06-10' },

  // Bianca Cruz (id: '6') scores
  { id: 'sc-12', assessmentId: 'as-1', studentId: '6', score: 70, submittedAt: '2026-06-16' },
  { id: 'sc-13', assessmentId: 'as-2', studentId: '6', score: 60, submittedAt: '2026-06-21' },
  { id: 'sc-14', assessmentId: 'as-3', studentId: '6', score: 32, submittedAt: '2026-06-09' },
  { id: 'sc-15', assessmentId: 'as-4', studentId: '6', score: 72, submittedAt: '2026-06-16' },
  { id: 'sc-16', assessmentId: 'as-5', studentId: '6', score: 14, submittedAt: '2026-06-10' },

  // Ethan Stone (id: '9') scores
  { id: 'sc-17', assessmentId: 'as-1', studentId: '9', score: 84, submittedAt: '2026-06-16' },
  { id: 'sc-18', assessmentId: 'as-2', studentId: '9', score: 80, submittedAt: '2026-06-21' },
  { id: 'sc-19', assessmentId: 'as-3', studentId: '9', score: 41, submittedAt: '2026-06-09' },
  { id: 'sc-20', assessmentId: 'as-4', studentId: '9', score: 88, submittedAt: '2026-06-16' },
  { id: 'sc-21', assessmentId: 'as-5', studentId: '9', score: 17, submittedAt: '2026-06-10' },

  // Fiona Kelly (id: '10') scores
  { id: 'sc-22', assessmentId: 'as-1', studentId: '10', score: 74, submittedAt: '2026-06-16' },
  { id: 'sc-23', assessmentId: 'as-2', studentId: '10', score: 68, submittedAt: '2026-06-21' },
  { id: 'sc-24', assessmentId: 'as-3', studentId: '10', score: 35, submittedAt: '2026-06-09' },
  { id: 'sc-25', assessmentId: 'as-4', studentId: '10', score: 80, submittedAt: '2026-06-16' },
  { id: 'sc-26', assessmentId: 'as-5', studentId: '10', score: 16, submittedAt: '2026-06-10' }
];

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
    faceEnrolled: true,
    faceEnrollmentDetails: {
      images: ['https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150'],
      status: 'Enrolled & Verified',
      enrolledAt: '2026-06-10'
    },
    retentionHistory: [
      {
        id: 'ret-1',
        studentId: '1',
        date: '2026-06-22',
        previousStatus: 'active',
        newStatus: 'warning',
        remarks: 'Triggered warning: clinical grade (2.75) in CLIN401 fell below retention standard (2.5).',
        changedBy: 'eleanor.vance@dentisys.edu'
      }
    ]
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
        components: { quizzes: 60, exams: 55, practicum: 65, attendance: 80 },
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
        remedialScore: 82,
        remedialGrade: 3.0,
        examDate: '2026-06-18',
        status: 'passed',
        notes: 'Passed the written remediation exam on second attempt. Grade updated to passing 3.0.',
      }
    ],
  },
  {
    id: '5',
    studentId: 'DENT-2022-0012',
    name: 'Ariel B. Mendoza',
    email: 'ariel.mendoza@dentisys.edu',
    classId: 'CLINIC-A',
    className: 'Clinical Rotation A',
    yearLevel: 4,
    status: 'active',
    clinicHoursCompleted: 350,
    enrolledSubjects: [
      {
        code: 'CLIN401',
        name: 'Clinical Dentistry I (Endodontics focus)',
        units: 6,
        isClinical: true,
        components: { quizzes: 88, exams: 85, practicum: 87, attendance: 95 },
        grade: 2.0,
        hasRemedial: false,
      },
      {
        code: 'CLIN402',
        name: 'Restorative Dentistry Clinic',
        units: 4,
        isClinical: true,
        components: { quizzes: 90, exams: 92, practicum: 90, attendance: 98 },
        grade: 1.5,
        hasRemedial: false,
      },
      {
        code: 'ODON401',
        name: 'Dental Jurisprudence & Ethics',
        units: 2,
        isClinical: false,
        components: { quizzes: 85, exams: 86, practicum: 0, attendance: 95 },
        grade: 2.0,
        hasRemedial: false,
      }
    ],
    overallGWA: 1.79,
    remedialExams: [],
    faceEnrolled: true,
    faceEnrollmentDetails: {
      images: ['https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150'],
      status: 'Enrolled & Verified',
      enrolledAt: '2026-06-11'
    },
    retentionHistory: []
  },
  {
    id: '6',
    studentId: 'DENT-2022-0089',
    name: 'Bianca S. Cruz',
    email: 'bianca.cruz@dentisys.edu',
    classId: 'CLINIC-A',
    className: 'Clinical Rotation A',
    yearLevel: 4,
    status: 'critical',
    clinicHoursCompleted: 190,
    enrolledSubjects: [
      {
        code: 'CLIN401',
        name: 'Clinical Dentistry I (Endodontics focus)',
        units: 6,
        isClinical: true,
        components: { quizzes: 65, exams: 60, practicum: 70, attendance: 75 },
        grade: 3.0,
        hasRemedial: true,
      },
      {
        code: 'CLIN402',
        name: 'Restorative Dentistry Clinic',
        units: 4,
        isClinical: true,
        components: { quizzes: 70, exams: 68, practicum: 72, attendance: 80 },
        grade: 3.0,
        hasRemedial: true,
      },
      {
        code: 'ODON401',
        name: 'Dental Jurisprudence & Ethics',
        units: 2,
        isClinical: false,
        components: { quizzes: 75, exams: 78, practicum: 0, attendance: 85 },
        grade: 2.5,
        hasRemedial: false,
      }
    ],
    overallGWA: 2.92,
    remedialExams: [
      {
        id: 'rem-3',
        studentId: '6',
        studentName: 'Bianca S. Cruz',
        subjectCode: 'CLIN401',
        subjectName: 'Clinical Dentistry I (Endodontics focus)',
        originalGrade: 3.0,
        remedialScore: null,
        remedialGrade: null,
        examDate: '2026-07-02',
        status: 'pending',
        notes: 'Needs to retake root canal instrumentation practical assessment.',
      },
      {
        id: 'rem-4',
        studentId: '6',
        studentName: 'Bianca S. Cruz',
        subjectCode: 'CLIN402',
        subjectName: 'Restorative Dentistry Clinic',
        originalGrade: 3.0,
        remedialScore: null,
        remedialGrade: null,
        examDate: '2026-07-03',
        status: 'pending',
        notes: 'Needs to retake cavity preparation practical assessment.',
      }
    ],
    faceEnrolled: false,
    retentionHistory: [
      {
        id: 'ret-2',
        studentId: '6',
        date: '2026-06-23',
        previousStatus: 'warning',
        newStatus: 'critical',
        remarks: 'Downgraded to Critical: multiple clinical subject grades exceed 2.5 limits.',
        changedBy: 'eleanor.vance@dentisys.edu'
      }
    ]
  },
  {
    id: '7',
    studentId: 'DENT-2023-0004',
    name: 'Carlos M. Yulo',
    email: 'carlos.yulo@dentisys.edu',
    classId: 'CLINIC-A',
    className: 'Clinical Rotation A',
    yearLevel: 3,
    status: 'active',
    clinicHoursCompleted: 280,
    enrolledSubjects: [
      {
        code: 'CLIN301',
        name: 'Endodontics I Clinic',
        units: 3,
        isClinical: true,
        components: { quizzes: 95, exams: 92, practicum: 94, attendance: 98 },
        grade: 1.25,
        hasRemedial: false,
      },
      {
        code: 'CLIN302',
        name: 'Prosthodontics Clinic I',
        units: 4,
        isClinical: true,
        components: { quizzes: 92, exams: 94, practicum: 93, attendance: 99 },
        grade: 1.25,
        hasRemedial: false,
      },
      {
        code: 'ODON303',
        name: 'Oral Pathology II',
        units: 3,
        isClinical: false,
        components: { quizzes: 88, exams: 89, practicum: 0, attendance: 95 },
        grade: 1.75,
        hasRemedial: false,
      }
    ],
    overallGWA: 1.40,
    remedialExams: [],
    faceEnrolled: true,
    faceEnrollmentDetails: {
      images: ['https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150'],
      status: 'Enrolled & Verified',
      enrolledAt: '2026-06-15'
    },
    retentionHistory: []
  },
  {
    id: '8',
    studentId: 'DENT-2023-0077',
    name: 'Diana G. Rivera',
    email: 'diana.rivera@dentisys.edu',
    classId: 'CLINIC-A',
    className: 'Clinical Rotation A',
    yearLevel: 3,
    status: 'warning',
    clinicHoursCompleted: 120,
    enrolledSubjects: [
      {
        code: 'CLIN301',
        name: 'Endodontics I Clinic',
        units: 3,
        isClinical: true,
        components: { quizzes: 70, exams: 72, practicum: 75, attendance: 88 },
        grade: 2.75,
        hasRemedial: true,
      },
      {
        code: 'CLIN302',
        name: 'Prosthodontics Clinic I',
        units: 4,
        isClinical: true,
        components: { quizzes: 76, exams: 74, practicum: 78, attendance: 90 },
        grade: 2.5,
        hasRemedial: false,
      },
      {
        code: 'ODON303',
        name: 'Oral Pathology II',
        units: 3,
        isClinical: false,
        components: { quizzes: 78, exams: 80, practicum: 0, attendance: 92 },
        grade: 2.5,
        hasRemedial: false,
      }
    ],
    overallGWA: 2.58,
    remedialExams: [
      {
        id: 'rem-5',
        studentId: '8',
        studentName: 'Diana G. Rivera',
        subjectCode: 'CLIN301',
        subjectName: 'Endodontics I Clinic',
        originalGrade: 2.75,
        remedialScore: null,
        remedialGrade: null,
        examDate: '2026-06-29',
        status: 'pending',
        notes: 'Needs practice on molar root canal preparation.',
      }
    ],
    faceEnrolled: true,
    faceEnrollmentDetails: {
      images: ['https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150'],
      status: 'Enrolled & Verified',
      enrolledAt: '2026-06-18'
    },
    retentionHistory: [
      {
        id: 'ret-3',
        studentId: '8',
        date: '2026-06-24',
        previousStatus: 'active',
        newStatus: 'warning',
        remarks: 'Warning standing due to GWA of 2.75 in CLIN301.',
        changedBy: 'eleanor.vance@dentisys.edu'
      }
    ]
  },
  {
    id: '9',
    studentId: 'DENT-2022-0125',
    name: 'Ethan L. Stone',
    email: 'ethan.stone@dentisys.edu',
    classId: 'CLINIC-A',
    className: 'Clinical Rotation A',
    yearLevel: 4,
    status: 'active',
    clinicHoursCompleted: 320,
    enrolledSubjects: [
      {
        code: 'CLIN401',
        name: 'Clinical Dentistry I (Endodontics focus)',
        units: 6,
        isClinical: true,
        components: { quizzes: 82, exams: 80, practicum: 84, attendance: 93 },
        grade: 2.25,
        hasRemedial: false,
      },
      {
        code: 'CLIN402',
        name: 'Restorative Dentistry Clinic',
        units: 4,
        isClinical: true,
        components: { quizzes: 86, exams: 85, practicum: 88, attendance: 96 },
        grade: 2.0,
        hasRemedial: false,
      },
      {
        code: 'ODON401',
        name: 'Dental Jurisprudence & Ethics',
        units: 2,
        isClinical: false,
        components: { quizzes: 90, exams: 92, practicum: 0, attendance: 98 },
        grade: 1.5,
        hasRemedial: false,
      }
    ],
    overallGWA: 2.04,
    remedialExams: [],
    faceEnrolled: true,
    faceEnrollmentDetails: {
      images: ['https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150'],
      status: 'Enrolled & Verified',
      enrolledAt: '2026-06-12'
    },
    retentionHistory: []
  },
  {
    id: '10',
    studentId: 'DENT-2022-0198',
    name: 'Fiona R. Kelly',
    email: 'fiona.kelly@dentisys.edu',
    classId: 'CLINIC-A',
    className: 'Clinical Rotation A',
    yearLevel: 4,
    status: 'remedial',
    clinicHoursCompleted: 210,
    enrolledSubjects: [
      {
        code: 'CLIN401',
        name: 'Clinical Dentistry I (Endodontics focus)',
        units: 6,
        isClinical: true,
        components: { quizzes: 70, exams: 78, practicum: 75, attendance: 88 },
        grade: 2.5,
        hasRemedial: false,
      },
      {
        code: 'CLIN402',
        name: 'Restorative Dentistry Clinic',
        units: 4,
        isClinical: true,
        components: { quizzes: 78, exams: 75, practicum: 80, attendance: 90 },
        grade: 2.5,
        hasRemedial: false,
      },
      {
        code: 'ODON401',
        name: 'Dental Jurisprudence & Ethics',
        units: 2,
        isClinical: false,
        components: { quizzes: 80, exams: 82, practicum: 0, attendance: 92 },
        grade: 2.5,
        hasRemedial: false,
      }
    ],
    overallGWA: 2.50,
    remedialExams: [
      {
        id: 'rem-6',
        studentId: '10',
        studentName: 'Fiona R. Kelly',
        subjectCode: 'CLIN401',
        subjectName: 'Clinical Dentistry I (Endodontics focus)',
        originalGrade: 2.75,
        remedialScore: 80,
        remedialGrade: 2.5,
        examDate: '2026-06-24',
        status: 'passed',
        notes: 'Passed the clinical remedial exam on practical crown preparation.',
      }
    ],
    faceEnrolled: true,
    faceEnrollmentDetails: {
      images: ['https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150'],
      status: 'Enrolled & Verified',
      enrolledAt: '2026-06-19'
    },
    retentionHistory: [
      {
        id: 'ret-4',
        studentId: '10',
        date: '2026-06-25',
        previousStatus: 'warning',
        newStatus: 'remedial',
        remarks: 'Moved to remedial standing: successfully cleared CLIN401 remediation exam.',
        changedBy: 'eleanor.vance@dentisys.edu'
      }
    ]
  },

  // ===== CLINIC-B: Clinical Rotation B =====
  {
    id: '11',
    studentId: 'DENT-2022-0301',
    name: 'Miguel A. Reyes',
    email: 'miguel.reyes@dentisys.edu',
    classId: 'CLINIC-B',
    className: 'Clinical Rotation B',
    yearLevel: 4,
    status: 'active',
    clinicHoursCompleted: 310,
    enrolledSubjects: [
      {
        code: 'CLIN401',
        name: 'Clinical Dentistry I (Endodontics focus)',
        units: 6,
        isClinical: true,
        components: { quizzes: 90, exams: 88, practicum: 92, attendance: 98 },
        grade: 1.25,
        hasRemedial: false,
      },
      {
        code: 'CLIN402',
        name: 'Restorative Dentistry Clinic',
        units: 4,
        isClinical: true,
        components: { quizzes: 88, exams: 90, practicum: 91, attendance: 97 },
        grade: 1.25,
        hasRemedial: false,
      },
      {
        code: 'ODON401',
        name: 'Dental Jurisprudence & Ethics',
        units: 2,
        isClinical: false,
        components: { quizzes: 93, exams: 95, practicum: 0, attendance: 99 },
        grade: 1.0,
        hasRemedial: false,
      }
    ],
    overallGWA: 1.20,
    remedialExams: [],
    faceEnrolled: true,
    faceEnrollmentDetails: {
      images: ['https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'],
      status: 'Enrolled & Verified',
      enrolledAt: '2026-06-10'
    },
    retentionHistory: []
  },
  {
    id: '12',
    studentId: 'DENT-2022-0302',
    name: 'Lea M. Corpus',
    email: 'lea.corpus@dentisys.edu',
    classId: 'CLINIC-B',
    className: 'Clinical Rotation B',
    yearLevel: 4,
    status: 'warning',
    clinicHoursCompleted: 245,
    enrolledSubjects: [
      {
        code: 'CLIN401',
        name: 'Clinical Dentistry I (Endodontics focus)',
        units: 6,
        isClinical: true,
        components: { quizzes: 68, exams: 65, practicum: 70, attendance: 85 },
        grade: 2.75,
        hasRemedial: true,
      },
      {
        code: 'CLIN402',
        name: 'Restorative Dentistry Clinic',
        units: 4,
        isClinical: true,
        components: { quizzes: 72, exams: 74, practicum: 75, attendance: 88 },
        grade: 2.5,
        hasRemedial: false,
      },
      {
        code: 'ODON401',
        name: 'Dental Jurisprudence & Ethics',
        units: 2,
        isClinical: false,
        components: { quizzes: 78, exams: 80, practicum: 0, attendance: 90 },
        grade: 2.25,
        hasRemedial: false,
      }
    ],
    overallGWA: 2.58,
    remedialExams: [
      {
        id: 'rem-b1',
        studentId: '12',
        studentName: 'Lea M. Corpus',
        subjectCode: 'CLIN401',
        subjectName: 'Clinical Dentistry I (Endodontics focus)',
        originalGrade: 2.75,
        remedialScore: null,
        remedialGrade: null,
        examDate: '2026-07-10',
        status: 'pending',
        notes: 'Needs to retake endodontic instrumentation practical exam.',
      }
    ],
    faceEnrolled: false,
    retentionHistory: [
      {
        id: 'ret-b1',
        studentId: '12',
        date: '2026-06-28',
        previousStatus: 'active',
        newStatus: 'warning',
        remarks: 'Upgraded to Warning: CLIN401 grade exceeds 2.5 threshold.',
        changedBy: 'eleanor.vance@dentisys.edu'
      }
    ]
  },
  {
    id: '13',
    studentId: 'DENT-2022-0303',
    name: 'Jonas P. Dela Cruz',
    email: 'jonas.delacruz@dentisys.edu',
    classId: 'CLINIC-B',
    className: 'Clinical Rotation B',
    yearLevel: 4,
    status: 'active',
    clinicHoursCompleted: 295,
    enrolledSubjects: [
      {
        code: 'CLIN401',
        name: 'Clinical Dentistry I (Endodontics focus)',
        units: 6,
        isClinical: true,
        components: { quizzes: 82, exams: 84, practicum: 86, attendance: 94 },
        grade: 1.75,
        hasRemedial: false,
      },
      {
        code: 'CLIN402',
        name: 'Restorative Dentistry Clinic',
        units: 4,
        isClinical: true,
        components: { quizzes: 80, exams: 82, practicum: 85, attendance: 92 },
        grade: 2.0,
        hasRemedial: false,
      },
      {
        code: 'ODON401',
        name: 'Dental Jurisprudence & Ethics',
        units: 2,
        isClinical: false,
        components: { quizzes: 85, exams: 87, practicum: 0, attendance: 95 },
        grade: 1.75,
        hasRemedial: false,
      }
    ],
    overallGWA: 1.90,
    remedialExams: [],
    faceEnrolled: true,
    faceEnrollmentDetails: {
      images: ['https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150'],
      status: 'Enrolled & Verified',
      enrolledAt: '2026-06-12'
    },
    retentionHistory: []
  },
  {
    id: '14',
    studentId: 'DENT-2022-0304',
    name: 'Rosario T. Bautista',
    email: 'rosario.bautista@dentisys.edu',
    classId: 'CLINIC-B',
    className: 'Clinical Rotation B',
    yearLevel: 4,
    status: 'critical',
    clinicHoursCompleted: 185,
    enrolledSubjects: [
      {
        code: 'CLIN401',
        name: 'Clinical Dentistry I (Endodontics focus)',
        units: 6,
        isClinical: true,
        components: { quizzes: 58, exams: 55, practicum: 60, attendance: 75 },
        grade: 3.0,
        hasRemedial: true,
      },
      {
        code: 'CLIN402',
        name: 'Restorative Dentistry Clinic',
        units: 4,
        isClinical: true,
        components: { quizzes: 60, exams: 58, practicum: 62, attendance: 78 },
        grade: 3.0,
        hasRemedial: true,
      },
      {
        code: 'ODON401',
        name: 'Dental Jurisprudence & Ethics',
        units: 2,
        isClinical: false,
        components: { quizzes: 65, exams: 68, practicum: 0, attendance: 82 },
        grade: 2.75,
        hasRemedial: false,
      }
    ],
    overallGWA: 2.95,
    remedialExams: [
      {
        id: 'rem-b2',
        studentId: '14',
        studentName: 'Rosario T. Bautista',
        subjectCode: 'CLIN401',
        subjectName: 'Clinical Dentistry I (Endodontics focus)',
        originalGrade: 3.0,
        remedialScore: null,
        remedialGrade: null,
        examDate: '2026-07-12',
        status: 'pending',
        notes: 'Critical standing — two clinical subjects below passing threshold.',
      },
      {
        id: 'rem-b3',
        studentId: '14',
        studentName: 'Rosario T. Bautista',
        subjectCode: 'CLIN402',
        subjectName: 'Restorative Dentistry Clinic',
        originalGrade: 3.0,
        remedialScore: null,
        remedialGrade: null,
        examDate: '2026-07-14',
        status: 'pending',
        notes: 'Required to complete remedial dental procedure assessments.',
      }
    ],
    faceEnrolled: true,
    faceEnrollmentDetails: {
      images: ['https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150'],
      status: 'Enrolled & Verified',
      enrolledAt: '2026-06-11'
    },
    retentionHistory: [
      {
        id: 'ret-b2',
        studentId: '14',
        date: '2026-07-01',
        previousStatus: 'warning',
        newStatus: 'critical',
        remarks: 'Downgraded to Critical: two clinical subjects (CLIN401, CLIN402) exceed 2.5 limits.',
        changedBy: 'eleanor.vance@dentisys.edu'
      }
    ]
  },
  {
    id: '15',
    studentId: 'DENT-2022-0305',
    name: 'Angelica B. Santos',
    email: 'angelica.santos@dentisys.edu',
    classId: 'CLINIC-B',
    className: 'Clinical Rotation B',
    yearLevel: 4,
    status: 'active',
    clinicHoursCompleted: 270,
    enrolledSubjects: [
      {
        code: 'CLIN401',
        name: 'Clinical Dentistry I (Endodontics focus)',
        units: 6,
        isClinical: true,
        components: { quizzes: 85, exams: 87, practicum: 88, attendance: 95 },
        grade: 1.75,
        hasRemedial: false,
      },
      {
        code: 'CLIN402',
        name: 'Restorative Dentistry Clinic',
        units: 4,
        isClinical: true,
        components: { quizzes: 84, exams: 86, practicum: 87, attendance: 96 },
        grade: 1.75,
        hasRemedial: false,
      },
      {
        code: 'ODON401',
        name: 'Dental Jurisprudence & Ethics',
        units: 2,
        isClinical: false,
        components: { quizzes: 88, exams: 90, practicum: 0, attendance: 97 },
        grade: 1.5,
        hasRemedial: false,
      }
    ],
    overallGWA: 1.70,
    remedialExams: [],
    faceEnrolled: false,
    retentionHistory: []
  }
];

// Pre-fill attendance logs for the past few days for the subjects
const generateInitialAttendance = (): AttendanceRecord[] => {
  const records: AttendanceRecord[] = [];
  const studentsList = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];
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
  const isV2 = localStorage.getItem('dentisys_mock_version') === 'v2';

  const [students, setStudents] = useState<Student[]>(() => {
    if (!isV2) return initialStudents;
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
    if (!isV2) return generateInitialAttendance();
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
    if (!isV2) return defaultSettings;
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
    if (!isV2) return initialAssessments;
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
    if (!isV2) return initialAssessmentScores;
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
    if (!isV2) return [];
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
    localStorage.setItem('dentisys_mock_version', 'v2');
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
