import { Timestamp } from "firebase/firestore";

export interface CoreValue {
  id: string;
  name: string;
  description: string;
  behaviors: string[];
  order: number;
  createdAt: Timestamp;
}

export interface CoreValueFormData {
  name: string;
  description: string;
  behaviors: string[];
  order: number;
}
