"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { updateCompany } from "@/lib/company-service";
import { canManageCompany } from "@/lib/permissions";
import { DEFAULT_SCORING_PARAMETERS } from "@/types/company";
import type { ScoringParameters } from "@/types/company";

export default function CompanySettingsPage() {
  const { profile } = useAuth();
  const { activeCompany } = useCompany();
  const router = useRouter();

  const [name, setName] = useState("");
  const [paramStrings, setParamStrings] = useState({
    hpCultureFitMin: "",
    hpProductivityMin: "",
    lcfCultureFitMax: "",
    lpProductivityMax: "",
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
      const p = activeCompany.scoringParameters ?? { ...DEFAULT_SCORING_PARAMETERS };
      setParamStrings({
        hpCultureFitMin: String(p.hpCultureFitMin),
        hpProductivityMin: String(p.hpProductivityMin),
        lcfCultureFitMax: String(p.lcfCultureFitMax),
        lpProductivityMax: String(p.lpProductivityMax),
      });
    }
  }, [profile, activeCompany, router]);

  // Parse strings to numbers for display and save
  const params: ScoringParameters = {
    hpCultureFitMin: parseFloat(paramStrings.hpCultureFitMin) || 0,
    hpProductivityMin: parseFloat(paramStrings.hpProductivityMin) || 0,
    lcfCultureFitMax: parseFloat(paramStrings.lcfCultureFitMax) || 0,
    lpProductivityMax: parseFloat(paramStrings.lpProductivityMax) || 0,
  };

  async function handleSave() {
    if (!companyId || !name.trim()) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await updateCompany(companyId, {
        name: name.trim(),
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

        {/* Scoring Parameters */}
        <div className="mt-6 rounded-[4px] border border-brand-gray bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/40">
            Scoring Parameters
          </h2>
          <p className="mt-1 text-xs text-primary/50">
            Per the book, use .5 values so no team member ever falls exactly on a threshold line.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-primary/40">
                HP Culture Fit Threshold
              </label>
              <p className="text-[10px] text-primary/40">
                Culture fit must be above this to qualify as HP (default: 8.5 → displayed as ≥9)
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
                Productivity must be above this to qualify as HP (default: 8.5 → displayed as ≥9)
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
                Culture fit below this = Low Culture Fit, regardless of productivity (default: 7.5)
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
                Productivity below this = Low Producing, unless already LCF (default: 6.5)
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
                  Culture Fit &gt; {params.hpCultureFitMin} AND Productivity &gt; {params.hpProductivityMin}
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
                  Culture Fit &lt; {params.lcfCultureFitMax} (any productivity)
                </p>
              </div>
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
