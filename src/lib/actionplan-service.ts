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

function backfillIds(plan: ActionPlan): {
  plan: ActionPlan;
  changed: boolean;
} {
  let changed = false;
  const actions = (plan.actions ?? []).map((a) => {
    if (a.id) return a;
    changed = true;
    return { ...a, id: crypto.randomUUID() };
  });
  const actionIds = new Set(actions.map((a) => a.id));
  const notes = (plan.notes ?? []).map((n) => {
    const next: ActionNote = {
      ...n,
      id: n.id || crypto.randomUUID(),
      actionItemId: n.actionItemId ?? null,
    };
    if (!n.id) changed = true;
    // Drop dead links — a linked note whose target action no longer exists
    // (e.g., the action was id-less and got a fresh id this session). Better
    // to surface as a general note than vanish.
    if (next.actionItemId && !actionIds.has(next.actionItemId)) {
      next.actionItemId = null;
      changed = true;
    }
    return next;
  });
  return { plan: { ...plan, actions, notes }, changed };
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
  if (plans.length === 1) {
    const { plan: filled, changed } = backfillIds(plans[0]);
    if (changed) await persistRepair(companyId, filled);
    return filled;
  }

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
  const { plan: filled, changed } = backfillIds({
    ...canonical,
    actions: mergedActions,
    notes: mergedNotes,
  });
  if (changed) await persistRepair(companyId, filled);
  return filled;
}

/**
 * One-time self-repair: write back stable IDs and re-pointed notes so the
 * next read sees the same shape. Without this, id-less actions get a fresh
 * random UUID on every load and any linked notes silently lose their target.
 */
async function persistRepair(
  companyId: string,
  plan: ActionPlan
): Promise<void> {
  try {
    await updateDoc(doc(db, "companies", companyId, "actionPlans", plan.id), {
      actions: plan.actions,
      notes: plan.notes,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    // Non-fatal: the in-memory plan is correct for this session even if
    // persistence fails. Log so we notice repeated drift in production.
    console.warn("Action plan repair failed", { planId: plan.id, err });
  }
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
  return snap.docs.map(
    (d) => backfillIds({ id: d.id, ...d.data() } as ActionPlan).plan
  );
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
