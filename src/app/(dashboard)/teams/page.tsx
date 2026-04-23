"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { canManageCompany, canManageTeam } from "@/lib/permissions";
import {
  getTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  ensureTopLevelTeam,
  getTeamMembers,
  createTeamMember,
  updateTeamMember,
  logMemberChange,
  archiveMember,
  unarchiveMember,
  deleteTeamMember,
  changeTeam,
  promoteToLeader,
  logLeaderChangeForTeamMembers,
  findDuplicateMember,
} from "@/lib/team-service";
import { getAssessmentHistory } from "@/lib/assessment-service";
import { getCompanyUsers, updateUserRole, deactivateUser, reactivateUser, updateUserEmail } from "@/lib/user-service";
import { getFiscalYear, getFiscalQuarter } from "@/lib/fiscalUtils";
import { useKeyboardShortcuts } from "@/lib/useKeyboardShortcuts";
import type { Team, TeamMember } from "@/types/team";
import type { UserProfile, UserRole } from "@/types/auth";

const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: "Super Admin",
  company_admin: "Company Admin",
  senior_leader: "Senior Leader",
  leader: "Leader",
};
const ASSIGNABLE_ROLES: UserRole[] = ["company_admin", "senior_leader", "leader"];

/** Build a tree structure from flat teams list */
function buildTree(teams: Team[]): Map<string | null, Team[]> {
  const tree = new Map<string | null, Team[]>();
  for (const t of teams) {
    const parentId = t.parentTeamId ?? null;
    if (!tree.has(parentId)) tree.set(parentId, []);
    tree.get(parentId)!.push(t);
  }
  return tree;
}

