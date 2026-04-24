import { Timestamp } from "firebase/firestore";

export interface Coach {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  chatIntro: string;
  referenceDocIds: string[];
  isActive: boolean;
  order: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ReferenceDocument {
  id: string;
  title: string;
  fileName: string;
  fileUrl: string;
  textContent: string;
  createdAt: Timestamp;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Transcript {
  id: string;
  coachId: string;
  companyId: string;
  userId: string;
  userDisplayName: string;
  memberId: string | null;
  memberName: string | null;
  title?: string;
  messages: ChatMessage[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
