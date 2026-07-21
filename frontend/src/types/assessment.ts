export interface AssessmentCategory {
  id: string;
  name: string;
  description?: string;
}

export interface Assessment {
  id: string;
  title: string;
  categoryId: string;
  totalPoints: number;
  date: string;
  isArchived?: boolean;
  createdAt: string;
  updatedAt: string;
  subject?: string;
  section?: string;
  status?: string;
  name?: string;
  category?: string;
  maxScore?: number;
  dueDate?: string;
  displayOrder?: number;
}
