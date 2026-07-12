// src/utils/calculateRetention.ts

/**
 * Determine retention status based on GWA.
 * Returns 'Retained' if GWA is within acceptable range, otherwise 'Not Retained'.
 * This simple rule can be customized later via configuration.
 */
export function calculateRetention(gwa: number): string {
  // Example threshold: GWA <= 3.0 retains the student.
  return gwa <= 3.0 ? 'Retained' : 'Not Retained';
}
