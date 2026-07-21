// src/mock-data/sections.ts
import { Section } from "../types/section";

export const sectionsData: Section[] = [
  {
    id: "sec-001",
    courseId: "course-001",
    name: "Section A",
    instructorId: "fac-001",
    schedule: "Mon/Wed/Fri 09:00-10:30",
  },
  {
    id: "sec-002",
    courseId: "course-001",
    name: "Section B",
    instructorId: "fac-001",
    schedule: "Tue/Thu 11:00-12:30",
  },
  {
    id: "sec-003",
    courseId: "course-002",
    name: "Section C",
    instructorId: "fac-002",
    schedule: "Mon/Wed 14:00-15:30",
  },
];
