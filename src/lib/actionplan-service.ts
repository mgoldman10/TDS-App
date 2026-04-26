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

function backfillIds(plan: ActionPlan): ActionPlan {
  const actions = (plan.actions ?? []).map((a) =>
    a.id ? a : { ...a, id: crypto.randomUUID() }
  );
  const notes = (plan.notes ?? []).map((n) =>
    n.id
      ? { ...n, actionItemId: n.actionItemId ?? null }
      : { ...n, id: crypto.randomUUID(), actionItemId: n.actionItemId ?? null }
  );
  return { ...plan, actions, notes };
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
  return backfillIds({ id: snap.docs[0].id, ...snap.docs[0].data() } as ActionPlan);
}

/** Get all action plans for a company (across all members) */
export async function getAllActionPlans(
  companyId: string
): Promise<ActionPlan[]> {
  const q = query(
    plansRef(companyId),
    orderBy("memberName", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => backfillIds({ id: d.id, ...d.data() } as ActionPlan));
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
  text: string,
  actionItemId: string | null = null
): Promise<void> {
  const newNote: ActionNote = {
    id: crypto.randomUUID(),
    actionItemId,
    text,
    createdAt: Timestamp.now(),
  };
  await updateDoc(doc(db, "companies", companyId, "actionPlans", planId), {
    notes: [...currentNotes, newNote],
    updatedAt: serverTimestamp(),
  });
}

export async function updateNotes(
  companyId: string,
  planId: string,
  notes: ActionNote[]
): Promise<void> {
  await updateDoc(doc(db, "companies", companyId, "actionPlans", planId), {
    notes,
    updatedAt: serverTimestamp(),
  });
}
