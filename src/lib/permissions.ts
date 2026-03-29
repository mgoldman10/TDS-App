import type { UserProfile, UserRole } from "@/types/auth";
import { isAtLeast } from "@/types/auth";

/** Can manage company settings (core values, scoring parameters) */
export function canManageCompany(profile: UserProfile | null): boolean {
  if (!profile) return false;
  return isAtLeast(profile.role, "company_admin");
}

/** Can manage users (add, edit, deactivate) */
export function canManageUsers(profile: UserProfile | null): boolean {
  if (!profile) return false;
  return isAtLeast(profile.role, "company_admin");
}

/** Can view assessments across all teams */
export function canViewAllTeams(profile: UserProfile | null): boolean {
  if (!profile) return false;
  return isAtLeast(profile.role, "company_admin");
}

/** Can view reports and TDI trends */
export function canViewReports(profile: UserProfile | null): boolean {
  if (!profile) return false;
  return isAtLeast(profile.role, "senior_leader");
}

/** Check if user has at least the given role */
export function hasRole(profile: UserProfile | null, role: UserRole): boolean {
  if (!profile) return false;
  return isAtLeast(profile.role, role);
}
