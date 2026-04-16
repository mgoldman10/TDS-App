"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { getAllTeamMembers, getTeams, getMemberChanges } from "@/lib/team-service";
import { getAuthorizedMemberIds } from "@/lib/team-auth";
import { getAssessmentHistory, getAssessmentForMember, createAssessment, updateAssessment } from "@/lib/assessment-service";
import { getTargetsForMember, createTarget, updateTarget, deleteTarget } from "@/lib/productivity-service";
import { getActionPlanForMember, createActionPlan, addAction, updateActions, addNote } from "@/lib/actionplan-service";
import { ensureDefaultCoaches } from "@/lib/coach-service";
import AskMikeButton from "@/components/askmike/AskMikeButton";
import ChatPanel from "@/components/askmike/ChatPanel";
import { buildNameMapping } from "@/lib/anonymize";
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
import type { Coach } from "@/types/coach";
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
  const [memberPlan, setMemberPlan] = useState<ActionPlan | null>(null);
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
  const [newActionOwner, setNewActionOwner] = useState("");
  const [newActionDate, setNewActionDate] = useState("");

  // AskMike coach state
  const [peopleCoach, setPeopleCoach] = useState<Coach | null>(null);
  const [difficultCoach, setDifficultCoach] = useState<Coach | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [activeCoach, setActiveCoach] = useState<Coach | null>(null);
  const [activeCoachIsPeople, setActiveCoachIsPeople] = useState(false);
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
    if (!companyId || !profile) return;
    try {
      // Check authorization first
      const { authorizedMemberIds } = await getAuthorizedMemberIds(companyId, profile);
      if (!authorizedMemberIds.has(memberId)) {
        router.replace("/members");
        return;
      }

      const [allMembers, allTeams, assessmentData, targetData, planData, valuesData, changesData, coachesData] = await Promise.all([
        getAllTeamMembers(companyId),
        getTeams(companyId),
        getAssessmentHistory(companyId, memberId),
        getTargetsForMember(companyId, memberId),
        getActionPlanForMember(companyId, memberId),
        getCoreValues(companyId),
        getMemberChanges(companyId, memberId),
        ensureDefaultCoaches().catch(() => [] as Coach[]),
      ]);
      const m = allMembers.find((tm) => tm.id === memberId);
      setMember(m ?? null);
      if (m) setTeam(allTeams.find((t) => t.id === m.teamId) ?? null);
      // Sort newest-first (year desc, then quarter desc) since the query only orders by year
      const sortedAssessments = [...assessmentData].sort((a, b) =>
        b.fiscalYear !== a.fiscalYear ? b.fiscalYear - a.fiscalYear : b.fiscalQuarter - a.fiscalQuarter
      );
      setAssessments(sortedAssessments);
      setTargets(targetData);
      setMemberPlan(planData);
      setCoreValues(valuesData);
      setMemberChanges(changesData);
      const pc = coachesData.find((c) => c.name.toLowerCase().includes("people"));
      const dc = coachesData.find((c) => c.name.toLowerCase().includes("difficult"));
      if (pc) setPeopleCoach(pc);
      if (dc) setDifficultCoach(dc);

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
  const openActions = (memberPlan?.actions ?? []).filter((a: ActionItem) => !a.completedAt).sort((a: ActionItem, b: ActionItem) => (a.targetDate || "9999") < (b.targetDate || "9999") ? -1 : 1);
  const completedActions = (memberPlan?.actions ?? []).filter((a: ActionItem) => a.completedAt);
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
    let plan = memberPlan;
    if (!plan) {
      const id = await createActionPlan(companyId, { memberId, memberName: member?.name ?? "" });
      plan = { id, memberId, memberName: member?.name ?? "", actions: [], notes: [], createdAt: null, updatedAt: null } as unknown as ActionPlan;
      setMemberPlan(plan);
    }
    const action: ActionItem = { description: newActionDesc.trim(), targetDate: newActionDate, completedAt: null, owner: newActionOwner || profile?.displayName || "" };
    await addAction(companyId, plan.id, plan.actions, action);
    setMemberPlan({ ...plan, actions: [...plan.actions, action] });
    setNewActionDesc(""); setNewActionOwner(""); setNewActionDate("");
  }

  async function handleToggleAction(idx: number) {
    if (!companyId || !memberPlan) return;
    const updated = [...memberPlan.actions];
    updated[idx] = { ...updated[idx], completedAt: updated[idx].completedAt ? null : new Date().toISOString().split("T")[0] };
    await updateActions(companyId, memberPlan.id, updated);
    setMemberPlan({ ...memberPlan, actions: updated });
  }

  async function handleDeleteAction(idx: number) {
    if (!companyId || !memberPlan) return;
    if (!window.confirm("Delete this action item? This cannot be undone.")) return;
    const updated = memberPlan.actions.filter((_, i) => i !== idx);
    await updateActions(companyId, memberPlan.id, updated);
    setMemberPlan({ ...memberPlan, actions: updated });
  }

  async function handleChangeOwner(idx: number, newOwner: string) {
    if (!companyId || !memberPlan) return;
    const updated = [...memberPlan.actions];
    updated[idx] = { ...updated[idx], owner: newOwner };
    await updateActions(companyId, memberPlan.id, updated);
    setMemberPlan({ ...memberPlan, actions: updated });
  }

  async function handleAddNote() {
    if (!companyId || !newNoteText.trim() || !memberPlan) return;
    await addNote(companyId, memberPlan.id, memberPlan.notes, newNoteText.trim());
    setMemberPlan({ ...memberPlan, notes: [...memberPlan.notes, { text: newNoteText.trim(), createdAt: { toDate: () => new Date() } }] } as ActionPlan);
    setNewNoteText("");
  }

  function buildCoachContext(): string {
    const parts: string[] = [];
    parts.push(`Team Member: ${member?.name ?? "Unknown"}`);
    if (member?.role) parts.push(`Role: ${member.role}`);
    if (team) parts.push(`Team: ${team.name}`);
    if (latestAssessment) {
      parts.push(`\nPerformance Category: ${latestAssessment.performanceCategory} — ${CATEGORY_LABELS[latestAssessment.performanceCategory]}`);
      parts.push(`Overall Culture Fit Score: ${latestAssessment.cultureFitScore.toFixed(1)}`);
      parts.push(`Overall Productivity Score: ${latestAssessment.productivityScore.toFixed(1)}`);

      // Detailed core value ratings
      if (latestAssessment.cultureFitScores.length > 0) {
        parts.push(`\nCulture Fit — Core Value Ratings:`);
        latestAssessment.cultureFitScores.forEach((cfs) => {
          parts.push(`- ${cfs.coreValueName}: ${RATING_LABELS[cfs.rating]} (${ratingScores[cfs.rating]})`);
        });
      }

      // Detailed productivity targets and actuals
      if (latestAssessment.productivityActuals.length > 0) {
        parts.push(`\nProductivity — Targets & Actuals:`);
        latestAssessment.productivityActuals.forEach((pa) => {
          const t = targets.find((tgt) => tgt.id === pa.targetId);
          const prefix = t?.unit === "dollars" ? "$" : "";
          const suffix = t?.unit === "percentage" ? "%" : "";
          if (t) {
            if (t.frequency === "monthly" && pa.monthlyActuals) {
              const m1 = pa.monthlyActuals.month1;
              const m2 = pa.monthlyActuals.month2;
              const m3 = pa.monthlyActuals.month3;
              parts.push(`- ${pa.targetName} (Weight: ${t.weight}%, Monthly):`);
              parts.push(`    Month 1: Actual ${prefix}${m1 ?? "N/A"}${suffix}, Target ${prefix}${t.monthlyTargets?.month1 ?? 0}${suffix}`);
              parts.push(`    Month 2: Actual ${prefix}${m2 ?? "N/A"}${suffix}, Target ${prefix}${t.monthlyTargets?.month2 ?? 0}${suffix}`);
              parts.push(`    Month 3: Actual ${prefix}${m3 ?? "N/A"}${suffix}, Target ${prefix}${t.monthlyTargets?.month3 ?? 0}${suffix}`);
            } else {
              parts.push(`- ${pa.targetName} (Weight: ${t.weight}%): Actual ${prefix}${pa.actual ?? "N/A"}${suffix}, Target ${prefix}${t.target}${suffix}`);
            }
          } else {
            parts.push(`- ${pa.targetName}: Actual ${pa.actual ?? "N/A"}`);
          }
        });
      }
    }
    if (openActions.length > 0) {
      parts.push(`\nOpen Action Items:`);
      openActions.forEach((a: ActionItem) => parts.push(`- ${a.description}${a.owner ? ` (owner: ${a.owner})` : ""}${a.targetDate ? ` (due: ${a.targetDate})` : ""}`));
    }
    const recentNotes = (memberPlan?.notes ?? []).slice(0, 5);
    if (recentNotes.length > 0) {
      parts.push(`\nRecent Coaching Notes:`);
      recentNotes.forEach((n) => parts.push(`- ${n.text}`));
    }

    // --- Current Quarter Highlights ---
    if (latestAssessment) {
      const highlights: string[] = [];
      const prod = latestAssessment.productivityScore;
      const fit = latestAssessment.cultureFitScore;
      const cat = latestAssessment.performanceCategory;

      // Overall performance interpretation
      if (cat === "HP") {
        highlights.push(`High Performer — strong contributions across both productivity and culture fit`);
      } else if (cat === "LP") {
        highlights.push(`Low Producer — productivity is below expectations and needs attention`);
      } else if (cat === "LCF") {
        highlights.push(`Low Culture Fit — productivity may be adequate but culture fit is a concern`);
      } else {
        if (prod >= 8.5) highlights.push(`Solid productivity this quarter (${prod.toFixed(1)}/10)`);
        else if (prod < 6.0) highlights.push(`Productivity below threshold this quarter (${prod.toFixed(1)}/10)`);
        else highlights.push(`Moderate productivity this quarter (${prod.toFixed(1)}/10)`);
      }

      if (fit >= 9.0) highlights.push(`Exceptional culture fit score (${fit.toFixed(1)}/10)`);
      else if (fit < 6.0) highlights.push(`Culture fit score is low (${fit.toFixed(1)}/10) — values alignment may need discussion`);

      // Note a significant gap between productivity and culture fit
      if (Math.abs(prod - fit) >= 2.0) {
        if (prod > fit) highlights.push(`Notable gap: productivity (${prod.toFixed(1)}) significantly higher than culture fit (${fit.toFixed(1)})`);
        else highlights.push(`Notable gap: culture fit (${fit.toFixed(1)}) significantly higher than productivity (${prod.toFixed(1)})`);
      }

      // Per-target performance vs goal
      latestAssessment.productivityActuals.forEach((pa) => {
        const t = targets.find((tgt) => tgt.id === pa.targetId);
        if (!t || t.target === 0) return;
        if (t.frequency === "quarterly" && pa.actual != null) {
          const pct = pa.actual / t.target;
          const prefix = t.unit === "dollars" ? "$" : "";
          const suffix = t.unit === "percentage" ? "%" : "";
          if (t.type === "bigger" && pct >= 1.1) highlights.push(`${pa.targetName}: exceeded target by ${((pct - 1) * 100).toFixed(0)}% (actual: ${prefix}${pa.actual}${suffix}, target: ${prefix}${t.target}${suffix})`);
          else if (t.type === "bigger" && pct < 0.75) highlights.push(`${pa.targetName}: significantly below target — ${(pct * 100).toFixed(0)}% of goal (actual: ${prefix}${pa.actual}${suffix}, target: ${prefix}${t.target}${suffix})`);
        }
      });

      parts.push(`\nCurrent Quarter Highlights:`);
      highlights.forEach((h) => parts.push(`- ${h}`));
    }

    // --- Performance Trend (Last 4 Quarters) ---
    if (assessments.length >= 2) {
      const recent = assessments.slice(0, 4); // newest first
      const oldest = recent[recent.length - 1];
      const newest = recent[0];
      const prodDelta = newest.productivityScore - oldest.productivityScore;
      const fitDelta = newest.cultureFitScore - oldest.cultureFitScore;
      // On a 0–10 scale, ±0.5 is a meaningful change
      const trendLabel = (delta: number) => delta >= 0.5 ? "IMPROVING" : delta <= -0.5 ? "DECLINING" : "consistent";
      const quarterLabel = (a: Assessment) => `Q${a.fiscalQuarter} FY${a.fiscalYear}`;

      parts.push(`\nPerformance Trend (Last ${recent.length} Quarters):`);
      parts.push(`${recent.map(quarterLabel).reverse().join(" → ")}`);
      parts.push(`Productivity: ${recent.map((a) => a.productivityScore.toFixed(0)).reverse().join(" → ")} (${trendLabel(prodDelta)} ${prodDelta >= 0 ? "+" : ""}${prodDelta.toFixed(0)} pts)`);
      parts.push(`Culture Fit: ${recent.map((a) => a.cultureFitScore.toFixed(0)).reverse().join(" → ")} (${trendLabel(fitDelta)} ${fitDelta >= 0 ? "+" : ""}${fitDelta.toFixed(0)} pts)`);

      // Category progression
      const categories = recent.map((a) => CATEGORY_LABELS[a.performanceCategory]).reverse();
      const allSameCategory = categories.every((c) => c === categories[0]);
      if (allSameCategory && recent.length >= 3) {
        parts.push(`Category: consistently ${categories[0]} for ${recent.length} quarters`);
      } else {
        parts.push(`Category: ${categories.join(" → ")}`);
      }

      // Per-target trends — find targets that appear in 2+ assessments
      const targetTrends: string[] = [];
      const seenTargetIds = new Set<string>();
      recent[0].productivityActuals.forEach((pa) => {
        if (seenTargetIds.has(pa.targetId)) return;
        seenTargetIds.add(pa.targetId);
        const t = targets.find((tgt) => tgt.id === pa.targetId);
        if (!t) return;

        // Gather actuals across quarters (oldest to newest)
        const history = recent
          .map((a) => a.productivityActuals.find((x) => x.targetId === pa.targetId))
          .filter(Boolean)
          .reverse();
        if (history.length < 2) return;

        const prefix = t.unit === "dollars" ? "$" : "";
        const suffix = t.unit === "percentage" ? "%" : "";

        if (t.frequency === "monthly") {
          const avgs = history.map((h) => {
            if (!h?.monthlyActuals) return null;
            const vals = [h.monthlyActuals.month1, h.monthlyActuals.month2, h.monthlyActuals.month3].filter((v) => v != null) as number[];
            return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
          });
          const validAvgs = avgs.filter((v) => v != null) as number[];
          if (validAvgs.length < 2) return;
          const delta = validAvgs[validAvgs.length - 1] - validAvgs[0];
          const label = trendLabel(t.type === "bigger" ? delta : -delta);
          targetTrends.push(`- ${pa.targetName}: ${label} (avg: ${validAvgs.map((v) => `${prefix}${v.toFixed(0)}${suffix}`).join(" → ")})`);
        } else {
          const actuals = history.map((h) => h?.actual);
          const validActuals = actuals.filter((v) => v != null) as number[];
          if (validActuals.length < 2) return;
          const delta = validActuals[validActuals.length - 1] - validActuals[0];
          const label = trendLabel(t.type === "bigger" ? delta : -delta);
          // Check if consistently hitting/exceeding target
          const allHitting = validActuals.every((v) => t.type === "bigger" ? v >= t.target : v <= t.target);
          const noneHitting = validActuals.every((v) => t.type === "bigger" ? v < t.target : v > t.target);
          const qualifier = allHitting ? " — consistently meeting or exceeding target" : noneHitting ? " — consistently below target" : "";
          targetTrends.push(`- ${pa.targetName}: ${label} (${validActuals.map((v) => `${prefix}${v}${suffix}`).join(" → ")})${qualifier}`);
        }
      });
      if (targetTrends.length > 0) {
        parts.push(`\nPer-Target Trends:`);
        targetTrends.forEach((t) => parts.push(t));
      }

      // Coaching prompt hint
      const prodTrend = trendLabel(prodDelta);
      const fitTrend = trendLabel(fitDelta);
      const isHighPerformer = newest.performanceCategory === "HP";
      const isUnderperformer = newest.performanceCategory === "LP" || newest.performanceCategory === "LCF";
      const hints: string[] = [];

      if (prodTrend === "IMPROVING" && !isUnderperformer) {
        hints.push("Productivity is trending up. Consider opening by recognizing this improvement — it may be a good time to raise the bar or discuss expanding their scope.");
      } else if (prodTrend === "DECLINING") {
        hints.push("Productivity has been declining. Consider asking the leader whether they'd like to focus this session on diagnosing root causes or building a recovery plan.");
      }
      if (fitTrend === "DECLINING") {
        hints.push("Culture fit scores have been declining. This may warrant a conversation about values alignment.");
      } else if (fitTrend === "IMPROVING") {
        hints.push("Culture fit is improving — worth acknowledging.");
      }
      if (isHighPerformer && prodTrend === "consistent") {
        hints.push("Consistent High Performer. Consider discussing stretch goals or leadership development opportunities.");
      }
      if (isUnderperformer && prodTrend !== "IMPROVING") {
        hints.push("Persistent underperformance warrants a direct conversation. Consider discussing whether expectations are clear and what specific support is needed.");
      }

      if (hints.length > 0) {
        parts.push(`\nNote for coach:`);
        hints.forEach((h) => parts.push(`- ${h}`));
      }
    }

    return parts.join("\n");
  }

  function buildPeopleCoachIntro(): string {
    if (!latestAssessment || !member) {
      return peopleCoach?.chatIntro ?? "I'm here to assist you with coaching strategies for any situation. How can I help?";
    }
    const firstName = member.name.split(" ")[0];
    const cat = latestAssessment.performanceCategory;
    const prod = latestAssessment.productivityScore;

    // Trend direction across available quarters
    let trendUp = false;
    let trendDown = false;
    if (assessments.length >= 2) {
      const recent = assessments.slice(0, 4);
      const prodDelta = recent[0].productivityScore - recent[recent.length - 1].productivityScore;
      if (prodDelta >= 0.5) trendUp = true;
      else if (prodDelta <= -0.5) trendDown = true;
    }

    // Best and worst quarterly productivity targets by % of goal
    const ratingOrder: Record<string, number> = { models: 4, lives: 3, occasional: 2, frequent: 1 };
    type TargetPerf = { name: string; pct: number };
    const targetPerfs: TargetPerf[] = [];
    latestAssessment.productivityActuals.forEach((pa) => {
      const t = targets.find((tgt) => tgt.id === pa.targetId);
      if (!t || t.target === 0 || t.frequency !== "quarterly" || pa.actual == null) return;
      const pct = t.type === "bigger" ? pa.actual / t.target : t.target / Math.max(pa.actual, 0.01);
      targetPerfs.push({ name: pa.targetName, pct });
    });
    targetPerfs.sort((a, b) => b.pct - a.pct);
    const bestTarget = targetPerfs.length > 0 && targetPerfs[0].pct >= 1.0 ? targetPerfs[0] : null;
    const worstTarget = targetPerfs.length > 0 && targetPerfs[targetPerfs.length - 1].pct < 0.85 ? targetPerfs[targetPerfs.length - 1] : null;

    // Best and worst core values by rating
    const ratedCVs = latestAssessment.cultureFitScores.filter((cfs) => cfs.rating);
    ratedCVs.sort((a, b) => (ratingOrder[b.rating] ?? 0) - (ratingOrder[a.rating] ?? 0));
    const bestCV = ratedCVs.length > 0 && ratedCVs[0].rating === "models" ? ratedCVs[0] : null;
    const worstCV = ratedCVs.length > 0 && (ratedCVs[ratedCVs.length - 1].rating === "occasional" || ratedCVs[ratedCVs.length - 1].rating === "frequent") ? ratedCVs[ratedCVs.length - 1] : null;

    // Build intro + specific detail + closing
    let intro = "";
    let detail = "";
    let closing = "What would you like to focus on in your next coaching conversation?";

    if (cat === "HP") {
      intro = trendUp
        ? `${firstName} is on a roll — they're a High Performer and productivity keeps improving!`
        : `Looks like ${firstName} is doing great — they're a High Performer this quarter!`;
      if (bestTarget) detail = ` ${bestTarget.name} is a real standout.`;
      else if (bestCV) detail = ` They really seem to model ${bestCV.coreValueName}.`;

    } else if (cat === "LP") {
      intro = trendDown
        ? `It looks like ${firstName} has been struggling — productivity has been slipping over the last few quarters.`
        : `It looks like ${firstName} is having a tough quarter on productivity.`;
      if (worstTarget) detail = ` ${worstTarget.name} is significantly behind target.`;
      else if (worstCV) detail = ` There also seem to be some concerns around ${worstCV.coreValueName}.`;
      closing = "Want to talk through how to approach the coaching conversation?";

    } else if (cat === "LCF") {
      intro = `It looks like ${firstName} may have some culture fit concerns worth discussing.`;
      if (worstCV) detail = ` ${worstCV.coreValueName} seems to be the main area of concern.`;
      closing = "How can I help you prepare for that conversation?";

    } else {
      // MP
      if (trendUp) {
        intro = `Good news — ${firstName}'s productivity has been trending up!`;
        if (bestTarget) detail = ` ${bestTarget.name} is looking particularly strong.`;
      } else if (trendDown) {
        intro = `It looks like ${firstName}'s productivity has been slipping a bit recently.`;
        if (worstTarget) detail = ` ${worstTarget.name} seems to be the main area of concern.`;
        closing = "Want to talk through how to address it?";
      } else if (prod < 6.0) {
        intro = `It looks like ${firstName} is struggling with productivity this quarter.`;
        if (worstTarget) detail = ` ${worstTarget.name} is significantly behind target.`;
        closing = "Want to talk through how to approach the coaching conversation?";
      } else {
        intro = `${firstName} is performing at the Medium Performer level this quarter — there's definitely room to grow.`;
        if (worstCV) detail = ` One area to focus on: ${worstCV.coreValueName}.`;
        else if (worstTarget) detail = ` ${worstTarget.name} might be worth discussing.`;
        else if (bestTarget) detail = ` ${bestTarget.name} is a bright spot, but there's still room to develop.`;
      }
    }

    return `${intro}${detail} ${closing}`;
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
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/40">Action Items</h2>
              {openActions.length === 0 && completedActions.length === 0 && (
                <p className="mt-2 text-sm text-primary/40">No action items yet.</p>
              )}
              {openActions.map((a: ActionItem, i: number) => {
                const actionIdx = memberPlan?.actions.indexOf(a) ?? -1;
                return (
                  <div key={i} className="mt-2 flex items-center gap-3 rounded-[4px] border border-brand-gray/50 p-2.5">
                    <input type="checkbox" checked={false} onChange={() => { if (actionIdx >= 0) handleToggleAction(actionIdx); }} className="h-4 w-4 accent-green-500" />
                    <span className="flex-1 text-sm text-primary">{a.description}</span>
                    <select
                      value={a.owner ?? ""}
                      onChange={(e) => { if (actionIdx >= 0) handleChangeOwner(actionIdx, e.target.value); }}
                      className="rounded-[2px] border border-brand-gray/50 bg-white px-1.5 py-0.5 text-[10px] text-primary/60 outline-none"
                    >
                      <option value="">Unassigned</option>
                      {profile?.displayName && <option value={profile.displayName}>{profile.displayName}</option>}
                      {member && member.name !== profile?.displayName && <option value={member.name}>{member.name}</option>}
                    </select>
                    {a.targetDate && <span className={`text-xs whitespace-nowrap ${a.targetDate < now.toISOString().split("T")[0] ? "text-accent" : "text-primary/40"}`}>Due: {new Date(a.targetDate + "T00:00:00").toLocaleDateString()}</span>}
                    <button onClick={() => { if (actionIdx >= 0) handleDeleteAction(actionIdx); }} className="text-xs text-accent/30 transition hover:text-accent" title="Delete action">✕</button>
                  </div>
                );
              })}
              {completedActions.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/30">Completed</p>
                  {completedActions.map((a: ActionItem, i: number) => {
                    const actionIdx = memberPlan?.actions.indexOf(a) ?? -1;
                    return (
                      <div key={i} className="mt-1 flex items-center gap-3 rounded-[4px] border border-brand-gray/30 p-2.5 opacity-60">
                        <input type="checkbox" checked={true} onChange={() => { if (actionIdx >= 0) handleToggleAction(actionIdx); }} className="h-4 w-4 accent-green-500" />
                        <span className="flex-1 text-sm text-primary line-through">{a.description}</span>
                        {a.owner && <span className="text-[10px] text-primary/30">{a.owner}</span>}
                        <button onClick={() => { if (actionIdx >= 0) handleDeleteAction(actionIdx); }} className="text-xs text-accent/30 transition hover:text-accent" title="Delete action">✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <input type="text" value={newActionDesc} onChange={(e) => setNewActionDesc(e.target.value)} placeholder="New action item..."
                  className="flex-1 rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" onKeyDown={(e) => { if (e.key === "Enter") handleAddAction(); }} />
                <div className="flex gap-2">
                  <select
                    value={newActionOwner}
                    onChange={(e) => setNewActionOwner(e.target.value)}
                    className="flex-1 sm:flex-none rounded-[4px] border border-brand-gray bg-white px-2 py-1.5 text-xs text-primary outline-none focus:border-primary"
                  >
                    <option value="">{profile?.displayName ?? "Me"}</option>
                    {member && member.name !== profile?.displayName && <option value={member.name}>{member.name}</option>}
                  </select>
                  <input type="date" value={newActionDate} onChange={(e) => setNewActionDate(e.target.value)} className="rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" />
                  <button onClick={handleAddAction} disabled={!newActionDesc.trim()} className="rounded-[4px] bg-primary px-3 py-1.5 text-xs font-semibold uppercase text-white transition hover:opacity-90 disabled:opacity-50 whitespace-nowrap">Add</button>
                </div>
              </div>
              {memberPlan && memberPlan.notes.length > 0 && (
                <div className="mt-4 border-t border-brand-gray pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/30">Coaching Notes</p>
                  {[...memberPlan.notes].reverse().map((n, i) => (
                    <div key={i} className="mt-1 text-sm text-primary/70"><span className="text-[10px] text-primary/30">{n.createdAt?.toDate ? n.createdAt.toDate().toLocaleDateString() : ""} — </span>{n.text}</div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <input type="text" value={newNoteText} onChange={(e) => setNewNoteText(e.target.value)} placeholder="Add a coaching note..."
                  className="flex-1 rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary" onKeyDown={(e) => { if (e.key === "Enter") handleAddNote(); }} />
                <button onClick={handleAddNote} disabled={!newNoteText.trim()} className="rounded-[4px] bg-primary px-3 py-1.5 text-xs font-semibold uppercase text-white transition hover:opacity-90 disabled:opacity-50 whitespace-nowrap">Add Note</button>
              </div>
            </div>

            {/* AskMike Coaches */}
            {(peopleCoach || difficultCoach) && (
              <div className="mt-4 flex flex-wrap gap-3">
                {peopleCoach && (
                  <AskMikeButton label="AskMike People Coach" onClick={() => { setActiveCoach(peopleCoach); setActiveCoachIsPeople(true); setShowChat(true); }} />
                )}
                {difficultCoach && (
                  <AskMikeButton label="AskMike Difficult Conversations Coach" onClick={() => { setActiveCoach(difficultCoach); setActiveCoachIsPeople(false); setShowChat(true); }} />
                )}
              </div>
            )}

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
        {/* AskMike ChatPanel */}
        {activeCoach && (
          <ChatPanel
            key={activeCoach.id}
            coachId={activeCoach.id}
            coachName={activeCoach.name}
            chatIntro={activeCoachIsPeople ? buildPeopleCoachIntro() : activeCoach.chatIntro}
            context={buildCoachContext()}
            isOpen={showChat}
            onClose={() => setShowChat(false)}
            userId={profile?.uid ?? ""}
            userDisplayName={profile?.displayName ?? ""}
            companyId={companyId ?? ""}
            memberId={memberId}
            memberName={member?.name ?? null}
            nameMapping={buildNameMapping(member?.name, team?.name, profile?.displayName, openActions.map((a: ActionItem) => a.owner))}
            onGenerateActions={undefined}
          />
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
