import { Timestamp } from "firebase/firestore";

export type TargetType = "bigger" | "smaller";
export type UnitType = "units" | "dollars" | "percentage";
export type Frequency = "quarterly" | "monthly";

export interface MonthlyValues {
  month1: number;
  month2: number;
  month3: number;
}

export interface ProductivityTarget {
  id: string;
  memberId: string;
  name: string;
  type: TargetType;
  unit: UnitType;
  frequency: Frequency;
  weight: number;   // 0-100, all weights for one member must sum to 100

  // Quarterly: single values used directly
  // Monthly: these are ignored in favor of monthlyTargets/monthlyMin/monthlyMax
  target: number;
  min: number;
  max: number;

  // Monthly breakdowns (only used when frequency === "monthly")
  monthlyTargets: MonthlyValues | null;
  monthlyMin: MonthlyValues | null;    // for bigger-is-better
  monthlyMax: MonthlyValues | null;    // for smaller-is-better

  order: number;
  createdAt: Timestamp;
}

export const UNIT_LABELS: Record<UnitType, string> = {
  units: "Units",
  dollars: "$",
  percentage: "%",
};

export const DEFAULT_MONTHLY: MonthlyValues = { month1: 0, month2: 0, month3: 0 };
