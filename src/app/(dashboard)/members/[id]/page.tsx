"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { getAllTeamMembers, getTeams, getMemberChanges } from "@/lib/team-service";
import { getAssessmentHistory, getAssessmentForMember, createAssessment, updateAssessment } from "@/lib/assessment-service";
import { getTargetsForMember, createTarget, updateTarget, deleteTarget } from "@/lib/productivity-service";
import { getActionPlansForMember, createActionPlan, addAction, updateActions, addNote } from "@/lib/actionplan-service";
import { getCoreValues } from "@/lib/corevalue-service";
import { calculateCultureFitScore } from "@/lib/culture-fit-scoring";
import { calculateTotalProductivityScore } from "@/lib/productivity-scoring";
import { validateWeights } from "@/lib/productivity-scoring";
import { assignCategory } from "@/lib/category-scoring";
import { getFiscalYear, getFiscalQuarter } from "@/lib/fiscalUtils";
import { formatNumber, stripCommas } from "@/lib/formatNumber";
import UserAvatar from "@/components/UserAvatar";
import type { TeamMember, Team, TeamMemberChange } from "@/types/team";
import type { Assessment, CultureFitRating, CultureFitScore, ProductivityActual, PerformanceCategory } from "@/types/assessment";
import type { ProductivityTarget, TargetType, UnitType, Frequency, MonthlyValues, NullableMonthlyValues } from "@/types/productivity";
import type { CoreValue } from "@/types/corevalue";
import type { ActionPlan, ActionItem } from "@/types/actionplan";
import { CATEGORY_COLORS, CATEGORY_LABELS, RATING_LABELS } from "@/types/assessment";
import { DEFAULT_MONTHLY } from "@/types/productivity";
import { DEFAULT_SCORING_PARAMETERS, DEFAULT_CULTURE_FIT_RATING_SCORES, DEFAULT_CULTURE_FIT_CAPS } from "@/types/company";

const RATINGS: CultureFitRating[] = ["models", "lives", "occasional", "frequent"];

