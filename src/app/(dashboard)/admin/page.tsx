"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { getCompanies, createCompany } from "@/lib/company-service";
import type { Company } from "@/types/company";

export default function AdminPage() {
  const { profile } = useAuth();
  const { setActiveCompanyId } = useCompany();
  const router = useRouter();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!profile || profile.role !== "superadmin") {
      router.replace("/dashboard");
      return;
    }
    loadCompanies();
  }, [profile, router]);

  async function loadCompanies() {
    try {
      const data = await getCompanies();
      setCompanies(data);
    } catch {
      // silently handle
    }
    setLoading(false);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const id = await createCompany(newName.trim());
      setCompanies([...companies, { id, name: newName.trim() } as Company]);
      setNewName("");
    } catch {
      alert("Failed to create company.");
    }
    setCreating(false);
  }

  function handleSelect(companyId: string) {
    setActiveCompanyId(companyId);
    router.push("/dashboard");
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
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary">Client Dashboard</h1>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Company name"
              className="rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="rounded-[4px] bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {creating ? "Creating..." : "+ New Company"}
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {companies.map((c) => (
            <div
              key={c.id}
              className="rounded-[4px] border border-brand-gray bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-primary">{c.name}</h2>
                </div>
                <button
                  onClick={() => handleSelect(c.id)}
                  className="text-sm font-semibold text-accent transition hover:opacity-70"
                >
                  Select →
                </button>
              </div>
            </div>
          ))}
        </div>

        {companies.length === 0 && (
          <p className="mt-8 text-center text-sm text-primary/40">
            No companies yet. Create your first one above.
          </p>
        )}
      </div>
    </div>
  );
}
