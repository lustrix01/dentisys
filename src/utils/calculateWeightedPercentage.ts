// src/utils/calculateWeightedPercentage.ts

/**
 * Calculate the weighted contribution for a category.
 * `average` is a percentage (0-100).
 * `weight` is the category weight also expressed as a percentage (e.g., 20 for 20%).
 * Returns the weighted contribution (0-100).
 */
export function calculateWeightedPercentage(average: number, weight: number): number {
  return Number(((average * weight) / 100).toFixed(2));
}
