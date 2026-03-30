import type { CultureFitScore, CultureFitRating } from "@/types/assessment";
import type { CultureFitRatingScores, CultureFitCaps } from "@/types/company";
import { DEFAULT_CULTURE_FIT_RATING_SCORES, DEFAULT_CULTURE_FIT_CAPS } from "@/types/company";

/**
 * Calculate the culture fit score from individual core value ratings.
 *
 * Per The Strength of Talent:
 * 1. Average all core value scores (using configurable rating scores)
 * 2. Apply caps (configurable):
 *    - If any value is "Occasional Challenges" → total cannot exceed occasionalCap
 *    - If any value is "Frequent Challenges" → total cannot exceed frequentCap
 *    - If both apply, use the lower cap
 */
export function calculateCultureFitScore(
  scores: CultureFitScore[],
  ratingScores: CultureFitRatingScores = DEFAULT_CULTURE_FIT_RATING_SCORES,
  caps: CultureFitCaps = DEFAULT_CULTURE_FIT_CAPS
): {
  rawAverage: number;
  cap: number | null;
  finalScore: number;
} {
  // Only count scores that have a rating selected
  const ratedScores = scores.filter((s) => s.rating && s.rating in ratingScores);
  if (ratedScores.length === 0) return { rawAverage: 0, cap: null, finalScore: 0 };

  // Calculate raw average using configurable scores
  const total = ratedScores.reduce((sum, s) => sum + ratingScores[s.rating], 0);
  const rawAverage = Math.round((total / ratedScores.length) * 10) / 10;

  // Determine cap
  const hasOccasional = ratedScores.some((s) => s.rating === "occasional");
  const hasFrequent = ratedScores.some((s) => s.rating === "frequent");

  let cap: number | null = null;
  if (hasFrequent) cap = caps.frequentCap;
  else if (hasOccasional) cap = caps.occasionalCap;

  const finalScore = cap !== null ? Math.min(rawAverage, cap) : rawAverage;

  return { rawAverage, cap, finalScore };
}

/** Get the numeric score for a single rating using configurable scores */
export function ratingToScore(
  rating: CultureFitRating,
  ratingScores: CultureFitRatingScores = DEFAULT_CULTURE_FIT_RATING_SCORES
): number {
  return ratingScores[rating];
}
