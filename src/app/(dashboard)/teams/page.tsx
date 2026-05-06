"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { canManageCompany, canManageTeamInScope } from "@/lib/permissions";
import { getSubTeamIds } from "@/lib/team-auth";
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
  logLeaderChangeForTeamMembers,
  findDuplicateMember,
  propagateMemberNameChange,
  propagateMemberTitleChange,
} from "@/lib/team-service";
import { getAssessmentHistory } from "@/lib/assessment-service";
import { getCompanyUsers, getArchivedUsers, updateUserRole, deactivateUser, reactivateUser, updateUserEmail, type ArchivedUser } from "@/lib/user-service";
import { getFiscalYear, getFiscalQuarter } from "@/lib/fiscalUtils";
import { useKeyboardShortcuts } from "@/lib/useKeyboardShortcuts";
import type { Team, TeamMember } from "@/types/team";
import type { UserProfile, UserRole } from "@/types/auth";
import TrashIcon from "@/components/TrashIcon";

const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: "Super Admin",
  company_admin: "Company Admin",
  senior_leader: "Senior Leader",
  leader: "Leader",
};
const ASSIGNABLE_ROLES: UserRole[] = ["company_admin", "senior_leader", "leader"];

/** Roles the current user is allowed to assign to others.
 * Admins (superadmin / company_admin) can assign any role.
 * Senior Leaders and Leaders can ONLY add Leaders — granting Senior Leader is reserved for admins. */
function assignableRolesFor(actorRole: UserRole): UserRole[] {
  if (actorRole === "superadmin" || actorRole === "company_admin") return ASSIGNABLE_ROLES;
  return ["leader"];
}

/** Build a tree structure from flat teams list.
 * If a team's parent isn't in the input set (e.g., the user is scoped to a
 * sub-team and the parent leadership team is out of view), the team is
 * treated as effectively top-level — so the renderer always has a root. */
