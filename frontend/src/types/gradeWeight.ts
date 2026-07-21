export interface GradeWeight {
  /** Identifier of the assessment category (e.g., 'quiz', 'midterm') */
  categoryId: string;
  /** Weight percentage (0-100) */
  weight: number;
}
