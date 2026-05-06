import { Timestamp } from "firebase/firestore";

export interface CultureFitRatingScores {
  models: number;        // default 10
  lives: number;         // default 9
  occasional: number;    // default 7
  frequent: number;      // default 1
}

export interface CultureFitCaps {
  occasionalCap: number; // default 8.4 — if any value is "Occasional", total cannot exceed this
  frequentCap: number;   // default 7.4 — if any value is "Frequent", total cannot exceed this
}

export interface ScoringParameters {
  hpCultureFitMin: number;    // default 9 — HP requires culture fit > this
  hpProductivityMin: number;  // default 9 — HP requires productivity > this
  lcfCultureFitMax: number;   // default 7.5 — below this = LCF regardless of productivity
  lpProductivityMax: number;  // default 6.5 — below this = LP (unless already LCF)
  cultureFitRatingScores: CultureFitRatingScores;
  cultureFitCaps: CultureFitCaps;
}

export const DEFAULT_CULTURE_FIT_RATING_SCORES: CultureFitRatingScores = {
  models: 10,
  lives: 9,
  occasional: 7,
  frequent: 1,
};

export const DEFAULT_CULTURE_FIT_CAPS: CultureFitCaps = {
  occasionalCap: 8.4,
  frequentCap: 7.4,
};

export const DEFAULT_SCORING_PARAMETERS: ScoringParameters = {
  hpCultureFitMin: 9,
  hpProductivityMin: 9,
  lcfCultureFitMax: 7.5,
  lpProductivityMax: 6.5,
  cultureFitRatingScores: { ...DEFAULT_CULTURE_FIT_RATING_SCORES },
  cultureFitCaps: { ...DEFAULT_CULTURE_FIT_CAPS },
};

export interface QuarterlyTdiGoal {
  company?: number;
  teams?: Record<string, number>;
}

export interface TdiGoals {
  // Per-quarter goal map. Keys are "FY-FQ" e.g. "2026-2".
  // Reads should check this first; writes always go here.
  quarterly?: Record<string, QuarterlyTdiGoal>;
  // Legacy flat fields. Kept as a fallback so existing data still
  // reads correctly until it's overwritten with quarter-specific values.
  company?: number;                    // target TDI for the whole company (e.g., 50 = +50%)
  teams?: Record<string, number>;      // teamId → target TDI
}

export interface Company {
  id: string;
  name: string;
  fiscalYearStartMonth: number; // 1-12, default 1 (January)
  scoringParameters: ScoringParameters;
  tdiGoals?: TdiGoals;
  isActive?: boolean;       // missing/true = active; false = archived
  archivedAt?: Timestamp;   // when archived
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CompanyFormData {
  name: string;
}
