// src/mock-data/remedial.ts
import { RemedialRecord } from "../types/remedial";

export const remedialData: RemedialRecord[] = [
  {
    id: "rem-001",
    studentId: "stu-002",
    courseId: "course-001",
    sectionId: "sec-001",
    description: "Extra tutoring for quiz 1",
    createdAt: "2023-09-15",
    status: "open",
  },
  {
    id: "rem-002",
    studentId: "stu-003",
    courseId: "course-002",
    sectionId: "sec-003",
    description: "Lab exercise remediation",
    createdAt: "2023-09-20",
    status: "closed",
  },
];
