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
  date: string; // ISO date string
  isArchived?: boolean;
  createdAt: string;
  updatedAt: string;
}
