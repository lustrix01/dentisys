// src/utils/calculateRemarks.ts

/**
 * Determine remarks based on GWA.
 * Returns a string such as 'Excellent', 'Very Good', 'Good', 'Pass', 'Fail'.
 */
export function calculateRemarks(gwa: number): string {
  if (gwa <= 1.5) return 'Excellent';
  if (gwa <= 2.5) return 'Very Good';
  if (gwa <= 3.5) return 'Good';
  if (gwa <= 4.5) return 'Pass';
  return 'Fail';
}
