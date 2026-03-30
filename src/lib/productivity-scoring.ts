import type { ProductivityTarget, MonthlyValues, NullableMonthlyValues } from "@/types/productivity";

/**
 * Bigger Is Better scoring:
 * Raw = ((Actual - Min) / (Target - Min)) × 10
 * Capped at 0–10
 */
export function scoreBiggerIsBetter(target: number, min: number, actual: number): number {
  if (target === min) return actual >= target ? 10 : 0;
  const raw = ((actual - min) / (target - min)) * 10;
  return Math.max(0, Math.min(10, raw));
}

/**
 * Smaller Is Better scoring:
 * Raw = ((Max - Actual) / (Max - Target)) × 10
 * Capped at 0–10
 */
export function scoreSmallerIsBetter(target: number, max: number, actual: number): number {
  if (max === target) return actual <= target ? 10 : 0;
  const raw = ((max - actual) / (max - target)) * 10;
  return Math.max(0, Math.min(10, raw));
}

/** Score a single period (one set of target/min/max/actual) */
function scorePeriod(
  type: "bigger" | "smaller",
  target: number,
  min: number,
  max: number,
  actual: number
): number {
  return type === "bigger"
    ? scoreBiggerIsBetter(target, min, actual)
    : scoreSmallerIsBetter(target, max, actual);
}

/**
 * Calculate the adjusted score for a target.
 * For quarterly: single score from single actual (null = skip).
 * For monthly: average only the months that have data (null months skipped).
 */
export function calculateTargetScore(
  t: ProductivityTarget,
  actual: number | null | MonthlyValues | NullableMonthlyValues
): { adjustedScore: number; weightedScore: number; hasData: boolean } {
  let adjustedScore: number;
  let hasData = false;

  if (t.frequency === "monthly" && t.monthlyTargets && typeof actual === "object" && actual !== null) {
    // Score each month independently, then average only months with data
    const months = ["month1", "month2", "month3"] as const;
    let sum = 0;
    let count = 0;
    for (const m of months) {
      const mActual = (actual as NullableMonthlyValues)[m];
      if (mActual === null || mActual === undefined) continue; // skip months without data
      const mTarget = t.monthlyTargets[m];
      const mMin = t.type === "bigger" ? (t.monthlyMin?.[m] ?? 0) : mTarget;
      const mMax = t.type === "smaller" ? (t.monthlyMax?.[m] ?? 0) : mTarget;
      sum += scorePeriod(t.type, mTarget, mMin, mMax, mActual);
      count++;
    }
    adjustedScore = count > 0 ? sum / count : 0;
    hasData = count > 0;
  } else if (actual !== null && typeof actual === "number") {
    // Quarterly: single value
    adjustedScore = scorePeriod(t.type, t.target, t.min, t.max, actual);
    hasData = true;
  } else {
    adjustedScore = 0;
    hasData = false;
  }

  const weightedScore = (t.weight / 100) * adjustedScore;
  return { adjustedScore, weightedScore, hasData };
}

/** Calculate total productivity score from all targets + actuals */
export function calculateTotalProductivityScore(
  targets: ProductivityTarget[],
  actuals: Record<string, number | null | MonthlyValues | NullableMonthlyValues>
): number {
  let total = 0;
  for (const t of targets) {
    const actual = actuals[t.id] ?? null;
    const { weightedScore } = calculateTargetScore(t, actual);
    total += weightedScore;
  }
  return Math.round(total * 10) / 10;
}

/** Validate that weights sum to exactly 100 */
export function validateWeights(targets: ProductivityTarget[]): {
  total: number;
  valid: boolean;
} {
  const total = targets.reduce((sum, t) => sum + t.weight, 0);
  return { total, valid: Math.abs(total - 100) < 0.01 };
}
