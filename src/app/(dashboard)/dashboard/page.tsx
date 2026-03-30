"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { getAssessmentsByQuarter, getAllAssessmentsForCompany } from "@/lib/assessment-service";
import { getAllActionPlans, updateActions } from "@/lib/actionplan-service";
import { getAllTeamMembers } from "@/lib/team-service";
import { getFiscalYear, getFiscalQuarter } from "@/lib/fiscalUtils";
import { DEFAULT_SCORING_PARAMETERS } from "@/types/company";
import TalentGrid from "@/components/TalentGrid";
import type { Assessment, PerformanceCategory } from "@/types/assessment";
import { CATEGORY_COLORS } from "@/types/assessment";
// actionplan types used implicitly via service return types

interface TdiPoint {
  quarter: string;
  tdi: number;
  sortKey: number;
}

interface FlatAction {
  planId: string;
  actionIdx: number;
  memberId: string;
  memberName: string;
  description: string;
  owner: string;
  targetDate: string;
  completedAt: string | null;
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const { activeCompany } = useCompany();
  const router = useRouter();

  const companyId = activeCompany?.id ?? profile?.companyId;
  const startMonth = activeCompany?.fiscalYearStartMonth ?? 1;
  const scoringParams = activeCompany?.scoringParameters ?? { ...DEFAULT_SCORING_PARAMETERS };
  const now = new Date();
  const currentFY = getFiscalYear(now, startMonth);
  const currentFQ = getFiscalQuarter(now, startMonth);
  const todayISO = now.toISOString().split("T")[0];

