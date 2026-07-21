export interface Faculty {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  role: 'admin' | 'faculty' | 'staff' | string;
  assignedSubjects?: string[];
  assignedClasses?: string[];
  publishedGrades?: number;
  pendingDrafts?: number;
  remedialCount?: number;
  atRiskCount?: number;
  profilePhotoUrl?: string;
}
