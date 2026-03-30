"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { canManageCompany } from "@/lib/permissions";
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
  changeTeam,
  promoteToLeader,
  logLeaderChangeForTeamMembers,
} from "@/lib/team-service";
import { getCompanyUsers } from "@/lib/user-service";
import { getFiscalYear, getFiscalQuarter } from "@/lib/fiscalUtils";
import { useKeyboardShortcuts } from "@/lib/useKeyboardShortcuts";
import type { Team, TeamMember } from "@/types/team";
import type { UserProfile } from "@/types/auth";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // Archive modal state
  const [archivingMemberId, setArchivingMemberId] = useState<string | null>(null);
  const [archivingTeamId, setArchivingTeamId] = useState<string | null>(null);
  const [archiveReason, setArchiveReason] = useState("");

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

  // Edit member
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTitle, setEditTitle] = useState("");

  useKeyboardShortcuts({
    onEscape: () => {
      setEditingTeamId(null);
      setEditingMemberId(null);
      setAddMemberTeamId(null);
      setAddSubTeamParentId(null);
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
      setTeams(teamData);
      setUsers(userData);

      const memberMap: Record<string, TeamMember[]> = {};
      for (const t of teamData) {
        memberMap[t.id] = await getTeamMembers(companyId, t.id);
      }
      setMembers(memberMap);

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
    // Check team members first
    for (const teamId of Object.keys(members)) {
      const member = members[teamId].find((m) => m.name === name);
      if (member?.role) return member.role;
    }
    // Check leader titles on teams
    const asLeader = teams.find((t) => t.leaderName === name);
    if (asLeader?.leaderTitle) return asLeader.leaderTitle;
    return "";
  }

  // Get sub-team leaders who should appear as members of this team
  // Exclude anyone already added as a regular team member
  function getLeadersAsMembers(teamId: string): { name: string; title: string; subTeamName: string }[] {
    const childTeams = teams.filter((t) => t.parentTeamId === teamId);
    const existingMemberNames = new Set((members[teamId] || []).map((m) => m.name));
    return childTeams
      .filter((t) => t.leaderName && !existingMemberNames.has(t.leaderName))
      .map((t) => ({ name: t.leaderName, title: t.leaderTitle || "", subTeamName: t.name }));
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
      // If leader changed, log it on all team members
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
    try {
      const team = teams.find((t) => t.id === teamId);
      const id = await createTeamMember(companyId, {
        name: newMemberName.trim(),
        role: newMemberTitle.trim(),
        teamId,
        reportsToUserId: team?.leaderId || profile?.uid || "",
      });
      const newMember = {
        id,
        name: newMemberName.trim(),
        role: newMemberTitle.trim(),
        teamId,
        reportsToUserId: team?.leaderId || "",
        isAppUser: false,
        appUserId: null,
      } as TeamMember;
      setMembers({
        ...members,
        [teamId]: [...(members[teamId] || []), newMember],
      });
      setNewMemberName("");
      setNewMemberTitle("");
      setAddMemberTeamId(null);
    } catch {
      setError("Failed to add team member.");
    }
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
      // Also log leader change for all team members
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
                            <span className="rounded-[2px] bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary/50">
                              Archived{m.archivedReason ? ` — ${m.archivedReason}` : ""}
                            </span>
                          )}
                          {leadsTeams.map((lt) => (
                            <span key={lt.id} className="rounded-[2px] bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-blue-700">
                              Leads {lt.name}
                            </span>
                          ))}
                          {m.isAppUser && (
                            <span className="rounded-[2px] bg-green-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-green-700">
                              App User
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
                              <button onClick={() => { setArchivingMemberId(m.id); setArchivingTeamId(team.id); setArchiveReason(""); }}
                                className="text-[10px] text-primary/30 transition hover:text-primary/60" title="Archive member">
                                ▼
                              </button>
                            </>
                          )}
                        </div>

                        {/* Archive confirmation */}
                        {isArchiving && (
                          <div className="border-t border-brand-gray/50 p-2.5 space-y-2">
                            <p className="text-xs font-semibold text-primary/60">Archive {m.name}?</p>
                            <p className="text-[10px] text-primary/40">Their assessment history will be preserved for TDI reporting.</p>
                            <input type="text" value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)}
                              placeholder="Reason (e.g., Left company, Terminated)"
                              className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                            <div className="flex gap-2">
                              <button onClick={handleArchiveMember}
                                className="rounded-[4px] bg-accent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90">
                                Archive
                              </button>
                              <button onClick={() => { setArchivingMemberId(null); setArchivingTeamId(null); }}
                                className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                                Cancel
                              </button>
                            </div>
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
                            <div className="flex gap-2">
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
              {addMemberTeamId === team.id ? (
                <div className="mt-2 rounded-[4px] border border-brand-gray/50 bg-primary/[0.02] p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)}
                      placeholder="Name" className="rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                    <input type="text" value={newMemberTitle} onChange={(e) => setNewMemberTitle(e.target.value)}
                      placeholder="Title (e.g., Controller)"
                      className="rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary"
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddMember(team.id); }} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleAddMember(team.id)} disabled={!newMemberName.trim()}
                      className="rounded-[4px] bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50">
                      Add
                    </button>
                    <button onClick={() => { setAddMemberTeamId(null); setNewMemberName(""); setNewMemberTitle(""); }}
                      className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
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
              )}

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
        <h1 className="text-2xl font-bold text-primary">Teams & Members</h1>
        <p className="mt-1 text-sm text-primary/50">
          Organize your team hierarchy. Click a member name to view their profile.
        </p>

        {/* Search + filters */}
        <div className="mt-4 flex items-center gap-4">
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

        <div className="mt-6 space-y-3">
          {topLevelTeams.map((team) => renderTeam(team))}
        </div>

        {topLevelTeams.length === 0 && (
          <p className="mt-6 text-sm font-light text-primary/70">Loading team structure...</p>
        )}
      </div>
    </div>
  );
}
