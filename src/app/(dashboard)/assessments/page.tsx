"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { formatNumber } from "@/lib/formatNumber";
import NumericInput from "@/components/NumericInput";
import { useCompany } from "@/contexts/CompanyContext";
import { getCoreValues } from "@/lib/corevalue-service";
import { getAuthorizedMemberIds } from "@/lib/team-auth";
import { getTargetsForMember } from "@/lib/productivity-service";
import { calculateCultureFitScore } from "@/lib/culture-fit-scoring";
import { calculateTotalProductivityScore, validateWeights } from "@/lib/productivity-scoring";
import { assignCategory } from "@/lib/category-scoring";
import {
  getAssessmentForMember,
  createAssessment,
  updateAssessment,
} from "@/lib/assessment-service";
import { getFiscalYear, getFiscalQuarter } from "@/lib/fiscalUtils";
import { DEFAULT_SCORING_PARAMETERS, DEFAULT_CULTURE_FIT_RATING_SCORES, DEFAULT_CULTURE_FIT_CAPS } from "@/types/company";
import type { CoreValue } from "@/types/corevalue";
import type { TeamMember } from "@/types/team";
import type { ProductivityTarget, NullableMonthlyValues } from "@/types/productivity";
import type {
  CultureFitRating,
  CultureFitScore,
  ProductivityActual,
  Assessment,
  PerformanceCategory,
} from "@/types/assessment";
import {
  RATING_LABELS,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
} from "@/types/assessment";

const RATINGS: CultureFitRating[] = ["models", "lives", "occasional", "frequent"];

