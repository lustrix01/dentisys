// src/mock-data/deadlines.ts

import { DeadlineInfo } from "../types/dashboard";

export const deadlinesData: DeadlineInfo[] = [
  {
    id: "dead-001",
    title: "Quiz 2 Due",
    date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    relatedEntity: "assessment-002",
  },
  {
    id: "dead-002",
    title: "Midterm Exam Publishing",
    date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    relatedEntity: "assessment-005",
  },
  {
    id: "dead-003",
    title: "Remedial Session",
    date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    relatedEntity: "remedial-001",
  },
];
