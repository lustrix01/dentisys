// src/mock-data/assessments.ts
import { Assessment, AssessmentCategory } from "../types/assessment";

export const assessmentCategoriesData: AssessmentCategory[] = [
  { id: "cat-quiz", name: "Quiz" },
  { id: "cat-activity", name: "Activity" },
  { id: "cat-lab", name: "Laboratory Exercise" },
  { id: "cat-midterm", name: "Midterm Exam" },
  { id: "cat-final", name: "Final Exam" },
  { id: "cat-project", name: "Project" },
];

export const assessmentsData: Assessment[] = [
  {
    id: "assess-001",
    title: "Quiz 1",
    categoryId: "cat-quiz",
    totalPoints: 20,
    date: "2023-09-10",
    isArchived: false,
    createdAt: "2023-08-30",
    updatedAt: "2023-08-30",
  },
  {
    id: "assess-002",
    title: "Midterm Exam",
    categoryId: "cat-midterm",
    totalPoints: 100,
    date: "2023-10-15",
    isArchived: false,
    createdAt: "2023-09-01",
    updatedAt: "2023-09-01",
  },
  {
    id: "assess-003",
    title: "Project",
    categoryId: "cat-project",
    totalPoints: 150,
    date: "2023-12-01",
    isArchived: false,
    createdAt: "2023-10-01",
    updatedAt: "2023-10-01",
  },
];
