import { Timestamp } from "firebase/firestore";

export interface ActionItem {
  id: string;
  description: string;
  targetDate: string;       // ISO date string
  completedAt: string | null; // ISO date string or null if not done
  owner: string;            // display name of accountable person
}

export interface ActionNote {
  id: string;
  actionItemId: string | null; // null = general note, otherwise links to ActionItem.id
  text: string;
  createdAt: Timestamp;
}

export interface ActionPlan {
  id: string;
  memberId: string;
  memberName: string;
  actions: ActionItem[];
  notes: ActionNote[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
