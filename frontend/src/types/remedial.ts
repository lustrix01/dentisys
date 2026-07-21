// src/types/remedial.ts
export interface RemedialRecord {
  id: string;
  studentId: string;
  courseId: string;
  sectionId: string;
  description: string;
  createdAt: string; // ISO date string
  status: 'open' | 'closed' | 'archived';
}
