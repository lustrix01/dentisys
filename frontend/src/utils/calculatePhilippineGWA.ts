// src/utils/calculatePhilippineGWA.ts

/**
 * Convert a weighted percentage (0-100) to the Philippine GWA (1.0 – 5.0) scale.
 * This is a simple linear mapping where 100% => 1.0 (excellent) and 0% => 5.0 (fail).
 */
export function calculatePhilippineGWA(weightedPercentage: number): number {
  const gwa = 5 - (weightedPercentage / 100) * 4; // linear mapping
  return Number(gwa.toFixed(2));
}