export default function AssessmentsPage() {
  const { profile } = useAuth();
  const { activeCompany } = useCompany();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedMember = searchParams.get("member") ?? "";

  const companyId = activeCompany?.id ?? profile?.companyId;
  const startMonth = activeCompany?.fiscalYearStartMonth ?? 1;
  const scoringParams = activeCompany?.scoringParameters ?? { ...DEFAULT_SCORING_PARAMETERS };
  const now = new Date();
  const currentFY = getFiscalYear(now, startMonth);
  const currentFQ = getFiscalQuarter(now, startMonth);

  const [selectedYear, setSelectedYear] = useState(currentFY);
  const [selectedQuarter, setSelectedQuarter] = useState(currentFQ);
  const [selectedMemberId, setSelectedMemberId] = useState(preselectedMember);
  const [memberSearch, setMemberSearch] = useState("");

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [coreValues, setCoreValues] = useState<CoreValue[]>([]);
  const [targets, setTargets] = useState<ProductivityTarget[]>([]);

  const [cultureFitScores, setCultureFitScores] = useState<CultureFitScore[]>([]);
  const [productivityActuals, setProductivityActuals] = useState<ProductivityActual[]>([]);
  const [existingAssessment, setExistingAssessment] = useState<Assessment | null>(null);

  const [quarterIncomplete, setQuarterIncomplete] = useState(false);
  const [completedMonths, setCompletedMonths] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(true);
  const [loadingMember, setLoadingMember] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentFY + 1 - i);

  useEffect(() => {
    if (!profile || !companyId) {
      if (profile?.role === "superadmin") router.replace("/admin");
      setLoading(false);
      return;
    }
    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, companyId]);

  async function loadInitialData() {
    if (!companyId) return;
    try {
      const [authResult, valuesData] = await Promise.all([
        getAuthorizedMemberIds(companyId, profile!),
        getCoreValues(companyId),
      ]);
      const membersData = authResult.allMembers;
      setTeamMembers(membersData);
      setCoreValues(valuesData);
      // Auto-select preselected member from URL
      if (preselectedMember && membersData.some((m) => m.id === preselectedMember)) {
        handleSelectMember(preselectedMember);
      }
    } catch (err) {
      console.error("Load error:", err);
      setError("Failed to load data.");
    }
    setLoading(false);
  }

  async function handleSelectMember(memberId: string) {
    setSelectedMemberId(memberId);
    setSuccess("");
    if (!memberId || !companyId) {
      setTargets([]);
      setCultureFitScores([]);
      setProductivityActuals([]);
      setExistingAssessment(null);
      return;
    }

    setLoadingMember(true);
    try {
      // Load targets for this member
      const memberTargets = await getTargetsForMember(companyId, memberId);
      setTargets(memberTargets);

      // Check for existing assessment this quarter
      const existing = await getAssessmentForMember(companyId, memberId, selectedYear, selectedQuarter);
      setExistingAssessment(existing);

      if (existing) {
        // Load existing scores, merging with current targets so new targets are editable
        setCultureFitScores(existing.cultureFitScores);
        const merged = memberTargets.map((t) => {
          const saved = existing.productivityActuals.find((pa) => pa.targetId === t.id);
          return saved ?? {
            targetId: t.id,
            targetName: t.name,
            actual: null,
            monthlyActuals: t.frequency === "monthly"
              ? { month1: null, month2: null, month3: null }
              : null,
          };
        });
        setProductivityActuals(merged);
      } else {
        // Initialize blank scores
        setCultureFitScores(
          coreValues.map((cv) => ({
            coreValueId: cv.id,
            coreValueName: cv.name,
            rating: "" as CultureFitRating,
          }))
        );
        setProductivityActuals(
          memberTargets.map((t) => ({
            targetId: t.id,
            targetName: t.name,
            actual: null,
            monthlyActuals: t.frequency === "monthly" ? { month1: null, month2: null, month3: null } : null,
          }))
        );
      }
    } catch (err) {
      console.error("Load member error:", err);
      setError("Failed to load member data.");
    }
    setLoadingMember(false);
  }

  // Live calculations — use company's configurable scoring parameters
  const ratingScores = scoringParams.cultureFitRatingScores ?? DEFAULT_CULTURE_FIT_RATING_SCORES;
  const fitCaps = scoringParams.cultureFitCaps ?? DEFAULT_CULTURE_FIT_CAPS;
  const cultureFitResult = calculateCultureFitScore(cultureFitScores, ratingScores, fitCaps);
  const effectiveMonths = quarterIncomplete ? completedMonths : 3;
  const productivityActualsMap: Record<string, number | null | NullableMonthlyValues> = {};
  for (const pa of productivityActuals) {
    const t = targets.find((tgt) => tgt.id === pa.targetId);
    if (t?.frequency === "monthly" && pa.monthlyActuals) {
      // For monthly targets, null out months beyond completedMonths
      productivityActualsMap[pa.targetId] = {
        month1: pa.monthlyActuals.month1,
        month2: effectiveMonths >= 2 ? pa.monthlyActuals.month2 : null,
        month3: effectiveMonths >= 3 ? pa.monthlyActuals.month3 : null,
      };
    } else if (t?.frequency === "quarterly" && quarterIncomplete) {
      // For quarterly targets with incomplete quarter, scale: actual * (completedMonths/3)
      // Actually, just pass through — the user enters what they have and we weight proportionally
      productivityActualsMap[pa.targetId] = pa.actual;
    } else {
      productivityActualsMap[pa.targetId] = pa.monthlyActuals ?? pa.actual;
    }
  }
  const productivityScore = calculateTotalProductivityScore(targets, productivityActualsMap);
  const { total: weightTotal, valid: weightsValid } = targets.length > 0 ? validateWeights(targets) : { total: 0, valid: true };
  const allCoreValuesRated = cultureFitScores.length > 0 && cultureFitScores.every((s) => s.rating);
  const isComplete = allCoreValuesRated;
  const category = isComplete ? assignCategory(cultureFitResult.finalScore, productivityScore, scoringParams) : null;

  function updateCultureFitRating(coreValueId: string, rating: CultureFitRating) {
    setCultureFitScores(
      cultureFitScores.map((s) =>
        s.coreValueId === coreValueId ? { ...s, rating } : s
      )
    );
  }

  function updateProductivityActual(targetId: string, actual: number | null) {
    setProductivityActuals(
      productivityActuals.map((pa) =>
        pa.targetId === targetId ? { ...pa, actual } : pa
      )
    );
  }

  function updateMonthlyActual(targetId: string, month: "month1" | "month2" | "month3", value: number | null) {
    setProductivityActuals(
      productivityActuals.map((pa) =>
        pa.targetId === targetId
          ? { ...pa, monthlyActuals: { ...(pa.monthlyActuals ?? { month1: null, month2: null, month3: null }), [month]: value } }
          : pa
      )
    );
  }

  async function handleSave() {
    if (!companyId || !selectedMemberId) return;
    const unrated = cultureFitScores.filter((s) => !s.rating);
    if (unrated.length > 0) {
      setError(`Please rate all core values before saving. ${unrated.length} unrated.`);
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");

    const member = teamMembers.find((m) => m.id === selectedMemberId);
    const data = {
      cultureFitScores,
      cultureFitScore: cultureFitResult.finalScore,
      productivityActuals,
      productivityScore,
      performanceCategory: (category ?? "MP") as PerformanceCategory,
    };

    try {
      if (existingAssessment) {
        await updateAssessment(companyId, existingAssessment.id, data);
        setExistingAssessment({ ...existingAssessment, ...data });
      } else {
        const id = await createAssessment(companyId, {
          ...data,
          memberId: selectedMemberId,
          memberName: member?.name ?? "",
          assessedByUserId: profile?.uid ?? "",
          fiscalYear: selectedYear,
          fiscalQuarter: selectedQuarter,
        });
        setExistingAssessment({ id, ...data } as Assessment);
      }
      setSuccess("Assessment saved.");
    } catch {
      setError("Failed to save assessment.");
    }
    setSaving(false);
  }

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
        <h1 className="text-2xl font-bold text-primary">Performance Assessment</h1>
        <p className="mt-1 text-sm text-primary/50">
          Step 2 of the Talent Density framework. Score each team member on Culture Fit and Productivity.
        </p>

        {error && <p className="mt-4 text-sm text-accent">{error}</p>}
        {success && <p className="mt-4 text-sm text-green-600">{success}</p>}

        {/* Quarter + Member selection */}
        <div className="mt-6 flex flex-wrap items-end gap-4">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Fiscal Year</label>
            <select value={selectedYear} onChange={(e) => { setSelectedYear(Number(e.target.value)); setSelectedMemberId(""); }}
              className="mt-1 block rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm font-semibold text-primary outline-none focus:border-primary">
              {yearOptions.map((y) => <option key={y} value={y}>FY {y}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Quarter</label>
            <select value={selectedQuarter} onChange={(e) => { setSelectedQuarter(Number(e.target.value)); setSelectedMemberId(""); }}
              className="mt-1 block rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm font-semibold text-primary outline-none focus:border-primary">
              {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Team Member</label>
            <input
              type="text"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search team members..."
              className="mt-1 block w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
            />
            {(memberSearch || !selectedMemberId) && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded-[4px] border border-brand-gray bg-white shadow-sm">
                {teamMembers
                  .filter((m) => !memberSearch || m.name.toLowerCase().includes(memberSearch.toLowerCase()) || (m.role && m.role.toLowerCase().includes(memberSearch.toLowerCase())))
                  .map((m) => (
                    <button key={m.id} onClick={() => { handleSelectMember(m.id); setMemberSearch(""); }}
                      className={`block w-full px-3 py-2 text-left text-sm transition hover:bg-primary/5 ${selectedMemberId === m.id ? "bg-primary/10 font-semibold text-primary" : "text-primary/70"}`}>
                      {m.name}{m.role ? ` — ${m.role}` : ""}
                    </button>
                  ))}
                {teamMembers.filter((m) => !memberSearch || m.name.toLowerCase().includes(memberSearch.toLowerCase())).length === 0 && (
                  <p className="px-3 py-2 text-xs text-primary/40">No matches</p>
                )}
              </div>
            )}
            {selectedMemberId && !memberSearch && (
              <p className="mt-1 text-xs text-primary/50">
                Selected: <span className="font-semibold text-primary">{teamMembers.find((m) => m.id === selectedMemberId)?.name}</span>
                <button onClick={() => { setSelectedMemberId(""); setMemberSearch(""); }} className="ml-2 text-accent hover:opacity-70">Change</button>
              </p>
            )}
          </div>
        </div>

        {/* Quarter Incomplete checkbox */}
        {selectedMemberId && (
          <div className="mt-4 flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={quarterIncomplete}
                onChange={(e) => { setQuarterIncomplete(e.target.checked); if (!e.target.checked) setCompletedMonths(1); }}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm text-primary">Quarter incomplete?</span>
            </label>
            {quarterIncomplete && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-primary/50">Months completed:</span>
                <select
                  value={completedMonths}
                  onChange={(e) => setCompletedMonths(Number(e.target.value) as 1 | 2)}
                  className="rounded-[4px] border border-brand-gray bg-white px-3 py-1 text-sm font-semibold text-primary outline-none focus:border-primary"
                >
                  <option value={1}>1 month</option>
                  <option value={2}>2 months</option>
                </select>
              </div>
            )}
          </div>
        )}

        {loadingMember && (
          <p className="mt-4 animate-pulse text-sm text-primary/50">Loading assessment data...</p>
        )}

        {selectedMemberId && !loadingMember && (
          <>
            {/* Summary bar */}
            <div className="mt-6 rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Culture Fit</p>
                  <p className="text-2xl font-bold text-primary">
                    {cultureFitResult.finalScore.toFixed(1)}
                    {cultureFitResult.cap && (
                      <span className="ml-1 text-xs font-normal text-accent">
                        (capped at {cultureFitResult.cap})
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Productivity</p>
                  <p className="text-2xl font-bold text-primary">{productivityScore.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Category</p>
                  {category ? (
                    <span className={`inline-block rounded-[4px] px-3 py-1 text-sm font-bold ${CATEGORY_COLORS[category].bg} ${CATEGORY_COLORS[category].text}`}>
                      {category} — {CATEGORY_LABELS[category]}
                    </span>
                  ) : (
                    <span className="inline-block rounded-[4px] border border-brand-gray px-3 py-1 text-sm text-primary/40">
                      Rate all core values to see category
                    </span>
                  )}
                </div>
                <div className="flex-1" />
                <div className="flex flex-col items-end gap-1">
                  {!weightsValid && targets.length > 0 && (
                    <p className="text-xs text-accent">
                      Target productivity weights total {weightTotal}% — must equal 100% before saving.
                    </p>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={saving || !weightsValid}
                    className="rounded-[4px] bg-primary px-6 py-2 font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : existingAssessment ? "Update Assessment" : "Save Assessment"}
                  </button>
                </div>
              </div>
            </div>

            {/* Two columns: Culture Fit + Productivity */}
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {/* Culture Fit */}
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/40">
                  Culture Fit Scoring
                </h2>
                <div className="mt-3 space-y-2">
                  {cultureFitScores.map((cfs) => (
                    <div key={cfs.coreValueId} className="rounded-[4px] border border-brand-gray bg-white p-3 shadow-sm">
                      <p className="text-sm font-semibold text-primary">{cfs.coreValueName}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {RATINGS.map((r) => (
                          <button
                            key={r}
                            onClick={() => updateCultureFitRating(cfs.coreValueId, r)}
                            className={`rounded-[4px] px-3 py-1.5 text-xs font-semibold transition ${
                              cfs.rating === r
                                ? r === "frequent"
                                  ? "bg-red-500 text-white"
                                  : r === "occasional"
                                    ? "bg-yellow-400 text-primary"
                                    : "bg-green-500 text-white"
                                : "border border-brand-gray bg-white text-primary/60 hover:bg-primary/5"
                            }`}
                          >
                            {RATING_LABELS[r]} ({ratingScores[r]})
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {cultureFitScores.length === 0 && (
                    <p className="text-sm text-primary/40">No core values defined. Add them in Core Values settings.</p>
                  )}
                </div>
              </div>

              {/* Productivity */}
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/40">
                  Productivity Scoring
                </h2>
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
                          <span className="text-[10px] text-primary/40">
                            Weight: {t.weight}% · Target: {prefix}{isMonthly ? "monthly" : t.target}{suffix}
                          </span>
                        </div>

                        {!isMonthly && (
                          <div className="mt-2">
                            <label className="text-[9px] font-semibold uppercase tracking-wider text-primary/30">Actual</label>
                            <div className="relative mt-1">
                              {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-primary/40">{prefix}</span>}
                              <NumericInput
                                value={pa?.actual ?? null}
                                onChange={(v) => updateProductivityActual(t.id, v)}
                                placeholder="Enter actual"
                                className={`w-full rounded-[4px] border border-brand-gray bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-primary ${prefix ? "pl-7" : ""} ${suffix ? "pr-7" : ""}`}
                              />
                              {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-primary/40">{suffix}</span>}
                            </div>
                          </div>
                        )}

                        {isMonthly && (
                          <div className="mt-2 space-y-1">
                            {(["month1", "month2", "month3"] as const).map((m, i) => {
                              const monthNum = i + 1;
                              const isAvailable = !quarterIncomplete || monthNum <= effectiveMonths;
                              if (!isAvailable) return null;
                              const mVal = pa?.monthlyActuals?.[m];
                              return (
                                <div key={m} className="flex items-center gap-2">
                                  <span className="w-16 text-[9px] font-semibold text-primary/30">Month {monthNum}</span>
                                  <span className="text-[9px] text-primary/30">
                                    Target: {prefix}{formatNumber(t.monthlyTargets?.[m] ?? 0)}{suffix}
                                  </span>
                                  <div className="relative flex-1">
                                    {prefix && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-primary/40">{prefix}</span>}
                                    <NumericInput
                                      value={mVal ?? null}
                                      onChange={(v) => updateMonthlyActual(t.id, m, v)}
                                      placeholder="Enter actual"
                                      className={`w-full rounded-[4px] border border-brand-gray bg-white px-2 py-1 text-xs text-primary outline-none focus:border-primary ${prefix ? "pl-5" : ""} ${suffix ? "pr-5" : ""}`}
                                    />
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
                  {targets.length === 0 && (
                    <p className="text-sm text-primary/40">No productivity targets set. Add them in Productivity Targets.</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