  const [currentAssessments, setCurrentAssessments] = useState<Assessment[]>([]);
  const [tdiTrend, setTdiTrend] = useState<TdiPoint[]>([]);
  const [actionItems, setActionItems] = useState<FlatAction[]>([]);
  const [allPlans, setAllPlans] = useState<{ id: string; memberId: string; memberName: string; actions: { description: string; targetDate: string; completedAt: string | null; owner: string }[] }[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = profile?.role === "superadmin" || profile?.role === "company_admin";

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
    if (!companyId) return;
    try {
      const [quarterData, allData, plansData, membersData] = await Promise.all([
        getAssessmentsByQuarter(companyId, currentFY, currentFQ),
        getAllAssessmentsForCompany(companyId),
        getAllActionPlans(companyId),
        getAllTeamMembers(companyId),
      ]);

      // Filter by authorization
      const authorized = (assessments: Assessment[]) =>
        isAdmin ? assessments : assessments.filter((a) => a.assessedByUserId === profile?.uid);

      // Current quarter assessments (exclude archived members)
      const activeMemberIds = new Set(membersData.filter((m) => (m.status ?? "active") === "active").map((m) => m.id));
      setCurrentAssessments(authorized(quarterData).filter((a) => activeMemberIds.has(a.memberId)));

      // TDI trend across all quarters
      const allAuthorized = authorized(allData);
      const grouped = new Map<string, Assessment[]>();
      for (const a of allAuthorized) {
        const key = `${a.fiscalYear}-${a.fiscalQuarter}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(a);
      }
      const trend: TdiPoint[] = [];
      for (const [key, assessments] of Array.from(grouped.entries())) {
        const [fy, fq] = key.split("-").map(Number);
        const total = assessments.length;
        if (total === 0) continue;
        const counts = { HP: 0, MP: 0, LP: 0, LCF: 0 };
        for (const a of assessments) {
          if (a.performanceCategory in counts) counts[a.performanceCategory as PerformanceCategory]++;
        }
        const tdi = Math.round(((counts.HP / total) - ((counts.LP + counts.LCF) / total)) * 100);
        trend.push({ quarter: `Q${fq} FY${fy}`, tdi, sortKey: fy * 10 + fq });
      }
      trend.sort((a, b) => a.sortKey - b.sortKey);
      setTdiTrend(trend);

      // Action items across all members
      setAllPlans(plansData);
      const flat: FlatAction[] = [];
      for (const plan of plansData) {
        for (let idx = 0; idx < plan.actions.length; idx++) {
          const action = plan.actions[idx];
          flat.push({
            planId: plan.id,
            actionIdx: idx,
            memberId: plan.memberId,
            memberName: plan.memberName,
            description: action.description,
            owner: action.owner ?? "",
            targetDate: action.targetDate,
            completedAt: action.completedAt,
          });
        }
      }
      // Open items only, sorted: overdue first, then by date
      const openItems = flat
        .filter((a) => !a.completedAt)
        .sort((a, b) => {
          const aOverdue = a.targetDate && a.targetDate < todayISO ? 0 : 1;
          const bOverdue = b.targetDate && b.targetDate < todayISO ? 0 : 1;
          if (aOverdue !== bOverdue) return aOverdue - bOverdue;
          return (a.targetDate || "9999") < (b.targetDate || "9999") ? -1 : 1;
        });
      setActionItems(openItems);
    } catch (err) {
      console.error("Dashboard load error:", err);
    }
    setLoading(false);
  }

  async function handleToggleAction(planId: string, actionIdx: number) {
    if (!companyId) return;
    const plan = allPlans.find((p) => p.id === planId);
    if (!plan) return;
    const updated = [...plan.actions];
    updated[actionIdx] = { ...updated[actionIdx], completedAt: updated[actionIdx].completedAt ? null : new Date().toISOString().split("T")[0] };
    await updateActions(companyId, planId, updated);
    setAllPlans(allPlans.map((p) => p.id === planId ? { ...p, actions: updated } : p));
    // Remove from action items list
    setActionItems(actionItems.filter((a) => !(a.planId === planId && a.actionIdx === actionIdx)));
  }

  async function handleChangeOwner(planId: string, actionIdx: number, newOwner: string) {
    if (!companyId) return;
    const plan = allPlans.find((p) => p.id === planId);
    if (!plan) return;
    const updated = [...plan.actions];
    updated[actionIdx] = { ...updated[actionIdx], owner: newOwner };
    await updateActions(companyId, planId, updated);
    setAllPlans(allPlans.map((p) => p.id === planId ? { ...p, actions: updated } : p));
    setActionItems(actionItems.map((a) => a.planId === planId && a.actionIdx === actionIdx ? { ...a, owner: newOwner } : a));
  }

  // TDI for current quarter
  const total = currentAssessments.length;
  const counts: Record<PerformanceCategory, number> = { HP: 0, MP: 0, LP: 0, LCF: 0 };
  for (const a of currentAssessments) {
    if (a.performanceCategory in counts) counts[a.performanceCategory]++;
  }
  const tdi = total > 0
    ? Math.round(((counts.HP / total) - ((counts.LP + counts.LCF) / total)) * 100)
    : 0;

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
        <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
        <p className="mt-1 text-sm text-primary/50">
          Q{currentFQ} FY{currentFY} — {total} team member{total !== 1 ? "s" : ""} assessed
        </p>

        {/* TDI + Category Counts */}
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
          {/* TDI Score */}
          <div className="col-span-2 rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm lg:col-span-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">TDI</p>
            <p className={`mt-1 text-3xl font-bold ${tdi > 0 ? "text-green-600" : tdi < 0 ? "text-red-500" : "text-yellow-500"}`}>
              {tdi > 0 ? "+" : ""}{tdi}%
            </p>
            <p className="mt-0.5 text-[9px] text-primary/30">%HP − (%LP + %LCF)</p>
          </div>
          {/* Category cards */}
          {(["HP", "MP", "LP", "LCF"] as PerformanceCategory[]).map((cat) => (
            <div key={cat} className="rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <span className={`rounded-[2px] px-2 py-0.5 text-[10px] font-semibold ${CATEGORY_COLORS[cat].bg} ${CATEGORY_COLORS[cat].text}`}>{cat}</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-primary">{counts[cat]}</p>
              <p className="text-[10px] text-primary/30">{total > 0 ? Math.round((counts[cat] / total) * 100) : 0}%</p>
            </div>
          ))}
        </div>

        {/* TalentGrid + TDI Trend */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Mini TalentGrid */}
          <div className="rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/40">Talent Density Model</h2>
            {currentAssessments.length > 0 ? (
              <div className="mt-3">
                <TalentGrid
                  assessments={currentAssessments}
                  scoringParams={scoringParams}
                  privacyMode={false}
                  onClickMember={(id) => router.push(`/members/${id}`)}
                />
              </div>
            ) : (
              <p className="mt-3 text-sm text-primary/40">No assessments for this quarter yet.</p>
            )}
          </div>

          {/* TDI Trend */}
          <div className="rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/40">TDI Trend</h2>
            {tdiTrend.length > 0 ? (
              <div className="mt-3">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={tdiTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="quarter" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={35} tickFormatter={(v) => `${v}%`} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 4, border: "1px solid #e5e7eb" }} formatter={(value) => [`${value}%`, "TDI"]} />
                    <Line type="monotone" dataKey="tdi" name="TDI" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mt-3 text-sm text-primary/40">TDI trend will appear after multiple quarters of assessments.</p>
            )}
          </div>
        </div>

        {/* Action Items */}
        <div className="mt-6 rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/40">
            Open Action Items
            {actionItems.length > 0 && <span className="ml-2 text-primary/30">({actionItems.length})</span>}
          </h2>
          {actionItems.length === 0 ? (
            <p className="mt-3 text-sm text-primary/40">No open action items across your team.</p>
          ) : (
            <div className="mt-3">
              {/* Header */}
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 border-b border-brand-gray pb-2 items-center">
                <span className="col-span-1 text-[10px] font-semibold uppercase tracking-wider text-primary/30">Done</span>
                <span className="col-span-2 text-[10px] font-semibold uppercase tracking-wider text-primary/30">Team Member</span>
                <span className="col-span-4 text-[10px] font-semibold uppercase tracking-wider text-primary/30">Action</span>
                <span className="col-span-2 text-[10px] font-semibold uppercase tracking-wider text-primary/30">Owner</span>
                <span className="col-span-3 text-[10px] font-semibold uppercase tracking-wider text-primary/30">Due Date</span>
              </div>
              {/* Rows */}
              {actionItems.map((a, i) => {
                const isOverdue = a.targetDate && a.targetDate < todayISO;
                return (
                  <div key={i} className={`grid grid-cols-12 gap-2 border-b border-brand-gray/30 py-2 items-center ${isOverdue ? "bg-accent/5" : ""}`}>
                    <div className="col-span-1 flex justify-center">
                      <input type="checkbox" checked={false} onChange={() => handleToggleAction(a.planId, a.actionIdx)} className="h-4 w-4 accent-green-500 cursor-pointer" />
                    </div>
                    <button onClick={() => router.push(`/members/${a.memberId}`)} className="col-span-2 text-left text-xs font-semibold text-primary transition hover:text-accent truncate">
                      {a.memberName}
                    </button>
                    <span className="col-span-4 text-xs text-primary/70 truncate">{a.description}</span>
                    <div className="col-span-2">
                      <select
                        value={a.owner}
                        onChange={(e) => handleChangeOwner(a.planId, a.actionIdx, e.target.value)}
                        className="w-full rounded-[2px] border border-brand-gray/50 bg-white px-1 py-0.5 text-[10px] text-primary/60 outline-none truncate"
                      >
                        <option value="">Unassigned</option>
                        {profile?.displayName && <option value={profile.displayName}>{profile.displayName}</option>}
                        {a.memberName !== profile?.displayName && <option value={a.memberName}>{a.memberName}</option>}
                        {a.owner && a.owner !== profile?.displayName && a.owner !== a.memberName && <option value={a.owner}>{a.owner}</option>}
                      </select>
                    </div>
                    <span className={`col-span-3 text-xs ${isOverdue ? "font-semibold text-accent" : "text-primary/50"}`}>
                      {a.targetDate ? new Date(a.targetDate + "T00:00:00").toLocaleDateString() : "—"}
                      {isOverdue && <span className="ml-2 rounded-[2px] bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-accent">Overdue</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
