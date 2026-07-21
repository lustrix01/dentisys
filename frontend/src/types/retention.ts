export interface RetentionRecord {
  id: string;
  studentId: string;
  period: string; // e.g., '2023-2024'
  status: 'At Risk' | 'Stable' | 'Improving';
  notes?: string;
}
