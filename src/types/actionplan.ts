import { Timestamp } from "firebase/firestore";

export interface ActionItem {
  description: string;
  targetDate: string;       // ISO date string
  completedAt: string | null; // ISO date string or null if not done
}

export interface ActionNote {
  text: string;
  createdAt: Timestamp;
}

export interface ActionPlan {
  id: string;
  memberId: string;
  memberName: string;
  fiscalYear: number;
  fiscalQuarter: number;
  actions: ActionItem[];
  notes: ActionNote[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
