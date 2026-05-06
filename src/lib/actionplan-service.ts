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
  arrayUnion,
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

/**
 * Get the action plan for a member.
 *
 * Historically rare race conditions (rapid clicks while memberPlan was null,
 * or two write paths each calling createActionPlan) could produce more than
 * one plan doc per memberId. If we just return the newest, notes/actions
 * written to the older one disappear on reload. So we fetch every plan for
 * this member and merge actions + notes by id, returning the merged set
 * keyed by the OLDEST plan's id (so subsequent writes converge there).
 */
export async function getActionPlanForMember(
  companyId: string,
  memberId: string
): Promise<ActionPlan | null> {
  const q = query(plansRef(companyId), where("memberId", "==", memberId));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const plans = snap.docs.map(
    (d) => ({ id: d.id, ...d.data() } as ActionPlan)
  );
  if (plans.length === 1) return backfillIds(plans[0]);

  plans.sort((a, b) => {
    const aMs = (a.createdAt as Timestamp | null)?.toMillis?.() ?? Infinity;
    const bMs = (b.createdAt as Timestamp | null)?.toMillis?.() ?? Infinity;
    return aMs - bMs;
  });
  const canonical = plans[0];
  const seenActionIds = new Set<string>();
  const seenNoteIds = new Set<string>();
  const mergedActions: ActionItem[] = [];
  const mergedNotes: ActionNote[] = [];
  for (const p of plans) {
    for (const a of p.actions ?? []) {
      if (a.id && seenActionIds.has(a.id)) continue;
      if (a.id) seenActionIds.add(a.id);
      mergedActions.push(a);
    }
    for (const n of p.notes ?? []) {
      if (n.id && seenNoteIds.has(n.id)) continue;
      if (n.id) seenNoteIds.add(n.id);
      mergedNotes.push(n);
    }
  }
  return backfillIds({
    ...canonical,
    actions: mergedActions,
    notes: mergedNotes,
  });
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
  _currentActions: ActionItem[],
  action: ActionItem
): Promise<void> {
  // Atomic append. Using arrayUnion (vs an overwrite of the full array
  // built from React state) means a stale local snapshot can't drop
  // existing actions written by a concurrent click or another tab.
  await updateDoc(doc(db, "companies", companyId, "actionPlans", planId), {
    actions: arrayUnion(action),
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
  _currentNotes: ActionNote[],
  text: string,
  actionItemId: string | null = null,
  noteIdOverride?: string
): Promise<ActionNote> {
  // Atomic append. See addAction comment above. Caller can pass a
  // noteIdOverride so its in-memory state and the DB row share an id.
  const newNote: ActionNote = {
    id: noteIdOverride ?? crypto.randomUUID(),
    actionItemId,
    text,
    createdAt: Timestamp.now(),
  };
  await updateDoc(doc(db, "companies", companyId, "actionPlans", planId), {
    notes: arrayUnion(newNote),
    updatedAt: serverTimestamp(),
  });
  return newNote;
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
