"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { canManageUsers } from "@/lib/permissions";
import { getCompanyUsers, updateUserRole, deactivateUser, reactivateUser } from "@/lib/user-service";
import { getTeams } from "@/lib/team-service";
import type { UserProfile, UserRole } from "@/types/auth";
import type { Team } from "@/types/team";

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
  const [showInactive, setShowInactive] = useState(false);

  // Create user form
  const [teams, setTeams] = useState<Team[]>([]);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formTeam, setFormTeam] = useState("");
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
      const [userData, teamData] = await Promise.all([
        getCompanyUsers(cid),
        getTeams(cid),
      ]);
      setUsers(userData);
      setTeams(teamData);
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
          title: formTitle.trim(),
          teamId: formTeam || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create user.");
      } else {
        setCreatedPassword(`__email_sent__${formEmail.trim()}`);
        setFormName("");
        setFormEmail("");
        setFormTitle("");
        setFormTeam("");
        setFormRole("leader");
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

  async function handleResetPassword(user: UserProfile) {
    try {
      const res = await fetch("/api/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, displayName: user.displayName }),
      });
      if (!res.ok) throw new Error();
      alert(`Password reset email sent to ${user.email}`);
    } catch {
      setError("Failed to send password reset email.");
    }
  }

  async function handleDeactivate(userId: string) {
    if (!companyId) return;
    if (!window.confirm("Deactivate this user? They will no longer be able to log in, but their data will be preserved.")) return;
    try {
      await deactivateUser(companyId, userId);
      setUsers(users.map((u) => (u.uid === userId ? { ...u, isActive: false } : u)));
    } catch {
      setError("Failed to deactivate user.");
    }
  }

  async function handleReactivate(userId: string) {
    if (!companyId) return;
    try {
      await reactivateUser(companyId, userId);
      setUsers(users.map((u) => (u.uid === userId ? { ...u, isActive: true } : u)));
    } catch {
      setError("Failed to reactivate user.");
    }
  }

  const activeUsers = users.filter((u) => (u.isActive ?? true));
  const inactiveUsers = users.filter((u) => u.isActive === false);
  const displayedUsers = showInactive ? users : activeUsers;

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
          <h1 className="text-2xl font-bold text-primary">Users</h1>
          {inactiveUsers.length > 0 && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
              <span className="text-xs text-primary/50">Show Inactive ({inactiveUsers.length})</span>
            </label>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-accent">{error}</p>}

        {/* Create User Form */}
        <div className="mt-6 rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-primary/40">
            Create User
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Title (e.g., VP Sales)"
              className="rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
            />
            <select
              value={formTeam}
              onChange={(e) => setFormTeam(e.target.value)}
              className="rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
            >
              <option value="">No team</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
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
              {createdPassword.startsWith("__email_sent__") ? (
                <>
                  <p className="text-sm text-green-800">
                    User created. A password setup email has been sent to{" "}
                    <strong>{createdPassword.replace("__email_sent__", "")}</strong>.
                  </p>
                  <p className="mt-1 text-xs text-green-600">
                    The user will receive an email with a link to set their password.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-green-800">
                    User created. Temporary password:{" "}
                    <code className="rounded bg-green-100 px-2 py-0.5 font-mono text-sm font-bold">
                      {createdPassword}
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

        {/* User List */}
        {displayedUsers.length === 0 && (
          <p className="mt-6 text-sm font-light text-primary/70">
            No users yet. Create one above.
          </p>
        )}

        <div className="mt-6 space-y-2">
          {displayedUsers.map((u) => {
            const isInactive = u.isActive === false;
            return (
              <div
                key={u.uid}
                className={`flex items-center gap-4 rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm ${isInactive ? "opacity-50" : ""}`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-primary">{u.displayName}</p>
                    {isInactive && (
                      <span className="rounded-[2px] bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary/50">Inactive</span>
                    )}
                  </div>
                  <p className="text-xs text-primary/50">{u.email}</p>
                </div>
                {!isInactive ? (
                  <>
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
                    <button
                      onClick={() => handleResetPassword(u)}
                      className="rounded-[4px] border border-brand-gray bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary/50 transition hover:text-primary hover:border-primary"
                      title="Send password reset email"
                    >
                      Reset Password
                    </button>
                    {u.uid !== profile?.uid && (
                      <button
                        onClick={() => handleDeactivate(u.uid)}
                        className="text-xs text-accent/50 transition hover:text-accent"
                        title="Deactivate user"
                      >
                        ✕
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    onClick={() => handleReactivate(u.uid)}
                    className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white"
                  >
                    Reactivate
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