function buildTree(teams: Team[]): Map<string | null, Team[]> {
  const tree = new Map<string | null, Team[]>();
  const teamIds = new Set(teams.map((t) => t.id));
  for (const t of teams) {
    const effectiveParent =
      t.parentTeamId && teamIds.has(t.parentTeamId) ? t.parentTeamId : null;
    if (!tree.has(effectiveParent)) tree.set(effectiveParent, []);
    tree.get(effectiveParent)!.push(t);
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
  const [authorizedTeamIds, setAuthorizedTeamIds] = useState<Set<string>>(new Set());
  const [members, setMembers] = useState<Record<string, TeamMember[]>>({});
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [unlinkedUsers, setUnlinkedUsers] = useState<UserProfile[]>([]);
  const [archivedUsers, setArchivedUsers] = useState<ArchivedUser[]>([]);
  const [showArchivedUsers, setShowArchivedUsers] = useState(false);
  const [restoringUserId, setRestoringUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // Archive form state (lives inside the consolidated edit panel)
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveMemberHasAssessments, setArchiveMemberHasAssessments] = useState<boolean | null>(null);

  // Expanded teams
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  // Add sub-team — keyed by the team member who will lead the new sub-team.
  // The leader is auto-set to that member (their uid + name + title).
  const [addSubTeamForMemberId, setAddSubTeamForMemberId] = useState<string | null>(null);
  const [newSubTeamName, setNewSubTeamName] = useState("");

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
  // Team-to-lead selection for the Add Member invite path
  const [newMemberLeadsMode, setNewMemberLeadsMode] = useState<"existing" | "new">("new");
  const [newMemberLeadsExistingId, setNewMemberLeadsExistingId] = useState("");
  const [newMemberLeadsNewName, setNewMemberLeadsNewName] = useState("");
  const [newMemberLeadsParentId, setNewMemberLeadsParentId] = useState("");

  // Member name/title fields (live inside the consolidated edit panel)
  const [editName, setEditName] = useState("");
  const [editTitle, setEditTitle] = useState("");

  // App-user email edit (lives inside the consolidated edit panel)
  const [editEmail, setEditEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);

  // Invite-as-app-user fields (lives inside the consolidated edit panel)
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("leader");
  const [inviting, setInviting] = useState(false);
  const [inviteLeadsMode, setInviteLeadsMode] = useState<"existing" | "new">("new");
  const [inviteLeadsExistingId, setInviteLeadsExistingId] = useState("");
  const [inviteLeadsNewName, setInviteLeadsNewName] = useState("");
  const [inviteLeadsParentId, setInviteLeadsParentId] = useState("");

  // Unlinked-user → assign to a team as a member
  const [assignTeamUserId, setAssignTeamUserId] = useState<string | null>(null);
  const [assignTeamId, setAssignTeamId] = useState("");
  const [assignTeamTitle, setAssignTeamTitle] = useState("");
  const [assigning, setAssigning] = useState(false);
  // Team-to-lead picker (lives inside the consolidated edit panel)
  const [leadAssignMode, setLeadAssignMode] = useState<"existing" | "new">("new");
  const [leadAssignExistingId, setLeadAssignExistingId] = useState("");
  const [leadAssignNewName, setLeadAssignNewName] = useState("");
  const [leadAssignParentId, setLeadAssignParentId] = useState("");
  const [leadAssigning, setLeadAssigning] = useState(false);

  // Consolidated edit panel — only one row's pencil is open at a time.
  // Panel sections (member, app user, team-they-lead, etc.) all render
  // together inside this single panel; their field state lives in the
  // individual edit* / invite* / leadAssign* / changeTeam* / archive* vars.
  const [openEditPanelId, setOpenEditPanelId] = useState<string | null>(null);
  const [moveTeamToId, setMoveTeamToId] = useState("");
  // Unlinked-user pencil panel (separate state — keyed by uid)
  const [openUnlinkedPanelId, setOpenUnlinkedPanelId] = useState<string | null>(null);

  useKeyboardShortcuts({
    onEscape: () => {
      setEditingTeamId(null);
      setOpenEditPanelId(null);
      setOpenUnlinkedPanelId(null);
      setAddMemberTeamId(null);
      setAddSubTeamForMemberId(null);
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
        getCompanyUsers(companyId),
      ]);

      // Compute authorized team scope: admins get everything; otherwise teams the user leads
      // plus all descendant sub-teams (recursive).
      let authIds: Set<string>;
      if (isAdmin) {
        authIds = new Set(teamData.map((t) => t.id));
      } else {
        authIds = new Set<string>();
        for (const t of teamData.filter((t) => t.leaderId === profile.uid)) {
          getSubTeamIds(t.id, teamData).forEach((id) => authIds.add(id));
        }
      }
      setAuthorizedTeamIds(authIds);

      // Strict scope: non-admins see only their own teams (and descendants).
      // The team tree's render logic treats any team whose parent isn't in
      // the visible list as effectively top-level, so a sub-team leader
      // sees their team as the root — no parent leadership team is exposed.
      const visibleTeams = teamData.filter((t) => authIds.has(t.id));
      setTeams(visibleTeams);
      setUsers(userData);

      const memberMap: Record<string, TeamMember[]> = {};
      for (const t of visibleTeams) {
        memberMap[t.id] = await getTeamMembers(companyId, t.id);
      }
      setMembers(memberMap);

      // Find users with no linked teamMember record (admin only).
      // Archived users now live in /usersArchived and aren't returned by
      // getCompanyUsers, so the isActive filter is just defensive.
      if (isAdmin && userData.length > 0) {
        const allMembers = Object.values(memberMap).flat();
        const linkedUserIds = new Set(allMembers.filter((m) => m.appUserId).map((m) => m.appUserId));
        const unlinked = userData.filter((u) => !linkedUserIds.has(u.uid) && (u.isActive ?? true));
        setUnlinkedUsers(unlinked);
      }

      if (isAdmin) {
        try {
          const archived = await getArchivedUsers(companyId);
          setArchivedUsers(archived);
        } catch (archiveErr) {
          console.error("Archived users load error:", archiveErr);
        }
      }

      // Default expansion: every team that renders as top-level in the
      // current scope. Admins start with the real root expanded. Non-admins
      // get their boundary teams expanded (R&D for a sub-team leader).
      const expandSet = new Set<string>();
      const visibleIds = new Set(visibleTeams.map((t) => t.id));
      const renderRoots = visibleTeams.filter(
        (t) => !t.parentTeamId || !visibleIds.has(t.parentTeamId)
      );
      for (const t of renderRoots) expandSet.add(t.id);
      setExpandedTeams(expandSet);
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

  async function checkDuplicates(_name: string, email: string) {
    if (!companyId || !email.trim()) { setDupWarning(""); return; }
    try {
      const matches = await findDuplicateMember(companyId, "", email);
      if (matches.length > 0) {
        const names = matches.map((m) => m.name).join(", ");
        setDupWarning(`This email is already used by ${names}. Duplicate emails are not allowed.`);
      } else {
        setDupWarning("");
      }
    } catch {
      setDupWarning("");
    }
  }

  /** Create a sub-team under a given member of a parent team. The member
   * automatically becomes the leader of the new sub-team. If the member is
   * an app user, leaderId is their uid; otherwise leaderId is empty and
   * leaderName carries their name (legacy free-text leader path). */
  async function handleCreateSubTeamForMember(parentTeam: Team, m: TeamMember) {
    if (!companyId || !newSubTeamName.trim()) return;
    try {
      const leaderId = m.appUserId || "";
      const leaderName = m.name;
      const leaderTitle = m.role || "";
      const id = await createTeam(companyId, {
        name: newSubTeamName.trim(),
        leaderId,
        leaderName,
        leaderTitle,
        parentTeamId: parentTeam.id,
        level: (parentTeam.level ?? 0) + 1,
      });
      const newTeam: Team = {
        id,
        name: newSubTeamName.trim(),
        parentTeamId: parentTeam.id,
        leaderId,
        leaderName,
        leaderTitle,
        level: (parentTeam.level ?? 0) + 1,
      } as Team;
      setTeams([...teams, newTeam]);
      setAuthorizedTeamIds((prev) => new Set([...Array.from(prev), id]));
      setMembers({ ...members, [id]: [] });
      setNewSubTeamName("");
      setAddSubTeamForMemberId(null);
      setExpandedTeams((prev) => new Set([...Array.from(prev), parentTeam.id, id]));
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
    // Prefer the leader's live profile title; fall back to the team's
    // stored leaderTitle so we don't lose anything if the leader has
    // no member record (rare/legacy data).
    const liveTitle = team.leaderName ? findPersonTitle(team.leaderName) : "";
    setEditTeamLeaderTitle(liveTitle || team.leaderTitle || "");
  }

  async function handleSaveTeam(teamId: string) {
    if (!companyId || !editTeamName.trim()) return;
    try {
      const oldTeam = teams.find((t) => t.id === teamId);
      const leaderChanged = oldTeam && oldTeam.leaderName !== editTeamLeader.trim() && oldTeam.leaderName;
      // If the leader is being replaced (not simply set on a leaderless team),
      // confirm before silently overwriting — the previous leader loses their
      // team scope and their team-leader memory of this team.
      if (leaderChanged && editTeamLeader.trim()) {
        const ok = window.confirm(
          `${oldTeam.name} is currently led by ${oldTeam.leaderName}. Replace ${oldTeam.leaderName} with ${editTeamLeader.trim()} as the leader?`
        );
        if (!ok) return;
      }
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

    // Block on duplicate email — re-check synchronously since the inline
    // warning is debounced on blur and the email may have changed since.
    if (newMemberEmail.trim()) {
      try {
        const emailDups = await findDuplicateMember(companyId, "", newMemberEmail.trim());
        if (emailDups.length > 0) {
          const names = emailDups.map((m) => m.name).join(", ");
          setDupWarning(`This email is already used by ${names}. Duplicate emails are not allowed.`);
          return;
        }
      } catch {
        // If the duplicate check itself fails, fall through and let the create flow surface any error.
      }
    }

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
        const effectiveRole: UserRole = isAdmin ? newMemberRole : "leader";
        const needsLeadTeam = effectiveRole === "senior_leader" || effectiveRole === "leader";

        // Validate the team-to-lead picker for leader-type roles.
        let leadsExistingTeamId: string | undefined;
        let leadsNewTeam: { name: string; parentTeamId: string } | undefined;
        if (needsLeadTeam) {
          if (newMemberLeadsMode === "existing") {
            if (!newMemberLeadsExistingId) {
              setError("Pick a team for this person to lead.");
              setAddingMember(false);
              return;
            }
            const targetTeam = teams.find((t) => t.id === newMemberLeadsExistingId);
            if (targetTeam?.leaderId && targetTeam.leaderName) {
              const ok = window.confirm(
                `${targetTeam.name} is currently led by ${targetTeam.leaderName}. Replace ${targetTeam.leaderName} with ${newMemberName.trim()} as the leader?`
              );
              if (!ok) {
                setAddingMember(false);
                return;
              }
            }
            leadsExistingTeamId = newMemberLeadsExistingId;
          } else {
            if (!newMemberLeadsNewName.trim() || !newMemberLeadsParentId) {
              setError("Enter a name and pick a parent team for the new team.");
              setAddingMember(false);
              return;
            }
            leadsNewTeam = {
              name: newMemberLeadsNewName.trim(),
              parentTeamId: newMemberLeadsParentId,
            };
          }
        }

        try {
          const res = await fetch("/api/users/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyId,
              email: newMemberEmail.trim(),
              displayName: newMemberName.trim(),
              role: effectiveRole,
              title: newMemberTitle.trim(),
              teamId,
              leadsExistingTeamId,
              leadsNewTeam,
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
            // If a team was created or a leader changed, refresh teams.
            if (data.ledTeamId) {
              const refreshedTeams = await getTeams(companyId);
              const visible = isAdmin
                ? refreshedTeams
                : refreshedTeams.filter((t) => authorizedTeamIds.has(t.id) || t.leaderId === profile?.uid || t.id === data.ledTeamId);
              setTeams(visible);
              if (data.ledTeamId && !authorizedTeamIds.has(data.ledTeamId)) {
                setAuthorizedTeamIds(new Set([...Array.from(authorizedTeamIds), data.ledTeamId]));
              }
            }
            if (data.reusedExistingAuth) {
              setNotice(
                `${newMemberName.trim()} was added to this company. They already had a login from another company, so no welcome email was sent — they'll use their existing password.`
              );
            } else if (data.emailSent === false) {
              setNotice(
                `${newMemberName.trim()} was created, but the welcome email failed to send${
                  data.emailError ? ` (${data.emailError})` : ""
                }. Tell them manually or use Reset Password to retry.`
              );
            }
          } else {
            setError(data.error || "Member added but invite failed.");
            setAddingMember(false);
            return;
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
      setNewMemberLeadsMode("new");
      setNewMemberLeadsExistingId("");
      setNewMemberLeadsNewName("");
      setNewMemberLeadsParentId("");
    } catch {
      setError("Failed to add team member.");
    }
    setAddingMember(false);
  }

  async function handleInviteMember(memberId: string, teamId: string) {
    if (!companyId || !inviteEmail.trim()) return;
    const member = members[teamId]?.find((m) => m.id === memberId);
    if (!member) return;

    const effectiveRole: UserRole = isAdmin ? inviteRole : "leader";
    const needsLeadTeam = effectiveRole === "senior_leader" || effectiveRole === "leader";

    let leadsExistingTeamId: string | undefined;
    let leadsNewTeam: { name: string; parentTeamId: string } | undefined;
    if (needsLeadTeam) {
      if (inviteLeadsMode === "existing") {
        if (!inviteLeadsExistingId) {
          setError("Pick a team for this person to lead.");
          return;
        }
        const targetTeam = teams.find((t) => t.id === inviteLeadsExistingId);
        if (targetTeam?.leaderId && targetTeam.leaderName) {
          const ok = window.confirm(
            `${targetTeam.name} is currently led by ${targetTeam.leaderName}. Replace ${targetTeam.leaderName} with ${member.name} as the leader?`
          );
          if (!ok) return;
        }
        leadsExistingTeamId = inviteLeadsExistingId;
      } else {
        if (!inviteLeadsNewName.trim() || !inviteLeadsParentId) {
          setError("Enter a name and pick a parent team for the new team.");
          return;
        }
        leadsNewTeam = {
          name: inviteLeadsNewName.trim(),
          parentTeamId: inviteLeadsParentId,
        };
      }
    }

    setInviting(true);
    try {
      const res = await fetch("/api/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          email: inviteEmail.trim(),
          displayName: member.name,
          role: effectiveRole,
          title: member.role,
          teamId,
          leadsExistingTeamId,
          leadsNewTeam,
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
        if (data.ledTeamId) {
          const refreshedTeams = await getTeams(companyId);
          const visible = isAdmin
            ? refreshedTeams
            : refreshedTeams.filter((t) => authorizedTeamIds.has(t.id) || t.leaderId === profile?.uid || t.id === data.ledTeamId);
          setTeams(visible);
          if (data.ledTeamId && !authorizedTeamIds.has(data.ledTeamId)) {
            setAuthorizedTeamIds(new Set([...Array.from(authorizedTeamIds), data.ledTeamId]));
          }
        }
        setInviteEmail("");
        setInviteRole("leader");
        setInviteLeadsMode("new");
        setInviteLeadsExistingId("");
        setInviteLeadsNewName("");
        setInviteLeadsParentId("");
        if (data.reusedExistingAuth) {
          setNotice(
            `${member.name} was added to this company. They already had a login from another company, so no welcome email was sent — they'll use their existing password.`
          );
        } else if (data.emailSent === false) {
          setNotice(
            `${member.name} was invited, but the welcome email failed to send${
              data.emailError ? ` (${data.emailError})` : ""
            }. Tell them manually or use Reset Password to retry.`
          );
        }
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
    if (
      !window.confirm(
        "Archive this user? They will be removed from this company and can no longer log in here. Their email will become available for a new user."
      )
    )
      return;
    const result = await deactivateUser(companyId, userId);
    if (result.error) {
      setError(result.error);
      return;
    }
    setUsers(users.filter((u) => u.uid !== userId));
    setUnlinkedUsers((prev) => prev.filter((u) => u.uid !== userId));
    if (isAdmin) {
      try {
        const archived = await getArchivedUsers(companyId);
        setArchivedUsers(archived);
      } catch {
        // non-fatal
      }
    }
  }

  async function handleRestoreUser(archivedDocId: string) {
    if (!companyId) return;
    setRestoringUserId(archivedDocId);
    setError("");
    const result = await reactivateUser(companyId, archivedDocId);
    setRestoringUserId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    // Reload both active and archived lists
    try {
      const [updated, archived] = await Promise.all([
        getCompanyUsers(companyId),
        getArchivedUsers(companyId),
      ]);
      setUsers(updated);
      setArchivedUsers(archived);
    } catch {
      // non-fatal
    }
  }

  // Kept for back-compat with any callers; reactivation now goes through
  // handleRestoreUser using the archived doc id, not the user id.
  async function handleReactivateUser(userId: string) {
    await handleRestoreUser(userId);
  }
  void handleReactivateUser;

  async function handleResetPassword(email: string, displayName: string) {
    try {
      const res = await fetch("/api/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to send password reset email.");
        return;
      }
      alert(`Password reset email sent to ${email}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to send password reset email."
      );
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

  async function handleAssignLeadTeam(userId: string, userDisplayName: string) {
    if (!companyId) return;
    let leadsExistingTeamId: string | undefined;
    let leadsNewTeam: { name: string; parentTeamId: string } | undefined;
    if (leadAssignMode === "existing") {
      if (!leadAssignExistingId) {
        setError("Pick a team for this person to lead.");
        return;
      }
      const targetTeam = teams.find((t) => t.id === leadAssignExistingId);
      if (targetTeam?.leaderId && targetTeam.leaderId !== userId && targetTeam.leaderName) {
        const ok = window.confirm(
          `${targetTeam.name} is currently led by ${targetTeam.leaderName}. Replace ${targetTeam.leaderName} with ${userDisplayName} as the leader?`
        );
        if (!ok) return;
      }
      leadsExistingTeamId = leadAssignExistingId;
    } else {
      if (!leadAssignNewName.trim() || !leadAssignParentId) {
        setError("Enter a name and pick a parent team for the new team.");
        return;
      }
      leadsNewTeam = {
        name: leadAssignNewName.trim(),
        parentTeamId: leadAssignParentId,
      };
    }

    setLeadAssigning(true);
    setError("");
    try {
      const res = await fetch("/api/users/assign-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          userId,
          leadsExistingTeamId,
          leadsNewTeam,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to assign team.");
      } else {
        const refreshedTeams = await getTeams(companyId);
        const visible = isAdmin
          ? refreshedTeams
          : refreshedTeams.filter((t) => authorizedTeamIds.has(t.id) || t.leaderId === profile?.uid || t.id === data.ledTeamId);
        setTeams(visible);
        if (data.ledTeamId && !authorizedTeamIds.has(data.ledTeamId)) {
          setAuthorizedTeamIds(new Set([...Array.from(authorizedTeamIds), data.ledTeamId]));
        }
        setLeadAssignMode("new");
        setLeadAssignExistingId("");
        setLeadAssignNewName("");
        setLeadAssignParentId("");
        setNotice(`${userDisplayName} now leads ${leadsNewTeam ? leadsNewTeam.name : (teams.find((t) => t.id === leadsExistingTeamId)?.name ?? "the selected team")}.`);
      }
    } catch {
      setError("Failed to assign team.");
    }
    setLeadAssigning(false);
  }

  async function handleSaveMember(memberId: string, teamId: string) {
    if (!companyId) return;
    const member = members[teamId]?.find((m) => m.id === memberId);
    if (!member) return;
    try {
      const updates: Partial<{ name: string; role: string }> = {};
      const nameChanged = editName !== member.name;
      const titleChanged = editTitle !== member.role;
      if (nameChanged) updates.name = editName;
      if (titleChanged) {
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

      const appUserId = member.appUserId ?? null;

      // If the name changed, propagate to denormalized copies
      // (user.displayName, team.leaderName, actionPlan.memberName)
      if (nameChanged) {
        const oldName = member.name;
        const newName = editName;
        const { updatedTeamIds } = await propagateMemberNameChange(
          companyId, memberId, oldName, newName, appUserId
        );
        if (updatedTeamIds.length > 0) {
          setTeams((prev) =>
            prev.map((t) =>
              updatedTeamIds.includes(t.id) ? { ...t, leaderName: newName } : t
            )
          );
        }
        if (appUserId) {
          setUsers((prev) =>
            prev.map((u) =>
              u.uid === appUserId ? { ...u, displayName: newName } : u
            )
          );
        }
      }

      // If the title changed, propagate to team.leaderTitle on any team this person leads
      if (titleChanged) {
        const currentName = nameChanged ? editName : member.name;
        const { updatedTeamIds } = await propagateMemberTitleChange(
          companyId, currentName, editTitle, appUserId
        );
        if (updatedTeamIds.length > 0) {
          setTeams((prev) =>
            prev.map((t) =>
              updatedTeamIds.includes(t.id) ? { ...t, leaderTitle: editTitle } : t
            )
          );
        }
      }

      closeMemberPanel();
    } catch {
      setError("Failed to update member.");
    }
  }

  /** Open the consolidated edit panel for a member, prefilling all section
   * fields and resetting any draft state from a previously-open panel. */
  function openMemberPanel(m: TeamMember, teamId: string) {
    setOpenUnlinkedPanelId(null); // one panel at a time across both sections
    setOpenEditPanelId(m.id);
    // Member section
    setEditName(m.name);
    setEditTitle(m.role);
    // Move-to-team section
    setMoveTeamToId("");
    // App user → invite path defaults
    setInviteEmail("");
    setInviteRole("leader");
    setInviteLeadsMode("new");
    setInviteLeadsExistingId("");
    setInviteLeadsNewName("");
    setInviteLeadsParentId(teamId);
    // App user → email edit defaults (only used when linkedUser exists)
    const linkedUser = m.isAppUser && m.appUserId ? users.find((u) => u.uid === m.appUserId) : null;
    setEditEmail(linkedUser?.email ?? "");
    setEmailError("");
    // App user → team-to-lead picker defaults
    const ledTeam = linkedUser ? teams.find((t) => t.leaderId === linkedUser.uid) : null;
    setLeadAssignMode("new");
    setLeadAssignExistingId("");
    setLeadAssignNewName("");
    setLeadAssignParentId(ledTeam ? (ledTeam.parentTeamId ?? teamId) : teamId);
    // Archive section
    setArchiveReason("");
    setArchiveMemberHasAssessments(null);
    if (companyId) {
      getAssessmentHistory(companyId, m.id)
        .then((a) => setArchiveMemberHasAssessments(a.length > 0))
        .catch(() => setArchiveMemberHasAssessments(false));
    }
  }

  function closeMemberPanel() {
    setOpenEditPanelId(null);
    setEmailError("");
  }

  /** Open the consolidated edit panel for an unlinked user (admin only). */
  function openUnlinkedPanel(u: UserProfile) {
    setOpenEditPanelId(null); // one panel at a time
    setOpenUnlinkedPanelId(u.uid);
    setEditEmail(u.email);
    setEmailError("");
    setAssignTeamId("");
    setAssignTeamTitle("");
    // Team-to-lead picker defaults
    const ledTeam = teams.find((t) => t.leaderId === u.uid);
    setLeadAssignMode("new");
    setLeadAssignExistingId("");
    setLeadAssignNewName("");
    setLeadAssignParentId(ledTeam ? (ledTeam.parentTeamId ?? "") : "");
  }

  function closeUnlinkedPanel() {
    setOpenUnlinkedPanelId(null);
    setEmailError("");
  }

  async function handleArchiveMember(memberId: string, teamId: string, reason: string) {
    if (!companyId) return;
    try {
      await archiveMember(companyId, memberId, reason || "Left company", profile?.uid || "", todayISO, currentFY, currentFQ);
      setMembers({
        ...members,
        [teamId]: members[teamId].map((m) =>
          m.id === memberId ? { ...m, status: "archived" as const, archivedReason: reason || "Left company" } : m
        ),
      });
    } catch { setError("Failed to archive member."); }
  }

  async function handleUnarchiveMember(memberId: string, teamId: string) {
    if (!companyId) return;
    try {
      await unarchiveMember(companyId, memberId, profile?.uid || "", todayISO, currentFY, currentFQ);
      setMembers({ ...members, [teamId]: members[teamId].map((m) => m.id === memberId ? { ...m, status: "active" as const, archivedAt: null, archivedReason: null } : m) });
    } catch { setError("Failed to unarchive member."); }
  }

  async function handleDeleteMember(memberId: string, teamId: string) {
    if (!companyId) return;
    if (!window.confirm("Permanently delete this team member? This cannot be undone.")) return;
    try {
      await deleteTeamMember(companyId, memberId);
      setMembers({ ...members, [teamId]: members[teamId].filter((m) => m.id !== memberId) });
    } catch { setError("Failed to delete member."); }
  }

  async function handleChangeTeam(memberId: string, fromTeamId: string, toTeamId: string) {
    if (!companyId || !memberId || !fromTeamId || !toTeamId) return;
    const member = members[fromTeamId]?.find((m) => m.id === memberId);
    if (!member) return;
    const fromTeam = teams.find((t) => t.id === fromTeamId);
    const toTeam = teams.find((t) => t.id === toTeamId);
    if (!toTeam) return;
    try {
      await changeTeam(companyId, memberId, fromTeam?.name || "", toTeamId, toTeam.name, toTeam.leaderId || "", profile?.uid || "", todayISO, currentFY, currentFQ);
      const updatedMember = { ...member, teamId: toTeamId, reportsToUserId: toTeam.leaderId || "" };
      setMembers({
        ...members,
        [fromTeamId]: members[fromTeamId].filter((m) => m.id !== memberId),
        [toTeamId]: [...(members[toTeamId] || []), updatedMember],
      });
    } catch { setError("Failed to change team."); }
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
    // Cap visual indentation at 4 levels deep — beyond that, the page gets
    // visually crowded but we still nest logically.
    const visualIndent = Math.min(indent, 4);
    const isEditingThis = editingTeamId === team.id;
    const totalMembers = teamMembers.length + leaderMembers.length;
    const canManage = canManageTeamInScope(profile, team.id, authorizedTeamIds);

    // Map each child team to the parent-team member who leads it (if any).
    // Prefer leaderId (app-user uid); fall back to leaderName (free-text).
    const ledByMemberId = new Map<string, Team[]>();
    const matchedChildIds = new Set<string>();
    for (const ct of childTeams) {
      let matched: TeamMember | undefined;
      if (ct.leaderId) {
        matched = teamMembers.find((m) => m.appUserId === ct.leaderId);
      }
      if (!matched && ct.leaderName) {
        matched = teamMembers.find((m) => m.name === ct.leaderName);
      }
      if (matched) {
        const arr = ledByMemberId.get(matched.id) ?? [];
        arr.push(ct);
        ledByMemberId.set(matched.id, arr);
        matchedChildIds.add(ct.id);
      }
    }
    const orphanChildTeams = childTeams.filter((ct) => !matchedChildIds.has(ct.id));

    return (
      <div key={team.id} style={{ marginLeft: visualIndent > 0 ? 20 : 0 }}>
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
              {team.leaderName && (() => {
                // Prefer the leader's live profile title over the team's
                // possibly-stale leaderTitle cache.
                const displayTitle = findPersonTitle(team.leaderName) || team.leaderTitle || "";
                return (
                  <span className="text-xs text-primary/40">
                    Led by {team.leaderName}
                    {displayTitle && <span className="text-primary/30"> · {displayTitle}</span>}
                  </span>
                );
              })()}
              <span className="text-[10px] text-primary/30">
                {totalMembers} member{totalMembers !== 1 ? "s" : ""}
                {childTeams.length > 0 ? ` · ${childTeams.length} sub-team${childTeams.length !== 1 ? "s" : ""}` : ""}
              </span>
            </button>

            {canManage && (
              <button onClick={() => startEditTeam(team)}
                className="text-xs text-primary/50 transition hover:text-primary" title="Edit team">
                {isEditingThis ? "▲" : "✎"}
              </button>
            )}
            {canManage && !isTopLevel && (
              <button onClick={() => handleDeleteTeam(team.id)}
                className="text-red-500 transition hover:text-red-700"
                title="Delete team" aria-label="Delete team">
                <TrashIcon />
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
                  <div className="mt-1 rounded-[4px] border border-brand-gray bg-primary/[0.03] px-3 py-2 text-sm text-primary/80 min-h-[38px] flex items-center">
                    {editTeamLeaderTitle.trim() || <span className="text-primary/30">—</span>}
                  </div>
                  <p className="mt-1 text-[10px] text-primary/40">Title is changed from the member&apos;s profile.</p>
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
              {/* Synthetic leader-of-sub-team rows (people who lead a sub-team
                  but aren't a regular team-member of this team). Display only —
                  these are rare edge cases and aren't part of the editable list. */}
              {leaderMembers.length > 0 && (
                <div className="space-y-1 mb-1">
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

              {/* Team members — one compact row each. Click ✎ to open
                  the consolidated edit panel for that person. */}
              {teamMembers.length > 0 && (
                <div className={`space-y-1 ${leaderMembers.length > 0 ? "mt-1" : ""}`}>
                  {[...teamMembers].sort((a, b) => {
                    const aIsLeader =
                      (!!team.leaderId && a.appUserId === team.leaderId) ||
                      (!team.leaderId && !!team.leaderName && a.name === team.leaderName);
                    const bIsLeader =
                      (!!team.leaderId && b.appUserId === team.leaderId) ||
                      (!team.leaderId && !!team.leaderName && b.name === team.leaderName);
                    if (aIsLeader && !bIsLeader) return -1;
                    if (bIsLeader && !aIsLeader) return 1;
                    return a.name.localeCompare(b.name);
                  }).map((m) => {
                    const isPanelOpen = openEditPanelId === m.id;
                    const isArchived = m.status === "archived";
                    const leadsTeams = teams.filter((t) => t.leaderId && m.appUserId && t.leaderId === m.appUserId);
                    // Fallback for non-app-user leadership references (legacy data).
                    const leadsByName = childTeams.filter((ct) => ct.leaderName === m.name);
                    const allLeads = leadsTeams.length > 0 ? leadsTeams : leadsByName;
                    const linkedUser = m.isAppUser && m.appUserId ? users.find((u) => u.uid === m.appUserId) : null;
                    const userIsInactive = linkedUser?.isActive === false;
                    const allowedRoles = profile ? assignableRolesFor(profile.role) : ["leader" as UserRole];
                    const userOutranks = linkedUser ? !allowedRoles.includes(linkedUser.role) : false;
                    const isSelf = linkedUser?.uid === profile?.uid;

                    return (
                      <Fragment key={m.id}>
                      <div className={`rounded-[4px] border border-brand-gray/50 ${isArchived ? "bg-primary/[0.03] opacity-60" : "bg-white"}`}>
                        {/* Compact one-line row */}
                        <div className="flex items-center gap-3 p-2.5">
                          <div className="flex-1 min-w-0 flex items-baseline gap-2 flex-wrap">
                            <button onClick={() => router.push(`/members/${m.id}`)} className={`text-sm font-semibold transition hover:text-accent ${isArchived ? "text-primary/50" : "text-primary"}`}>
                              {m.name}
                            </button>
                            {m.role && <span className="text-xs text-primary/50">{m.role}</span>}
                          </div>
                          {isArchived && (
                            <span className="rounded-[2px] bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary/50">
                              Archived{m.archivedReason ? ` — ${m.archivedReason}` : ""}
                            </span>
                          )}
                          {allLeads.map((lt) => (
                            <span key={lt.id} className="rounded-[2px] bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-blue-700">
                              Leads {lt.name}
                            </span>
                          ))}
                          {m.isAppUser && (
                            <span className={`rounded-[2px] px-1.5 py-0.5 text-[9px] font-semibold uppercase ${userIsInactive ? "bg-primary/10 text-primary/40" : "bg-green-100 text-green-700"}`}>
                              {userIsInactive ? "User (Inactive)" : "User"}
                            </span>
                          )}
                          {canManage && (
                            <button onClick={() => isPanelOpen ? closeMemberPanel() : openMemberPanel(m, team.id)}
                              className="text-xs text-primary/50 transition hover:text-primary" title="Edit">
                              {isPanelOpen ? "▲" : "✎"}
                            </button>
                          )}
                        </div>

                        {/* Consolidated edit panel — opens when ✎ is clicked */}
                        {isPanelOpen && (
                          <div className="border-t border-brand-gray/50 divide-y divide-brand-gray/20 bg-primary/[0.02]">
                            {/* Member section */}
                            {!isArchived && (
                              <div className="p-3 space-y-2">
                                <p className="text-xs font-bold uppercase tracking-wider text-primary/80">Member</p>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] uppercase tracking-wider text-primary/40">Name</label>
                                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                                      className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                                  </div>
                                  <div>
                                    <label className="text-[10px] uppercase tracking-wider text-primary/40">Title</label>
                                    <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                                      className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => handleSaveMember(m.id, team.id)}
                                    className="rounded-[4px] bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90">
                                    Save
                                  </button>
                                  <button onClick={() => { setEditName(m.name); setEditTitle(m.role); }}
                                    className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Move to a different team */}
                            {!isArchived && teams.filter((t) => t.id !== team.id && authorizedTeamIds.has(t.id)).length > 0 && (
                              <div className="p-3 space-y-2">
                                <p className="text-xs font-bold uppercase tracking-wider text-primary/80">Move to a different team</p>
                                <p className="text-[10px] text-primary/50">Currently: <span className="font-semibold text-primary/70">{team.name}</span></p>
                                <select value={moveTeamToId} onChange={(e) => setMoveTeamToId(e.target.value)}
                                  className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary">
                                  <option value="">Select team…</option>
                                  {teams.filter((t) => t.id !== team.id && authorizedTeamIds.has(t.id)).map((t) => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                  ))}
                                </select>
                                <div className="flex gap-2">
                                  <button onClick={() => { if (moveTeamToId) { handleChangeTeam(m.id, team.id, moveTeamToId); setMoveTeamToId(""); } }}
                                    disabled={!moveTeamToId}
                                    className="rounded-[4px] bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50">
                                    Save Move
                                  </button>
                                  <button onClick={() => setMoveTeamToId("")}
                                    className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* App user section */}
                            <div className="p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-bold uppercase tracking-wider text-primary/80">App user</p>
                                <p className="text-[10px] text-primary/50">
                                  Status: {linkedUser ? (userIsInactive ? "User · Inactive" : "User · Active") : "Not invited"}
                                </p>
                              </div>
                              {linkedUser ? (
                                <>
                                  <div className="space-y-1">
                                    <label className="text-[10px] uppercase tracking-wider text-primary/40">Email</label>
                                    <div className="flex items-center gap-2">
                                      <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                                        className="flex-1 rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                                      <button onClick={() => handleUpdateEmail(linkedUser.uid, linkedUser.displayName)}
                                        disabled={emailSaving}
                                        className="rounded-[4px] bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50">
                                        {emailSaving ? "Saving…" : "Save Email"}
                                      </button>
                                      <button onClick={() => { setEditEmail(linkedUser.email); setEmailError(""); }}
                                        className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                                        Cancel
                                      </button>
                                    </div>
                                    {emailError && <p className="text-[10px] text-accent">{emailError}</p>}
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <label className="text-[10px] uppercase tracking-wider text-primary/40">Role</label>
                                    {(userOutranks || isSelf) ? (
                                      <span className="rounded-[4px] border border-brand-gray bg-primary/5 px-2 py-1 text-[10px] font-semibold text-primary/60">
                                        {ROLE_LABELS[linkedUser.role]}
                                      </span>
                                    ) : (
                                      <select value={linkedUser.role}
                                        onChange={(e) => handleUserRoleChange(linkedUser.uid, e.target.value as UserRole)}
                                        className="rounded-[4px] border border-brand-gray bg-white px-2 py-1 text-[10px] font-semibold text-primary outline-none focus:border-primary">
                                        {allowedRoles.map((r) => (
                                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                                        ))}
                                      </select>
                                    )}
                                    <button onClick={() => handleResetPassword(linkedUser.email, linkedUser.displayName)}
                                      className="rounded-[4px] border border-brand-gray bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary/50 transition hover:text-primary hover:border-primary">
                                      Reset Password
                                    </button>
                                    {!isSelf && !userOutranks && (
                                      userIsInactive ? (
                                        <button onClick={() => handleReactivateUser(linkedUser.uid)}
                                          className="rounded-[4px] border border-primary bg-transparent px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                                          Reactivate
                                        </button>
                                      ) : (
                                        <button onClick={() => handleDeactivateUser(linkedUser.uid)}
                                          className="rounded-[4px] border border-brand-gray bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent/70 transition hover:bg-accent hover:text-white hover:border-accent">
                                          Deactivate
                                        </button>
                                      )
                                    )}
                                  </div>
                                </>
                              ) : (
                                <div className="space-y-2">
                                  <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                                    placeholder="Email address"
                                    className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                                  {allowedRoles.length === 1 ? (
                                    <p className="text-[11px] text-primary/50">
                                      Role: <span className="font-semibold text-primary">{ROLE_LABELS[allowedRoles[0]]}</span>
                                    </p>
                                  ) : (
                                    <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as UserRole)}
                                      className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary">
                                      {allowedRoles.map((r) => (
                                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                                      ))}
                                    </select>
                                  )}
                                  {(inviteRole === "senior_leader" || inviteRole === "leader") && (
                                    <div className="rounded-[4px] border border-brand-gray/60 bg-white p-2 space-y-2">
                                      <p className="text-xs font-bold uppercase tracking-wider text-primary/80">Team they will lead</p>
                                      <div className="flex gap-3 text-xs">
                                        <label className="flex items-center gap-1.5 cursor-pointer">
                                          <input type="radio" checked={inviteLeadsMode === "new"} onChange={() => setInviteLeadsMode("new")} className="accent-primary" />
                                          <span className="text-primary/70">Create a new team</span>
                                        </label>
                                        <label className="flex items-center gap-1.5 cursor-pointer">
                                          <input type="radio" checked={inviteLeadsMode === "existing"} onChange={() => setInviteLeadsMode("existing")} className="accent-primary" />
                                          <span className="text-primary/70">Lead an existing team</span>
                                        </label>
                                      </div>
                                      {inviteLeadsMode === "new" ? (
                                        <>
                                          <input type="text" value={inviteLeadsNewName} onChange={(e) => setInviteLeadsNewName(e.target.value)}
                                            placeholder="New team name"
                                            className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-xs text-primary outline-none focus:border-primary" />
                                          <select value={inviteLeadsParentId} onChange={(e) => setInviteLeadsParentId(e.target.value)}
                                            className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-xs text-primary outline-none focus:border-primary">
                                            <option value="">Parent team…</option>
                                            {teams.filter((t) => authorizedTeamIds.has(t.id)).map((t) => (
                                              <option key={t.id} value={t.id}>{t.name}</option>
                                            ))}
                                          </select>
                                        </>
                                      ) : (
                                        <select value={inviteLeadsExistingId} onChange={(e) => setInviteLeadsExistingId(e.target.value)}
                                          className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-xs text-primary outline-none focus:border-primary">
                                          <option value="">Select team…</option>
                                          {teams.filter((t) => authorizedTeamIds.has(t.id)).map((t) => (
                                            <option key={t.id} value={t.id}>
                                              {t.name}{t.leaderName ? ` (currently led by ${t.leaderName} — will replace)` : ""}
                                            </option>
                                          ))}
                                        </select>
                                      )}
                                    </div>
                                  )}
                                  <div className="flex gap-2">
                                    <button onClick={() => handleInviteMember(m.id, team.id)}
                                      disabled={inviting || !inviteEmail.trim()}
                                      className="rounded-[4px] bg-accent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50">
                                      {inviting ? "Sending…" : "Send Invite"}
                                    </button>
                                    <button onClick={() => { setInviteEmail(""); setInviteRole("leader"); setInviteLeadsMode("new"); setInviteLeadsExistingId(""); setInviteLeadsNewName(""); setInviteLeadsParentId(team.id); }}
                                      className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Team they lead */}
                            {linkedUser && (linkedUser.role === "senior_leader" || linkedUser.role === "leader") && !userIsInactive && (() => {
                              const currentLed = teams.find((t) => t.leaderId === linkedUser.uid);
                              return (
                                <div className="p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-bold uppercase tracking-wider text-primary/80">Team they lead</p>
                                    {currentLed && (
                                      <p className="text-[10px] text-primary/50">Currently: <span className="font-semibold text-primary/70">{currentLed.name}</span></p>
                                    )}
                                  </div>
                                  <div className="flex gap-3 text-xs">
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                      <input type="radio" checked={leadAssignMode === "new"} onChange={() => setLeadAssignMode("new")} className="accent-primary" />
                                      <span className="text-primary/70">Create a new team</span>
                                    </label>
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                      <input type="radio" checked={leadAssignMode === "existing"} onChange={() => setLeadAssignMode("existing")} className="accent-primary" />
                                      <span className="text-primary/70">Lead an existing team</span>
                                    </label>
                                  </div>
                                  {leadAssignMode === "new" ? (
                                    <>
                                      <input type="text" value={leadAssignNewName} onChange={(e) => setLeadAssignNewName(e.target.value)}
                                        placeholder="New team name"
                                        className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-xs text-primary outline-none focus:border-primary" />
                                      <select value={leadAssignParentId} onChange={(e) => setLeadAssignParentId(e.target.value)}
                                        className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-xs text-primary outline-none focus:border-primary">
                                        <option value="">Parent team…</option>
                                        {teams.filter((t) => authorizedTeamIds.has(t.id)).map((t) => (
                                          <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                      </select>
                                    </>
                                  ) : (
                                    <select value={leadAssignExistingId} onChange={(e) => setLeadAssignExistingId(e.target.value)}
                                      className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-xs text-primary outline-none focus:border-primary">
                                      <option value="">Select team…</option>
                                      {teams.filter((t) => authorizedTeamIds.has(t.id) && t.leaderId !== linkedUser.uid).map((t) => (
                                        <option key={t.id} value={t.id}>
                                          {t.name}{t.leaderName ? ` (currently led by ${t.leaderName} — will replace)` : ""}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                  <div className="flex gap-2">
                                    <button onClick={() => handleAssignLeadTeam(linkedUser.uid, linkedUser.displayName)} disabled={leadAssigning}
                                      className="rounded-[4px] bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50">
                                      {leadAssigning ? "Saving…" : "Save Team Assignment"}
                                    </button>
                                    <button onClick={() => {
                                      const cur = teams.find((t) => t.leaderId === linkedUser.uid);
                                      setLeadAssignMode("new");
                                      setLeadAssignExistingId("");
                                      setLeadAssignNewName("");
                                      setLeadAssignParentId(cur ? (cur.parentTeamId ?? team.id) : team.id);
                                    }}
                                      className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Danger zone */}
                            {!isSelf && (
                              <div className="p-3 space-y-2">
                                <p className="text-xs font-bold uppercase tracking-wider text-primary/80">Danger zone</p>
                                {isArchived ? (
                                  <button onClick={() => handleUnarchiveMember(m.id, team.id)}
                                    className="rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary/60 transition hover:text-primary hover:border-primary">
                                    Unarchive Member
                                  </button>
                                ) : (
                                  <>
                                    {archiveMemberHasAssessments === null ? (
                                      <p className="text-[10px] text-primary/40 animate-pulse">Checking assessment history…</p>
                                    ) : (
                                      <p className="text-[10px] text-primary/50">
                                        {archiveMemberHasAssessments
                                          ? "Their assessment history will be preserved for TDI reporting."
                                          : "No assessments found. You can archive (preserves the record) or permanently delete (entered in error)."}
                                      </p>
                                    )}
                                    <input type="text" value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)}
                                      placeholder="Reason (e.g., Left company, Terminated)"
                                      className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                                    <div className="flex gap-2 flex-wrap">
                                      <button onClick={() => handleArchiveMember(m.id, team.id, archiveReason)}
                                        className="rounded-[4px] bg-accent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90">
                                        Archive Member
                                      </button>
                                      {archiveMemberHasAssessments === false && (
                                        <button onClick={() => handleDeleteMember(m.id, team.id)}
                                          className="rounded-[4px] border-[1.5px] border-accent bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-accent transition hover:bg-accent hover:text-white">
                                          Delete Permanently
                                        </button>
                                      )}
                                      <button onClick={() => setArchiveReason("")}
                                        className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                                        Cancel
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Per-member "+ Add Sub-Team" + nested sub-teams led by this member */}
                      {!isArchived && (canManage || (ledByMemberId.get(m.id)?.length ?? 0) > 0) && (
                        <div className="ml-3 mt-1 space-y-2 border-l-2 border-brand-gray/30 pl-3">
                          {(ledByMemberId.get(m.id) ?? []).map((sub) => (
                            <div key={`sub-${sub.id}`}>{renderTeam(sub)}</div>
                          ))}
                          {canManage && addSubTeamForMemberId === m.id ? (
                            <div className="rounded-[4px] border border-brand-gray/50 bg-primary/[0.02] p-3 space-y-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">
                                New sub-team — {m.name} will lead
                              </p>
                              <input type="text" value={newSubTeamName}
                                onChange={(e) => setNewSubTeamName(e.target.value)}
                                placeholder="Sub-team name"
                                className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                              <div className="flex gap-2">
                                <button onClick={() => handleCreateSubTeamForMember(team, m)}
                                  disabled={!newSubTeamName.trim()}
                                  className="rounded-[4px] bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50">
                                  Create
                                </button>
                                <button onClick={() => { setAddSubTeamForMemberId(null); setNewSubTeamName(""); }}
                                  className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : canManage ? (
                            <button onClick={() => { setAddSubTeamForMemberId(m.id); setNewSubTeamName(""); }}
                              className="text-xs font-semibold text-primary/50 transition hover:text-primary">
                              + Add Sub-Team
                            </button>
                          ) : null}
                        </div>
                      )}
                      </Fragment>
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
                    <p className="text-[11px] text-accent bg-accent/10 rounded-[4px] px-2 py-1">{dupWarning}</p>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={newMemberInvite}
                      onChange={(e) => setNewMemberInvite(e.target.checked)}
                      disabled={!newMemberEmail.trim()}
                      className="h-3.5 w-3.5 accent-primary" />
                    <span className="text-xs text-primary/60">Invite as app user</span>
                    {!newMemberEmail.trim() && <span className="text-[10px] text-primary/30">(enter email first)</span>}
                  </label>
                  {newMemberInvite && (() => {
                    const allowedRoles = profile ? assignableRolesFor(profile.role) : ["leader" as UserRole];
                    if (allowedRoles.length === 1) {
                      return (
                        <p className="text-[11px] text-primary/50">
                          Role: <span className="font-semibold text-primary">{ROLE_LABELS[allowedRoles[0]]}</span>
                        </p>
                      );
                    }
                    return (
                      <select value={newMemberRole} onChange={(e) => setNewMemberRole(e.target.value as UserRole)}
                        className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary">
                        {allowedRoles.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    );
                  })()}
                  {newMemberInvite && (newMemberRole === "senior_leader" || newMemberRole === "leader") && (
                    <div className="rounded-[4px] border border-brand-gray/60 bg-white p-2 space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-primary/80">
                        Team they will lead
                      </p>
                      <div className="flex gap-3 text-xs">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" checked={newMemberLeadsMode === "new"} onChange={() => setNewMemberLeadsMode("new")} className="accent-primary" />
                          <span className="text-primary/70">Create a new team</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" checked={newMemberLeadsMode === "existing"} onChange={() => setNewMemberLeadsMode("existing")} className="accent-primary" />
                          <span className="text-primary/70">Lead an existing team</span>
                        </label>
                      </div>
                      {newMemberLeadsMode === "new" ? (
                        <>
                          <input type="text" value={newMemberLeadsNewName}
                            onChange={(e) => setNewMemberLeadsNewName(e.target.value)}
                            placeholder="New team name (e.g., Sales)"
                            className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-xs text-primary outline-none focus:border-primary" />
                          <select value={newMemberLeadsParentId}
                            onChange={(e) => setNewMemberLeadsParentId(e.target.value)}
                            className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-xs text-primary outline-none focus:border-primary">
                            <option value="">Parent team…</option>
                            {teams.filter((t) => authorizedTeamIds.has(t.id)).map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </>
                      ) : (
                        <select value={newMemberLeadsExistingId}
                          onChange={(e) => setNewMemberLeadsExistingId(e.target.value)}
                          className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-xs text-primary outline-none focus:border-primary">
                          <option value="">Select team…</option>
                          {teams.filter((t) => authorizedTeamIds.has(t.id)).map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}{t.leaderName ? ` (currently led by ${t.leaderName} — will replace)` : ""}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => handleAddMember(team.id)} disabled={addingMember || !newMemberName.trim()}
                      className="rounded-[4px] bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50">
                      {addingMember ? "Adding..." : "Add"}
                    </button>
                    <button onClick={() => { setAddMemberTeamId(null); setNewMemberName(""); setNewMemberTitle(""); setNewMemberEmail(""); setNewMemberInvite(false); setDupWarning(""); setNewMemberLeadsExistingId(""); setNewMemberLeadsNewName(""); setNewMemberLeadsParentId(""); }}
                      className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : canManage ? (
                <div className="mt-2 flex gap-3">
                  <button onClick={() => {
                    setAddMemberTeamId(team.id);
                    setNewMemberLeadsMode("new");
                    setNewMemberLeadsExistingId("");
                    setNewMemberLeadsNewName("");
                    setNewMemberLeadsParentId(team.id);
                  }}
                    className="text-xs font-semibold text-accent transition hover:opacity-70">
                    + Add Member
                  </button>
                </div>
              ) : null}

              {/* Other sub-teams — sub-teams whose leader isn't a member of
                  this team (archived leader, leader-only setup, legacy data).
                  Render at the bottom so the natural hierarchy stays clean. */}
              {orphanChildTeams.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">
                    Other sub-teams
                  </p>
                  {orphanChildTeams.map((child) => renderTeam(child))}
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
            <p className="mt-1 text-xs text-yellow-700">These users exist in the system but aren&apos;t assigned to a team. Open a row to assign them to a team or change their settings.</p>
            <div className="mt-3 space-y-2">
              {unlinkedUsers.map((u) => {
                const isPanelOpen = openUnlinkedPanelId === u.uid;
                const ledTeam = teams.find((t) => t.leaderId === u.uid);
                const allowedRoles = profile ? assignableRolesFor(profile.role) : ["leader" as UserRole];
                const userOutranks = !allowedRoles.includes(u.role);
                const isSelf = u.uid === profile?.uid;
                const userIsInactive = u.isActive === false;
                return (
                  <div key={u.uid} className="rounded-[4px] border border-yellow-200 bg-white">
                    <div className="flex items-center gap-3 p-3">
                      <div className="flex-1 min-w-0 flex items-baseline gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-primary">{u.displayName}</p>
                        <p className="text-xs text-primary/50">{u.email}</p>
                        <span className="rounded-[2px] bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary/60">
                          {ROLE_LABELS[u.role]}
                        </span>
                        {ledTeam && (
                          <span className="rounded-[2px] bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-blue-700">
                            Leads {ledTeam.name}
                          </span>
                        )}
                        {userIsInactive && (
                          <span className="rounded-[2px] bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary/40">
                            Inactive
                          </span>
                        )}
                      </div>
                      <button onClick={() => isPanelOpen ? closeUnlinkedPanel() : openUnlinkedPanel(u)}
                        className="text-xs text-primary/50 transition hover:text-primary" title="Edit">
                        {isPanelOpen ? "▲" : "✎"}
                      </button>
                    </div>

                    {isPanelOpen && (
                      <div className="border-t border-yellow-200 divide-y divide-yellow-200/60 bg-primary/[0.02]">
                        {/* App user section */}
                        <div className="p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold uppercase tracking-wider text-primary/80">App user</p>
                            <p className="text-[10px] text-primary/50">Status: {userIsInactive ? "User · Inactive" : "User · Active"}</p>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase tracking-wider text-primary/40">Email</label>
                            <div className="flex items-center gap-2">
                              <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                                className="flex-1 rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                              <button onClick={() => handleUpdateEmail(u.uid, u.displayName)}
                                disabled={emailSaving}
                                className="rounded-[4px] bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50">
                                {emailSaving ? "Saving…" : "Save Email"}
                              </button>
                              <button onClick={() => { setEditEmail(u.email); setEmailError(""); }}
                                className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                                Cancel
                              </button>
                            </div>
                            {emailError && <p className="text-[10px] text-accent">{emailError}</p>}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <label className="text-[10px] uppercase tracking-wider text-primary/40">Role</label>
                            {(userOutranks || isSelf) ? (
                              <span className="rounded-[4px] border border-brand-gray bg-primary/5 px-2 py-1 text-[10px] font-semibold text-primary/60">
                                {ROLE_LABELS[u.role]}
                              </span>
                            ) : (
                              <select value={u.role}
                                onChange={(e) => handleUserRoleChange(u.uid, e.target.value as UserRole)}
                                className="rounded-[4px] border border-brand-gray bg-white px-2 py-1 text-[10px] font-semibold text-primary outline-none focus:border-primary">
                                {allowedRoles.map((r) => (
                                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                                ))}
                              </select>
                            )}
                            <button onClick={() => handleResetPassword(u.email, u.displayName)}
                              className="rounded-[4px] border border-brand-gray bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary/50 transition hover:text-primary hover:border-primary">
                              Reset Password
                            </button>
                            {!isSelf && !userOutranks && (
                              userIsInactive ? (
                                <button onClick={() => handleReactivateUser(u.uid)}
                                  className="rounded-[4px] border border-primary bg-transparent px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                                  Reactivate
                                </button>
                              ) : (
                                <button onClick={() => handleDeactivateUser(u.uid)}
                                  className="rounded-[4px] border border-brand-gray bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent/70 transition hover:bg-accent hover:text-white hover:border-accent">
                                  Deactivate
                                </button>
                              )
                            )}
                          </div>
                        </div>

                        {/* Assign to a team as a member */}
                        {!userIsInactive && (
                          <div className="p-3 space-y-2">
                            <p className="text-xs font-bold uppercase tracking-wider text-primary/80">Assign to a team as a member</p>
                            <select value={assignTeamUserId === u.uid ? assignTeamId : ""}
                              onChange={(e) => { setAssignTeamUserId(u.uid); setAssignTeamId(e.target.value); }}
                              className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary">
                              <option value="">Select team…</option>
                              {teams.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                            <input type="text" value={assignTeamUserId === u.uid ? assignTeamTitle : ""}
                              onChange={(e) => { setAssignTeamUserId(u.uid); setAssignTeamTitle(e.target.value); }}
                              placeholder="Title (optional)"
                              className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                            <div className="flex gap-2">
                              <button onClick={handleAssignUnlinkedUser} disabled={assigning || !assignTeamId || assignTeamUserId !== u.uid}
                                className="rounded-[4px] bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50">
                                {assigning ? "Assigning…" : "Assign to Team"}
                              </button>
                              <button onClick={() => { setAssignTeamId(""); setAssignTeamTitle(""); }}
                                className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Team they lead */}
                        {(u.role === "senior_leader" || u.role === "leader") && !userIsInactive && (
                          <div className="p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold uppercase tracking-wider text-primary/80">Team they lead</p>
                              {ledTeam && (
                                <p className="text-[10px] text-primary/50">Currently: <span className="font-semibold text-primary/70">{ledTeam.name}</span></p>
                              )}
                            </div>
                            <div className="flex gap-3 text-xs">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input type="radio" checked={leadAssignMode === "new"} onChange={() => setLeadAssignMode("new")} className="accent-primary" />
                                <span className="text-primary/70">Create a new team</span>
                              </label>
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input type="radio" checked={leadAssignMode === "existing"} onChange={() => setLeadAssignMode("existing")} className="accent-primary" />
                                <span className="text-primary/70">Lead an existing team</span>
                              </label>
                            </div>
                            {leadAssignMode === "new" ? (
                              <>
                                <input type="text" value={leadAssignNewName} onChange={(e) => setLeadAssignNewName(e.target.value)}
                                  placeholder="New team name"
                                  className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-xs text-primary outline-none focus:border-primary" />
                                <select value={leadAssignParentId} onChange={(e) => setLeadAssignParentId(e.target.value)}
                                  className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-xs text-primary outline-none focus:border-primary">
                                  <option value="">Parent team…</option>
                                  {teams.filter((t) => authorizedTeamIds.has(t.id)).map((t) => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                  ))}
                                </select>
                              </>
                            ) : (
                              <select value={leadAssignExistingId} onChange={(e) => setLeadAssignExistingId(e.target.value)}
                                className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-xs text-primary outline-none focus:border-primary">
                                <option value="">Select team…</option>
                                {teams.filter((t) => authorizedTeamIds.has(t.id) && t.leaderId !== u.uid).map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}{t.leaderName ? ` (currently led by ${t.leaderName} — will replace)` : ""}
                                  </option>
                                ))}
                              </select>
                            )}
                            <div className="flex gap-2">
                              <button onClick={() => handleAssignLeadTeam(u.uid, u.displayName)} disabled={leadAssigning}
                                className="rounded-[4px] bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50">
                                {leadAssigning ? "Saving…" : "Save Team Assignment"}
                              </button>
                              <button onClick={() => {
                                const cur = teams.find((t) => t.leaderId === u.uid);
                                setLeadAssignMode("new");
                                setLeadAssignExistingId("");
                                setLeadAssignNewName("");
                                setLeadAssignParentId(cur ? (cur.parentTeamId ?? "") : "");
                              }}
                                className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Archived users (admin only) */}
        {isAdmin && archivedUsers.length > 0 && (
          <div className="mt-6 rounded-[4px] border border-brand-gray bg-white">
            <button
              type="button"
              onClick={() => setShowArchivedUsers((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-sm font-semibold uppercase tracking-wider text-primary/70">
                Archived Users ({archivedUsers.length})
              </span>
              <span className="text-xs text-primary/40">
                {showArchivedUsers ? "Hide" : "Show"}
              </span>
            </button>
            {showArchivedUsers && (
              <div className="space-y-2 border-t border-brand-gray/50 p-4">
                <p className="text-xs text-primary/50">
                  Archived users cannot log in to this company. Their email is
                  available for use by a new user. Restore brings them back if
                  the original email isn&apos;t already in use.
                </p>
                {archivedUsers.map((u) => {
                  const restoreEmail = u.archivedEmail ?? u.email;
                  const isRestoring = restoringUserId === u.archivedDocId;
                  return (
                    <div
                      key={u.archivedDocId}
                      className="rounded-[4px] border border-brand-gray/50 bg-primary/[0.02] p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-primary">
                            {u.displayName}
                          </p>
                          <p className="text-xs text-primary/50">
                            {restoreEmail} · {ROLE_LABELS[u.role]}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRestoreUser(u.archivedDocId)}
                          disabled={isRestoring}
                          className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white disabled:opacity-50"
                        >
                          {isRestoring ? "Restoring..." : "Restore"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
        {notice && (
          <div className="mt-4 flex items-start gap-3 rounded-[4px] border border-yellow-300 bg-yellow-50 px-4 py-3">
            <p className="flex-1 text-sm text-yellow-900">{notice}</p>
            <button
              type="button"
              onClick={() => setNotice("")}
              className="text-xs font-semibold uppercase tracking-wider text-yellow-900/60 transition hover:text-yellow-900"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {topLevelTeams.map((team) => renderTeam(team))}
        </div>

        {topLevelTeams.length === 0 && !loading && !isAdmin && authorizedTeamIds.size === 0 && (
          <div className="mt-6 rounded-[4px] border border-brand-gray bg-primary/[0.02] p-6">
            <p className="text-sm font-semibold text-primary">You&apos;re not currently leading any teams.</p>
            <p className="mt-2 text-sm text-primary/60">
              You haven&apos;t been assigned as the leader of a team in this company yet.
              Ask your company admin to assign you to a team — once they do, you&apos;ll
              be able to add team members and sub-teams here.
            </p>
          </div>
        )}

        {topLevelTeams.length === 0 && !loading && (isAdmin || authorizedTeamIds.size > 0) && (
          <p className="mt-6 text-sm font-light text-primary/70">Loading team structure...</p>
        )}
      </div>
    </div>
  );
}
