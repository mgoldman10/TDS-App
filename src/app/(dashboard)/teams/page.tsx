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
  deleteTeamMember,
  logMemberChange,
} from "@/lib/team-service";
import { getCompanyUsers } from "@/lib/user-service";
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

  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Record<string, TeamMember[]>>({});
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Expanded teams
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  // Add sub-team form
  const [addSubTeamParentId, setAddSubTeamParentId] = useState<string | null>(null);
  const [newSubTeamName, setNewSubTeamName] = useState("");
  const [newSubTeamLeader, setNewSubTeamLeader] = useState("");
  const [newSubTeamLeaderTitle, setNewSubTeamLeaderTitle] = useState("");

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
  function getLeadersAsMembers(teamId: string): { name: string; title: string; subTeamName: string }[] {
    const childTeams = teams.filter((t) => t.parentTeamId === teamId);
    return childTeams
      .filter((t) => t.leaderName)
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
      await updateTeam(companyId, teamId, {
        name: editTeamName.trim(),
        leaderName: editTeamLeader.trim(),
        leaderTitle: editTeamLeaderTitle.trim(),
      });
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
          await logMemberChange(companyId, memberId, "role", member.role, editTitle, profile?.uid || "");
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

  async function handleDeleteMember(memberId: string, teamId: string) {
    if (!companyId || !window.confirm("Remove this team member?")) return;
    try {
      await deleteTeamMember(companyId, memberId);
      setMembers({
        ...members,
        [teamId]: members[teamId].filter((m) => m.id !== memberId),
      });
    } catch {
      setError("Failed to remove member.");
    }
  }

  const tree = buildTree(teams);

  function renderTeam(team: Team) {
    const isExpanded = expandedTeams.has(team.id);
    const childTeams = tree.get(team.id) || [];
    const teamMembers = members[team.id] || [];
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
                    return (
                      <div key={m.id} className="rounded-[4px] border border-brand-gray/50 bg-white">
                        <div className="flex items-center gap-3 p-2.5">
                          <div className="flex-1">
                            <span className="text-sm font-semibold text-primary">{m.name}</span>
                            {m.role && <span className="ml-2 text-xs text-primary/50">{m.role}</span>}
                          </div>
                          {m.isAppUser && (
                            <span className="rounded-[2px] bg-green-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-green-700">
                              App User
                            </span>
                          )}
                          <button onClick={() => {
                            if (isEditing) { setEditingMemberId(null); }
                            else { setEditingMemberId(m.id); setEditName(m.name); setEditTitle(m.role); }
                          }}
                            className="text-xs text-primary/50 transition hover:text-primary">
                            {isEditing ? "▲" : "✎"}
                          </button>
                          <button onClick={() => handleDeleteMember(m.id, team.id)}
                            className="text-xs text-accent/50 transition hover:text-accent">
                            ✕
                          </button>
                        </div>

                        {isEditing && (
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
                            <button onClick={() => handleSaveMember(m.id, team.id)}
                              className="rounded-[4px] bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90">
                              Save
                            </button>
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
          Organize your team hierarchy. Leaders automatically appear as members of their parent team.
        </p>

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
