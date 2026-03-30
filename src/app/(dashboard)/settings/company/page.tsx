"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { updateCompany } from "@/lib/company-service";
import { canManageCompany } from "@/lib/permissions";
import { DEFAULT_SCORING_PARAMETERS, DEFAULT_CULTURE_FIT_RATING_SCORES, DEFAULT_CULTURE_FIT_CAPS } from "@/types/company";
import type { ScoringParameters } from "@/types/company";

export default function CompanySettingsPage() {
  const { profile } = useAuth();
  const { activeCompany } = useCompany();
  const router = useRouter();

  const [name, setName] = useState("");
  const [fiscalStartMonth, setFiscalStartMonth] = useState(1);
  const [paramStrings, setParamStrings] = useState({
    hpCultureFitMin: "",
    hpProductivityMin: "",
    lcfCultureFitMax: "",
    lpProductivityMax: "",
  });
  const [ratingScoreStrings, setRatingScoreStrings] = useState({
    models: "10", lives: "9", occasional: "7", frequent: "1",
  });
  const [capStrings, setCapStrings] = useState({
    occasionalCap: "8.4", frequentCap: "7.4",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const companyId = activeCompany?.id ?? profile?.companyId;

  useEffect(() => {
    if (!profile || !canManageCompany(profile)) {
      router.replace("/dashboard");
      return;
    }
    if (activeCompany) {
      setName(activeCompany.name);
      setFiscalStartMonth(activeCompany.fiscalYearStartMonth ?? 1);
      const p = activeCompany.scoringParameters ?? { ...DEFAULT_SCORING_PARAMETERS };
      setParamStrings({
        hpCultureFitMin: String(p.hpCultureFitMin),
        hpProductivityMin: String(p.hpProductivityMin),
        lcfCultureFitMax: String(p.lcfCultureFitMax),
        lpProductivityMax: String(p.lpProductivityMax),
      });
      const rs = p.cultureFitRatingScores ?? { ...DEFAULT_CULTURE_FIT_RATING_SCORES };
      setRatingScoreStrings({
        models: String(rs.models), lives: String(rs.lives),
        occasional: String(rs.occasional), frequent: String(rs.frequent),
      });
      const caps = p.cultureFitCaps ?? { ...DEFAULT_CULTURE_FIT_CAPS };
      setCapStrings({
        occasionalCap: String(caps.occasionalCap), frequentCap: String(caps.frequentCap),
      });
    }
  }, [profile, activeCompany, router]);

  // Parse strings to numbers for display and save
  const params: ScoringParameters = {
    hpCultureFitMin: parseFloat(paramStrings.hpCultureFitMin) || 0,
    hpProductivityMin: parseFloat(paramStrings.hpProductivityMin) || 0,
    lcfCultureFitMax: parseFloat(paramStrings.lcfCultureFitMax) || 0,
    lpProductivityMax: parseFloat(paramStrings.lpProductivityMax) || 0,
    cultureFitRatingScores: {
      models: parseFloat(ratingScoreStrings.models) || 10,
      lives: parseFloat(ratingScoreStrings.lives) || 9,
      occasional: parseFloat(ratingScoreStrings.occasional) || 7,
      frequent: parseFloat(ratingScoreStrings.frequent) || 1,
    },
    cultureFitCaps: {
      occasionalCap: parseFloat(capStrings.occasionalCap) || 8.4,
      frequentCap: parseFloat(capStrings.frequentCap) || 7.4,
    },
  };

  async function handleSave() {
    if (!companyId || !name.trim()) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await updateCompany(companyId, {
        name: name.trim(),
        fiscalYearStartMonth: fiscalStartMonth,
        scoringParameters: params,
      });
      setSuccess("Settings saved.");
    } catch {
      setError("Failed to save settings.");
    }
    setSaving(false);
  }

  function updateParam(key: keyof ScoringParameters, value: string) {
    setParamStrings({ ...paramStrings, [key]: value });
  }

  if (!companyId) {
    return (
      <div className="px-4 py-6 lg:px-8 lg:py-12">
        <p className="text-sm text-primary/70">No company selected.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white px-4 py-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-primary">Company Settings</h1>

        {error && <p className="mt-4 text-sm text-accent">{error}</p>}
        {success && <p className="mt-4 text-sm text-green-600">{success}</p>}

        {/* Company Name */}
        <div className="mt-8 rounded-[4px] border border-brand-gray bg-white p-6 shadow-sm">
          <label className="text-xs font-semibold uppercase tracking-wider text-primary/40">
            Company Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-2 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
          />
        </div>

        {/* Fiscal Year Start Month */}
        <div className="mt-6 rounded-[4px] border border-brand-gray bg-white p-6 shadow-sm">
          <label className="text-xs font-semibold uppercase tracking-wider text-primary/40">
            Fiscal Year Start Month
          </label>
          <select
            value={fiscalStartMonth}
            onChange={(e) => setFiscalStartMonth(Number(e.target.value))}
            className="mt-2 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
          >
            {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>

        {/* Scoring Parameters */}
        <div className="mt-6 rounded-[4px] border border-brand-gray bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/40">
              Scoring Parameters
            </h2>
            <button
              onClick={() => setParamStrings({
                hpCultureFitMin: String(DEFAULT_SCORING_PARAMETERS.hpCultureFitMin),
                hpProductivityMin: String(DEFAULT_SCORING_PARAMETERS.hpProductivityMin),
                lcfCultureFitMax: String(DEFAULT_SCORING_PARAMETERS.lcfCultureFitMax),
                lpProductivityMax: String(DEFAULT_SCORING_PARAMETERS.lpProductivityMax),
              })}
              className="text-[10px] font-semibold text-accent transition hover:opacity-70"
            >
              Reset to Recommended
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-primary/40">
                HP Culture Fit Threshold
              </label>
              <p className="text-[10px] text-primary/40">
                Culture fit must be greater than or equal to this to qualify as HP
              </p>
              <input
                type="text"
                value={paramStrings.hpCultureFitMin}
                onChange={(e) => updateParam("hpCultureFitMin", e.target.value)}
                className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-primary/40">
                HP Productivity Threshold
              </label>
              <p className="text-[10px] text-primary/40">
                Productivity must be greater than or equal to this to qualify as HP
              </p>
              <input
                type="text"
                value={paramStrings.hpProductivityMin}
                onChange={(e) => updateParam("hpProductivityMin", e.target.value)}
                className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-primary/40">
                LCF Culture Fit Threshold
              </label>
              <p className="text-[10px] text-primary/40">
                Culture fit less than or equal to this = Low Culture Fit, regardless of productivity
              </p>
              <input
                type="text"
                value={paramStrings.lcfCultureFitMax}
                onChange={(e) => updateParam("lcfCultureFitMax", e.target.value)}
                className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-primary/40">
                LP Productivity Threshold
              </label>
              <p className="text-[10px] text-primary/40">
                Productivity less than this = Low Producing, unless already LCF
              </p>
              <input
                type="text"
                value={paramStrings.lpProductivityMax}
                onChange={(e) => updateParam("lpProductivityMax", e.target.value)}
                className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Visual preview */}
          <div className="mt-6 rounded-[4px] border border-brand-gray bg-primary/[0.02] p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary/40">
              Category Preview
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-[4px] border border-green-300 bg-green-50 p-3">
                <p className="font-semibold text-green-700">High Performing (HP)</p>
                <p className="mt-1 text-green-600">
                  Culture Fit ≥ {params.hpCultureFitMin} AND Productivity ≥ {params.hpProductivityMin}
                </p>
              </div>
              <div className="rounded-[4px] border border-yellow-300 bg-yellow-50 p-3">
                <p className="font-semibold text-yellow-700">Medium Performing (MP)</p>
                <p className="mt-1 text-yellow-600">
                  Everyone not in HP, LP, or LCF
                </p>
              </div>
              <div className="rounded-[4px] border border-red-300 bg-red-50 p-3">
                <p className="font-semibold text-red-700">Low Producing (LP)</p>
                <p className="mt-1 text-red-600">
                  Productivity &lt; {params.lpProductivityMax} (unless LCF)
                </p>
              </div>
              <div className="rounded-[4px] border border-red-300 bg-red-50 p-3">
                <p className="font-semibold text-red-700">Low Culture Fit (LCF)</p>
                <p className="mt-1 text-red-600">
                  Culture Fit ≤ {params.lcfCultureFitMax} (any productivity)
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Culture Fit Scoring Guidelines */}
        <div className="mt-6 rounded-[4px] border border-brand-gray bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/40">
              Culture Fit Rating Scores
            </h2>
            <button
              onClick={() => {
                setRatingScoreStrings({ models: "10", lives: "9", occasional: "7", frequent: "1" });
                setCapStrings({ occasionalCap: "8.4", frequentCap: "7.4" });
              }}
              className="text-[10px] font-semibold text-accent transition hover:opacity-70"
            >
              Reset to Recommended
            </button>
          </div>
          <p className="mt-1 text-xs text-primary/50">
            Score assigned to each rating level when calculating the culture fit average.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(["models", "lives", "occasional", "frequent"] as const).map((key) => (
              <div key={key}>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-primary/40">
                  {key === "models" ? "Models" : key === "lives" ? "Lives" : key === "occasional" ? "Occasional Challenges" : "Frequent Challenges"}
                </label>
                <input
                  type="text"
                  value={ratingScoreStrings[key]}
                  onChange={(e) => setRatingScoreStrings({ ...ratingScoreStrings, [key]: e.target.value })}
                  className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
                />
              </div>
            ))}
          </div>

          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-primary/40">
            Culture Fit Score Caps
          </h2>
          <p className="mt-1 text-xs text-primary/50">
            Maximum culture fit score when a team member has any core value rated at these levels.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-primary/40">
                Occasional Challenges Cap
              </label>
              <p className="text-[10px] text-primary/40">
                If any core value is &quot;Occasional Challenges&quot;, total cannot exceed this
              </p>
              <input
                type="text"
                value={capStrings.occasionalCap}
                onChange={(e) => setCapStrings({ ...capStrings, occasionalCap: e.target.value })}
                className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-primary/40">
                Frequent Challenges Cap
              </label>
              <p className="text-[10px] text-primary/40">
                If any core value is &quot;Frequent Challenges&quot;, total cannot exceed this (use lower cap if both apply)
              </p>
              <input
                type="text"
                value={capStrings.frequentCap}
                onChange={(e) => setCapStrings({ ...capStrings, frequentCap: e.target.value })}
                className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="mt-6 rounded-[4px] bg-primary px-6 py-3 font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
