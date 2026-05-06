"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { getAuthorizedMemberIds } from "@/lib/team-auth";
import {
  getTargetsForMember,
  createTarget,
  updateTarget,
  deleteTarget,
} from "@/lib/productivity-service";
import { validateWeights } from "@/lib/productivity-scoring";
import { useKeyboardShortcuts } from "@/lib/useKeyboardShortcuts";
import type { TeamMember } from "@/types/team";
import type { ProductivityTarget, TargetType, UnitType, Frequency, MonthlyValues } from "@/types/productivity";
import { DEFAULT_MONTHLY } from "@/types/productivity";
import NumericInput from "@/components/NumericInput";
import TrashIcon from "@/components/TrashIcon";

export default function ProductivityTargetsPage() {
  const { profile } = useAuth();
  const { activeCompany } = useCompany();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedMember = searchParams.get("member") ?? "";

  const companyId = activeCompany?.id ?? profile?.companyId;

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState(preselectedMember);
  const [memberSearch, setMemberSearch] = useState("");
  const [targets, setTargets] = useState<ProductivityTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Expanded target for editing
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useKeyboardShortcuts({
    onEscape: () => setExpandedId(null),
  });

  useEffect(() => {
    if (!profile || !companyId) {
      if (profile?.role === "superadmin") router.replace("/admin");
      setLoading(false);
      return;
    }
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, companyId]);

  async function loadMembers() {
    if (!companyId) return;
    try {
      const { allMembers: data } = await getAuthorizedMemberIds(companyId, profile!);
      setTeamMembers(data);
      if (preselectedMember && data.some((m: TeamMember) => m.id === preselectedMember)) {
        loadTargets(preselectedMember);
      }
    } catch {
      setError("Failed to load team members.");
    }
    setLoading(false);
  }

  async function loadTargets(memberId: string) {
    if (!companyId) return;
    setLoadingTargets(true);
    try {
      const data = await getTargetsForMember(companyId, memberId);
      setTargets(data);
    } catch (err) {
      console.error("Load targets error:", err);
      setError("Failed to load targets.");
    }
    setLoadingTargets(false);
  }

  function handleSelectMember(memberId: string) {
    setSelectedMemberId(memberId);
    setExpandedId(null);
    if (memberId) loadTargets(memberId);
    else setTargets([]);
  }

  async function handleAddTarget() {
    if (!companyId || !selectedMemberId) return;
    try {
      const id = await createTarget(companyId, {
        memberId: selectedMemberId,
        name: "",
        type: "bigger",
        unit: "units",
        frequency: "quarterly",
        weight: 0,
        target: 0,
        min: 0,
        max: 0,
        monthlyTargets: null,
        monthlyMin: null,
        monthlyMax: null,
        order: targets.length,
      });
      const newTarget = {
        id,
        memberId: selectedMemberId,
        name: "",
        type: "bigger" as TargetType,
        unit: "units" as UnitType,
        frequency: "quarterly" as Frequency,
        weight: 0,
        target: 0,
        min: 0,
        max: 0,
        monthlyTargets: null,
        monthlyMin: null,
        monthlyMax: null,
        order: targets.length,
      } as ProductivityTarget;
      setTargets([...targets, newTarget]);
      setExpandedId(id);
    } catch {
      setError("Failed to add target.");
    }
  }

  async function handleSaveTarget(targetId: string, updates: Partial<ProductivityTarget>) {
    if (!companyId) return;
    setSaving(true);
    try {
      // Auto-set min/max based on type
      const target = targets.find((t) => t.id === targetId);
      if (!target) return;

      const merged = { ...target, ...updates };
      if (merged.type === "bigger") {
        merged.max = merged.target; // Max auto-set to Target
      } else {
        merged.min = merged.target; // Min auto-set to Target
      }

      await updateTarget(companyId, targetId, {
        name: merged.name,
        type: merged.type,
        unit: merged.unit,
        frequency: merged.frequency,
        weight: merged.weight,
        target: merged.target,
        min: merged.min,
        max: merged.max,
        monthlyTargets: merged.monthlyTargets,
        monthlyMin: merged.monthlyMin,
        monthlyMax: merged.monthlyMax,
      });

      setTargets(targets.map((t) => (t.id === targetId ? { ...t, ...merged } : t)));
    } catch {
      setError("Failed to save target.");
    }
    setSaving(false);
  }

  async function handleDeleteTarget(targetId: string) {
    if (!companyId || !window.confirm("Delete this target?")) return;
    try {
      await deleteTarget(companyId, targetId);
      setTargets(targets.filter((t) => t.id !== targetId));
      if (expandedId === targetId) setExpandedId(null);
    } catch {
      setError("Failed to delete target.");
    }
  }

  const { total: weightTotal, valid: weightsValid } = validateWeights(targets);
  const selectedMember = teamMembers.find((m) => m.id === selectedMemberId);

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
        <h1 className="text-2xl font-bold text-primary">Productivity Targets</h1>
        <p className="mt-1 text-sm text-primary/50">
          Set KPI targets for each team member. Per The Strength of Talent, each role has 1–3 KPIs that define success.
        </p>

        {error && <p className="mt-4 text-sm text-accent">{error}</p>}

        {/* Member selector with search */}
        <div className="mt-6">
          <label className="text-xs font-semibold uppercase tracking-wider text-primary/40">
            Team Member
          </label>
          <input
            type="text"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            placeholder="Search team members..."
            className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
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
              <button onClick={() => { setSelectedMemberId(""); handleSelectMember(""); setMemberSearch(""); }} className="ml-2 text-accent hover:opacity-70">Change</button>
            </p>
          )}
        </div>

        {selectedMemberId && (
          <>
            {/* Weight validation bar */}
            {targets.length > 0 && (
              <div className="mt-6 rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary/40">
                    Total Weight
                  </span>
                  <span className={`text-sm font-bold ${weightsValid ? "text-green-600" : "text-accent"}`}>
                    {weightTotal}%{weightsValid ? " ✓" : ` (must be 100%)`}
                  </span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-brand-gray/30">
                  <div
                    className={`h-2 rounded-full transition-all ${weightsValid ? "bg-green-500" : weightTotal > 100 ? "bg-accent" : "bg-yellow-400"}`}
                    style={{ width: `${Math.min(100, weightTotal)}%` }}
                  />
                </div>
              </div>
            )}

            {loadingTargets && (
              <p className="mt-4 animate-pulse text-sm text-primary/50">Loading targets...</p>
            )}

            {/* Targets list */}
            {!loadingTargets && (
              <div className="mt-4 space-y-2">
                {targets.map((t) => (
                  <TargetCard
                    key={t.id}
                    target={t}
                    isExpanded={expandedId === t.id}
                    onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
                    onSave={(updates) => handleSaveTarget(t.id, updates)}
                    onDelete={() => handleDeleteTarget(t.id)}
                    saving={saving}
                  />
                ))}
              </div>
            )}

            {!loadingTargets && targets.length === 0 && (
              <p className="mt-4 text-sm text-primary/40">
                No targets set for {selectedMember?.name || "this member"} yet.
              </p>
            )}

            {/* Add target button */}
            <button
              onClick={handleAddTarget}
              className="mt-4 rounded-[4px] bg-accent px-6 py-3 font-semibold uppercase tracking-wider text-white transition hover:opacity-90"
            >
              + Add Target
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// --- Unit-formatted Input ---

function UnitInput({
  value,
  onChange,
  unit,
  disabled,
  placeholder,
}: {
  value: number | null;
  onChange?: (val: number | null) => void;
  unit: UnitType;
  disabled?: boolean;
  placeholder?: string;
}) {
  const prefix = unit === "dollars" ? "$" : "";
  const suffix = unit === "percentage" ? "%" : "";
  return (
    <div className="relative mt-1">
      {prefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-primary/40">{prefix}</span>
      )}
      <NumericInput
        value={value}
        onChange={onChange ?? (() => {})}
        disabled={disabled}
        placeholder={placeholder}
        className={`w-full rounded-[4px] border border-brand-gray px-3 py-2 text-sm outline-none focus:border-primary ${
          prefix ? "pl-7" : ""
        } ${suffix ? "pr-7" : ""} ${
          disabled ? "bg-primary/5 text-primary/40" : "bg-white text-primary"
        }`}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-primary/40">{suffix}</span>
      )}
    </div>
  );
}

