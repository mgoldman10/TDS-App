import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Team, TeamMember, TeamMemberChange } from "@/types/team";

// --- Teams ---

function teamsRef(companyId: string) {
  return collection(db, "companies", companyId, "teams");
}

export async function getTeams(companyId: string): Promise<Team[]> {
  const q = query(teamsRef(companyId), orderBy("name", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Team));
}

export async function getTeamsByLeader(companyId: string, leaderId: string): Promise<Team[]> {
  const q = query(teamsRef(companyId), where("leaderId", "==", leaderId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Team));
}

export async function createTeam(
  companyId: string,
  data: { name: string; leaderId: string; leaderName: string; leaderTitle: string; parentTeamId: string | null; level: number }
): Promise<string> {
  const ref = await addDoc(teamsRef(companyId), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Ensure a top-level team exists; create one if not */
export async function ensureTopLevelTeam(companyId: string): Promise<Team> {
  const all = await getTeams(companyId);
  const topLevel = all.find((t) => !t.parentTeamId);
  if (topLevel) return topLevel;

  const id = await createTeam(companyId, {
    name: "Senior Leadership Team",
    leaderId: "",
    leaderName: "",
    leaderTitle: "",
    parentTeamId: null,
    level: 0,
  });
  return { id, name: "Senior Leadership Team", parentTeamId: null, leaderId: "", leaderName: "", leaderTitle: "", level: 0 } as Team;
}

export async function updateTeam(
  companyId: string,
  teamId: string,
  data: Partial<{ name: string; leaderId: string; leaderName: string; leaderTitle: string }>
): Promise<void> {
  await updateDoc(doc(db, "companies", companyId, "teams", teamId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteTeam(
  companyId: string,
  teamId: string
): Promise<void> {
  await deleteDoc(doc(db, "companies", companyId, "teams", teamId));
}

// --- Team Members ---

function membersRef(companyId: string) {
  return collection(db, "companies", companyId, "teamMembers");
}

export async function getTeamMembers(companyId: string, teamId: string): Promise<TeamMember[]> {
  const q = query(membersRef(companyId), where("teamId", "==", teamId), orderBy("name", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TeamMember));
}

export async function getAllTeamMembers(companyId: string): Promise<TeamMember[]> {
  const q = query(membersRef(companyId), orderBy("name", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TeamMember));
}

export async function getMembersByLeader(companyId: string, leaderId: string): Promise<TeamMember[]> {
  const q = query(membersRef(companyId), where("reportsToUserId", "==", leaderId), orderBy("name", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TeamMember));
}

export async function createTeamMember(
  companyId: string,
  data: {
    name: string;
    role: string;
    teamId: string;
    reportsToUserId: string;
  }
): Promise<string> {
  const ref = await addDoc(membersRef(companyId), {
    ...data,
    isAppUser: false,
    appUserId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTeamMember(
  companyId: string,
  memberId: string,
  data: Partial<{ name: string; role: string; teamId: string; reportsToUserId: string }>
): Promise<void> {
  await updateDoc(doc(db, "companies", companyId, "teamMembers", memberId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteTeamMember(
  companyId: string,
  memberId: string
): Promise<void> {
  await deleteDoc(doc(db, "companies", companyId, "teamMembers", memberId));
}

// --- Change History ---

function changesRef(companyId: string) {
  return collection(db, "companies", companyId, "teamMemberChanges");
}

export async function logMemberChange(
  companyId: string,
  memberId: string,
  changeType: "role" | "team" | "reporting_line",
  previousValue: string,
  newValue: string,
  changedByUserId: string
): Promise<void> {
  await addDoc(changesRef(companyId), {
    memberId,
    changeType,
    previousValue,
    newValue,
    changedAt: serverTimestamp(),
    changedByUserId,
  });
}

export async function getMemberChanges(
  companyId: string,
  memberId: string
): Promise<TeamMemberChange[]> {
  const q = query(
    changesRef(companyId),
    where("memberId", "==", memberId),
    orderBy("changedAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TeamMemberChange));
}
