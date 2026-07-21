// src/mock-data/retention.ts
import { RetentionRecord } from "../types/retention";

export const retentionData: RetentionRecord[] = [
  {
    id: "ret-001",
    studentId: "stu-001",
    period: "2023-2024",
    status: "Stable",
    notes: "Good attendance",
  },
  {
    id: "ret-002",
    studentId: "stu-002",
    period: "2023-2024",
    status: "At Risk",
    notes: "Low quiz scores",
  },
  {
    id: "ret-003",
    studentId: "stu-003",
    period: "2023-2024",
    status: "At Risk",
    notes: "Frequent absences",
  },
];
