"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { canManageUsers } from "@/lib/permissions";
import { getCompanyUsers, updateUserRole } from "@/lib/user-service";
import type { UserProfile, UserRole } from "@/types/auth";

const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: "Super Admin",
  company_admin: "Company Admin",
  senior_leader: "Senior Leader",
  leader: "Leader",
};

const ASSIGNABLE_ROLES: UserRole[] = ["company_admin", "senior_leader", "leader"];

export default function UsersPage() {
  const { profile } = useAuth();
  const { activeCompany } = useCompany();
  const router = useRouter();

  const companyId = activeCompany?.id ?? profile?.companyId;

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create user form
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("leader");
  const [creating, setCreating] = useState(false);
  const [createdPassword, setCreatedPassword] = useState("");

  useEffect(() => {
    if (!profile || !canManageUsers(profile)) {
      router.replace("/dashboard");
      return;
    }
    if (!companyId) {
      if (profile.role === "superadmin") router.replace("/admin");
      setLoading(false);
      return;
    }
    loadUsers(companyId);
  }, [profile, companyId, router]);

  async function loadUsers(cid: string) {
    try {
      const data = await getCompanyUsers(cid);
      setUsers(data);
    } catch {
      setError("Failed to load users.");
    }
    setLoading(false);
  }

  async function handleCreate() {
    if (!companyId || !formName.trim() || !formEmail.trim()) return;
    setCreating(true);
    setError("");
    setCreatedPassword("");
    try {
      const res = await fetch("/api/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          email: formEmail.trim(),
          displayName: formName.trim(),
          role: formRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create user.");
      } else {
        setCreatedPassword(data.tempPassword);
        setFormName("");
        setFormEmail("");
        setFormRole("leader");
        // Reload users
        await loadUsers(companyId);
      }
    } catch {
      setError("Failed to create user.");
    }
    setCreating(false);
  }

  async function handleRoleChange(userId: string, newRole: UserRole) {
    if (!companyId) return;
    try {
      await updateUserRole(companyId, userId, newRole);
      setUsers(users.map((u) => (u.uid === userId ? { ...u, role: newRole } : u)));
    } catch {
      setError("Failed to update role.");
    }
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
        <h1 className="text-2xl font-bold text-primary">Users</h1>

        {error && <p className="mt-4 text-sm text-accent">{error}</p>}

        {/* Create User Form */}
        <div className="mt-6 rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/40">
            Create User
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Full name"
              className="rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
            />
            <input
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              placeholder="Email"
              className="rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
            />
            <select
              value={formRole}
              onChange={(e) => setFormRole(e.target.value as UserRole)}
              className="rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <button
              onClick={handleCreate}
              disabled={creating || !formName.trim() || !formEmail.trim()}
              className="rounded-[4px] bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create"}
            </button>
          </div>

          {createdPassword && (
            <div className="rounded-[4px] border border-green-300 bg-green-50 p-3">
              <p className="text-sm text-green-800">
                User created. Temporary password:{" "}
                <code className="rounded bg-green-100 px-2 py-0.5 font-mono text-sm font-bold">
                  {createdPassword}
                </code>
              </p>
              <p className="mt-1 text-xs text-green-600">
                Share this with the user. They can reset it via &quot;Forgot Password?&quot; on the login page.
              </p>
            </div>
          )}
        </div>

        {/* User List */}
        {users.length === 0 && (
          <p className="mt-6 text-sm font-light text-primary/70">
            No users yet. Create one above.
          </p>
        )}

        <div className="mt-6 space-y-2">
          {users.map((u) => (
            <div
              key={u.uid}
              className="flex items-center gap-4 rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm"
            >
              <div className="flex-1">
                <p className="text-sm font-semibold text-primary">{u.displayName}</p>
                <p className="text-xs text-primary/50">{u.email}</p>
              </div>
              <select
                value={u.role}
                onChange={(e) => handleRoleChange(u.uid, e.target.value as UserRole)}
                className="rounded-[4px] border border-brand-gray bg-white px-3 py-1 text-xs font-semibold text-primary outline-none focus:border-primary"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
