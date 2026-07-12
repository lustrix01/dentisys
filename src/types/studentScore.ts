export interface StudentScore {
  studentId: string;
  assessmentId: string;
  score: number; // raw score
  weightedScore?: number; // optional after applying weight
}
