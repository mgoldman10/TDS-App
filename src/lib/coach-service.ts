import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Coach, Transcript, ChatMessage, ReferenceDocument } from "@/types/coach";

function coachesRef() {
  return collection(db, "config", "askmike", "coaches");
}

function refDocsRef() {
  return collection(db, "config", "askmike", "refdocs");
}

function transcriptsRef() {
  return collection(db, "config", "askmike", "transcripts");
}

// Coach CRUD
export async function getCoaches(): Promise<Coach[]> {
  const q = query(coachesRef(), orderBy("order", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Coach));
}

export async function getActiveCoaches(): Promise<Coach[]> {
  const q = query(coachesRef(), where("isActive", "==", true), orderBy("order", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Coach));
}

export async function getCoach(coachId: string): Promise<Coach | null> {
  const snap = await getDoc(doc(db, "config", "askmike", "coaches", coachId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Coach;
}

export async function createCoach(data: Omit<Coach, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const ref = await addDoc(coachesRef(), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCoach(
  coachId: string,
  data: Partial<Omit<Coach, "id" | "createdAt" | "updatedAt">>
): Promise<void> {
  await updateDoc(doc(db, "config", "askmike", "coaches", coachId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCoach(coachId: string): Promise<void> {
  const { deleteDoc: removeDoc } = await import("firebase/firestore");
  await removeDoc(doc(db, "config", "askmike", "coaches", coachId));
}

/** Seed default coaches if none exist */
export async function ensureDefaultCoaches(): Promise<Coach[]> {
  // Simple fetch without composite index requirements
  const snap = await getDocs(collection(db, "config", "askmike", "coaches"));
  const existing = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Coach));
  if (existing.length > 0) return existing.filter((c) => c.isActive !== false);

  // Seed People Coach
  await createCoach({
    name: "People Coach",
    description: "Get coaching advice on managing team members based on their performance category.",
    systemPrompt: `You are Mike Goldman's People Coach AI assistant, embedded in the Talent Density System. You help leaders take differentiated actions based on each team member's performance category.

Your coaching philosophy (from "The Strength of Talent"):
- HIGH PERFORMING (HP): Overinvest. These are your most valuable people. Retain them, give them stretch assignments, increase their visibility, and ensure they feel valued. Never take them for granted.
- MEDIUM PERFORMING (MP): Coach and develop. Help them build skills to reach HP. Set clear expectations, provide regular feedback, create development plans, and give them opportunities to grow.
- LOW PRODUCING (LP): Address quickly. Determine if it's a skill gap (coachable) or will gap (not coachable). Set clear 30/60/90 day improvement plans. If no improvement, make the tough decision.
- LOW CULTURE FIT (LCF): Act decisively. Culture fit issues rarely self-correct. These individuals can be toxic to your team regardless of their productivity. Have the difficult conversation and make a change.

When coaching a leader:
- Always reference the specific team member's scores and category
- Give concrete, actionable advice — not generic platitudes
- Suggest specific conversations to have, questions to ask, and actions to take
- Be direct and honest, even when the advice is uncomfortable
- Help leaders see that NOT acting is itself a decision with consequences`,
    chatIntro: "I'm your People Coach. I can see this team member's assessment data. What would you like help with — developing them, having a tough conversation, or creating an action plan?",
    referenceDocIds: [],
    isActive: true,
    order: 1,
  });

  // Seed Difficult Conversations Coach
  await createCoach({
    name: "Difficult Conversations Coach",
    description: "Get help preparing for and conducting difficult workplace conversations.",
    systemPrompt: `You are Mike Goldman's Difficult Conversations Coach AI assistant, embedded in the Talent Density System. You help leaders prepare for and navigate tough workplace conversations.

Your approach:
- Help leaders prepare mentally and structurally for the conversation
- Suggest specific language and framing they can use
- Coach on how to be direct yet compassionate
- Help anticipate likely reactions and how to handle them
- Emphasize that avoiding difficult conversations hurts everyone — the team member, the team, and the leader

Common difficult conversation scenarios:
- Performance improvement discussions (LP/LCF team members)
- Letting someone go
- Addressing attitude or culture fit issues
- Giving tough feedback to someone who thinks they're doing well
- Discussing a demotion or role change
- Addressing interpersonal conflicts on the team

When coaching:
- Ask clarifying questions about the situation before giving advice
- Provide a suggested conversation outline they can follow
- Include specific phrases and sentences they can use or adapt
- Help them practice handling defensive or emotional reactions
- Remind them that the goal is clarity and respect, not winning an argument`,
    chatIntro: "I'm your Difficult Conversations Coach. I can see this team member's profile and scores. Tell me about the conversation you're preparing for, and I'll help you navigate it effectively.",
    referenceDocIds: [],
    isActive: true,
    order: 2,
  });

  // Return the newly created coaches
  return getActiveCoaches();
}

// Transcript CRUD
export async function saveTranscript(
  transcriptId: string | null,
  data: {
    coachId: string;
    companyId: string;
    userId: string;
    userDisplayName: string;
    memberId: string | null;
    memberName: string | null;
    messages: ChatMessage[];
  }
): Promise<string> {
  if (transcriptId) {
    await updateDoc(doc(db, "config", "askmike", "transcripts", transcriptId), {
      messages: data.messages,
      updatedAt: serverTimestamp(),
    });
    return transcriptId;
  }
  const ref = await addDoc(transcriptsRef(), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getUserTranscripts(
  userId: string,
  coachId: string
): Promise<Transcript[]> {
  const q = query(
    transcriptsRef(),
    where("userId", "==", userId),
    where("coachId", "==", coachId),
    orderBy("createdAt", "desc"),
    limit(20)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Transcript));
}

// Reference Document CRUD
export async function getReferenceDocuments(): Promise<ReferenceDocument[]> {
  const q = query(refDocsRef(), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ReferenceDocument));
}

export async function getReferenceDocsByIds(ids: string[]): Promise<ReferenceDocument[]> {
  if (ids.length === 0) return [];
  const results: ReferenceDocument[] = [];
  for (const id of ids) {
    const snap = await getDoc(doc(db, "config", "askmike", "refdocs", id));
    if (snap.exists()) {
      results.push({ id: snap.id, ...snap.data() } as ReferenceDocument);
    }
  }
  return results;
}

export async function createReferenceDocument(data: {
  title: string;
  fileName: string;
  fileUrl: string;
  textContent: string;
}): Promise<string> {
  const ref = await addDoc(refDocsRef(), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteReferenceDocument(refDocId: string): Promise<void> {
  const { deleteDoc: removeDoc } = await import("firebase/firestore");
  await removeDoc(doc(db, "config", "askmike", "refdocs", refDocId));
}
