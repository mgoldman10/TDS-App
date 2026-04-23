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
  arrayUnion,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Team, TeamMember, TeamMemberChange, MemberChangeType, TeamLeaderChange } from "@/types/team";

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
    isAppUser?: boolean;
    appUserId?: string | null;
  }
): Promise<string> {
  const ref = await addDoc(membersRef(companyId), {
    ...data,
    isAppUser: data.isAppUser ?? false,
    appUserId: data.appUserId ?? null,
    status: "active",
    archivedAt: null,
    archivedReason: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTeamMember(
  companyId: string,
  memberId: string,
  data: Partial<{ name: string; role: string; teamId: string; reportsToUserId: string; status: "active" | "archived"; archivedAt: ReturnType<typeof serverTimestamp> | null; archivedReason: string | null; isAppUser: boolean; appUserId: string | null }>
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
  changeType: MemberChangeType,
  previousValue: string,
  newValue: string,
  changedByUserId: string,
  effectiveDate: string,
  fiscalYear: number,
  fiscalQuarter: number
): Promise<void> {
  await addDoc(changesRef(companyId), {
    memberId,
    changeType,
    previousValue,
    newValue,
    changedAt: serverTimestamp(),
    changedByUserId,
    effectiveDate,
    fiscalYear,
    fiscalQuarter,
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

/** Get all changes for members of a given team (for leader_change annotations) */
export async function getChangesByType(
  companyId: string,
  changeType: MemberChangeType
): Promise<TeamMemberChange[]> {
  const q = query(
    changesRef(companyId),
    where("changeType", "==", changeType),
    orderBy("changedAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TeamMemberChange));
}

/** Archive a team member (soft delete) */
export async function archiveMember(
  companyId: string,
  memberId: string,
  reason: string,
  changedByUserId: string,
  effectiveDate: string,
  fiscalYear: number,
  fiscalQuarter: number
): Promise<void> {
  await updateDoc(doc(db, "companies", companyId, "teamMembers", memberId), {
    status: "archived",
    archivedAt: serverTimestamp(),
    archivedReason: reason,
    updatedAt: serverTimestamp(),
  });
  await logMemberChange(companyId, memberId, "archived", "active", reason, changedByUserId, effectiveDate, fiscalYear, fiscalQuarter);
}

/** Restore an archived team member to active */
export async function unarchiveMember(
  companyId: string,
  memberId: string,
  changedByUserId: string,
  effectiveDate: string,
  fiscalYear: number,
  fiscalQuarter: number
): Promise<void> {
  await updateDoc(doc(db, "companies", companyId, "teamMembers", memberId), {
    status: "active",
    archivedAt: null,
    archivedReason: null,
    updatedAt: serverTimestamp(),
  });
  await logMemberChange(companyId, memberId, "archived", "active", "Unarchived", changedByUserId, effectiveDate, fiscalYear, fiscalQuarter);
}

/** Change a team member's team */
export async function changeTeam(
  companyId: string,
  memberId: string,
  oldTeamName: string,
  newTeamId: string,
  newTeamName: string,
  newReportsToUserId: string,
  changedByUserId: string,
  effectiveDate: string,
  fiscalYear: number,
  fiscalQuarter: number
): Promise<void> {
  await updateDoc(doc(db, "companies", companyId, "teamMembers", memberId), {
    teamId: newTeamId,
    reportsToUserId: newReportsToUserId,
    updatedAt: serverTimestamp(),
  });
  await logMemberChange(companyId, memberId, "team", oldTeamName, newTeamName, changedByUserId, effectiveDate, fiscalYear, fiscalQuarter);
}

/** Promote a team member to leader of their team */
export async function promoteToLeader(
  companyId: string,
  memberId: string,
  memberName: string,
  memberTitle: string,
  teamId: string,
  previousLeaderId: string,
  previousLeaderName: string,
  changedByUserId: string,
  effectiveDate: string,
  fiscalYear: number,
  fiscalQuarter: number
): Promise<void> {
  // Update the team's leader
  await updateDoc(doc(db, "companies", companyId, "teams", teamId), {
    leaderId: memberId,
    leaderName: memberName,
    leaderTitle: memberTitle,
    leaderHistory: arrayUnion({
      previousLeaderId,
      previousLeaderName,
      newLeaderId: memberId,
      newLeaderName: memberName,
      changedAt: new Date().toISOString(),
      changedByUserId,
      effectiveDate,
      fiscalYear,
      fiscalQuarter,
    } as unknown as TeamLeaderChange),
    updatedAt: serverTimestamp(),
  });
  // Log promotion on the promoted member
  await logMemberChange(companyId, memberId, "promoted_to_leader", previousLeaderName || "none", memberName, changedByUserId, effectiveDate, fiscalYear, fiscalQuarter);
}

export interface DuplicateMatch {
  type: "member" | "user";
  id: string;
  name: string;
  email?: string;
  teamId?: string;
}

/**
 * Check for existing team members or users with the same name or email.
 * Returns any matches found so the UI can warn before saving.
 */
export async function findDuplicateMember(
  companyId: string,
  name: string,
  email: string
): Promise<DuplicateMatch[]> {
  const matches: DuplicateMatch[] = [];
  const nameLower = name.trim().toLowerCase();
  const emailLower = email.trim().toLowerCase();

  if (!nameLower && !emailLower) return matches;

  // Check teamMembers collection
  const membersSnap = await getDocs(
    query(collection(db, "companies", companyId, "teamMembers"), where("status", "==", "active"))
  );
  for (const d of membersSnap.docs) {
    const data = d.data();
    const existingName = (data.name ?? "").toLowerCase();
    const existingEmail = (data.email ?? "").toLowerCase();
    const nameMatch = nameLower && existingName === nameLower;
    const emailMatch = emailLower && existingEmail === emailLower;
    if (nameMatch || emailMatch) {
      matches.push({ type: "member", id: d.id, name: data.name, email: data.email, teamId: data.teamId });
    }
  }

  // Check users collection for email collision
  if (emailLower) {
    const usersSnap = await getDocs(
      query(collection(db, "companies", companyId, "users"), where("email", "==", emailLower))
    );
    for (const d of usersSnap.docs) {
      const data = d.data();
      // Only add if not already caught via the member check
      const alreadyFound = matches.some((m) => m.type === "user" && m.id === d.id);
      if (!alreadyFound) {
        matches.push({ type: "user", id: d.id, name: data.displayName, email: data.email });
      }
    }
  }

  return matches;
}

/** Log a leader change event on all members of a team */
export async function logLeaderChangeForTeamMembers(
  companyId: string,
  teamId: string,
  previousLeaderName: string,
  newLeaderName: string,
  changedByUserId: string,
  effectiveDate: string,
  fiscalYear: number,
  fiscalQuarter: number
): Promise<void> {
  const teamMembersData = await getTeamMembers(companyId, teamId);
  for (const m of teamMembersData) {
    await logMemberChange(companyId, m.id, "leader_change", previousLeaderName, newLeaderName, changedByUserId, effectiveDate, fiscalYear, fiscalQuarter);
  }
}
