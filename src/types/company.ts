import { Timestamp } from "firebase/firestore";

export interface ScoringParameters {
  hpCultureFitMin: number;    // default 8.5 — HP requires culture fit > this
  hpProductivityMin: number;  // default 8.5 — HP requires productivity > this
  lcfCultureFitMax: number;   // default 7.5 — below this = LCF regardless of productivity
  lpProductivityMax: number;  // default 6.5 — below this = LP (unless already LCF)
}

export const DEFAULT_SCORING_PARAMETERS: ScoringParameters = {
  hpCultureFitMin: 9,
  hpProductivityMin: 9,
  lcfCultureFitMax: 7.5,
  lpProductivityMax: 6.5,
};

export interface Company {
  id: string;
  name: string;
  scoringParameters: ScoringParameters;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CompanyFormData {
  name: string;
}
