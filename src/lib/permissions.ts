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

/** Can manage a specific team: true for admins, or the team's own leader */
export function canManageTeam(profile: UserProfile | null, teamLeaderId: string): boolean {
  if (!profile) return false;
  if (isAtLeast(profile.role, "company_admin")) return true;
  return profile.uid === teamLeaderId;
}

/**
 * Can manage a specific team given a precomputed authorized scope.
 * Admins always pass. Otherwise the team must be in the user's scope (their own teams plus
 * all descendant sub-teams), as computed via getAuthorizedTeamIds / getSubTeamIds.
 */
export function canManageTeamInScope(
  profile: UserProfile | null,
  teamId: string,
  authorizedTeamIds: Set<string>
): boolean {
  if (!profile) return false;
  if (isAtLeast(profile.role, "company_admin")) return true;
  return authorizedTeamIds.has(teamId);
}

/** Check if user has at least the given role */
export function hasRole(profile: UserProfile | null, role: UserRole): boolean {
  if (!profile) return false;
  return isAtLeast(profile.role, role);
}
