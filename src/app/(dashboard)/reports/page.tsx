"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar,
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { getAllAssessmentsForCompany, getAssessmentsByQuarter } from "@/lib/assessment-service";
import { getChangesByType } from "@/lib/team-service";
import { getAuthorizedMemberIds } from "@/lib/team-auth";
import { updateCompany } from "@/lib/company-service";
import { getFiscalYear, getFiscalQuarter } from "@/lib/fiscalUtils";
import { DEFAULT_SCORING_PARAMETERS } from "@/types/company";
import type { TdiGoals, QuarterlyTdiGoal } from "@/types/company";
import TalentGrid from "@/components/TalentGrid";
import type { Assessment, PerformanceCategory } from "@/types/assessment";
import { CATEGORY_COLORS } from "@/types/assessment";
import type { Team, TeamMember, TeamMemberChange } from "@/types/team";

type ReportTab = "trends" | "snapshots" | "comparisons" | "goals";

const LINE_COLORS = ["#22c55e", "#3b82f6", "#eab308", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

function calcTdi(assessments: Assessment[]): number {
  const total = assessments.length;
  if (total === 0) return 0;
  const counts = { HP: 0, MP: 0, LP: 0, LCF: 0 };
  for (const a of assessments) {
    if (a.performanceCategory in counts) counts[a.performanceCategory as PerformanceCategory]++;
  }
  return Math.round(((counts.HP / total) - ((counts.LP + counts.LCF) / total)) * 100);
}

function categoryCounts(assessments: Assessment[]): Record<PerformanceCategory, number> {
  const counts: Record<PerformanceCategory, number> = { HP: 0, MP: 0, LP: 0, LCF: 0 };
  for (const a of assessments) {
    if (a.performanceCategory in counts) counts[a.performanceCategory]++;
  }
  return counts;
}

function MultiSelectDropdown({
  label,
  options,
  selectedValues,
  onChange,
  allLabel = "All",
}: {
  label: string;
  options: { value: string; label: string }[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const summary =
    selectedValues.length === 0
      ? allLabel
      : selectedValues.length === 1
      ? options.find((o) => o.value === selectedValues[0])?.label ?? "1 selected"
      : `${selectedValues.length} selected`;

  const toggle = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((v) => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="mt-1 flex min-w-[180px] items-center justify-between rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm font-semibold text-primary outline-none transition hover:border-primary/40 focus:border-primary"
      >
        <span className="truncate">{summary}</span>
        <span className="ml-2 text-[10px] text-primary/40">▼</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-64 overflow-y-auto rounded-[4px] border border-brand-gray bg-white shadow-lg">
          <label className="flex items-center gap-2 px-3 py-2 text-sm text-primary cursor-pointer hover:bg-primary/[0.04]">
            <input
              type="checkbox"
              checked={selectedValues.length === 0}
              onChange={() => onChange([])}
              className="h-4 w-4 rounded border-brand-gray accent-accent"
            />
            {allLabel}
          </label>
          <div className="border-t border-brand-gray/30" />
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-3 py-2 text-sm text-primary cursor-pointer hover:bg-primary/[0.04]"
            >
              <input
                type="checkbox"
                checked={selectedValues.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="h-4 w-4 rounded border-brand-gray accent-accent"
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}


export default function ReportsPage() {
  const { profile } = useAuth();
  const { activeCompany } = useCompany();
  const router = useRouter();

  const companyId = activeCompany?.id ?? profile?.companyId;
  const startMonth = activeCompany?.fiscalYearStartMonth ?? 1;
  const scoringParams = activeCompany?.scoringParameters ?? { ...DEFAULT_SCORING_PARAMETERS };
  const now = new Date();
  const currentFY = getFiscalYear(now, startMonth);
  const currentFQ = getFiscalQuarter(now, startMonth);

  const isAdmin = profile?.role === "superadmin" || profile?.role === "company_admin";

  const [activeTab, setActiveTab] = useState<ReportTab>("trends");
  const [allAssessments, setAllAssessments] = useState<Assessment[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [changes, setChanges] = useState<TeamMemberChange[]>([]);
  const [, setAuthorizedTeamIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Trends state
  const [trendDimension, setTrendDimension] = useState<"overall" | "team" | "leader">("overall");

  // Snapshots state
  const [snapYear, setSnapYear] = useState(currentFY);
  const [snapQuarter, setSnapQuarter] = useState(currentFQ);
  const [snapAssessments, setSnapAssessments] = useState<Assessment[]>([]);
  // Empty array = "All Teams"; otherwise restrict to these team ids.
  const [snapTeamFilter, setSnapTeamFilter] = useState<string[]>([]);
  const [snapLoading, setSnapLoading] = useState(false);

  // Comparisons state
  const [sortCol, setSortCol] = useState<string>("tdi");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [compYear, setCompYear] = useState(currentFY);
  const [compQuarter, setCompQuarter] = useState(currentFQ);
  const [compTeamFilter, setCompTeamFilter] = useState<string[]>([]);

  // Goals state
  const [tdiGoals, setTdiGoals] = useState<TdiGoals>({});
  const [goalSaving, setGoalSaving] = useState(false);
  // Quarter being viewed/edited on the Goals tab. Defaults to current.
  const [goalsYear, setGoalsYear] = useState(currentFY);
  const [goalsQuarter, setGoalsQuarter] = useState(currentFQ);
  const [bulkGoalStr, setBulkGoalStr] = useState("");

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentFY + 1 - i);

  useEffect(() => {
    if (!profile || !companyId) { setLoading(false); return; }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, companyId]);

  async function loadData() {
    if (!companyId || !profile) return;
    try {
      const [allData, authResult, teamChanges, leaderChanges] = await Promise.all([
        getAllAssessmentsForCompany(companyId),
        getAuthorizedMemberIds(companyId, profile),
        getChangesByType(companyId, "team").catch(() => []),
        getChangesByType(companyId, "leader_change").catch(() => []),
      ]);

      const { authorizedTeamIds: authIds, authorizedMemberIds: authMemberIds, allMembers: memberData, allTeams: teamData } = authResult;
      setAuthorizedTeamIds(authIds);

      // Filter data by authorization
      const filteredAssessments = allData.filter((a) => authMemberIds.has(a.memberId));

      setAllAssessments(filteredAssessments);
      setTeams(teamData);
      setMembers(memberData);
      setChanges([...teamChanges, ...leaderChanges].filter((c) => authMemberIds.has(c.memberId)));

      setTdiGoals(activeCompany?.tdiGoals ?? {});

      // Load initial snapshot
      await loadSnapshot(currentFY, currentFQ, filteredAssessments);
    } catch (err) {
      console.error("Reports load error:", err);
    }
    setLoading(false);
  }

  async function loadSnapshot(fy: number, fq: number, existingData?: Assessment[]) {
    setSnapLoading(true);
    if (existingData) {
      setSnapAssessments(existingData.filter((a) => a.fiscalYear === fy && a.fiscalQuarter === fq));
    } else if (companyId) {
      const data = await getAssessmentsByQuarter(companyId, fy, fq);
      const authMemberIds = new Set(members.map((m) => m.id));
      setSnapAssessments(isAdmin ? data : data.filter((a) => a.assessedByUserId === profile?.uid || authMemberIds.has(a.memberId)));
    }
    setSnapLoading(false);
  }

  // --- Computed data ---

  // Group assessments by quarter
  const quarterGroups = new Map<string, Assessment[]>();
  for (const a of allAssessments) {
    const key = `${a.fiscalYear}-${a.fiscalQuarter}`;
    if (!quarterGroups.has(key)) quarterGroups.set(key, []);
    quarterGroups.get(key)!.push(a);
  }

  // TDI Trend data
  function buildTrendData() {
    const entries = Array.from(quarterGroups.entries())
      .map(([key, assessments]) => {
        const [fy, fq] = key.split("-").map(Number);
        return { key, fy, fq, assessments, sortKey: fy * 10 + fq, label: `Q${fq} FY${fy}` };
      })
      .sort((a, b) => a.sortKey - b.sortKey);

    if (trendDimension === "overall") {
      return entries.map((e) => ({ quarter: e.label, Overall: calcTdi(e.assessments) }));
    }

    if (trendDimension === "team") {
      return entries.map((e) => {
        const row: Record<string, string | number> = { quarter: e.label };
        for (const t of teams) {
          const teamMemberIds = new Set(members.filter((m) => m.teamId === t.id).map((m) => m.id));
          const teamAssessments = e.assessments.filter((a) => teamMemberIds.has(a.memberId));
          row[t.name] = calcTdi(teamAssessments);
        }
        return row;
      });
    }

    // By leader
    const leaderNames = new Map<string, string>();
    for (const a of allAssessments) {
      if (!leaderNames.has(a.assessedByUserId)) {
        leaderNames.set(a.assessedByUserId, "");
      }
    }
    // Resolve names from teams
    for (const t of teams) {
      if (leaderNames.has(t.leaderId)) leaderNames.set(t.leaderId, t.leaderName);
    }

    return entries.map((e) => {
      const row: Record<string, string | number> = { quarter: e.label };
      for (const [uid, name] of Array.from(leaderNames.entries())) {
        const leaderAssessments = e.assessments.filter((a) => a.assessedByUserId === uid);
        if (name) row[name] = calcTdi(leaderAssessments);
      }
      return row;
    });
  }

  const trendData = buildTrendData();
  const trendKeys = trendData.length > 0
    ? Object.keys(trendData[0]).filter((k) => k !== "quarter")
    : [];

  // Comparison data
  function buildComparisonData() {
    const quarterAssessments = allAssessments.filter(
      (a) => a.fiscalYear === compYear && a.fiscalQuarter === compQuarter
    );
    const teamsToShow = compTeamFilter.length > 0
      ? teams.filter((t) => compTeamFilter.includes(t.id))
      : teams;
    return teamsToShow.map((t) => {
      const teamMemberIds = new Set(members.filter((m) => m.teamId === t.id).map((m) => m.id));
      const teamAssessments = quarterAssessments.filter((a) => teamMemberIds.has(a.memberId));
      const counts = categoryCounts(teamAssessments);
      const total = teamAssessments.length;
      return {
        teamId: t.id,
        teamName: t.name,
        leaderName: t.leaderName,
        tdi: calcTdi(teamAssessments),
        total,
        hp: counts.HP,
        mp: counts.MP,
        lp: counts.LP,
        lcf: counts.LCF,
        hpPct: total > 0 ? Math.round((counts.HP / total) * 100) : 0,
        mpPct: total > 0 ? Math.round((counts.MP / total) * 100) : 0,
        lpPct: total > 0 ? Math.round((counts.LP / total) * 100) : 0,
        lcfPct: total > 0 ? Math.round((counts.LCF / total) * 100) : 0,
      };
    }).filter((r) => r.total > 0).sort((a, b) => {
      const aVal = a[sortCol as keyof typeof a] ?? 0;
      const bVal = b[sortCol as keyof typeof b] ?? 0;
      return sortDir === "desc" ? (bVal > aVal ? 1 : -1) : (aVal > bVal ? 1 : -1);
    });
  }

  const comparisonData = buildComparisonData();

  // Goals: TDI for any quarter, optionally scoped to a team
  function getTdiForQuarter(fy: number, fq: number, teamId?: string): number {
    const qAssessments = allAssessments.filter((a) => a.fiscalYear === fy && a.fiscalQuarter === fq);
    if (!teamId) return calcTdi(qAssessments);
    const teamMemberIds = new Set(members.filter((m) => m.teamId === teamId).map((m) => m.id));
    return calcTdi(qAssessments.filter((a) => teamMemberIds.has(a.memberId)));
  }

  function quarterHasAssessments(fy: number, fq: number, teamId?: string): boolean {
    const found = allAssessments.find((a) => a.fiscalYear === fy && a.fiscalQuarter === fq);
    if (!found) return false;
    if (!teamId) return true;
    const teamMemberIds = new Set(members.filter((m) => m.teamId === teamId).map((m) => m.id));
    return allAssessments.some(
      (a) => a.fiscalYear === fy && a.fiscalQuarter === fq && teamMemberIds.has(a.memberId)
    );
  }

  function goalStatus(current: number, goal: number | undefined): "green" | "yellow" | "red" | "none" {
    if (goal == null) return "none";
    if (current >= goal) return "green";
    if (current >= goal - 10) return "yellow";
    return "red";
  }

  // ---- Goals helpers (per-quarter) ----
  const quarterKey = (fy: number, fq: number) => `${fy}-${fq}`;
  const nextFq = currentFQ === 4 ? 1 : currentFQ + 1;
  const nextFy = currentFQ === 4 ? currentFY + 1 : currentFY;
  const selectedKey = quarterKey(goalsYear, goalsQuarter);

  function getGoalForQuarter(fy: number, fq: number): QuarterlyTdiGoal {
    const stored = tdiGoals.quarterly?.[quarterKey(fy, fq)];
    if (stored) return stored;
    // Fall back to legacy flat fields so existing data stays applied
    // until the user saves a quarter-specific value over it.
    return { company: tdiGoals.company, teams: tdiGoals.teams };
  }

  const selectedGoal = getGoalForQuarter(goalsYear, goalsQuarter);
  const selectedCompanyGoal = selectedGoal.company;
  const selectedTeamGoals = selectedGoal.teams ?? {};

  // Build the list of quarters to surface in the selector: every quarter
  // we have assessments for, every quarter that already has a goal, plus
  // current and next. De-duped and sorted oldest → newest.
  const quarterEntries: { fy: number; fq: number; key: string; sortKey: number }[] = [];
  const seenKeys = new Set<string>();
  function pushQuarter(fy: number, fq: number) {
    const key = quarterKey(fy, fq);
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    quarterEntries.push({ fy, fq, key, sortKey: fy * 10 + fq });
  }
  for (const a of allAssessments) pushQuarter(a.fiscalYear, a.fiscalQuarter);
  for (const k of Object.keys(tdiGoals.quarterly ?? {})) {
    const [fy, fq] = k.split("-").map(Number);
    if (!Number.isNaN(fy) && !Number.isNaN(fq)) pushQuarter(fy, fq);
  }
  pushQuarter(currentFY, currentFQ);
  pushQuarter(nextFy, nextFq);
  quarterEntries.sort((a, b) => a.sortKey - b.sortKey);

  function quarterLabel(fy: number, fq: number): string {
    const isCurrent = fy === currentFY && fq === currentFQ;
    const isNext = fy === nextFy && fq === nextFq;
    return `Q${fq} FY${fy}${isCurrent ? " (current)" : isNext ? " (next)" : ""}`;
  }

  function updateCompanyGoal(raw: string) {
    if (raw !== "" && Number.isNaN(Number(raw)) && raw !== "-") return;
    setTdiGoals((prev) => {
      const quarterly = { ...(prev.quarterly ?? {}) };
      const entry = { ...(quarterly[selectedKey] ?? {}) };
      if (raw === "" || raw === "-") delete entry.company;
      else entry.company = parseInt(raw) || 0;
      quarterly[selectedKey] = entry;
      return { ...prev, quarterly };
    });
  }

  function updateTeamGoal(teamId: string, raw: string) {
    if (raw !== "" && Number.isNaN(Number(raw)) && raw !== "-") return;
    setTdiGoals((prev) => {
      const quarterly = { ...(prev.quarterly ?? {}) };
      const entry = { ...(quarterly[selectedKey] ?? {}) };
      const teamsMap = { ...(entry.teams ?? {}) };
      if (raw === "" || raw === "-") delete teamsMap[teamId];
      else teamsMap[teamId] = parseInt(raw) || 0;
      entry.teams = teamsMap;
      quarterly[selectedKey] = entry;
      return { ...prev, quarterly };
    });
  }

  function applyBulkGoal() {
    if (bulkGoalStr === "") return;
    const num = parseInt(bulkGoalStr) || 0;
    setTdiGoals((prev) => {
      const quarterly = { ...(prev.quarterly ?? {}) };
      const entry = { ...(quarterly[selectedKey] ?? {}) };
      const teamsMap = { ...(entry.teams ?? {}) };
      for (const t of teams) teamsMap[t.id] = num;
      entry.teams = teamsMap;
      quarterly[selectedKey] = entry;
      return { ...prev, quarterly };
    });
  }

  async function handleSaveGoals() {
    if (!companyId) return;
    setGoalSaving(true);
    try {
      await updateCompany(companyId, { tdiGoals });
    } catch (err) {
      console.error("Failed to save goals:", err);
    }
    setGoalSaving(false);
  }

  // Snapshot filtered
  const filteredSnapAssessments = snapTeamFilter.length > 0
    ? snapAssessments.filter((a) => {
        const m = members.find((m) => m.id === a.memberId);
        return m && snapTeamFilter.includes(m.teamId);
      })
    : snapAssessments;

  // Quarter changes
  const quarterChanges = changes.filter((c) => c.fiscalYear === currentFY && c.fiscalQuarter === currentFQ);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="animate-pulse text-lg font-light text-primary/70">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white px-4 py-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold text-primary">Reports</h1>
        <p className="mt-1 text-sm text-primary/50">TDI benchmarks, trends, and team comparisons.</p>

        {/* Tabs */}
        <div className="mt-6 flex gap-1 border-b border-brand-gray">
          {([
            ["trends", "TDI Trends"],
            ["snapshots", "Snapshots"],
            ["comparisons", "Comparisons"],
            ["goals", "TDI Goals"],
          ] as [ReportTab, string][]).map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-semibold uppercase tracking-wider transition ${activeTab === tab ? "border-b-2 border-primary text-primary" : "text-primary/40 hover:text-primary/70"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ===== TDI TRENDS ===== */}
        {activeTab === "trends" && (
          <div className="mt-6">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">View by:</span>
              {(["overall", "team", "leader"] as const).map((d) => (
                <button key={d} onClick={() => setTrendDimension(d)}
                  className={`rounded-[4px] px-3 py-1 text-xs font-semibold uppercase transition ${trendDimension === d ? "bg-primary text-white" : "border border-brand-gray text-primary/50 hover:text-primary"}`}>
                  {d === "overall" ? "Overall" : d === "team" ? "By Team" : "By Leader"}
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="quarter" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={35} tickFormatter={(v) => `${v}%`} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 4, border: "1px solid #e5e7eb" }} />
                    {trendKeys.length > 1 && (
                      <Legend verticalAlign="bottom" iconSize={8} formatter={(v) => <span style={{ fontSize: 11, color: "#6b7280" }}>{v}</span>} />
                    )}
                    {trendKeys.map((key, i) => (
                      <Line key={key} type="monotone" dataKey={key} name={key} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-primary/40">No assessment data available for trend analysis.</p>
              )}
            </div>
          </div>
        )}

        {/* ===== SNAPSHOTS ===== */}
        {activeTab === "snapshots" && (
          <div className="mt-6">
            <div className="flex items-center gap-4">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Fiscal Year</label>
                <select value={snapYear} onChange={(e) => { const fy = Number(e.target.value); setSnapYear(fy); loadSnapshot(fy, snapQuarter); }}
                  className="mt-1 block rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm font-semibold text-primary outline-none focus:border-primary">
                  {yearOptions.map((y) => <option key={y} value={y}>FY {y}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Quarter</label>
                <select value={snapQuarter} onChange={(e) => { const fq = Number(e.target.value); setSnapQuarter(fq); loadSnapshot(snapYear, fq); }}
                  className="mt-1 block rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm font-semibold text-primary outline-none focus:border-primary">
                  {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
                </select>
              </div>
              <MultiSelectDropdown
                label="Teams"
                options={teams.map((t) => ({ value: t.id, label: t.name }))}
                selectedValues={snapTeamFilter}
                onChange={setSnapTeamFilter}
                allLabel="All Teams"
              />
            </div>

            {snapLoading ? (
              <p className="mt-4 animate-pulse text-sm text-primary/50">Loading...</p>
            ) : (
              <div className="mt-4 rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm">
                {filteredSnapAssessments.length > 0 ? (
                  <>
                    <div className="flex items-center gap-4 mb-3">
                      <span className="text-sm font-semibold text-primary">Q{snapQuarter} FY{snapYear}</span>
                      <span className="text-xs text-primary/50">{filteredSnapAssessments.length} assessments</span>
                      <span className={`text-sm font-bold ${calcTdi(filteredSnapAssessments) > 0 ? "text-green-600" : calcTdi(filteredSnapAssessments) < 0 ? "text-red-500" : "text-yellow-500"}`}>
                        TDI: {calcTdi(filteredSnapAssessments) > 0 ? "+" : ""}{calcTdi(filteredSnapAssessments)}%
                      </span>
                    </div>
                    <TalentGrid
                      assessments={filteredSnapAssessments}
                      scoringParams={scoringParams}
                      privacyMode={false}
                      onClickMember={(id) => router.push(`/members/${id}`)}
                    />
                    {/* Category bar */}
                    <div className="mt-3 flex gap-4">
                      {(["HP", "MP", "LP", "LCF"] as PerformanceCategory[]).map((cat) => {
                        const c = categoryCounts(filteredSnapAssessments);
                        const t = filteredSnapAssessments.length;
                        return (
                          <div key={cat} className="flex items-center gap-2">
                            <span className={`rounded-[2px] px-2 py-0.5 text-[10px] font-semibold ${CATEGORY_COLORS[cat].bg} ${CATEGORY_COLORS[cat].text}`}>{cat}</span>
                            <span className="text-xs text-primary/60">{c[cat]} ({t > 0 ? Math.round((c[cat] / t) * 100) : 0}%)</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-primary/40">No assessments for this quarter.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== COMPARISONS ===== */}
        {activeTab === "comparisons" && (
          <div className="mt-6">
            <div className="flex items-center gap-4">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Fiscal Year</label>
                <select value={compYear} onChange={(e) => setCompYear(Number(e.target.value))}
                  className="mt-1 block rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm font-semibold text-primary outline-none focus:border-primary">
                  {yearOptions.map((y) => <option key={y} value={y}>FY {y}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Quarter</label>
                <select value={compQuarter} onChange={(e) => setCompQuarter(Number(e.target.value))}
                  className="mt-1 block rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm font-semibold text-primary outline-none focus:border-primary">
                  {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
                </select>
              </div>
              <MultiSelectDropdown
                label="Teams"
                options={teams.map((t) => ({ value: t.id, label: t.name }))}
                selectedValues={compTeamFilter}
                onChange={setCompTeamFilter}
                allLabel="All Teams"
              />
            </div>

            <p className="text-xs text-primary/40 mt-4 mb-3">Q{compQuarter} FY{compYear} — Click column headers to sort</p>

            {comparisonData.length > 0 ? (
              <>
                {/* Table */}
                <div className="rounded-[4px] border border-brand-gray bg-white shadow-sm overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-brand-gray">
                        {[
                          ["teamName", "Team"], ["leaderName", "Leader"], ["tdi", "TDI"],
                          ["total", "Total"], ["hpPct", "HP%"], ["mpPct", "MP%"], ["lpPct", "LP%"], ["lcfPct", "LCF%"],
                        ].map(([col, label]) => (
                          <th key={col}
                            onClick={() => { if (sortCol === col) setSortDir(sortDir === "desc" ? "asc" : "desc"); else { setSortCol(col); setSortDir("desc"); } }}
                            className="cursor-pointer px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-primary/40 hover:text-primary transition">
                            {label} {sortCol === col ? (sortDir === "desc" ? "▼" : "▲") : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonData.map((r) => (
                        <tr key={r.teamId} className="border-b border-brand-gray/30 hover:bg-primary/[0.02]">
                          <td className="px-3 py-2 text-sm font-semibold text-primary">{r.teamName}</td>
                          <td className="px-3 py-2 text-xs text-primary/60">{r.leaderName || "—"}</td>
                          <td className={`px-3 py-2 text-sm font-bold ${r.tdi > 0 ? "text-green-600" : r.tdi < 0 ? "text-red-500" : "text-yellow-500"}`}>
                            {r.tdi > 0 ? "+" : ""}{r.tdi}%
                          </td>
                          <td className="px-3 py-2 text-xs text-primary/60">{r.total}</td>
                          <td className="px-3 py-2 text-xs text-green-600">{r.hpPct}%</td>
                          <td className="px-3 py-2 text-xs text-yellow-500">{r.mpPct}%</td>
                          <td className="px-3 py-2 text-xs text-red-500">{r.lpPct}%</td>
                          <td className="px-3 py-2 text-xs text-red-500">{r.lcfPct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Bar chart */}
                <div className="mt-4 rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm">
                  <ResponsiveContainer width="100%" height={Math.max(200, Math.min(comparisonData.length * 40, 500))}>
                    <BarChart data={comparisonData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                      <YAxis type="category" dataKey="teamName" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={120} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 4, border: "1px solid #e5e7eb" }} />
                      <Bar dataKey="tdi" name="TDI" fill="#22c55e" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : (
              <p className="text-sm text-primary/40">No team data for Q{compQuarter} FY{compYear}.</p>
            )}
          </div>
        )}

        {/* ===== TDI GOALS ===== */}
        {activeTab === "goals" && (() => {
          const companyHasActuals = quarterHasAssessments(goalsYear, goalsQuarter);
          const companyActual = getTdiForQuarter(goalsYear, goalsQuarter);
          const isFutureQuarter =
            (goalsYear > currentFY) ||
            (goalsYear === currentFY && goalsQuarter > currentFQ);
          const colors = { green: "bg-green-500", yellow: "bg-yellow-400", red: "bg-red-500", none: "bg-brand-gray" };
          return (
          <div className="mt-6 space-y-6">
            {/* Quarter selector */}
            <div className="rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Quarter</label>
              <select value={selectedKey}
                onChange={(e) => { const [fy, fq] = e.target.value.split("-").map(Number); setGoalsYear(fy); setGoalsQuarter(fq); setBulkGoalStr(""); }}
                className="mt-1 block rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm font-semibold text-primary outline-none focus:border-primary">
                {quarterEntries.map((q) => (
                  <option key={q.key} value={q.key}>{quarterLabel(q.fy, q.fq)}</option>
                ))}
              </select>
            </div>

            {/* Company goal */}
            <div className="rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/40">Company TDI Goal</h2>
              <div className="mt-3 flex items-center gap-4">
                {companyHasActuals && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-primary/50">Actual:</span>
                    <span className={`text-lg font-bold ${companyActual > 0 ? "text-green-600" : companyActual < 0 ? "text-red-500" : "text-yellow-500"}`}>
                      {companyActual > 0 ? "+" : ""}{companyActual}%
                    </span>
                  </div>
                )}
                {isAdmin ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-primary/50">Goal:</span>
                    <input type="text" value={selectedCompanyGoal != null ? String(selectedCompanyGoal) : ""}
                      onChange={(e) => updateCompanyGoal(e.target.value)}
                      placeholder="e.g., 50" className="w-20 rounded-[4px] border border-brand-gray bg-white px-2 py-1 text-sm text-primary outline-none focus:border-primary" />
                    <span className="text-xs text-primary/30">%</span>
                  </div>
                ) : selectedCompanyGoal != null ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-primary/50">Goal: {selectedCompanyGoal}%</span>
                  </div>
                ) : null}
                {companyHasActuals && selectedCompanyGoal != null && (
                  <span className={`h-3 w-3 rounded-full ${colors[goalStatus(companyActual, selectedCompanyGoal)]}`} />
                )}
              </div>
            </div>

            {/* Team goals */}
            <div className="rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/40">Team TDI Goals</h2>

              {isAdmin && teams.length > 0 && (
                <div className="mt-3 flex items-center gap-2 border-b border-brand-gray/50 pb-3">
                  <span className="text-xs text-primary/50">Set goal for all teams:</span>
                  <input type="text" value={bulkGoalStr}
                    onChange={(e) => { const v = e.target.value; if (v !== "" && Number.isNaN(Number(v)) && v !== "-") return; setBulkGoalStr(v); }}
                    placeholder="e.g., 30"
                    className="w-20 rounded-[4px] border border-brand-gray bg-white px-2 py-1 text-xs text-primary outline-none focus:border-primary" />
                  <span className="text-xs text-primary/30">%</span>
                  <button onClick={applyBulkGoal} disabled={bulkGoalStr === ""}
                    className="rounded-[4px] border border-brand-gray bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary transition hover:border-primary disabled:opacity-50">
                    Apply to all
                  </button>
                </div>
              )}

              <div className="mt-3 space-y-2">
                {teams.map((t) => {
                  const teamHasActuals = quarterHasAssessments(goalsYear, goalsQuarter, t.id);
                  const actual = getTdiForQuarter(goalsYear, goalsQuarter, t.id);
                  const goal = selectedTeamGoals[t.id];
                  return (
                    <div key={t.id} className="flex items-center gap-4 py-1">
                      <span className="w-40 text-sm font-semibold text-primary truncate">{t.name}</span>
                      {teamHasActuals ? (
                        <span className={`text-sm font-bold ${actual > 0 ? "text-green-600" : actual < 0 ? "text-red-500" : "text-yellow-500"}`}>
                          {actual > 0 ? "+" : ""}{actual}%
                        </span>
                      ) : (
                        <span className="text-sm text-primary/30">—</span>
                      )}
                      {isAdmin ? (
                        <input type="text" value={goal != null ? String(goal) : ""}
                          onChange={(e) => updateTeamGoal(t.id, e.target.value)}
                          placeholder="Goal" className="w-20 rounded-[4px] border border-brand-gray bg-white px-2 py-1 text-xs text-primary outline-none focus:border-primary" />
                      ) : goal != null ? (
                        <span className="text-xs text-primary/50">Goal: {goal}%</span>
                      ) : null}
                      {teamHasActuals && goal != null && (
                        <span className={`h-3 w-3 rounded-full ${colors[goalStatus(actual, goal)]}`} />
                      )}
                    </div>
                  );
                })}
              </div>
              {isAdmin && (
                <button onClick={handleSaveGoals} disabled={goalSaving}
                  className="mt-4 rounded-[4px] bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50">
                  {goalSaving ? "Saving..." : "Save Goals"}
                </button>
              )}
              {isFutureQuarter && (
                <p className="mt-2 text-xs text-primary/40">No actuals yet for this quarter — set goals now and the dots will appear once assessments are entered.</p>
              )}
            </div>

            {/* Change Log */}
            <div className="rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/40">
                Change Log — Q{currentFQ} FY{currentFY}
              </h2>
              {quarterChanges.length === 0 ? (
                <p className="mt-3 text-sm text-primary/40">No team member changes this quarter.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {quarterChanges.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-blue-600">
                        {c.changeType === "team" && "Team change"}
                        {c.changeType === "leader_change" && "New leader"}
                        {c.changeType === "promoted_to_leader" && "Promotion"}
                        {c.changeType === "archived" && "Archived"}
                        {c.changeType === "role" && "Role change"}
                      </span>
                      <span className="text-primary/50">{c.previousValue} → {c.newValue}</span>
                      {c.effectiveDate && (
                        <span className="text-primary/30">({new Date(c.effectiveDate + "T00:00:00").toLocaleDateString()})</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          );
        })()}
      </div>
    </div>
  );
}
