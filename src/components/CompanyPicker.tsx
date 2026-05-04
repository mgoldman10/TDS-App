"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { getCompany } from "@/lib/company-service";
import type { UserRole } from "@/types/auth";

interface MembershipDisplay {
  companyId: string;
  companyName: string;
  role: UserRole;
}

const ROLE_LABEL: Record<UserRole, string> = {
  superadmin: "Super Admin",
  company_admin: "Company Admin",
  senior_leader: "Senior Leader",
  leader: "Leader",
};

export default function CompanyPicker() {
  const { memberships } = useAuth();
  const { setActiveCompanyId, closePicker, activeCompany } = useCompany();
  const [items, setItems] = useState<MembershipDisplay[]>([]);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const resolved = await Promise.all(
        memberships.map(async (m) => {
          const c = await getCompany(m.companyId);
          if (!c || c.isActive === false) return null;
          return {
            companyId: m.companyId,
            companyName: c.name,
            role: m.role,
          };
        })
      );
      if (!cancelled) {
        setItems(resolved.filter((x): x is MembershipDisplay => x !== null));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [memberships]);

  async function handlePick(companyId: string) {
    setSubmitting(companyId);
    setError("");
    try {
      await setActiveCompanyId(companyId);
    } catch {
      setError("Failed to switch company. Please try again.");
      setSubmitting(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-primary/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="company-picker-title"
    >
      <div className="w-full max-w-md rounded-[4px] bg-white p-8 shadow-xl">
        <h2
          id="company-picker-title"
          className="mb-1 text-lg font-bold uppercase tracking-wider text-primary"
        >
          Select a Company
        </h2>
        <p className="mb-6 text-sm text-primary/70">
          You belong to more than one company. Choose which one you&apos;d like
          to work in.
        </p>

        {error && (
          <p className="mb-4 rounded-[4px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <ul className="space-y-2">
          {items.map((item) => {
            const isActive = activeCompany?.id === item.companyId;
            const isBusy = submitting === item.companyId;
            return (
              <li key={item.companyId}>
                <button
                  type="button"
                  onClick={() => handlePick(item.companyId)}
                  disabled={!!submitting}
                  className={`flex w-full items-center justify-between rounded-[4px] border px-4 py-3 text-left transition ${
                    isActive
                      ? "border-accent bg-accent/5"
                      : "border-brand-gray hover:border-primary/30 hover:bg-gray-50"
                  } ${submitting && !isBusy ? "opacity-50" : ""}`}
                >
                  <span>
                    <span className="block text-sm font-semibold text-primary">
                      {item.companyName}
                    </span>
                    <span className="text-xs uppercase tracking-wider text-primary/50">
                      {ROLE_LABEL[item.role]}
                    </span>
                  </span>
                  {isBusy && (
                    <span className="text-xs uppercase tracking-wider text-primary/60">
                      Loading…
                    </span>
                  )}
                  {isActive && !isBusy && (
                    <span className="text-xs uppercase tracking-wider text-accent">
                      Current
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {activeCompany && (
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={closePicker}
              disabled={!!submitting}
              className="rounded-[4px] border border-brand-gray px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
