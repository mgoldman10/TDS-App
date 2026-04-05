"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { getAssessmentsByQuarter, getAllAssessmentsForCompany } from "@/lib/assessment-service";
import { getAuthorizedMemberIds } from "@/lib/team-auth";
import type { TeamMember } from "@/types/team";
import { getFiscalYear, getFiscalQuarter } from "@/lib/fiscalUtils";
import { DEFAULT_SCORING_PARAMETERS } from "@/types/company";
import type { Assessment, PerformanceCategory } from "@/types/assessment";
import { CATEGORY_COLORS } from "@/types/assessment";
import type { Team } from "@/types/team";
import TalentGrid from "@/components/TalentGrid";

export default function TalentSummaryPage() {
  const { profile } = useAuth();
  const { activeCompany } = useCompany();
  const router = useRouter();

  const companyId = activeCompany?.id ?? profile?.companyId;
  const startMonth = activeCompany?.fiscalYearStartMonth ?? 1;
  const scoringParams = activeCompany?.scoringParameters ?? { ...DEFAULT_SCORING_PARAMETERS };
  const now = new Date();
  const currentFY = getFiscalYear(now, startMonth);
  const currentFQ = getFiscalQuarter(now, startMonth);

  const [selectedYear, setSelectedYear] = useState(currentFY);
  const [selectedQuarter, setSelectedQuarter] = useState(currentFQ);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [filterMode, setFilterMode] = useState("my-reports"); // "all", "my-reports", "team-reports", or a teamId
  const [privacyMode, setPrivacyMode] = useState(false);
  const [allAssessments, setAllAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentFY + 1 - i);

  useEffect(() => {
    if (!profile || !companyId) {
      if (profile?.role === "superadmin") router.replace("/admin");
      setLoading(false);
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, companyId, selectedYear, selectedQuarter]);

  async function loadData() {
    if (!companyId) return;
    setLoading(true);
    try {
      const [assessmentData, authResult, allData] = await Promise.all([
        getAssessmentsByQuarter(companyId, selectedYear, selectedQuarter),
        getAuthorizedMemberIds(companyId, profile!),
        getAllAssessmentsForCompany(companyId),
      ]);
      const { authorizedMemberIds: authMemberIds, allMembers: memberData, allTeams: teamData } = authResult;
      // Filter assessments to authorized members
      setAssessments(assessmentData.filter((a) => authMemberIds.has(a.memberId)));
      setTeams(teamData);
      setTeamMembers(memberData);
      setAllAssessments(allData.filter((a) => authMemberIds.has(a.memberId)));
    } catch (err) {
      console.error("Load error:", err);
    }
    setLoading(false);
  }

  // Assessments are already filtered by authorized members in loadData
  const isAdmin = profile?.role === "superadmin" || profile?.role === "company_admin";
  const authorizedAssessments = assessments;

  // Teams that have sub-teams (these are the teams that "meet in a room")
  const teamsWithSubTeams = teams.filter((t) =>
    teams.some((sub) => sub.parentTeamId === t.id)
  );

  // Filter based on selected mode
  // filterMode can be:
  //   "all" — all assessments (admin only)
  //   "my-reports" — only current user's assessments
  //   "reports-of:{teamId}" — direct reports of that team's members (excludes the team members themselves)
  //   "{teamId}" — members of a specific team
  const filteredAssessments = (() => {
    if (filterMode === "all") return authorizedAssessments;

    if (filterMode === "my-reports") {
      return authorizedAssessments.filter((a) => a.assessedByUserId === profile?.uid);
    }

    if (filterMode.startsWith("reports-of:")) {
      // "Direct Reports of [Team]" — show people assessed by members of this team,
      // but NOT the team members themselves
      const parentTeamId = filterMode.replace("reports-of:", "");
      const parentTeam = teams.find((t) => t.id === parentTeamId);
      if (!parentTeam) return authorizedAssessments;

      // Get sub-team leaders' names (these are the team members "in the room")
      const subTeams = teams.filter((t) => t.parentTeamId === parentTeamId);
      const inTheRoom = new Set<string>();
      // The leader of the parent team
      if (parentTeam.leaderName) inTheRoom.add(parentTeam.leaderName);
      // Sub-team leaders (they are members of the parent team)
      for (const st of subTeams) {
        if (st.leaderName) inTheRoom.add(st.leaderName);
      }
      // Also add regular members of the parent team
      for (const m of teamMembers) {
        if (m.teamId === parentTeamId) inTheRoom.add(m.name);
      }

      // Show assessments for people NOT in the room
      return authorizedAssessments.filter((a) => !inTheRoom.has(a.memberName));
    }

    // Specific team ID — show members of that team
    return authorizedAssessments.filter((a) => {
      const member = teamMembers.find((m) => m.id === a.memberId);
      if (!member) return false;
      if (member.teamId === filterMode) return true;
      const team = teams.find((t) => t.id === filterMode);
      if (team && team.leaderName === a.memberName) return true;
      return false;
    });
  })();

  // Exclude archived members from current period; include them in historical
  const isCurrentPeriod = selectedYear === currentFY && selectedQuarter === currentFQ;
  const activeMemberIds = new Set(teamMembers.filter((m) => (m.status ?? "active") === "active").map((m) => m.id));
  const tdiAssessments = isCurrentPeriod
    ? filteredAssessments.filter((a) => activeMemberIds.has(a.memberId))
    : filteredAssessments;

  // TDI calculation
  const total = tdiAssessments.length;
  const counts: Record<PerformanceCategory, number> = { HP: 0, MP: 0, LP: 0, LCF: 0 };
  for (const a of tdiAssessments) {
    if (a.performanceCategory in counts) counts[a.performanceCategory]++;
  }
  const tdi = total > 0
    ? Math.round(((counts.HP / total) - ((counts.LP + counts.LCF) / total)) * 100)
    : 0;

  // Apply the same filter logic to any set of assessments
  function applyFilter(assessmentsToFilter: Assessment[]): Assessment[] {
    const authorized = isAdmin
      ? assessmentsToFilter
      : assessmentsToFilter.filter((a) => a.assessedByUserId === profile?.uid);

    if (filterMode === "all") return authorized;
    if (filterMode === "my-reports") return authorized.filter((a) => a.assessedByUserId === profile?.uid);

    if (filterMode.startsWith("reports-of:")) {
      const parentTeamId = filterMode.replace("reports-of:", "");
      const parentTeam = teams.find((t) => t.id === parentTeamId);
      if (!parentTeam) return authorized;
      const subTeams = teams.filter((t) => t.parentTeamId === parentTeamId);
      const inTheRoom = new Set<string>();
      if (parentTeam.leaderName) inTheRoom.add(parentTeam.leaderName);
      for (const st of subTeams) { if (st.leaderName) inTheRoom.add(st.leaderName); }
      for (const m of teamMembers) { if (m.teamId === parentTeamId) inTheRoom.add(m.name); }
      return authorized.filter((a) => !inTheRoom.has(a.memberName));
    }

    return authorized.filter((a) => {
      const member = teamMembers.find((m) => m.id === a.memberId);
      if (!member) return false;
      if (member.teamId === filterMode) return true;
      const team = teams.find((t) => t.id === filterMode);
      if (team && team.leaderName === a.memberName) return true;
      return false;
    });
  }

  // Compute TDI trend across all quarters using the same filter
  const tdiTrendData = (() => {
    const grouped = new Map<string, Assessment[]>();
    for (const a of allAssessments) {
      const key = `${a.fiscalYear}-${a.fiscalQuarter}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(a);
    }
    const points: { quarter: string; tdi: number; sortKey: number }[] = [];
    for (const [key, qAssessments] of Array.from(grouped.entries())) {
      const [fy, fq] = key.split("-").map(Number);
      const filtered = applyFilter(qAssessments);
      const t = filtered.length;
      if (t === 0) continue;
      const c = { HP: 0, MP: 0, LP: 0, LCF: 0 };
      for (const a of filtered) { if (a.performanceCategory in c) c[a.performanceCategory as PerformanceCategory]++; }
      const tdiVal = Math.round(((c.HP / t) - ((c.LP + c.LCF) / t)) * 100);
      points.push({ quarter: `Q${fq} FY${fy}`, tdi: tdiVal, sortKey: fy * 10 + fq });
    }
    return points.sort((a, b) => a.sortKey - b.sortKey);
  })();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="animate-pulse text-lg font-light text-primary/70">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white px-4 py-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-primary">Talent Assessment Summary</h1>
        <p className="mt-1 text-sm text-primary/50">
          The Talent Assessment Model — plotting each team member on Culture Fit and Productivity.
        </p>

        {/* Controls */}
        <div className="mt-6 flex flex-wrap items-end gap-4">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Fiscal Year</label>
            <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="mt-1 block rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm font-semibold text-primary outline-none focus:border-primary">
              {yearOptions.map((y) => <option key={y} value={y}>FY {y}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Quarter</label>
            <select value={selectedQuarter} onChange={(e) => setSelectedQuarter(Number(e.target.value))}
              className="mt-1 block rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm font-semibold text-primary outline-none focus:border-primary">
              {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">View</label>
            <select value={filterMode} onChange={(e) => setFilterMode(e.target.value)}
              className="mt-1 block rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary">
              <option value="my-reports">My Direct Reports</option>
              {isAdmin && <option value="all">All Assessments</option>}
              {teamsWithSubTeams.map((t) => (
                <option key={`reports-${t.id}`} value={`reports-of:${t.id}`}>
                  Direct Reports of {t.name}
                </option>
              ))}
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer pb-2">
            <input
              type="checkbox"
              checked={privacyMode}
              onChange={(e) => setPrivacyMode(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span className="text-xs font-semibold text-primary/60">Privacy Mode</span>
          </label>
        </div>

        {/* Grid + Stats side by side */}
        {total === 0 ? (
          <div className="mt-8 rounded-[4px] border border-brand-gray bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-primary/40">
              No assessments for FY {selectedYear} Q{selectedQuarter} yet.
            </p>
            <p className="mt-2 text-xs text-primary/30">
              Enter assessments on the Assessments page first.
            </p>
          </div>
        ) : (
          <div className="mt-6 flex flex-col lg:flex-row gap-6 items-start">
            {/* The Grid */}
            <div className="flex-1 min-w-0">
              <TalentGrid
                assessments={filteredAssessments}
                scoringParams={scoringParams}
                privacyMode={privacyMode}
                onClickMember={(memberId) => {
                  router.push(`/members/${memberId}`);
                }}
              />
            </div>

            {/* TDI + Category Stats — right side */}
            <div className="w-full lg:w-48 flex-shrink-0 space-y-4">
              {/* TDI */}
              <div className="rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">
                  TDI
                </p>
                <p className={`mt-1 text-3xl font-bold ${tdi > 0 ? "text-green-600" : tdi < 0 ? "text-red-500" : "text-yellow-500"}`}>
                  {tdi > 0 ? "+" : ""}{tdi}%
                </p>
                <p className="mt-1 text-[9px] text-primary/30">
                  %HP − (%LP + %LCF)
                </p>
              </div>

              {/* Category counts */}
              <div className="rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm space-y-3">
                {(["HP", "MP", "LP", "LCF"] as PerformanceCategory[]).map((cat) => (
                  <div key={cat} className="flex items-center justify-between">
                    <span className={`rounded-[2px] px-2 py-0.5 text-[10px] font-semibold ${CATEGORY_COLORS[cat].bg} ${CATEGORY_COLORS[cat].text}`}>
                      {cat}
                    </span>
                    <div className="text-right">
                      <span className="text-sm font-bold text-primary">{counts[cat]}</span>
                      <span className="ml-1 text-[10px] text-primary/40">
                        ({total > 0 ? Math.round((counts[cat] / total) * 100) : 0}%)
                      </span>
                    </div>
                  </div>
                ))}
                <div className="border-t border-brand-gray pt-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Total</span>
                  <span className="text-sm font-bold text-primary">{total}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TDI Trend */}
        {tdiTrendData.length > 0 && (
          <div className="mt-6 rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/40">TDI Trend</h2>
            <div className="mt-3">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={tdiTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="quarter" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={35} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 4, border: "1px solid #e5e7eb" }} formatter={(value) => [`${value}%`, "TDI"]} />
                  <Line type="monotone" dataKey="tdi" name="TDI" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
