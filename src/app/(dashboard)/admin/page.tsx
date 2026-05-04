"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import {
  getCompanies,
  getArchivedCompanies,
  createCompany,
} from "@/lib/company-service";
import type { Company } from "@/types/company";

export default function AdminPage() {
  const { profile } = useAuth();
  const { setActiveCompanyId } = useCompany();
  const router = useRouter();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [archived, setArchived] = useState<Company[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyCompanyId, setBusyCompanyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  // Delete confirmation modal state
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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
    loadAll();
  }, [profile, router]);

  async function loadAll() {
    try {
      const [active, gone] = await Promise.all([
        getCompanies(),
        getArchivedCompanies(),
      ]);
      setCompanies(active);
      setArchived(gone);
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

  async function handleArchive(c: Company) {
    if (!window.confirm(
      `Archive "${c.name}"? All users at this company will be blocked from logging in. You can restore it from the archived list.`
    )) return;

    setBusyCompanyId(c.id);
    setActionError("");
    try {
      const res = await fetch("/api/companies/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: c.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "Failed to archive company.");
      } else {
        setCompanies((prev) => prev.filter((x) => x.id !== c.id));
        setArchived((prev) => [
          ...prev,
          { ...c, isActive: false } as Company,
        ]);
      }
    } catch {
      setActionError("Failed to archive company.");
    }
    setBusyCompanyId(null);
  }

  async function handleRestore(c: Company) {
    setBusyCompanyId(c.id);
    setActionError("");
    try {
      const res = await fetch("/api/companies/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: c.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "Failed to restore company.");
      } else {
        setArchived((prev) => prev.filter((x) => x.id !== c.id));
        setCompanies((prev) => [
          ...prev,
          { ...c, isActive: true } as Company,
        ]);
      }
    } catch {
      setActionError("Failed to restore company.");
    }
    setBusyCompanyId(null);
  }

  async function handleDelete() {
    if (!deletingCompany) return;
    if (deleteConfirmInput !== deletingCompany.name) {
      setDeleteError("Typed name does not match.");
      return;
    }
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/companies/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: deletingCompany.id,
          confirmName: deleteConfirmInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || "Failed to delete company.");
      } else {
        setArchived((prev) =>
          prev.filter((x) => x.id !== deletingCompany.id)
        );
        setDeletingCompany(null);
        setDeleteConfirmInput("");
        const summary = `Deleted. Removed ${data.mappingsUpdated ?? 0} membership records; ${data.authDeleted ?? 0} login accounts deleted.`;
        alert(summary);
      }
    } catch {
      setDeleteError("Failed to delete company.");
    }
    setDeleting(false);
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
        setSaPassword(`__email_sent__${saEmail.trim()}`);
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

  const visibleCompanies = showArchived ? archived : companies;

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

        <div className="mt-6 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-primary">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-4 w-4 rounded border-brand-gray accent-accent"
            />
            Show archived companies
          </label>
          {actionError && (
            <p className="text-sm text-accent">{actionError}</p>
          )}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {visibleCompanies.map((c) => {
            const isBusy = busyCompanyId === c.id;
            return (
              <div
                key={c.id}
                className={`rounded-[4px] border p-5 shadow-sm ${
                  showArchived
                    ? "border-brand-gray bg-gray-50"
                    : "border-brand-gray bg-white"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-primary">{c.name}</h2>
                    {showArchived && (
                      <p className="mt-1 text-xs uppercase tracking-wider text-primary/50">
                        Archived
                      </p>
                    )}
                  </div>
                  {!showArchived && (
                    <button
                      onClick={() => handleSelect(c.id)}
                      className="text-sm font-semibold text-accent transition hover:opacity-70"
                    >
                      Select →
                    </button>
                  )}
                </div>

                <div className="mt-4 flex gap-3 border-t border-brand-gray/50 pt-3">
                  {showArchived ? (
                    <>
                      <button
                        onClick={() => handleRestore(c)}
                        disabled={isBusy}
                        className="text-xs font-semibold uppercase tracking-wider text-primary hover:text-accent disabled:opacity-50"
                      >
                        {isBusy ? "Working..." : "Restore"}
                      </button>
                      <button
                        onClick={() => {
                          setDeletingCompany(c);
                          setDeleteConfirmInput("");
                          setDeleteError("");
                        }}
                        disabled={isBusy}
                        className="text-xs font-semibold uppercase tracking-wider text-accent hover:opacity-70 disabled:opacity-50"
                      >
                        Delete permanently
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleArchive(c)}
                      disabled={isBusy}
                      className="text-xs font-semibold uppercase tracking-wider text-primary/60 hover:text-accent disabled:opacity-50"
                    >
                      {isBusy ? "Archiving..." : "Archive"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {visibleCompanies.length === 0 && (
          <p className="mt-8 text-center text-sm text-primary/40">
            {showArchived
              ? "No archived companies."
              : "No companies yet. Create your first one above."}
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

      {/* Permanent delete confirmation modal */}
      {deletingCompany && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-primary/60 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-[4px] bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold uppercase tracking-wider text-accent">
              Delete {deletingCompany.name} permanently?
            </h3>
            <p className="mt-3 text-sm text-primary/80">
              This will permanently delete all teams, users, plans, assessments,
              and history for this company. Users with no other company access
              will also have their login account deleted. This cannot be undone.
            </p>
            <p className="mt-3 text-sm text-primary/80">
              Type the company name <strong>{deletingCompany.name}</strong> to
              confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmInput}
              onChange={(e) => setDeleteConfirmInput(e.target.value)}
              className="mt-2 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-accent"
              placeholder={deletingCompany.name}
              autoFocus
            />
            {deleteError && (
              <p className="mt-3 text-sm text-accent">{deleteError}</p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeletingCompany(null);
                  setDeleteConfirmInput("");
                  setDeleteError("");
                }}
                disabled={deleting}
                className="rounded-[4px] border border-brand-gray px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={
                  deleting || deleteConfirmInput !== deletingCompany.name
                }
                className="rounded-[4px] bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white hover:opacity-90 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
