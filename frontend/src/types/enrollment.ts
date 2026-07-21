export interface Enrollment {
  id: string;
  studentId: string;
  courseId: string;
  sectionId: string;
  enrollmentDate: string; // ISO date string
  status: 'enrolled' | 'dropped' | 'completed';
}
