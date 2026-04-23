"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { getAuthorizedMemberIds } from "@/lib/team-auth";
import { canManageCompany } from "@/lib/permissions";
import type { TeamMember, Team } from "@/types/team";

export default function MemberSelectPage() {
  const { profile } = useAuth();
  const { activeCompany } = useCompany();
  const router = useRouter();

  const companyId = activeCompany?.id ?? profile?.companyId;
  const isAdmin = canManageCompany(profile);

  const [allMembers, setAllMembers] = useState<TeamMember[]>([]);
  const [myMembers, setMyMembers] = useState<TeamMember[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

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
      const { allMembers: members, allTeams: teamData } = await getAuthorizedMemberIds(companyId, profile);
      setAllMembers(members);
      setTeams(teamData);

      // Direct reports shown first
      const direct = members.filter((m) => m.reportsToUserId === profile.uid);
      setMyMembers(direct);
    } catch (err) {
      console.error("Load error:", err);
    }
    setLoading(false);
  }

  function getTeamName(teamId: string): string {
    return teams.find((t) => t.id === teamId)?.name ?? "";
  }

  const activeFilter = (m: TeamMember) => showArchived || (m.status ?? "active") === "active";
  const archivedLast = (a: TeamMember, b: TeamMember) => (a.status === "archived" ? 1 : 0) - (b.status === "archived" ? 1 : 0);
  const visibleMyMembers = myMembers.filter(activeFilter).sort(archivedLast);
  const visibleAllMembers = allMembers.filter(activeFilter).sort(archivedLast);

  // Search results
  const query = searchQuery.toLowerCase().trim();
  const searchResults = query
    ? allMembers.filter(activeFilter).filter((m) =>
        m.name.toLowerCase().includes(query) ||
        (m.role && m.role.toLowerCase().includes(query))
      ).sort(archivedLast)
    : [];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="animate-pulse text-lg font-light text-primary/70">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white px-4 py-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-primary">Team Member Details</h1>
        <p className="mt-1 text-sm text-primary/50">
          Select a team member to view their profile, assessment history, and productivity targets.
        </p>

        {/* Search */}
        <div className="mt-6">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or role..."
              className="flex-1 rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
            />
            <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
              <span className="text-xs text-primary/50">Show Archived</span>
            </label>
          </div>

          {query && (
            <div className="mt-2 rounded-[4px] border border-brand-gray bg-white shadow-sm">
              {searchResults.length === 0 ? (
                <p className="px-3 py-3 text-xs text-primary/40">No matches found.</p>
              ) : (
                searchResults.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => router.push(`/members/${m.id}`)}
                    className={`flex w-full items-center gap-3 border-b border-brand-gray/30 px-3 py-2.5 text-left transition hover:bg-primary/5 last:border-0 ${m.status === "archived" ? "opacity-50" : ""}`}
                  >
                    <span className="text-sm font-semibold text-primary">{m.name}</span>
                    {m.role && <span className="text-xs text-primary/50">{m.role}</span>}
                    {m.status === "archived" && <span className="rounded-[2px] bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary/50">Archived</span>}
                    <span className="ml-auto text-[10px] text-primary/30">{getTeamName(m.teamId)}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* My Direct Reports */}
        {!query && visibleMyMembers.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/40">
              {isAdmin ? "My Direct Reports" : "My Team Members"}
            </h2>
            <div className="mt-3 space-y-2">
              {visibleMyMembers.map((m) => (
                <button
                  key={m.id}
                  onClick={() => router.push(`/members/${m.id}`)}
                  className={`flex w-full items-center gap-3 rounded-[4px] border border-brand-gray bg-white p-3 text-left shadow-sm transition hover:border-primary ${m.status === "archived" ? "opacity-50" : ""}`}
                >
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-primary">{m.name}</p>
                    {m.role && <p className="text-xs text-primary/50">{m.role}</p>}
                  </div>
                  {m.status === "archived" && <span className="rounded-[2px] bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary/50">Archived</span>}
                  <span className="text-[10px] text-primary/30">{getTeamName(m.teamId)}</span>
                  <span className="text-sm text-primary/30">→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* All Members (admin only, when not searching) */}
        {!query && isAdmin && visibleAllMembers.length > visibleMyMembers.length && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/40">All Team Members</h2>
            <div className="mt-3 space-y-2">
              {visibleAllMembers
                .filter((m) => !visibleMyMembers.some((my) => my.id === m.id))
                .map((m) => (
                  <button
                    key={m.id}
                    onClick={() => router.push(`/members/${m.id}`)}
                    className={`flex w-full items-center gap-3 rounded-[4px] border border-brand-gray/50 bg-white p-3 text-left shadow-sm transition hover:border-primary ${m.status === "archived" ? "opacity-50" : ""}`}
                  >
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-primary">{m.name}</p>
                      {m.role && <p className="text-xs text-primary/50">{m.role}</p>}
                    </div>
                    {m.status === "archived" && <span className="rounded-[2px] bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary/50">Archived</span>}
                    <span className="text-[10px] text-primary/30">{getTeamName(m.teamId)}</span>
                    <span className="text-sm text-primary/30">→</span>
                  </button>
                ))}
            </div>
          </div>
        )}

        {allMembers.length === 0 && !query && (
          <p className="mt-6 text-sm text-primary/40">No team members found. Add members on the Teams & Members page.</p>
        )}
      </div>
    </div>
  );
}
