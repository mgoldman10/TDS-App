import type { ProductivityTarget, MonthlyValues } from "@/types/productivity";

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
 * For quarterly: single score from single actual.
 * For monthly: average of 3 monthly scores.
 */
export function calculateTargetScore(
  t: ProductivityTarget,
  actual: number | MonthlyValues
): { adjustedScore: number; weightedScore: number } {
  let adjustedScore: number;

  if (t.frequency === "monthly" && t.monthlyTargets && typeof actual === "object") {
    // Score each month independently, then average
    const months = ["month1", "month2", "month3"] as const;
    let sum = 0;
    for (const m of months) {
      const mTarget = t.monthlyTargets[m];
      const mMin = t.type === "bigger" ? (t.monthlyMin?.[m] ?? 0) : mTarget;
      const mMax = t.type === "smaller" ? (t.monthlyMax?.[m] ?? 0) : mTarget;
      const mActual = actual[m];
      sum += scorePeriod(t.type, mTarget, mMin, mMax, mActual);
    }
    adjustedScore = sum / 3;
  } else {
    // Quarterly: single value
    const act = typeof actual === "number" ? actual : 0;
    adjustedScore = scorePeriod(t.type, t.target, t.min, t.max, act);
  }

  const weightedScore = (t.weight / 100) * adjustedScore;
  return { adjustedScore, weightedScore };
}

/** Calculate total productivity score from all targets + actuals */
export function calculateTotalProductivityScore(
  targets: ProductivityTarget[],
  actuals: Record<string, number | MonthlyValues>
): number {
  let total = 0;
  for (const t of targets) {
    const actual = actuals[t.id] ?? 0;
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
