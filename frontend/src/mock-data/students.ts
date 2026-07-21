// src/mock-data/students.ts
import { Student } from "../types/student";

export const studentsData: Student[] = [
  {
    id: "stu-001",
    studentNumber: "20230001",
    firstName: "Maria",
    lastName: "Garcia",
    courseId: "course-001",
    sectionId: "sec-001",
    attendancePercentage: 92,
    currentGWA: 1.75,
    retentionStatus: "retained",
    riskLevel: "Low",
  },
  {
    id: "stu-002",
    studentNumber: "20230002",
    firstName: "Luis",
    lastName: "Rivera",
    courseId: "course-001",
    sectionId: "sec-001",
    attendancePercentage: 78,
    currentGWA: 2.45,
    retentionStatus: "atRisk",
    riskLevel: "Moderate",
  },
  {
    id: "stu-003",
    studentNumber: "20230003",
    firstName: "Sofia",
    lastName: "Mendoza",
    courseId: "course-002",
    sectionId: "sec-002",
    attendancePercentage: 65,
    currentGWA: 3.10,
    retentionStatus: "atRisk",
    riskLevel: "High",
  },
];
