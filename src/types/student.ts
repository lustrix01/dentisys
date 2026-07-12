export interface Student {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  courseId: string;
  sectionId: string;
  attendancePercentage: number;
  currentGWA: number;
  retentionStatus: string;
  riskLevel: 'Low' | 'Moderate' | 'High';
}
