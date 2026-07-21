// src/mock-data/prediction.ts
import { PredictionResult } from "../types/prediction";

export const predictionData: PredictionResult[] = [
  {
    id: "pred-001",
    studentId: "stu-001",
    riskLevel: "Low Risk",
    confidence: 92.5,
    contributingFactors: ["High attendance", "Consistent quiz scores"],
    lastUpdated: "2023-09-12",
  },
  {
    id: "pred-002",
    studentId: "stu-002",
    riskLevel: "Moderate Risk",
    confidence: 78.3,
    contributingFactors: ["Low attendance", "Declining quiz scores"],
    lastUpdated: "2023-09-13",
  },
  {
    id: "pred-003",
    studentId: "stu-003",
    riskLevel: "High Risk",
    confidence: 65.0,
    contributingFactors: ["Frequent absences", "Low lab scores"],
    lastUpdated: "2023-09-14",
  },
];
