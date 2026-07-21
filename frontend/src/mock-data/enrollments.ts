// src/mock-data/enrollments.ts
import { Enrollment } from "../types/enrollment";

export const enrollmentsData: Enrollment[] = [
  {
    id: "enr-001",
    studentId: "stu-001",
    courseId: "course-001",
    sectionId: "sec-001",
    enrollmentDate: "2023-08-15",
    status: "enrolled",
  },
  {
    id: "enr-002",
    studentId: "stu-002",
    courseId: "course-001",
    sectionId: "sec-001",
    enrollmentDate: "2023-08-16",
    status: "enrolled",
  },
  {
    id: "enr-003",
    studentId: "stu-003",
    courseId: "course-002",
    sectionId: "sec-003",
    enrollmentDate: "2023-08-20",
    status: "enrolled",
  },
];