// --- Target Card Component ---

const MONTH_LABELS = ["Month 1", "Month 2", "Month 3"];

function TargetCard({
  target,
  isExpanded,
  onToggle,
  onSave,
  onDelete,
  saving,
}: {
  target: ProductivityTarget;
  isExpanded: boolean;
  onToggle: () => void;
  onSave: (updates: Partial<ProductivityTarget>) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(target.name);
  const [type, setType] = useState<TargetType>(target.type);
  const [unit, setUnit] = useState<UnitType>(target.unit);
  const [frequency, setFrequency] = useState<Frequency>(target.frequency ?? "quarterly");
  const [weightStr, setWeightStr] = useState(String(target.weight));

  // Quarterly values
  const [targetVal, setTargetVal] = useState<number | null>(target.target);
  const [minVal, setMinVal] = useState<number | null>(target.min);
  const [maxVal, setMaxVal] = useState<number | null>(target.max);

  // Threshold checkbox — show min (bigger) or max (smaller) only when checked
  const hasExistingThreshold = target.type === "bigger"
    ? (target.min !== 0 && target.min !== target.target)
    : (target.max !== 0 && target.max !== target.target);
  const hasExistingMonthlyThreshold = target.type === "bigger"
    ? (target.monthlyMin && (target.monthlyMin.month1 !== 0 || target.monthlyMin.month2 !== 0 || target.monthlyMin.month3 !== 0))
    : (target.monthlyMax && (target.monthlyMax.month1 !== 0 || target.monthlyMax.month2 !== 0 || target.monthlyMax.month3 !== 0));
  const [showThreshold, setShowThreshold] = useState(hasExistingThreshold || !!hasExistingMonthlyThreshold);

  // Monthly values
  const [mTargets, setMTargets] = useState<MonthlyValues>(target.monthlyTargets ?? { ...DEFAULT_MONTHLY });
  const [mMin, setMMin] = useState<MonthlyValues>(target.monthlyMin ?? { ...DEFAULT_MONTHLY });
  const [mMax, setMMax] = useState<MonthlyValues>(target.monthlyMax ?? { ...DEFAULT_MONTHLY });

  useEffect(() => {
    setName(target.name);
    setType(target.type);
    setUnit(target.unit);
    setFrequency(target.frequency ?? "quarterly");
    setWeightStr(String(target.weight));
    setTargetVal(target.target);
    setMinVal(target.min);
    setMaxVal(target.max);
    setMTargets(target.monthlyTargets ?? { ...DEFAULT_MONTHLY });
    setMMin(target.monthlyMin ?? { ...DEFAULT_MONTHLY });
    setMMax(target.monthlyMax ?? { ...DEFAULT_MONTHLY });
  }, [target]);

  function handleSave() {
    const weight = parseFloat(weightStr) || 0;
    const targetNum = targetVal ?? 0;
    const minNum = minVal ?? 0;
    const maxNum = maxVal ?? 0;

    if (frequency === "monthly") {
      const finalMMin = type === "bigger" && showThreshold ? mMin : { ...DEFAULT_MONTHLY };
      const finalMMax = type === "smaller" && showThreshold ? mMax : { ...DEFAULT_MONTHLY };
      onSave({
        name, type, unit, frequency, weight,
        target: 0, min: 0, max: 0,
        monthlyTargets: mTargets,
        monthlyMin: finalMMin,
        monthlyMax: finalMMax,
      });
    } else {
      onSave({
        name, type, unit, frequency, weight,
        target: targetNum,
        min: type === "bigger" && showThreshold ? minNum : 0,
        max: type === "smaller" && showThreshold ? maxNum : 0,
        monthlyTargets: null, monthlyMin: null, monthlyMax: null,
      });
    }
  }

  const isBigger = type === "bigger";
  const isMonthly = frequency === "monthly";
  const months = ["month1", "month2", "month3"] as const;

  function updateMonthly(
    setter: React.Dispatch<React.SetStateAction<MonthlyValues>>,
    month: "month1" | "month2" | "month3",
    value: number | null
  ) {
    setter((prev) => ({ ...prev, [month]: value ?? 0 }));
  }

  return (
    <div className="rounded-[4px] border border-brand-gray bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <button onClick={onToggle} className="flex flex-1 items-center gap-3 text-left">
          <div className="flex-1">
            <span className="text-sm font-semibold text-primary">
              {target.name || "Untitled Target"}
            </span>
            <span className="ml-2 text-xs text-primary/40">
              {target.weight}% · {isBigger ? "Bigger is Better" : "Smaller is Better"} · {frequency === "monthly" ? "Monthly" : "Quarterly"}
            </span>
          </div>
        </button>
        <button onClick={onToggle} className="px-1 text-sm text-primary/50">
          {isExpanded ? "▲" : "▼"}
        </button>
        <button onClick={onDelete} className="text-red-500 transition hover:text-red-700"
          title="Delete target" aria-label="Delete target">
          <TrashIcon />
        </button>
      </div>

      {/* Expanded edit form */}
      {isExpanded && (
        <div className="border-t border-brand-gray px-4 pb-4 pt-3 space-y-4">
          {/* Name */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">
              KPI Name / Description
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Revenue, Customer Satisfaction, Employee Turnover"
              className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
            />
          </div>

          {/* Type + Unit + Weight + Frequency */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Type</label>
              <select value={type} onChange={(e) => {
                setType(e.target.value as TargetType);
                setShowThreshold(false);
                setMinVal(0);
                setMaxVal(0);
                setMMin({ ...DEFAULT_MONTHLY });
                setMMax({ ...DEFAULT_MONTHLY });
              }}
                className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary">
                <option value="bigger">Bigger is Better</option>
                <option value="smaller">Smaller is Better</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Unit</label>
              <select value={unit} onChange={(e) => setUnit(e.target.value as UnitType)}
                className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary">
                <option value="units">Units</option>
                <option value="dollars">Dollars ($)</option>
                <option value="percentage">Percentage (%)</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Weight (%)</label>
              <input type="text" value={weightStr} onChange={(e) => setWeightStr(e.target.value)} placeholder="e.g., 30"
                className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Frequency</label>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}
                className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary">
                <option value="quarterly">Quarterly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>

          {/* Quarterly: Target + optional threshold */}
          {!isMonthly && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Target</label>
                  <UnitInput value={targetVal} onChange={setTargetVal} unit={unit} />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showThreshold}
                  onChange={(e) => setShowThreshold(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-xs text-primary/60">
                  {isBigger ? "Set minimum threshold" : "Set maximum threshold"}
                </span>
              </label>
              {showThreshold && (
                <div className="grid grid-cols-2 gap-3">
                  {isBigger && (
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Minimum</label>
                      <UnitInput value={minVal} onChange={setMinVal} unit={unit} placeholder="0" />
                      <p className="mt-0.5 text-[9px] text-primary/30">Must be ≤ Target</p>
                    </div>
                  )}
                  {!isBigger && (
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Maximum</label>
                      <UnitInput value={maxVal} onChange={setMaxVal} unit={unit} placeholder="Required" />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Monthly: 3 rows of Target + optional threshold */}
          {isMonthly && (
            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">
                Monthly Targets (3 months per quarter)
              </p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showThreshold}
                  onChange={(e) => setShowThreshold(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-xs text-primary/60">
                  {isBigger ? "Set minimum thresholds per month" : "Set maximum thresholds per month"}
                </span>
              </label>
              {months.map((m, i) => (
                <div key={m} className="rounded-[4px] border border-brand-gray/50 bg-primary/[0.02] p-3">
                  <p className="mb-2 text-xs font-semibold text-primary/60">{MONTH_LABELS[i]}</p>
                  <div className={`grid gap-3 ${showThreshold ? "grid-cols-2" : "grid-cols-1"}`}>
                    <div>
                      <label className="text-[9px] font-semibold uppercase tracking-wider text-primary/30">Target</label>
                      <UnitInput value={mTargets[m]} onChange={(v) => updateMonthly(setMTargets, m, v)} unit={unit} />
                    </div>
                    {showThreshold && isBigger && (
                      <div>
                        <label className="text-[9px] font-semibold uppercase tracking-wider text-primary/30">Minimum</label>
                        <UnitInput value={mMin[m]} onChange={(v) => updateMonthly(setMMin, m, v)} unit={unit} placeholder="0" />
                      </div>
                    )}
                    {showThreshold && !isBigger && (
                      <div>
                        <label className="text-[9px] font-semibold uppercase tracking-wider text-primary/30">Maximum</label>
                        <UnitInput value={mMax[m]} onChange={(v) => updateMonthly(setMMax, m, v)} unit={unit} placeholder="Required" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-[4px] bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Target"}
          </button>
        </div>
      )}
    </div>
  );
}
