// src/mock-data/attendance.ts
import { Attendance } from "../types/attendance";

export const attendanceData: Attendance[] = [
  {
    id: "att-001",
    studentId: "stu-001",
    date: "2023-09-01",
    status: "Present",
    courseId: "course-001",
    sectionId: "sec-001",
  },
  {
    id: "att-002",
    studentId: "stu-002",
    date: "2023-09-01",
    status: "Late",
    courseId: "course-001",
    sectionId: "sec-001",
  },
  {
    id: "att-003",
    studentId: "stu-003",
    date: "2023-09-02",
    status: "Absent",
    courseId: "course-002",
    sectionId: "sec-003",
  },
];
