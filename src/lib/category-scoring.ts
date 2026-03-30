import type { PerformanceCategory } from "@/types/assessment";
import type { ScoringParameters } from "@/types/company";

/**
 * Assign performance category based on culture fit and productivity scores.
 *
 * Per The Strength of Talent:
 * 1. LCF first: culture fit below threshold → Low Culture Fit (regardless of productivity)
 * 2. HP: both scores above their thresholds → High Performing
 * 3. LP: productivity below threshold → Low Producing
 * 4. MP: everyone else → Medium Performing
 */
export function assignCategory(
  cultureFitScore: number,
  productivityScore: number,
  params: ScoringParameters
): PerformanceCategory {
  // LCF takes priority — "It doesn't matter how productive they are"
  if (cultureFitScore <= params.lcfCultureFitMax) return "LCF";

  // HP — both dimensions at or above threshold
  if (cultureFitScore >= params.hpCultureFitMin && productivityScore >= params.hpProductivityMin) return "HP";

  // LP — productivity below threshold (and not already LCF)
  if (productivityScore < params.lpProductivityMax) return "LP";

  // Everyone else
  return "MP";
}
