import { Timestamp } from "firebase/firestore";
import type { NullableMonthlyValues } from "@/types/productivity";

export type CultureFitRating = "models" | "lives" | "occasional" | "frequent";
export type PerformanceCategory = "HP" | "MP" | "LP" | "LCF";

export const RATING_SCORES: Record<CultureFitRating, number> = {
  models: 10,
  lives: 9,
  occasional: 7,
  frequent: 1,
};

export const RATING_LABELS: Record<CultureFitRating, string> = {
  models: "Models",
  lives: "Lives",
  occasional: "Occasional Challenges",
  frequent: "Frequent Challenges",
};

export const CATEGORY_COLORS: Record<PerformanceCategory, { bg: string; text: string }> = {
  HP: { bg: "bg-green-500", text: "text-white" },
  MP: { bg: "bg-yellow-400", text: "text-primary" },
  LP: { bg: "bg-red-500", text: "text-white" },
  LCF: { bg: "bg-red-500", text: "text-white" },
};

export const CATEGORY_LABELS: Record<PerformanceCategory, string> = {
  HP: "High Performing",
  MP: "Medium Performing",
  LP: "Low Producing",
  LCF: "Low Culture Fit",
};

export interface CultureFitScore {
  coreValueId: string;
  coreValueName: string;
  rating: CultureFitRating;
}

export interface ProductivityActual {
  targetId: string;
  targetName: string;
  actual: number | null;               // null = no data yet (quarter incomplete)
  monthlyActuals: NullableMonthlyValues | null;  // null values = no data for that month
}

export interface Assessment {
  id: string;
  memberId: string;
  memberName: string;
  assessedByUserId: string;
  fiscalYear: number;
  fiscalQuarter: number;
  cultureFitScores: CultureFitScore[];
  cultureFitScore: number;
  productivityActuals: ProductivityActual[];
  productivityScore: number;
  performanceCategory: PerformanceCategory;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
