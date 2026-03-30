import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ActionPlan, ActionItem, ActionNote } from "@/types/actionplan";

function plansRef(companyId: string) {
  return collection(db, "companies", companyId, "actionPlans");
}

/** Get the single ongoing action plan for a member (creates none — call createActionPlan if needed) */
export async function getActionPlanForMember(
  companyId: string,
  memberId: string
): Promise<ActionPlan | null> {
  const q = query(
    plansRef(companyId),
    where("memberId", "==", memberId),
    orderBy("createdAt", "desc"),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as ActionPlan;
}

export async function createActionPlan(
  companyId: string,
  data: {
    memberId: string;
    memberName: string;
  }
): Promise<string> {
  const ref = await addDoc(plansRef(companyId), {
    ...data,
    actions: [],
    notes: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function addAction(
  companyId: string,
  planId: string,
  currentActions: ActionItem[],
  action: ActionItem
): Promise<void> {
  await updateDoc(doc(db, "companies", companyId, "actionPlans", planId), {
    actions: [...currentActions, action],
    updatedAt: serverTimestamp(),
  });
}

export async function updateActions(
  companyId: string,
  planId: string,
  actions: ActionItem[]
): Promise<void> {
  await updateDoc(doc(db, "companies", companyId, "actionPlans", planId), {
    actions,
    updatedAt: serverTimestamp(),
  });
}

export async function addNote(
  companyId: string,
  planId: string,
  currentNotes: ActionNote[],
  text: string
): Promise<void> {
  await updateDoc(doc(db, "companies", companyId, "actionPlans", planId), {
    notes: [...currentNotes, { text, createdAt: Timestamp.now() }],
    updatedAt: serverTimestamp(),
  });
}
