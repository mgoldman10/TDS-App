import { Timestamp } from "firebase/firestore";

export type UserRole = "superadmin" | "company_admin" | "senior_leader" | "leader";

/** Role hierarchy for permission checks */
const ROLE_LEVEL: Record<UserRole, number> = {
  superadmin: 4,
  company_admin: 3,
  senior_leader: 2,
  leader: 1,
};

/** Returns true if the user's role is at or above the required level */
export function isAtLeast(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[requiredRole];
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  companyId: string | null;
  teamIds: string[];
  isActive?: boolean; // defaults to true; false = archived (record retained)
  archivedAt?: Timestamp;
  archivedEmail?: string; // original email at time of archive (for Restore)
  createdAt: Timestamp;
}

export interface CompanyMembership {
  companyId: string;
  role: UserRole;
  addedAt: Timestamp;
}

export interface UserMapping {
  // Legacy fields kept for back-compat — new code should prefer memberships[]
  companyId: string | null;
  role: UserRole;
  memberships?: CompanyMembership[];
  isSuperadmin?: boolean;
}

export interface AuthState {
  user: import("firebase/auth").User | null;
  profile: UserProfile | null;
  memberships: CompanyMembership[];
  loading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
  refreshProfile: (preferredCompanyId?: string) => Promise<void>;
}