export default function MemberSummaryPage() {
  const { profile } = useAuth();
  const { activeCompany } = useCompany();
  const router = useRouter();
  const params = useParams();
  const memberId = params.id as string;

  const companyId = activeCompany?.id ?? profile?.companyId;
  const startMonth = activeCompany?.fiscalYearStartMonth ?? 1;
  const scoringParams = activeCompany?.scoringParameters ?? { ...DEFAULT_SCORING_PARAMETERS };
  const now = new Date();
  const currentFY = getFiscalYear(now, startMonth);
  const currentFQ = getFiscalQuarter(now, startMonth);

  const [member, setMember] = useState<TeamMember | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [targets, setTargets] = useState<ProductivityTarget[]>([]);
  const [, setCoreValues] = useState<CoreValue[]>([]);
  const [actionPlans, setActionPlans] = useState<ActionPlan[]>([]);
  const [memberChanges, setMemberChanges] = useState<TeamMemberChange[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [activeTab, setActiveTab] = useState<"overview" | "assess" | "targets">("overview");
  const [expandedQuarter, setExpandedQuarter] = useState<string | null>(null);

  // Assessment entry state
  const [assessYear, setAssessYear] = useState(currentFY);
  const [assessQuarter, setAssessQuarter] = useState(currentFQ);
  const [cultureFitScores, setCultureFitScores] = useState<CultureFitScore[]>([]);
  const [productivityActuals, setProductivityActuals] = useState<ProductivityActual[]>([]);
  const [existingAssessment, setExistingAssessment] = useState<Assessment | null>(null);
  const [quarterIncomplete, setQuarterIncomplete] = useState(false);
  const [completedMonths, setCompletedMonths] = useState<1 | 2>(1);
  const [assessmentSaving, setAssessmentSaving] = useState(false);
  const [assessmentSuccess, setAssessmentSuccess] = useState("");
  const [assessmentLoading, setAssessmentLoading] = useState(false);

  // Action plan state
  const [newActionDesc, setNewActionDesc] = useState("");
  const [newActionDate, setNewActionDate] = useState("");
  const [newNoteText, setNewNoteText] = useState("");

  // Target editing state
  const [expandedTargetId, setExpandedTargetId] = useState<string | null>(null);
  const [targetSaving, setTargetSaving] = useState(false);

  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile || !companyId || !memberId) { setLoading(false); return; }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, companyId, memberId]);

  async function loadData() {
    if (!companyId) return;
    try {
      const [allMembers, allTeams, assessmentData, targetData, planData, valuesData, changesData] = await Promise.all([
        getAllTeamMembers(companyId),
        getTeams(companyId),
        getAssessmentHistory(companyId, memberId),
        getTargetsForMember(companyId, memberId),
        getActionPlansForMember(companyId, memberId),
        getCoreValues(companyId),
        getMemberChanges(companyId, memberId),
      ]);
      const m = allMembers.find((tm) => tm.id === memberId);
      setMember(m ?? null);
      if (m) setTeam(allTeams.find((t) => t.id === m.teamId) ?? null);
      setAssessments(assessmentData);
      setTargets(targetData);
      setActionPlans(planData);
      setCoreValues(valuesData);
      setMemberChanges(changesData);

      // Load assessment for selected quarter
      await loadAssessmentForQuarter(assessYear, assessQuarter, valuesData, targetData);
    } catch (err) { console.error("Load error:", err); }
    setLoading(false);
  }

  async function loadAssessmentForQuarter(fy: number, fq: number, valuesData?: CoreValue[], targetData?: ProductivityTarget[]) {
    if (!companyId) return;
    setAssessmentLoading(true);
    setAssessmentSuccess("");
    try {
      const existing = await getAssessmentForMember(companyId, memberId, fy, fq);
      setExistingAssessment(existing);
      const cvData = valuesData ?? await getCoreValues(companyId);
      const tData = targetData ?? targets;
      if (existing) {
        setCultureFitScores(existing.cultureFitScores);
        setProductivityActuals(existing.productivityActuals);
      } else {
        setCultureFitScores(cvData.map((cv) => ({ coreValueId: cv.id, coreValueName: cv.name, rating: "" as CultureFitRating })));
        setProductivityActuals(tData.map((t) => ({ targetId: t.id, targetName: t.name, actual: null, monthlyActuals: t.frequency === "monthly" ? { month1: null, month2: null, month3: null } : null })));
      }
    } catch (err) { console.error("Load assessment error:", err); }
    setAssessmentLoading(false);
  }

  // Assessment calculations
  const ratingScores = scoringParams.cultureFitRatingScores ?? DEFAULT_CULTURE_FIT_RATING_SCORES;
  const fitCaps = scoringParams.cultureFitCaps ?? DEFAULT_CULTURE_FIT_CAPS;
  const cultureFitResult = calculateCultureFitScore(cultureFitScores, ratingScores, fitCaps);
  const effectiveMonths = quarterIncomplete ? completedMonths : 3;
  const productivityActualsMap: Record<string, number | null | NullableMonthlyValues> = {};
  for (const pa of productivityActuals) {
    const t = targets.find((tgt) => tgt.id === pa.targetId);
    if (t?.frequency === "monthly" && pa.monthlyActuals) {
      productivityActualsMap[pa.targetId] = {
        month1: pa.monthlyActuals.month1,
        month2: effectiveMonths >= 2 ? pa.monthlyActuals.month2 : null,
        month3: effectiveMonths >= 3 ? pa.monthlyActuals.month3 : null,
      };
    } else {
      productivityActualsMap[pa.targetId] = pa.monthlyActuals ?? pa.actual;
    }
  }
  const productivityScore = calculateTotalProductivityScore(targets, productivityActualsMap);
  const allCoreValuesRated = cultureFitScores.length > 0 && cultureFitScores.every((s) => s.rating);
  const category = allCoreValuesRated ? assignCategory(cultureFitResult.finalScore, productivityScore, scoringParams) : null;

  const latestAssessment = assessments.length > 0 ? assessments[0] : null;
  const trendData = [...assessments].reverse().map((a) => ({ quarter: `Q${a.fiscalQuarter} FY${a.fiscalYear}`, cultureFit: a.cultureFitScore, productivity: a.productivityScore }));
  const currentPlan = actionPlans.find((p) => p.fiscalYear === currentFY && p.fiscalQuarter === currentFQ);
  const openActions = currentPlan?.actions.filter((a) => !a.completedAt) ?? [];
  const completedActions = currentPlan?.actions.filter((a) => a.completedAt) ?? [];
  const { total: weightTotal, valid: weightsValid } = validateWeights(targets);

  // Handlers
  function updateCultureFitRating(coreValueId: string, rating: CultureFitRating) {
    setCultureFitScores(cultureFitScores.map((s) => s.coreValueId === coreValueId ? { ...s, rating } : s));
  }
  function updateProductivityActual(targetId: string, actual: number | null) {
    setProductivityActuals(productivityActuals.map((pa) => pa.targetId === targetId ? { ...pa, actual } : pa));
  }
  function updateMonthlyActual(targetId: string, month: "month1" | "month2" | "month3", value: number | null) {
    setProductivityActuals(productivityActuals.map((pa) =>
      pa.targetId === targetId ? { ...pa, monthlyActuals: { ...(pa.monthlyActuals ?? { month1: null, month2: null, month3: null }), [month]: value } } : pa
    ));
  }

  async function handleSaveAssessment() {
    if (!companyId || !memberId) return;
    const unrated = cultureFitScores.filter((s) => !s.rating);
    if (unrated.length > 0) { setError(`Please rate all core values. ${unrated.length} unrated.`); return; }
    setAssessmentSaving(true); setError(""); setAssessmentSuccess("");
    const data = { cultureFitScores, cultureFitScore: cultureFitResult.finalScore, productivityActuals, productivityScore, performanceCategory: (category ?? "MP") as PerformanceCategory };
    try {
      if (existingAssessment) {
        await updateAssessment(companyId, existingAssessment.id, data);
      } else {
        const id = await createAssessment(companyId, { ...data, memberId, memberName: member?.name ?? "", assessedByUserId: profile?.uid ?? "", fiscalYear: assessYear, fiscalQuarter: assessQuarter });
        setExistingAssessment({ id, ...data } as unknown as Assessment);
      }
      setAssessmentSuccess("Assessment saved.");
      await loadData(); // Reload to update history
    } catch { setError("Failed to save assessment."); }
    setAssessmentSaving(false);
  }

  async function handleAddAction() {
    if (!companyId || !newActionDesc.trim()) return;
    let plan = currentPlan;
    if (!plan) {
      const id = await createActionPlan(companyId, { memberId, memberName: member?.name ?? "", fiscalYear: currentFY, fiscalQuarter: currentFQ });
      plan = { id, memberId, memberName: member?.name ?? "", fiscalYear: currentFY, fiscalQuarter: currentFQ, actions: [], notes: [], createdAt: null, updatedAt: null } as unknown as ActionPlan;
      setActionPlans([plan, ...actionPlans]);
    }
    const action: ActionItem = { description: newActionDesc.trim(), targetDate: newActionDate, completedAt: null };
    await addAction(companyId, plan.id, plan.actions, action);
    setActionPlans(actionPlans.map((p) => p.id === plan!.id ? { ...p, actions: [...p.actions, action] } : p));
    setNewActionDesc(""); setNewActionDate("");
  }

  async function handleToggleAction(planId: string, idx: number) {
    if (!companyId) return;
    const plan = actionPlans.find((p) => p.id === planId);
    if (!plan) return;
    const updated = [...plan.actions];
    updated[idx] = { ...updated[idx], completedAt: updated[idx].completedAt ? null : new Date().toISOString().split("T")[0] };
    await updateActions(companyId, planId, updated);
    setActionPlans(actionPlans.map((p) => p.id === planId ? { ...p, actions: updated } : p));
  }

  async function handleAddNote() {
    if (!companyId || !newNoteText.trim() || !currentPlan) return;
    await addNote(companyId, currentPlan.id, currentPlan.notes, newNoteText.trim());
    setActionPlans(actionPlans.map((p) => p.id === currentPlan.id ? { ...p, notes: [...p.notes, { text: newNoteText.trim(), createdAt: { toDate: () => new Date() } }] } : p) as ActionPlan[]);
    setNewNoteText("");
  }

  async function handleAddTarget() {
    if (!companyId) return;
    const id = await createTarget(companyId, { memberId, name: "", type: "bigger", unit: "units", frequency: "quarterly", weight: 0, target: 0, min: 0, max: 0, monthlyTargets: null, monthlyMin: null, monthlyMax: null, order: targets.length });
    const newT = { id, memberId, name: "", type: "bigger" as TargetType, unit: "units" as UnitType, frequency: "quarterly" as Frequency, weight: 0, target: 0, min: 0, max: 0, monthlyTargets: null, monthlyMin: null, monthlyMax: null, order: targets.length } as ProductivityTarget;
    setTargets([...targets, newT]);
    setExpandedTargetId(id);
  }

  async function handleSaveTarget(targetId: string, updates: Partial<ProductivityTarget>) {
    if (!companyId) return;
    setTargetSaving(true);
    const t = targets.find((x) => x.id === targetId);
    if (!t) return;
    const merged = { ...t, ...updates };
    if (merged.type === "bigger") merged.max = merged.target;
    else merged.min = merged.target;
    await updateTarget(companyId, targetId, { name: merged.name, type: merged.type, unit: merged.unit, frequency: merged.frequency, weight: merged.weight, target: merged.target, min: merged.min, max: merged.max, monthlyTargets: merged.monthlyTargets, monthlyMin: merged.monthlyMin, monthlyMax: merged.monthlyMax });
    setTargets(targets.map((x) => x.id === targetId ? { ...x, ...merged } : x));
    setTargetSaving(false);
  }

  async function handleDeleteTarget(targetId: string) {
    if (!companyId || !window.confirm("Delete this target?")) return;
    await deleteTarget(companyId, targetId);
    setTargets(targets.filter((x) => x.id !== targetId));
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><p className="animate-pulse text-lg font-light text-primary/70">Loading...</p></div>;
  if (!member) return <div className="min-h-screen bg-white px-4 py-6 lg:px-8 lg:py-12"><div className="mx-auto max-w-3xl"><p className="text-sm text-accent">Team member not found.</p><button onClick={() => router.back()} className="mt-4 text-sm font-medium text-primary/50 transition hover:text-primary">← Go Back</button></div></div>;

  return (
    <div className="min-h-screen bg-white px-4 py-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-4xl">
        <button onClick={() => router.back()} className="text-sm font-medium text-primary/50 transition hover:text-primary">← Back</button>

        {/* Header */}
        <div className="mt-4 flex items-center gap-4">
          <UserAvatar name={member.name} size="lg" category={latestAssessment?.performanceCategory} />
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-primary">{member.name}</h1>
              {(member.status === "archived") && (
                <span className="rounded-[2px] bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary/50">
                  Archived{member.archivedReason ? ` — ${member.archivedReason}` : ""}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-primary/50">
              {member.role && <span>{member.role}</span>}
              {team && <span>· {team.name}</span>}
            </div>
          </div>
          {latestAssessment && (
            <span className={`ml-auto rounded-[4px] px-3 py-1 text-sm font-bold ${CATEGORY_COLORS[latestAssessment.performanceCategory].bg} ${CATEGORY_COLORS[latestAssessment.performanceCategory].text}`}>
              {latestAssessment.performanceCategory} — {CATEGORY_LABELS[latestAssessment.performanceCategory]}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="mt-6 flex gap-1 border-b border-brand-gray">
          {(["overview", "assess", "targets"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-semibold uppercase tracking-wider transition ${activeTab === tab ? "border-b-2 border-primary text-primary" : "text-primary/40 hover:text-primary/70"}`}>
              {tab === "overview" ? "Overview" : tab === "assess" ? "Assessment" : "Targets"}
            </button>
          ))}
        </div>

        {error && <p className="mt-4 text-sm text-accent">{error}</p>}
        {assessmentSuccess && <p className="mt-4 text-sm text-green-600">{assessmentSuccess}</p>}

        {/* ===== OVERVIEW TAB ===== */}
        {activeTab === "overview" && (
          <>
            {/* Score cards */}
            {latestAssessment && (
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Culture Fit</p>
                  <p className="mt-1 text-2xl font-bold text-primary">{latestAssessment.cultureFitScore.toFixed(1)}</p>
                </div>
                <div className="rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Productivity</p>
                  <p className="mt-1 text-2xl font-bold text-primary">{latestAssessment.productivityScore.toFixed(1)}</p>
                </div>
              </div>
            )}

            {/* Trend Chart */}
            {trendData.length >= 1 && (
              <div className="mt-6 rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/40">Score Trends</h2>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="quarter" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={25} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 4, border: "1px solid #e5e7eb" }} />
                    <Legend verticalAlign="bottom" iconSize={8} formatter={(v) => <span style={{ fontSize: 11, color: "#6b7280" }}>{v}</span>} />
                    <Line type="monotone" dataKey="cultureFit" name="Culture Fit" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="productivity" name="Productivity" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Action Items */}
            <div className="mt-6 rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/40">Action Items — Q{currentFQ} FY{currentFY}</h2>
              {openActions.map((a, i) => (
                <div key={i} className="mt-2 flex items-center gap-3 rounded-[4px] border border-brand-gray/50 p-2.5">
                  <input type="checkbox" checked={false} onChange={() => currentPlan && handleToggleAction(currentPlan.id, currentPlan.actions.indexOf(a))} className="h-4 w-4 accent-green-500" />
                  <span className="flex-1 text-sm text-primary">{a.description}</span>
                  {a.targetDate && <span className={`text-xs ${a.targetDate < now.toISOString().split("T")[0] ? "text-accent" : "text-primary/40"}`}>Due: {new Date(a.targetDate + "T00:00:00").toLocaleDateString()}</span>}
                </div>
              ))}
              {completedActions.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/30">Completed</p>
                  {completedActions.map((a, i) => (
                    <div key={i} className="mt-1 flex items-center gap-3 rounded-[4px] border border-brand-gray/30 p-2.5 opacity-60">
                      <input type="checkbox" checked={true} onChange={() => currentPlan && handleToggleAction(currentPlan.id, currentPlan.actions.indexOf(a))} className="h-4 w-4 accent-green-500" />
                      <span className="flex-1 text-sm text-primary line-through">{a.description}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <input type="text" value={newActionDesc} onChange={(e) => setNewActionDesc(e.target.value)} placeholder="New action item..."
                  className="flex-1 rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" onKeyDown={(e) => { if (e.key === "Enter") handleAddAction(); }} />
                <input type="date" value={newActionDate} onChange={(e) => setNewActionDate(e.target.value)} className="rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                <button onClick={handleAddAction} disabled={!newActionDesc.trim()} className="rounded-[4px] bg-primary px-3 py-1.5 text-xs font-semibold uppercase text-white transition hover:opacity-90 disabled:opacity-50">Add</button>
              </div>
              {currentPlan && currentPlan.notes.length > 0 && (
                <div className="mt-4 border-t border-brand-gray pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/30">Notes</p>
                  {currentPlan.notes.map((n, i) => (
                    <div key={i} className="mt-1 text-sm text-primary/70"><span className="text-[10px] text-primary/30">{n.createdAt?.toDate ? n.createdAt.toDate().toLocaleDateString() : ""} — </span>{n.text}</div>
                  ))}
                </div>
              )}
              {currentPlan && (
                <div className="mt-3 flex gap-2">
                  <input type="text" value={newNoteText} onChange={(e) => setNewNoteText(e.target.value)} placeholder="Add a note..."
                    className="flex-1 rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" onKeyDown={(e) => { if (e.key === "Enter") handleAddNote(); }} />
                  <button onClick={handleAddNote} disabled={!newNoteText.trim()} className="rounded-[4px] bg-primary px-3 py-1.5 text-xs font-semibold uppercase text-white transition hover:opacity-90 disabled:opacity-50">Add Note</button>
                </div>
              )}
            </div>

            {/* Assessment History */}
            {assessments.length > 0 && (
              <div className="mt-6">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/40">Assessment History</h2>
                <div className="mt-3 space-y-2">
                  {assessments.map((a) => {
                    const qKey = `${a.fiscalYear}-${a.fiscalQuarter}`;
                    const isExpanded = expandedQuarter === qKey;
                    // Find changes that occurred during this quarter
                    const quarterChanges = memberChanges.filter((c) =>
                      c.fiscalYear === a.fiscalYear && c.fiscalQuarter === a.fiscalQuarter
                    );
                    return (
                      <div key={a.id} className="rounded-[4px] border border-brand-gray bg-white shadow-sm">
                        <button onClick={() => setExpandedQuarter(isExpanded ? null : qKey)} className="flex w-full items-center gap-3 p-3 text-left">
                          <span className="text-sm font-semibold text-primary">Q{a.fiscalQuarter} FY{a.fiscalYear}</span>
                          <span className="text-xs text-primary/50">CF: {a.cultureFitScore.toFixed(1)} · Prod: {a.productivityScore.toFixed(1)}</span>
                          <span className={`rounded-[2px] px-2 py-0.5 text-[9px] font-semibold ${CATEGORY_COLORS[a.performanceCategory].bg} ${CATEGORY_COLORS[a.performanceCategory].text}`}>{a.performanceCategory}</span>
                          {quarterChanges.length > 0 && (
                            <span className="rounded-[2px] bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700">
                              {quarterChanges.length} change{quarterChanges.length !== 1 ? "s" : ""}
                            </span>
                          )}
                          <span className="ml-auto text-sm text-primary/40">{isExpanded ? "▲" : "▼"}</span>
                        </button>
                        {/* Change annotations */}
                        {quarterChanges.length > 0 && (
                          <div className="border-t border-brand-gray/50 px-3 py-2 space-y-1 bg-blue-50/50">
                            {quarterChanges.map((c) => (
                              <div key={c.id} className="flex items-center gap-2 text-[11px]">
                                <span className="font-semibold text-blue-600">
                                  {c.changeType === "team" && "Team changed"}
                                  {c.changeType === "promoted_to_leader" && "Promoted to leader"}
                                  {c.changeType === "leader_change" && "New team leader"}
                                  {c.changeType === "role" && "Role changed"}
                                  {c.changeType === "archived" && "Archived"}
                                  {c.changeType === "reporting_line" && "Reporting line changed"}
                                </span>
                                <span className="text-primary/50">
                                  {c.previousValue} → {c.newValue}
                                </span>
                                {c.effectiveDate && (
                                  <span className="text-primary/30">
                                    ({new Date(c.effectiveDate + "T00:00:00").toLocaleDateString()})
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {isExpanded && (
                          <div className="border-t border-brand-gray px-3 pb-3 pt-2 space-y-3">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/30">Culture Fit</p>
                              {a.cultureFitScores.map((cfs, i) => (
                                <div key={i} className="flex items-center justify-between text-xs mt-1"><span className="text-primary/70">{cfs.coreValueName}</span><span className="font-semibold text-primary">{RATING_LABELS[cfs.rating]}</span></div>
                              ))}
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/30">Productivity</p>
                              {a.productivityActuals.map((pa, i) => (
                                <div key={i} className="flex items-center justify-between text-xs mt-1"><span className="text-primary/70">{pa.targetName}</span><span className="font-semibold text-primary">{pa.actual !== null ? formatNumber(pa.actual) : "—"}</span></div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== ASSESS TAB ===== */}
        {activeTab === "assess" && (
          <>
            {/* Quarter selector */}
            <div className="mt-6 flex flex-wrap items-end gap-4">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Fiscal Year</label>
                <select value={assessYear} onChange={(e) => { const fy = Number(e.target.value); setAssessYear(fy); loadAssessmentForQuarter(fy, assessQuarter); }}
                  className="mt-1 block rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm font-semibold text-primary outline-none focus:border-primary">
                  {Array.from({ length: 5 }, (_, i) => currentFY + 1 - i).map((y) => <option key={y} value={y}>FY {y}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Quarter</label>
                <select value={assessQuarter} onChange={(e) => { const fq = Number(e.target.value); setAssessQuarter(fq); loadAssessmentForQuarter(assessYear, fq); }}
                  className="mt-1 block rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm font-semibold text-primary outline-none focus:border-primary">
                  {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
                </select>
              </div>
              <span className="pb-2 text-xs text-primary/40">
                {existingAssessment ? "Updating existing assessment" : "New assessment"}
              </span>
            </div>

            <div className="mt-4 flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={quarterIncomplete} onChange={(e) => { setQuarterIncomplete(e.target.checked); if (!e.target.checked) setCompletedMonths(1); }} className="h-4 w-4 accent-primary" />
                <span className="text-sm text-primary">Quarter incomplete?</span>
              </label>
              {quarterIncomplete && (
                <select value={completedMonths} onChange={(e) => setCompletedMonths(Number(e.target.value) as 1 | 2)}
                  className="rounded-[4px] border border-brand-gray bg-white px-3 py-1 text-sm font-semibold text-primary outline-none focus:border-primary">
                  <option value={1}>1 month</option>
                  <option value={2}>2 months</option>
                </select>
              )}
            </div>

            {assessmentLoading && <p className="mt-4 animate-pulse text-sm text-primary/50">Loading assessment...</p>}

            {/* Summary bar */}
            <div className="mt-4 rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm flex flex-wrap items-center gap-6">
              <div><p className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Culture Fit</p><p className="text-2xl font-bold text-primary">{cultureFitResult.finalScore.toFixed(1)}{cultureFitResult.cap && <span className="ml-1 text-xs font-normal text-accent">(capped at {cultureFitResult.cap})</span>}</p></div>
              <div><p className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Productivity</p><p className="text-2xl font-bold text-primary">{productivityScore.toFixed(1)}</p></div>
              <div><p className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Category</p>
                {category ? <span className={`inline-block rounded-[4px] px-3 py-1 text-sm font-bold ${CATEGORY_COLORS[category].bg} ${CATEGORY_COLORS[category].text}`}>{category} — {CATEGORY_LABELS[category]}</span>
                  : <span className="inline-block rounded-[4px] border border-brand-gray px-3 py-1 text-sm text-primary/40">Rate all core values</span>}
              </div>
              <div className="flex-1" />
              <button onClick={handleSaveAssessment} disabled={assessmentSaving}
                className="rounded-[4px] bg-primary px-6 py-2 font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50">
                {assessmentSaving ? "Saving..." : existingAssessment ? "Update" : "Save"}
              </button>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {/* Culture Fit */}
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/40">Culture Fit</h2>
                <div className="mt-3 space-y-2">
                  {cultureFitScores.map((cfs) => (
                    <div key={cfs.coreValueId} className="rounded-[4px] border border-brand-gray bg-white p-3 shadow-sm">
                      <p className="text-sm font-semibold text-primary">{cfs.coreValueName}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {RATINGS.map((r) => (
                          <button key={r} onClick={() => updateCultureFitRating(cfs.coreValueId, r)}
                            className={`rounded-[4px] px-3 py-1.5 text-xs font-semibold transition ${cfs.rating === r ? r === "frequent" ? "bg-red-500 text-white" : r === "occasional" ? "bg-yellow-400 text-primary" : "bg-green-500 text-white" : "border border-brand-gray bg-white text-primary/60 hover:bg-primary/5"}`}>
                            {RATING_LABELS[r]} ({ratingScores[r]})
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Productivity */}
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/40">Productivity</h2>
                <div className="mt-3 space-y-2">
                  {targets.map((t) => {
                    const pa = productivityActuals.find((p) => p.targetId === t.id);
                    const isMonthly = t.frequency === "monthly";
                    const prefix = t.unit === "dollars" ? "$" : "";
                    const suffix = t.unit === "percentage" ? "%" : "";
                    return (
                      <div key={t.id} className="rounded-[4px] border border-brand-gray bg-white p-3 shadow-sm">
                        <div className="flex items-baseline justify-between">
                          <p className="text-sm font-semibold text-primary">{t.name || "Untitled"}</p>
                          <span className="text-[10px] text-primary/40">Weight: {t.weight}%</span>
                        </div>
                        {!isMonthly && (
                          <div className="mt-2 relative">
                            <div className="flex items-center gap-3">
                              <label className="text-[9px] font-semibold uppercase tracking-wider text-primary/30">Actual</label>
                              <span className="text-[9px] text-primary/30">Target: {prefix}{formatNumber(t.target ?? 0)}{suffix}</span>
                            </div>
                            <div className="relative mt-1">
                              {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-primary/40">{prefix}</span>}
                              <input type="text" value={pa?.actual === null ? "" : formatNumber(pa?.actual ?? 0)}
                                onChange={(e) => { const raw = stripCommas(e.target.value); updateProductivityActual(t.id, raw === "" ? null : parseFloat(raw) || 0); }}
                                placeholder="Enter actual"
                                className={`w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary ${prefix ? "pl-7" : ""} ${suffix ? "pr-7" : ""}`} />
                              {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-primary/40">{suffix}</span>}
                            </div>
                          </div>
                        )}
                        {isMonthly && (
                          <div className="mt-2 space-y-1">
                            {(["month1", "month2", "month3"] as const).map((m, i) => {
                              if (quarterIncomplete && i + 1 > effectiveMonths) return null;
                              const mVal = pa?.monthlyActuals?.[m];
                              return (
                                <div key={m} className="flex items-center gap-2">
                                  <span className="w-16 text-[9px] font-semibold text-primary/30">Month {i + 1}</span>
                                  <span className="text-[9px] text-primary/30">Target: {prefix}{formatNumber(t.monthlyTargets?.[m] ?? 0)}{suffix}</span>
                                  <div className="relative flex-1">
                                    {prefix && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-primary/40">{prefix}</span>}
                                    <input type="text" value={mVal === null ? "" : formatNumber(mVal ?? 0)}
                                      onChange={(e) => { const raw = stripCommas(e.target.value); updateMonthlyActual(t.id, m, raw === "" ? null : parseFloat(raw) || 0); }}
                                      placeholder="Actual"
                                      className={`w-full rounded-[4px] border border-brand-gray bg-white px-2 py-1 text-xs text-primary outline-none focus:border-primary ${prefix ? "pl-5" : ""} ${suffix ? "pr-5" : ""}`} />
                                    {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-primary/40">{suffix}</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {targets.length === 0 && <p className="text-sm text-primary/40">No productivity targets set. Go to the Targets tab to add them.</p>}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ===== TARGETS TAB ===== */}
        {activeTab === "targets" && (
          <>
            {/* Weight bar */}
            {targets.length > 0 && (
              <div className="mt-6 rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary/40">Total Weight</span>
                  <span className={`text-sm font-bold ${weightsValid ? "text-green-600" : "text-accent"}`}>{weightTotal}%{weightsValid ? " ✓" : " (must be 100%)"}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-brand-gray/30">
                  <div className={`h-2 rounded-full transition-all ${weightsValid ? "bg-green-500" : weightTotal > 100 ? "bg-accent" : "bg-yellow-400"}`} style={{ width: `${Math.min(100, weightTotal)}%` }} />
                </div>
              </div>
            )}

            <div className="mt-4 space-y-2">
              {targets.map((t) => (
                <div key={t.id} className="rounded-[4px] border border-brand-gray bg-white shadow-sm">
                  <div className="flex items-center gap-3 p-3">
                    <button onClick={() => setExpandedTargetId(expandedTargetId === t.id ? null : t.id)} className="flex-1 text-left">
                      <span className="text-sm font-semibold text-primary">{t.name || "Untitled Target"}</span>
                      <span className="ml-2 text-xs text-primary/40">{t.weight}% · {t.type === "bigger" ? "Bigger" : "Smaller"} · {t.frequency === "monthly" ? "Monthly" : "Quarterly"}</span>
                    </button>
                    <button onClick={() => setExpandedTargetId(expandedTargetId === t.id ? null : t.id)} className="text-sm text-primary/50">{expandedTargetId === t.id ? "▲" : "▼"}</button>
                    <button onClick={() => handleDeleteTarget(t.id)} className="text-xs text-accent/50 transition hover:text-accent">✕</button>
                  </div>
                  {expandedTargetId === t.id && (
                    <TargetEditor target={t} onSave={(u) => handleSaveTarget(t.id, u)} saving={targetSaving} />
                  )}
                </div>
              ))}
            </div>

            {targets.length === 0 && <p className="mt-4 text-sm text-primary/40">No productivity targets yet.</p>}

            <button onClick={handleAddTarget} className="mt-4 rounded-[4px] bg-accent px-6 py-3 font-semibold uppercase tracking-wider text-white transition hover:opacity-90">+ Add Target</button>
          </>
        )}
      </div>
    </div>
  );
}

// --- Inline Target Editor ---
function TargetEditor({ target, onSave, saving }: { target: ProductivityTarget; onSave: (u: Partial<ProductivityTarget>) => void; saving: boolean }) {
  const [name, setName] = useState(target.name);
  const [type, setType] = useState<TargetType>(target.type);
  const [unit, setUnit] = useState<UnitType>(target.unit);
  const [frequency, setFrequency] = useState<Frequency>(target.frequency ?? "quarterly");
  const [weightStr, setWeightStr] = useState(String(target.weight));
  const [targetStr, setTargetStr] = useState(String(target.target));
  const [minStr, setMinStr] = useState(String(target.min));
  const [maxStr, setMaxStr] = useState(String(target.max));
  const [showThreshold, setShowThreshold] = useState(target.type === "bigger" ? target.min !== 0 : target.max !== 0);
  const [mTargets, setMTargets] = useState<MonthlyValues>(target.monthlyTargets ?? { ...DEFAULT_MONTHLY });
  const [mMin, setMMin] = useState<MonthlyValues>(target.monthlyMin ?? { ...DEFAULT_MONTHLY });
  const [mMax, setMMax] = useState<MonthlyValues>(target.monthlyMax ?? { ...DEFAULT_MONTHLY });
  const isBigger = type === "bigger";
  const isMonthly = frequency === "monthly";

  function handleSave() {
    const weight = parseFloat(weightStr) || 0;
    const targetVal = parseFloat(targetStr) || 0;
    const minVal = parseFloat(minStr) || 0;
    const maxVal = parseFloat(maxStr) || 0;
    if (isMonthly) {
      onSave({ name, type, unit, frequency, weight, target: 0, min: 0, max: 0, monthlyTargets: mTargets, monthlyMin: isBigger && showThreshold ? mMin : { ...DEFAULT_MONTHLY }, monthlyMax: !isBigger && showThreshold ? mMax : { ...DEFAULT_MONTHLY } });
    } else {
      onSave({ name, type, unit, frequency, weight, target: targetVal, min: isBigger && showThreshold ? minVal : 0, max: !isBigger && showThreshold ? maxVal : 0, monthlyTargets: null, monthlyMin: null, monthlyMax: null });
    }
  }

  const prefix = unit === "dollars" ? "$" : "";
  const suffix = unit === "percentage" ? "%" : "";

  return (
    <div className="border-t border-brand-gray px-4 pb-4 pt-3 space-y-4">
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">KPI Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Revenue"
          className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Type</label>
          <select value={type} onChange={(e) => { setType(e.target.value as TargetType); setShowThreshold(false); setMinStr("0"); setMaxStr("0"); }}
            className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary">
            <option value="bigger">Bigger is Better</option><option value="smaller">Smaller is Better</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Unit</label>
          <select value={unit} onChange={(e) => setUnit(e.target.value as UnitType)}
            className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary">
            <option value="units">Units</option><option value="dollars">Dollars ($)</option><option value="percentage">Percentage (%)</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Weight (%)</label>
          <input type="text" value={weightStr} onChange={(e) => setWeightStr(e.target.value)}
            className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Frequency</label>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}
            className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary">
            <option value="quarterly">Quarterly</option><option value="monthly">Monthly</option>
          </select>
        </div>
      </div>

      {!isMonthly && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Target</label>
              <div className="relative mt-1">
                {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-primary/40">{prefix}</span>}
                <input type="text" value={targetStr} onChange={(e) => setTargetStr(stripCommas(e.target.value))}
                  className={`w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary ${prefix ? "pl-7" : ""} ${suffix ? "pr-7" : ""}`} />
                {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-primary/40">{suffix}</span>}
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showThreshold} onChange={(e) => setShowThreshold(e.target.checked)} className="h-4 w-4 accent-primary" />
            <span className="text-xs text-primary/60">{isBigger ? "Set minimum threshold" : "Set maximum threshold"}</span>
          </label>
          {showThreshold && (
            <div className="grid grid-cols-2 gap-3">
              {isBigger && <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Minimum</label>
                <div className="relative mt-1">
                  {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-primary/40">{prefix}</span>}
                  <input type="text" value={minStr} onChange={(e) => setMinStr(stripCommas(e.target.value))}
                    className={`w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary ${prefix ? "pl-7" : ""} ${suffix ? "pr-7" : ""}`} />
                  {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-primary/40">{suffix}</span>}
                </div>
              </div>}
              {!isBigger && <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Maximum</label>
                <div className="relative mt-1">
                  {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-primary/40">{prefix}</span>}
                  <input type="text" value={maxStr} onChange={(e) => setMaxStr(stripCommas(e.target.value))}
                    className={`w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary ${prefix ? "pl-7" : ""} ${suffix ? "pr-7" : ""}`} />
                  {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-primary/40">{suffix}</span>}
                </div>
              </div>}
            </div>
          )}
        </div>
      )}

      {isMonthly && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showThreshold} onChange={(e) => setShowThreshold(e.target.checked)} className="h-4 w-4 accent-primary" />
            <span className="text-xs text-primary/60">{isBigger ? "Set minimum thresholds per month" : "Set maximum thresholds per month"}</span>
          </label>
          {(["month1", "month2", "month3"] as const).map((m, i) => (
            <div key={m} className="rounded-[4px] border border-brand-gray/50 bg-primary/[0.02] p-3">
              <p className="mb-2 text-xs font-semibold text-primary/60">Month {i + 1}</p>
              <div className={`grid gap-3 ${showThreshold ? "grid-cols-2" : "grid-cols-1"}`}>
                <div>
                  <label className="text-[9px] font-semibold uppercase tracking-wider text-primary/30">Target</label>
                  <div className="relative mt-1">
                    {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-primary/40">{prefix}</span>}
                    <input type="text" value={mTargets[m]} onChange={(e) => setMTargets({ ...mTargets, [m]: parseFloat(stripCommas(e.target.value)) || 0 })}
                      className={`w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary ${prefix ? "pl-7" : ""} ${suffix ? "pr-7" : ""}`} />
                    {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-primary/40">{suffix}</span>}
                  </div>
                </div>
                {showThreshold && isBigger && (
                  <div>
                    <label className="text-[9px] font-semibold uppercase tracking-wider text-primary/30">Minimum</label>
                    <div className="relative mt-1">
                      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-primary/40">{prefix}</span>}
                      <input type="text" value={mMin[m]} onChange={(e) => setMMin({ ...mMin, [m]: parseFloat(stripCommas(e.target.value)) || 0 })}
                        className={`w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary ${prefix ? "pl-7" : ""} ${suffix ? "pr-7" : ""}`} />
                      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-primary/40">{suffix}</span>}
                    </div>
                  </div>
                )}
                {showThreshold && !isBigger && (
                  <div>
                    <label className="text-[9px] font-semibold uppercase tracking-wider text-primary/30">Maximum</label>
                    <div className="relative mt-1">
                      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-primary/40">{prefix}</span>}
                      <input type="text" value={mMax[m]} onChange={(e) => setMMax({ ...mMax, [m]: parseFloat(stripCommas(e.target.value)) || 0 })}
                        className={`w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary ${prefix ? "pl-7" : ""} ${suffix ? "pr-7" : ""}`} />
                      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-primary/40">{suffix}</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={handleSave} disabled={saving}
        className="rounded-[4px] bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50">
        {saving ? "Saving..." : "Save Target"}
      </button>
    </div>
  );
}
