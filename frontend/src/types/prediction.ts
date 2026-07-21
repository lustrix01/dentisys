// src/types/prediction.ts
export interface PredictionResult {
  id: string;
  studentId: string;
  riskLevel: 'Low Risk' | 'Moderate Risk' | 'High Risk';
  confidence: number; // percent
  contributingFactors: string[];
  lastUpdated: string; // ISO date
}