export default function TeamsPage() {
  const { profile } = useAuth();
  const { activeCompany } = useCompany();
  const router = useRouter();

  const companyId = activeCompany?.id ?? profile?.companyId;
  const isAdmin = canManageCompany(profile);
  const startMonth = activeCompany?.fiscalYearStartMonth ?? 1;
  const now = new Date();
  const currentFY = getFiscalYear(now, startMonth);
  const currentFQ = getFiscalQuarter(now, startMonth);
  const todayISO = now.toISOString().split("T")[0];

  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Record<string, TeamMember[]>>({});
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [unlinkedUsers, setUnlinkedUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // Archive modal state
  const [archivingMemberId, setArchivingMemberId] = useState<string | null>(null);
  const [archivingTeamId, setArchivingTeamId] = useState<string | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveMemberHasAssessments, setArchiveMemberHasAssessments] = useState<boolean | null>(null);

  // Change team modal state
  const [changingTeamMemberId, setChangingTeamMemberId] = useState<string | null>(null);
  const [changingTeamFromId, setChangingTeamFromId] = useState<string | null>(null);
  const [changingTeamToId, setChangingTeamToId] = useState("");

  // Promote to leader state
  const [promotingMemberId, setPromotingMemberId] = useState<string | null>(null);
  const [promotingTeamId, setPromotingTeamId] = useState<string | null>(null);

  // Expanded teams
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  // Add sub-team form
  const [addSubTeamParentId, setAddSubTeamParentId] = useState<string | null>(null);
  const [newSubTeamName, setNewSubTeamName] = useState("");
  const [newSubTeamLeader, setNewSubTeamLeader] = useState("");
  const [newSubTeamLeaderTitle, setNewSubTeamLeaderTitle] = useState("");

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Editing team (name + leader)
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamLeader, setEditTeamLeader] = useState("");
  const [editTeamLeaderTitle, setEditTeamLeaderTitle] = useState("");

  // Add member form
  const [addMemberTeamId, setAddMemberTeamId] = useState<string | null>(null);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberTitle, setNewMemberTitle] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberInvite, setNewMemberInvite] = useState(false);
  const [newMemberRole, setNewMemberRole] = useState<UserRole>("leader");
  const [dupWarning, setDupWarning] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  // Edit member
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTitle, setEditTitle] = useState("");

  // Edit user email
  const [editingEmailUserId, setEditingEmailUserId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);

  // Invite existing member as user
  const [invitingMemberId, setInvitingMemberId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("leader");
  const [inviting, setInviting] = useState(false);

  // Assign unlinked user to a team
  const [assignTeamUserId, setAssignTeamUserId] = useState<string | null>(null);
  const [assignTeamId, setAssignTeamId] = useState("");
  const [assignTeamTitle, setAssignTeamTitle] = useState("");
  const [assigning, setAssigning] = useState(false);

  useKeyboardShortcuts({
    onEscape: () => {
      setEditingTeamId(null);
      setEditingMemberId(null);
      setAddMemberTeamId(null);
      setAddSubTeamParentId(null);
      setInvitingMemberId(null);
      setAssignTeamUserId(null);
    },
  });

  useEffect(() => {
    if (!profile || !companyId) {
      if (profile?.role === "superadmin") router.replace("/admin");
      setLoading(false);
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, companyId]);

  async function loadData() {
    if (!companyId || !profile) return;
    try {
      await ensureTopLevelTeam(companyId);
      const [teamData, userData] = await Promise.all([
        getTeams(companyId),
        isAdmin ? getCompanyUsers(companyId) : Promise.resolve([]),
      ]);

      // Non-admins only see teams they lead
      const visibleTeams = isAdmin
        ? teamData
        : teamData.filter((t) => canManageTeam(profile, t.leaderId));

      setTeams(visibleTeams);
      setUsers(userData);

      const memberMap: Record<string, TeamMember[]> = {};
      for (const t of visibleTeams) {
        memberMap[t.id] = await getTeamMembers(companyId, t.id);
      }
      setMembers(memberMap);

      // Find users with no linked teamMember record (admin only)
      if (isAdmin && userData.length > 0) {
        const allMembers = Object.values(memberMap).flat();
        const linkedUserIds = new Set(allMembers.filter((m) => m.appUserId).map((m) => m.appUserId));
        const unlinked = userData.filter((u) => !linkedUserIds.has(u.uid) && (u.isActive ?? true));
        setUnlinkedUsers(unlinked);
      }

      const topLevel = teamData.find((t) => !t.parentTeamId);
      if (topLevel) setExpandedTeams(new Set([topLevel.id]));
    } catch (err) {
      console.error("Teams load error:", err);
      setError("Failed to load teams.");
    }
    setLoading(false);
  }

  function toggleExpand(teamId: string) {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  /** Find a person's known title from team members or leader records */
  function findPersonTitle(name: string): string {
    for (const teamId of Object.keys(members)) {
      const member = members[teamId].find((m) => m.name === name);
      if (member?.role) return member.role;
    }
    const asLeader = teams.find((t) => t.leaderName === name);
    if (asLeader?.leaderTitle) return asLeader.leaderTitle;
    return "";
  }

  function getLeadersAsMembers(teamId: string): { name: string; title: string; subTeamName: string }[] {
    const childTeams = teams.filter((t) => t.parentTeamId === teamId);
    const existingMemberNames = new Set((members[teamId] || []).map((m) => m.name));
    return childTeams
      .filter((t) => t.leaderName && !existingMemberNames.has(t.leaderName))
      .map((t) => ({ name: t.leaderName, title: t.leaderTitle || "", subTeamName: t.name }));
  }

  async function checkDuplicates(name: string, email: string) {
    if (!companyId || (!name.trim() && !email.trim())) { setDupWarning(""); return; }
    try {
      const matches = await findDuplicateMember(companyId, name, email);
      if (matches.length > 0) {
        const names = matches.map((m) => m.name).join(", ");
        setDupWarning(`Possible duplicate: ${names} already exists. You can still proceed.`);
      } else {
        setDupWarning("");
      }
    } catch {
      setDupWarning("");
    }
  }

  async function handleCreateSubTeam(parentId: string, parentLevel: number) {
    if (!companyId || !newSubTeamName.trim()) return;
    try {
      const leaderId = newSubTeamLeader || "";
      const id = await createTeam(companyId, {
        name: newSubTeamName.trim(),
        leaderId,
        leaderName: leaderId ? (users.find((u) => u.uid === leaderId)?.displayName || "") : newSubTeamLeader.trim(),
        leaderTitle: newSubTeamLeaderTitle.trim(),
        parentTeamId: parentId,
        level: parentLevel + 1,
      });
      const newTeam = {
        id,
        name: newSubTeamName.trim(),
        parentTeamId: parentId,
        leaderId,
        leaderName: leaderId ? (users.find((u) => u.uid === leaderId)?.displayName || "") : newSubTeamLeader.trim(),
        leaderTitle: newSubTeamLeaderTitle.trim(),
        level: parentLevel + 1,
      } as Team;
      setTeams([...teams, newTeam]);
      setMembers({ ...members, [id]: [] });
      setNewSubTeamName("");
      setNewSubTeamLeader("");
      setNewSubTeamLeaderTitle("");
      setAddSubTeamParentId(null);
      setExpandedTeams((prev) => new Set([...Array.from(prev), parentId]));
    } catch {
      setError("Failed to create team.");
    }
  }

  function startEditTeam(team: Team) {
    if (editingTeamId === team.id) {
      setEditingTeamId(null);
      return;
    }
    setEditingTeamId(team.id);
    setEditTeamName(team.name);
    setEditTeamLeader(team.leaderName || "");
    setEditTeamLeaderTitle(team.leaderTitle || "");
  }

  async function handleSaveTeam(teamId: string) {
    if (!companyId || !editTeamName.trim()) return;
    try {
      const oldTeam = teams.find((t) => t.id === teamId);
      const leaderChanged = oldTeam && oldTeam.leaderName !== editTeamLeader.trim() && oldTeam.leaderName;
      await updateTeam(companyId, teamId, {
        name: editTeamName.trim(),
        leaderName: editTeamLeader.trim(),
        leaderTitle: editTeamLeaderTitle.trim(),
      });
      if (leaderChanged) {
        await logLeaderChangeForTeamMembers(
          companyId, teamId,
          oldTeam.leaderName, editTeamLeader.trim(),
          profile?.uid || "", todayISO, currentFY, currentFQ
        );
      }
      setTeams(teams.map((t) =>
        t.id === teamId
          ? { ...t, name: editTeamName.trim(), leaderName: editTeamLeader.trim(), leaderTitle: editTeamLeaderTitle.trim() }
          : t
      ));
      setEditingTeamId(null);
    } catch {
      setError("Failed to update team.");
    }
  }

  async function handleDeleteTeam(teamId: string) {
    if (!companyId) return;
    const children = teams.filter((t) => t.parentTeamId === teamId);
    if (children.length > 0) {
      alert("Remove all sub-teams first before deleting this team.");
      return;
    }
    if (!window.confirm("Delete this team and all its members?")) return;
    try {
      await deleteTeam(companyId, teamId);
      setTeams(teams.filter((t) => t.id !== teamId));
      const updated = { ...members };
      delete updated[teamId];
      setMembers(updated);
    } catch {
      setError("Failed to delete team.");
    }
  }

  async function handleAddMember(teamId: string) {
    if (!companyId || !newMemberName.trim()) return;
    setAddingMember(true);
    try {
      const team = teams.find((t) => t.id === teamId);
      const id = await createTeamMember(companyId, {
        name: newMemberName.trim(),
        role: newMemberTitle.trim(),
        teamId,
        reportsToUserId: team?.leaderId || profile?.uid || "",
      });

      let isAppUser = false;
      let appUserId: string | null = null;

      // If invite checked and email provided, create the app user
      if (newMemberInvite && newMemberEmail.trim()) {
        try {
          const res = await fetch("/api/users/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyId,
              email: newMemberEmail.trim(),
              displayName: newMemberName.trim(),
              role: isAdmin ? newMemberRole : "leader",
              title: newMemberTitle.trim(),
              teamId,
            }),
          });
          const data = await res.json();
          if (res.ok) {
            isAppUser = true;
            appUserId = data.uid;
            // Link the teamMember to the new user
            await updateTeamMember(companyId, id, { isAppUser: true, appUserId: data.uid });
            // Refresh users list
            if (isAdmin) {
              const updated = await getCompanyUsers(companyId);
              setUsers(updated);
              // Remove from unlinked
              setUnlinkedUsers((prev) => prev.filter((u) => u.uid !== data.uid));
            }
          } else {
            setError(data.error || "Member added but invite failed.");
          }
        } catch {
          setError("Member added but invite email failed.");
        }
      }

      const newMember = {
        id,
        name: newMemberName.trim(),
        role: newMemberTitle.trim(),
        teamId,
        reportsToUserId: team?.leaderId || "",
        isAppUser,
        appUserId,
        status: "active",
        archivedAt: null,
        archivedReason: null,
      } as TeamMember;

      setMembers({ ...members, [teamId]: [...(members[teamId] || []), newMember] });
      setNewMemberName("");
      setNewMemberTitle("");
      setNewMemberEmail("");
      setNewMemberInvite(false);
      setNewMemberRole("leader");
      setDupWarning("");
      setAddMemberTeamId(null);
    } catch {
      setError("Failed to add team member.");
    }
    setAddingMember(false);
  }

  async function handleInviteMember(memberId: string, teamId: string) {
    if (!companyId || !inviteEmail.trim()) return;
    const member = members[teamId]?.find((m) => m.id === memberId);
    if (!member) return;
    setInviting(true);
    try {
      const res = await fetch("/api/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          email: inviteEmail.trim(),
          displayName: member.name,
          role: isAdmin ? inviteRole : "leader",
          title: member.role,
          teamId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        await updateTeamMember(companyId, memberId, { isAppUser: true, appUserId: data.uid });
        setMembers({
          ...members,
          [teamId]: members[teamId].map((m) =>
            m.id === memberId ? { ...m, isAppUser: true, appUserId: data.uid } : m
          ),
        });
        if (isAdmin) {
          const updated = await getCompanyUsers(companyId);
          setUsers(updated);
          setUnlinkedUsers((prev) => prev.filter((u) => u.uid !== data.uid));
        }
        setInvitingMemberId(null);
        setInviteEmail("");
        setInviteRole("leader");
      } else {
        setError(data.error || "Invite failed.");
      }
    } catch {
      setError("Invite failed.");
    }
    setInviting(false);
  }

  async function handleUserRoleChange(userId: string, newRole: UserRole) {
    if (!companyId) return;
    try {
      await updateUserRole(companyId, userId, newRole);
      setUsers(users.map((u) => (u.uid === userId ? { ...u, role: newRole } : u)));
    } catch {
      setError("Failed to update role.");
    }
  }

  async function handleDeactivateUser(userId: string) {
    if (!companyId) return;
    if (!window.confirm("Deactivate this user? They will no longer be able to log in.")) return;
    try {
      await deactivateUser(companyId, userId);
      setUsers(users.map((u) => (u.uid === userId ? { ...u, isActive: false } : u)));
    } catch {
      setError("Failed to deactivate user.");
    }
  }

  async function handleReactivateUser(userId: string) {
    if (!companyId) return;
    try {
      await reactivateUser(companyId, userId);
      setUsers(users.map((u) => (u.uid === userId ? { ...u, isActive: true } : u)));
    } catch {
      setError("Failed to reactivate user.");
    }
  }

  async function handleResetPassword(email: string, displayName: string) {
    try {
      const res = await fetch("/api/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName }),
      });
      if (!res.ok) throw new Error();
      alert(`Password reset email sent to ${email}`);
    } catch {
      setError("Failed to send password reset email.");
    }
  }

  async function handleUpdateEmail(userId: string, displayName: string) {
    if (!companyId) return;
    setEmailError("");
    setEmailSaving(true);
    const result = await updateUserEmail(companyId, userId, editEmail.trim(), displayName);
    if (result.error) {
      setEmailError(result.error);
    } else {
      setUsers(users.map((u) => (u.uid === userId ? { ...u, email: editEmail.trim() } : u)));
      setEditingEmailUserId(null);
    }
    setEmailSaving(false);
  }

  async function handleAssignUnlinkedUser() {
    if (!companyId || !assignTeamUserId || !assignTeamId) return;
    const user = users.find((u) => u.uid === assignTeamUserId);
    if (!user) return;
    setAssigning(true);
    try {
      const team = teams.find((t) => t.id === assignTeamId);
      const id = await createTeamMember(companyId, {
        name: user.displayName,
        role: assignTeamTitle.trim(),
        teamId: assignTeamId,
        reportsToUserId: team?.leaderId || "",
      });
      await updateTeamMember(companyId, id, { isAppUser: true, appUserId: user.uid });
      setUnlinkedUsers((prev) => prev.filter((u) => u.uid !== assignTeamUserId));
      setAssignTeamUserId(null);
      setAssignTeamId("");
      setAssignTeamTitle("");
      // Refresh members for that team
      const updatedMembers = await getTeamMembers(companyId, assignTeamId);
      setMembers((prev) => ({ ...prev, [assignTeamId]: updatedMembers }));
    } catch {
      setError("Failed to assign user to team.");
    }
    setAssigning(false);
  }

  async function handleSaveMember(memberId: string, teamId: string) {
    if (!companyId) return;
    const member = members[teamId]?.find((m) => m.id === memberId);
    if (!member) return;
    try {
      const updates: Partial<{ name: string; role: string }> = {};
      if (editName !== member.name) updates.name = editName;
      if (editTitle !== member.role) {
        if (member.role && editTitle !== member.role) {
          await logMemberChange(companyId, memberId, "role", member.role, editTitle, profile?.uid || "", todayISO, currentFY, currentFQ);
        }
        updates.role = editTitle;
      }
      if (Object.keys(updates).length > 0) {
        await updateTeamMember(companyId, memberId, updates);
        setMembers({
          ...members,
          [teamId]: members[teamId].map((m) =>
            m.id === memberId ? { ...m, ...updates } : m
          ),
        });
      }
      setEditingMemberId(null);
    } catch {
      setError("Failed to update member.");
    }
  }

  async function handleArchiveMember() {
    if (!companyId || !archivingMemberId || !archivingTeamId) return;
    try {
      await archiveMember(companyId, archivingMemberId, archiveReason || "Left company", profile?.uid || "", todayISO, currentFY, currentFQ);
      setMembers({
        ...members,
        [archivingTeamId]: members[archivingTeamId].map((m) =>
          m.id === archivingMemberId ? { ...m, status: "archived" as const, archivedReason: archiveReason || "Left company" } : m
        ),
      });
      setArchivingMemberId(null); setArchivingTeamId(null); setArchiveReason("");
    } catch { setError("Failed to archive member."); }
  }

  async function handleUnarchiveMember(memberId: string, teamId: string) {
    if (!companyId) return;
    try {
      await unarchiveMember(companyId, memberId, profile?.uid || "", todayISO, currentFY, currentFQ);
      setMembers({ ...members, [teamId]: members[teamId].map((m) => m.id === memberId ? { ...m, status: "active" as const, archivedAt: null, archivedReason: null } : m) });
    } catch { setError("Failed to unarchive member."); }
  }

  async function handleDeleteMember() {
    if (!companyId || !archivingMemberId || !archivingTeamId) return;
    if (!window.confirm("Permanently delete this team member? This cannot be undone.")) return;
    try {
      await deleteTeamMember(companyId, archivingMemberId);
      setMembers({ ...members, [archivingTeamId]: members[archivingTeamId].filter((m) => m.id !== archivingMemberId) });
      setArchivingMemberId(null); setArchivingTeamId(null); setArchiveReason("");
    } catch { setError("Failed to delete member."); }
  }

  async function handleChangeTeam() {
    if (!companyId || !changingTeamMemberId || !changingTeamFromId || !changingTeamToId) return;
    const member = members[changingTeamFromId]?.find((m) => m.id === changingTeamMemberId);
    if (!member) return;
    const fromTeam = teams.find((t) => t.id === changingTeamFromId);
    const toTeam = teams.find((t) => t.id === changingTeamToId);
    if (!toTeam) return;
    try {
      await changeTeam(companyId, changingTeamMemberId, fromTeam?.name || "", changingTeamToId, toTeam.name, toTeam.leaderId || "", profile?.uid || "", todayISO, currentFY, currentFQ);
      const updatedMember = { ...member, teamId: changingTeamToId, reportsToUserId: toTeam.leaderId || "" };
      setMembers({
        ...members,
        [changingTeamFromId]: members[changingTeamFromId].filter((m) => m.id !== changingTeamMemberId),
        [changingTeamToId]: [...(members[changingTeamToId] || []), updatedMember],
      });
      setChangingTeamMemberId(null); setChangingTeamFromId(null); setChangingTeamToId("");
    } catch { setError("Failed to change team."); }
  }

  async function handlePromoteToLeader() {
    if (!companyId || !promotingMemberId || !promotingTeamId) return;
    const member = members[promotingTeamId]?.find((m) => m.id === promotingMemberId);
    const team = teams.find((t) => t.id === promotingTeamId);
    if (!member || !team) return;
    try {
      await promoteToLeader(companyId, promotingMemberId, member.name, member.role, promotingTeamId, team.leaderId, team.leaderName, profile?.uid || "", todayISO, currentFY, currentFQ);
      await logLeaderChangeForTeamMembers(companyId, promotingTeamId, team.leaderName, member.name, profile?.uid || "", todayISO, currentFY, currentFQ);
      setTeams(teams.map((t) => t.id === promotingTeamId ? { ...t, leaderId: promotingMemberId, leaderName: member.name, leaderTitle: member.role } : t));
      setPromotingMemberId(null); setPromotingTeamId(null);
    } catch { setError("Failed to promote member."); }
  }

  const tree = buildTree(teams);

  function renderTeam(team: Team) {
    const isExpanded = expandedTeams.has(team.id);
    const childTeams = tree.get(team.id) || [];
    const allTeamMembers = members[team.id] || [];
    const teamMembers = showArchived ? allTeamMembers : allTeamMembers.filter((m) => (m.status ?? "active") === "active");
    const leaderMembers = getLeadersAsMembers(team.id);
    const isTopLevel = !team.parentTeamId;
    const indent = team.level ?? 0;
    const isEditingThis = editingTeamId === team.id;
    const totalMembers = teamMembers.length + leaderMembers.length;
    const canManage = canManageTeam(profile, team.leaderId);

    return (
      <div key={team.id} style={{ marginLeft: indent > 0 ? 20 : 0 }}>
        <div className="rounded-[4px] border border-brand-gray bg-white shadow-sm">
          {/* Team header */}
          <div className="flex items-center gap-3 p-4">
            <button onClick={() => toggleExpand(team.id)} className="text-sm text-primary/50">
              {isExpanded ? "▼" : "▶"}
            </button>

            <button onClick={() => toggleExpand(team.id)} className="flex flex-1 items-baseline gap-2 text-left">
              <span className={`font-semibold text-primary ${isTopLevel ? "text-base" : "text-sm"}`}>
                {team.name}
              </span>
              {team.leaderName && (
                <span className="text-xs text-primary/40">
                  Led by {team.leaderName}
                  {team.leaderTitle && <span className="text-primary/30"> · {team.leaderTitle}</span>}
                </span>
              )}
              <span className="text-[10px] text-primary/30">
                {totalMembers} member{totalMembers !== 1 ? "s" : ""}
                {childTeams.length > 0 ? ` · ${childTeams.length} sub-team${childTeams.length !== 1 ? "s" : ""}` : ""}
              </span>
            </button>

            {isAdmin && (
              <button onClick={() => startEditTeam(team)}
                className="text-xs text-primary/50 transition hover:text-primary" title="Edit team">
                {isEditingThis ? "▲" : "✎"}
              </button>
            )}
            {isAdmin && !isTopLevel && (
              <button onClick={() => handleDeleteTeam(team.id)}
                className="text-xs text-accent/50 transition hover:text-accent">
                ✕
              </button>
            )}
          </div>

          {/* Edit team form */}
          {isEditingThis && (
            <div className="border-t border-brand-gray px-4 pb-4 pt-3 space-y-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Team Name</label>
                <input type="text" value={editTeamName} onChange={(e) => setEditTeamName(e.target.value)}
                  className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Leader Name</label>
                  {users.length > 0 ? (
                    <select value={editTeamLeader} onChange={(e) => {
                      setEditTeamLeader(e.target.value);
                      if (e.target.value) {
                        const knownTitle = findPersonTitle(e.target.value);
                        if (knownTitle) setEditTeamLeaderTitle(knownTitle);
                      }
                    }}
                      className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary">
                      <option value="">No leader</option>
                      {users.map((u) => (
                        <option key={u.uid} value={u.displayName}>{u.displayName}</option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" value={editTeamLeader} onChange={(e) => setEditTeamLeader(e.target.value)}
                      placeholder="Leader name"
                      className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary" />
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Leader Title</label>
                  <input type="text" value={editTeamLeaderTitle} onChange={(e) => setEditTeamLeaderTitle(e.target.value)}
                    placeholder="e.g., VP Finance"
                    className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleSaveTeam(team.id)}
                  className="rounded-[4px] bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90">
                  Save
                </button>
                <button onClick={() => setEditingTeamId(null)}
                  className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Expanded content */}
          {isExpanded && !isEditingThis && (
            <div className="border-t border-brand-gray px-4 pb-4 pt-3">
              {/* Sub-team leaders shown as members of this team */}
              {leaderMembers.length > 0 && (
                <div className="space-y-1">
                  {leaderMembers.map((lm, i) => (
                    <div key={`leader-${i}`} className="flex items-center gap-3 rounded-[4px] border border-brand-gray/50 bg-primary/[0.02] p-2.5">
                      <div className="flex-1">
                        <span className="text-sm font-semibold text-primary">{lm.name}</span>
                        {lm.title && <span className="ml-2 text-xs text-primary/50">{lm.title}</span>}
                      </div>
                      <span className="rounded-[2px] bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-blue-700">
                        Leads {lm.subTeamName}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Regular team members */}
              {teamMembers.length > 0 && (
                <div className={`space-y-1 ${leaderMembers.length > 0 ? "mt-1" : ""}`}>
                  {teamMembers.map((m) => {
                    const isEditing = editingMemberId === m.id;
                    const isArchived = m.status === "archived";
                    const leadsTeams = childTeams.filter((ct) => ct.leaderName === m.name);
                    const isArchiving = archivingMemberId === m.id;
                    const isChangingTeam = changingTeamMemberId === m.id;
                    const isPromoting = promotingMemberId === m.id;
                    const isInviting = invitingMemberId === m.id;
                    // Find linked user for user management controls
                    const linkedUser = m.isAppUser && m.appUserId ? users.find((u) => u.uid === m.appUserId) : null;
                    const userIsInactive = linkedUser?.isActive === false;

                    return (
                      <div key={m.id} className={`rounded-[4px] border border-brand-gray/50 ${isArchived ? "bg-primary/[0.03] opacity-60" : "bg-white"}`}>
                        <div className="flex items-center gap-3 p-2.5">
                          <div className="flex-1">
                            <button onClick={() => router.push(`/members/${m.id}`)} className={`text-sm font-semibold transition hover:text-accent ${isArchived ? "text-primary/50" : "text-primary"}`}>
                              {m.name}
                            </button>
                            {m.role && <span className="ml-2 text-xs text-primary/50">{m.role}</span>}
                          </div>
                          {isArchived && (
                            <>
                              <span className="rounded-[2px] bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary/50">
                                Archived{m.archivedReason ? ` — ${m.archivedReason}` : ""}
                              </span>
                              {isAdmin && (
                                <button onClick={() => handleUnarchiveMember(m.id, team.id)}
                                  className="rounded-[4px] border border-brand-gray bg-white px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary/50 transition hover:border-primary hover:text-primary">
                                  Unarchive
                                </button>
                              )}
                            </>
                          )}
                          {leadsTeams.map((lt) => (
                            <span key={lt.id} className="rounded-[2px] bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-blue-700">
                              Leads {lt.name}
                            </span>
                          ))}
                          {m.isAppUser && (
                            <span className={`rounded-[2px] px-1.5 py-0.5 text-[9px] font-semibold uppercase ${userIsInactive ? "bg-primary/10 text-primary/40" : "bg-green-100 text-green-700"}`}>
                              {userIsInactive ? "User (Inactive)" : "User"}
                            </span>
                          )}
                          {!isArchived && (
                            <>
                              <button onClick={() => {
                                if (isEditing) { setEditingMemberId(null); }
                                else { setEditingMemberId(m.id); setEditName(m.name); setEditTitle(m.role); }
                              }}
                                className="text-xs text-primary/50 transition hover:text-primary" title="Edit">
                                {isEditing ? "▲" : "✎"}
                              </button>
                              <button onClick={() => {
                                setArchivingMemberId(m.id); setArchivingTeamId(team.id); setArchiveReason("");
                                setArchiveMemberHasAssessments(null);
                                if (companyId) getAssessmentHistory(companyId, m.id).then((a) => setArchiveMemberHasAssessments(a.length > 0));
                              }} className="text-xs text-accent/50 transition hover:text-accent" title="Archive member">
                                ✕
                              </button>
                            </>
                          )}
                        </div>

                        {/* User management controls (admin only, for app users) */}
                        {isAdmin && m.isAppUser && linkedUser && !isArchived && !isEditing && !isArchiving && !isChangingTeam && !isPromoting && !isInviting && (
                          <div className="border-t border-brand-gray/30 bg-green-50/50">
                            {/* Email row */}
                            <div className="px-2.5 py-2 flex items-center gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Email</span>
                              {editingEmailUserId === linkedUser.uid ? (
                                <div className="flex flex-1 flex-col gap-1">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="email"
                                      value={editEmail}
                                      onChange={(e) => setEditEmail(e.target.value)}
                                      className="flex-1 rounded-[4px] border border-brand-gray bg-white px-2 py-1 text-[10px] text-primary outline-none focus:border-primary"
                                    />
                                    <button
                                      onClick={() => handleUpdateEmail(linkedUser.uid, linkedUser.displayName)}
                                      disabled={emailSaving}
                                      className="rounded-[4px] bg-primary px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50">
                                      {emailSaving ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                      onClick={() => { setEditingEmailUserId(null); setEmailError(""); }}
                                      className="text-[10px] text-primary/40 transition hover:text-primary">
                                      Cancel
                                    </button>
                                  </div>
                                  {emailError && <p className="text-[10px] text-accent">{emailError}</p>}
                                </div>
                              ) : (
                                <>
                                  <span className="text-[10px] text-primary/70">{linkedUser.email}</span>
                                  <button
                                    onClick={() => { setEditingEmailUserId(linkedUser.uid); setEditEmail(linkedUser.email); setEmailError(""); }}
                                    className="text-[10px] text-primary/40 transition hover:text-primary"
                                    title="Edit email">
                                    ✎
                                  </button>
                                </>
                              )}
                            </div>
                            {/* Role / password / deactivate row */}
                            <div className="border-t border-brand-gray/20 px-2.5 py-2 flex items-center gap-3">
                              <select
                                value={linkedUser.role}
                                onChange={(e) => handleUserRoleChange(linkedUser.uid, e.target.value as UserRole)}
                                className="rounded-[4px] border border-brand-gray bg-white px-2 py-1 text-[10px] font-semibold text-primary outline-none focus:border-primary"
                              >
                                {ASSIGNABLE_ROLES.map((r) => (
                                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                                ))}
                              </select>
                              <button onClick={() => handleResetPassword(linkedUser.email, linkedUser.displayName)}
                                className="rounded-[4px] border border-brand-gray bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary/50 transition hover:text-primary hover:border-primary">
                                Reset Password
                              </button>
                              {userIsInactive ? (
                                <button onClick={() => handleReactivateUser(linkedUser.uid)}
                                  className="rounded-[4px] border border-primary bg-transparent px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                                  Reactivate
                                </button>
                              ) : (
                                linkedUser.uid !== profile?.uid && (
                                  <button onClick={() => handleDeactivateUser(linkedUser.uid)}
                                    className="text-[10px] text-accent/50 transition hover:text-accent">
                                    Deactivate
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        )}

                        {/* Invite as user panel */}
                        {isInviting && (
                          <div className="border-t border-brand-gray/50 p-2.5 space-y-2">
                            <p className="text-xs font-semibold text-primary/60">Invite {m.name} as an app user</p>
                            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                              placeholder="Email address"
                              className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                            {isAdmin && (
                              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as UserRole)}
                                className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary">
                                {ASSIGNABLE_ROLES.map((r) => (
                                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                                ))}
                              </select>
                            )}
                            <div className="flex gap-2">
                              <button onClick={() => handleInviteMember(m.id, team.id)} disabled={inviting || !inviteEmail.trim()}
                                className="rounded-[4px] bg-accent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50">
                                {inviting ? "Sending..." : "Send Invite"}
                              </button>
                              <button onClick={() => { setInvitingMemberId(null); setInviteEmail(""); setInviteRole("leader"); }}
                                className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Archive confirmation */}
                        {isArchiving && (
                          <div className="border-t border-brand-gray/50 p-2.5 space-y-2">
                            {archiveMemberHasAssessments === null ? (
                              <p className="text-[10px] text-primary/40 animate-pulse">Checking assessment history...</p>
                            ) : (
                              <>
                                <p className="text-xs font-semibold text-primary/60">Archive {m.name}?</p>
                                {archiveMemberHasAssessments ? (
                                  <p className="text-[10px] text-primary/40">Their assessment history will be preserved for TDI reporting.</p>
                                ) : (
                                  <p className="text-[10px] text-primary/40">No assessments found — you can archive this member to preserve their record, or permanently delete if they were entered in error.</p>
                                )}
                                <input type="text" value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)}
                                  placeholder="Reason (e.g., Left company, Terminated)"
                                  className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                                <div className="flex gap-2">
                                  <button onClick={handleArchiveMember}
                                    className="rounded-[4px] bg-accent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90">
                                    Archive
                                  </button>
                                  {!archiveMemberHasAssessments && (
                                    <button onClick={handleDeleteMember}
                                      className="rounded-[4px] border-[1.5px] border-accent bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-accent transition hover:bg-accent hover:text-white">
                                      Delete
                                    </button>
                                  )}
                                  <button onClick={() => { setArchivingMemberId(null); setArchivingTeamId(null); }}
                                    className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                                    Cancel
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}

                        {/* Change team form */}
                        {isChangingTeam && (
                          <div className="border-t border-brand-gray/50 p-2.5 space-y-2">
                            <p className="text-xs font-semibold text-primary/60">Move {m.name} to another team</p>
                            <select value={changingTeamToId} onChange={(e) => setChangingTeamToId(e.target.value)}
                              className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary">
                              <option value="">Select team...</option>
                              {teams.filter((t) => t.id !== team.id).map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                            <div className="flex gap-2">
                              <button onClick={handleChangeTeam} disabled={!changingTeamToId}
                                className="rounded-[4px] bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50">
                                Move
                              </button>
                              <button onClick={() => { setChangingTeamMemberId(null); setChangingTeamFromId(null); setChangingTeamToId(""); }}
                                className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Promote confirmation */}
                        {isPromoting && (
                          <div className="border-t border-brand-gray/50 p-2.5 space-y-2">
                            <p className="text-xs font-semibold text-primary/60">Promote {m.name} to leader of {team.name}?</p>
                            {team.leaderName && <p className="text-[10px] text-primary/40">This will replace {team.leaderName} as the team leader.</p>}
                            <div className="flex gap-2">
                              <button onClick={handlePromoteToLeader}
                                className="rounded-[4px] bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90">
                                Promote
                              </button>
                              <button onClick={() => { setPromotingMemberId(null); setPromotingTeamId(null); }}
                                className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {isEditing && !isArchived && (
                          <div className="border-t border-brand-gray/50 p-2.5 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Name</label>
                                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                                  className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Title</label>
                                <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                                  className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                              </div>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              <button onClick={() => handleSaveMember(m.id, team.id)}
                                className="rounded-[4px] bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90">
                                Save
                              </button>
                              <button onClick={() => { setChangingTeamMemberId(m.id); setChangingTeamFromId(team.id); setChangingTeamToId(""); setEditingMemberId(null); }}
                                className="rounded-[4px] border-[1.5px] border-blue-500 bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-blue-500 transition hover:bg-blue-500 hover:text-white">
                                Change Team
                              </button>
                              <button onClick={() => { setPromotingMemberId(m.id); setPromotingTeamId(team.id); setEditingMemberId(null); }}
                                className="rounded-[4px] border-[1.5px] border-green-600 bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-green-600 transition hover:bg-green-600 hover:text-white">
                                Promote to Leader
                              </button>
                              {!m.isAppUser && (
                                <button onClick={() => { setInvitingMemberId(m.id); setInviteEmail(""); setInviteRole("leader"); setEditingMemberId(null); }}
                                  className="rounded-[4px] border-[1.5px] border-accent bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-accent transition hover:bg-accent hover:text-white">
                                  Invite as User
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {totalMembers === 0 && childTeams.length === 0 && (
                <p className="text-xs text-primary/40">No members or sub-teams yet.</p>
              )}

              {/* Add member */}
              {canManage && addMemberTeamId === team.id ? (
                <div className="mt-2 rounded-[4px] border border-brand-gray/50 bg-primary/[0.02] p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={newMemberName}
                      onChange={(e) => setNewMemberName(e.target.value)}
                      onBlur={() => checkDuplicates(newMemberName, newMemberEmail)}
                      placeholder="Name"
                      className="rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                    <input type="text" value={newMemberTitle} onChange={(e) => setNewMemberTitle(e.target.value)}
                      placeholder="Title (e.g., Controller)"
                      className="rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                  </div>
                  <input type="email" value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    onBlur={() => checkDuplicates(newMemberName, newMemberEmail)}
                    placeholder="Email (optional — required to invite as user)"
                    className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                  {dupWarning && (
                    <p className="text-[11px] text-yellow-700 bg-yellow-50 rounded-[4px] px-2 py-1">{dupWarning}</p>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={newMemberInvite}
                      onChange={(e) => setNewMemberInvite(e.target.checked)}
                      disabled={!newMemberEmail.trim()}
                      className="h-3.5 w-3.5 accent-primary" />
                    <span className="text-xs text-primary/60">Invite as app user</span>
                    {!newMemberEmail.trim() && <span className="text-[10px] text-primary/30">(enter email first)</span>}
                  </label>
                  {newMemberInvite && isAdmin && (
                    <select value={newMemberRole} onChange={(e) => setNewMemberRole(e.target.value as UserRole)}
                      className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary">
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  )}
                  {newMemberInvite && !isAdmin && (
                    <p className="text-[10px] text-primary/40">Will be invited as a Leader.</p>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => handleAddMember(team.id)} disabled={addingMember || !newMemberName.trim()}
                      className="rounded-[4px] bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50">
                      {addingMember ? "Adding..." : "Add"}
                    </button>
                    <button onClick={() => { setAddMemberTeamId(null); setNewMemberName(""); setNewMemberTitle(""); setNewMemberEmail(""); setNewMemberInvite(false); setDupWarning(""); }}
                      className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : canManage ? (
                <div className="mt-2 flex gap-3">
                  <button onClick={() => setAddMemberTeamId(team.id)}
                    className="text-xs font-semibold text-accent transition hover:opacity-70">
                    + Add Member
                  </button>
                  {isAdmin && (
                    <button onClick={() => { setAddSubTeamParentId(team.id); setNewSubTeamName(""); setNewSubTeamLeader(""); setNewSubTeamLeaderTitle(""); }}
                      className="text-xs font-semibold text-primary/50 transition hover:text-primary">
                      + Add Sub-Team
                    </button>
                  )}
                </div>
              ) : null}

              {/* Add sub-team form */}
              {addSubTeamParentId === team.id && (
                <div className="mt-2 rounded-[4px] border border-brand-gray/50 bg-primary/[0.02] p-3 space-y-2">
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Sub-Team Name</label>
                    <input type="text" value={newSubTeamName} onChange={(e) => setNewSubTeamName(e.target.value)}
                      placeholder="e.g., Finance, Sales, Marketing"
                      className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Leader</label>
                      {users.length > 0 ? (
                        <select value={newSubTeamLeader} onChange={(e) => {
                          setNewSubTeamLeader(e.target.value);
                          const selectedUser = users.find((u) => u.uid === e.target.value);
                          if (selectedUser) {
                            const knownTitle = findPersonTitle(selectedUser.displayName);
                            if (knownTitle) setNewSubTeamLeaderTitle(knownTitle);
                          }
                        }}
                          className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary">
                          <option value="">Select leader...</option>
                          {users.map((u) => (
                            <option key={u.uid} value={u.uid}>{u.displayName}</option>
                          ))}
                        </select>
                      ) : (
                        <input type="text" value={newSubTeamLeader} onChange={(e) => setNewSubTeamLeader(e.target.value)}
                          placeholder="Leader name"
                          className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Leader Title</label>
                      <input type="text" value={newSubTeamLeaderTitle} onChange={(e) => setNewSubTeamLeaderTitle(e.target.value)}
                        placeholder="e.g., VP Finance"
                        className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleCreateSubTeam(team.id, team.level ?? 0)} disabled={!newSubTeamName.trim()}
                      className="rounded-[4px] bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50">
                      Create
                    </button>
                    <button onClick={() => setAddSubTeamParentId(null)}
                      className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Child teams */}
              {childTeams.length > 0 && (
                <div className="mt-3 space-y-2">
                  {childTeams.map((child) => renderTeam(child))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="animate-pulse text-lg font-light text-primary/70">Loading...</p>
      </div>
    );
  }

  const topLevelTeams = tree.get(null) || [];

  return (
    <div className="min-h-screen bg-white px-4 py-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-primary">Teams & Users</h1>
        <p className="mt-1 text-sm text-primary/50">
          Manage your team structure. Add members and optionally invite them as app users.
        </p>

        {/* Unlinked users (admin only) */}
        {isAdmin && unlinkedUsers.length > 0 && (
          <div className="mt-6 rounded-[4px] border border-yellow-300 bg-yellow-50 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-yellow-800">
              Unlinked Users ({unlinkedUsers.length})
            </h2>
            <p className="mt-1 text-xs text-yellow-700">These users exist in the system but aren&apos;t assigned to a team. Assign them to a team or deactivate if no longer needed.</p>
            <div className="mt-3 space-y-2">
              {unlinkedUsers.map((u) => (
                <div key={u.uid} className="rounded-[4px] border border-yellow-200 bg-white p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-primary">{u.displayName}</p>
                      <p className="text-xs text-primary/50">{u.email} · {ROLE_LABELS[u.role]}</p>
                    </div>
                    <button onClick={() => { setAssignTeamUserId(u.uid); setAssignTeamId(""); setAssignTeamTitle(""); }}
                      className="rounded-[4px] bg-primary px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white transition hover:opacity-90">
                      Assign to Team
                    </button>
                    <button onClick={() => handleDeactivateUser(u.uid)}
                      className="text-xs text-accent/50 transition hover:text-accent">
                      Deactivate
                    </button>
                  </div>
                  {assignTeamUserId === u.uid && (
                    <div className="mt-3 space-y-2">
                      <select value={assignTeamId} onChange={(e) => setAssignTeamId(e.target.value)}
                        className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary">
                        <option value="">Select team...</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      <input type="text" value={assignTeamTitle} onChange={(e) => setAssignTeamTitle(e.target.value)}
                        placeholder="Title (optional)"
                        className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                      <div className="flex gap-2">
                        <button onClick={handleAssignUnlinkedUser} disabled={assigning || !assignTeamId}
                          className="rounded-[4px] bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50">
                          {assigning ? "Assigning..." : "Assign"}
                        </button>
                        <button onClick={() => setAssignTeamUserId(null)}
                          className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search + filters */}
        <div className="mt-6 flex items-center gap-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search team members..."
            className="flex-1 rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
          />
          <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
            <span className="text-xs text-primary/50">Show Archived</span>
          </label>
        </div>
        <div>
          {searchQuery.trim() && (() => {
            const q = searchQuery.toLowerCase();
            const allMembers: { id: string; name: string; role: string; teamName: string }[] = [];
            for (const teamId of Object.keys(members)) {
              const t = teams.find((x) => x.id === teamId);
              for (const m of members[teamId]) {
                if (m.name.toLowerCase().includes(q) || (m.role && m.role.toLowerCase().includes(q))) {
                  allMembers.push({ id: m.id, name: m.name, role: m.role, teamName: t?.name ?? "" });
                }
              }
            }
            if (allMembers.length === 0) return <p className="mt-2 text-xs text-primary/40">No matches found.</p>;
            return (
              <div className="mt-2 rounded-[4px] border border-brand-gray bg-white shadow-sm">
                {allMembers.map((m) => (
                  <button key={m.id} onClick={() => router.push(`/members/${m.id}`)}
                    className="flex w-full items-center gap-3 border-b border-brand-gray/30 px-3 py-2.5 text-left transition hover:bg-primary/5 last:border-0">
                    <span className="text-sm font-semibold text-primary">{m.name}</span>
                    {m.role && <span className="text-xs text-primary/50">{m.role}</span>}
                    <span className="ml-auto text-[10px] text-primary/30">{m.teamName}</span>
                  </button>
                ))}
              </div>
            );
          })()}
        </div>

        {error && <p className="mt-4 text-sm text-accent">{error}</p>}

        <div className="mt-4 space-y-3">
          {topLevelTeams.map((team) => renderTeam(team))}
        </div>

        {topLevelTeams.length === 0 && (
          <p className="mt-6 text-sm font-light text-primary/70">Loading team structure...</p>
        )}
      </div>
    </div>
  );
}
