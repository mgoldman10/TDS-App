"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
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

  // Superadmin creation
  const [showSuperadminForm, setShowSuperadminForm] = useState(false);
  const [saName, setSaName] = useState("");
  const [saEmail, setSaEmail] = useState("");
  const [saCreating, setSaCreating] = useState(false);
  const [saPassword, setSaPassword] = useState("");
  const [saError, setSaError] = useState("");

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

  async function handleCreateSuperadmin() {
    if (!saName.trim() || !saEmail.trim()) return;
    setSaCreating(true);
    setSaError("");
    setSaPassword("");
    try {
      const res = await fetch("/api/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: null,
          email: saEmail.trim(),
          displayName: saName.trim(),
          role: "superadmin",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaError(data.error || "Failed to create superadmin.");
      } else {
        const emailUsed = saEmail.trim();
        try {
          await sendPasswordResetEmail(auth, emailUsed);
          setSaPassword(`__email_sent__${emailUsed}`);
        } catch {
          setSaPassword(data.tempPassword);
        }
        setSaName("");
        setSaEmail("");
      }
    } catch {
      setSaError("Failed to create superadmin.");
    }
    setSaCreating(false);
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

        {/* Superadmin Management */}
        <div className="mt-10 border-t-2 border-brand-gray pt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-primary">Superadmin Users</h2>
            <button
              onClick={() => setShowSuperadminForm(!showSuperadminForm)}
              className="rounded-[4px] bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90"
            >
              {showSuperadminForm ? "Cancel" : "+ Add Superadmin"}
            </button>
          </div>

          {showSuperadminForm && (
            <div className="mt-4 rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm space-y-3">
              {saError && <p className="text-sm text-accent">{saError}</p>}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <input
                  type="text"
                  value={saName}
                  onChange={(e) => setSaName(e.target.value)}
                  placeholder="Full name"
                  className="rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
                />
                <input
                  type="email"
                  value={saEmail}
                  onChange={(e) => setSaEmail(e.target.value)}
                  placeholder="Email"
                  className="rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
                />
                <button
                  onClick={handleCreateSuperadmin}
                  disabled={saCreating || !saName.trim() || !saEmail.trim()}
                  className="rounded-[4px] bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {saCreating ? "Creating..." : "Create Superadmin"}
                </button>
              </div>
              {saPassword && (
                <div className="rounded-[4px] border border-green-300 bg-green-50 p-3">
                  {saPassword.startsWith("__email_sent__") ? (
                    <>
                      <p className="text-sm text-green-800">
                        Superadmin created. A password setup email has been sent to{" "}
                        <strong>{saPassword.replace("__email_sent__", "")}</strong>.
                      </p>
                      <p className="mt-1 text-xs text-green-600">
                        They will receive an email with a link to set their password.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-green-800">
                        Superadmin created. Temporary password:{" "}
                        <code className="rounded bg-green-100 px-2 py-0.5 font-mono text-sm font-bold">
                          {saPassword}
                        </code>
                      </p>
                      <p className="mt-1 text-xs text-green-600">
                        Share this with the user. They can reset it via &quot;Forgot Password?&quot; on the login page.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
