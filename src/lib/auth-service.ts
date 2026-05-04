import { Timestamp, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  CompanyMembership,
  UserMapping,
  UserProfile,
} from "@/types/auth";
import type { Company } from "@/types/company";

async function getActiveCompanyIds(
  companyIds: string[]
): Promise<Set<string>> {
  const unique = Array.from(new Set(companyIds));
  const results = await Promise.all(
    unique.map(async (id) => {
      const snap = await getDoc(doc(db, "companies", id));
      if (!snap.exists()) return null;
      const data = snap.data() as Partial<Company>;
      return data.isActive === false ? null : id;
    })
  );
  return new Set(results.filter((id): id is string => id !== null));
}

export async function getUserMapping(uid: string): Promise<UserMapping | null> {
  const snap = await getDoc(doc(db, "userMappings", uid));
  if (!snap.exists()) return null;
  return snap.data() as UserMapping;
}

export async function getUserProfile(
  companyId: string,
  uid: string
): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "companies", companyId, "users", uid));
  if (!snap.exists()) return null;
  return { ...snap.data(), companyId } as UserProfile;
}

export async function getSuperadminProfile(
  uid: string
): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "superadmin", uid));
  if (!snap.exists()) return null;
  return { ...snap.data(), companyId: null } as UserProfile;
}

/**
 * Returns all company memberships for a user, normalizing legacy mappings
 * (single companyId/role) into the memberships[] shape, and filtering out
 * any memberships pointing at archived companies. From the user's POV, an
 * archived company isn't somewhere they can log into.
 */
export async function getUserMemberships(
  uid: string
): Promise<CompanyMembership[]> {
  const mapping = await getUserMapping(uid);
  if (!mapping) return [];

  let raw: CompanyMembership[];
  if (mapping.memberships && mapping.memberships.length > 0) {
    raw = [...mapping.memberships].sort((a, b) => {
      const aMs = a.addedAt?.toMillis?.() ?? 0;
      const bMs = b.addedAt?.toMillis?.() ?? 0;
      return aMs - bMs;
    });
  } else if (mapping.companyId) {
    raw = [
      {
        companyId: mapping.companyId,
        role: mapping.role,
        addedAt: Timestamp.fromMillis(0),
      },
    ];
  } else {
    return [];
  }

  const activeIds = await getActiveCompanyIds(raw.map((m) => m.companyId));
  return raw.filter((m) => activeIds.has(m.companyId));
}

/**
 * Resolves the active UserProfile for a signed-in user.
 *
 * For superadmins → /superadmin/{uid}.
 * For company users → picks the membership matching preferredCompanyId,
 * else the earliest-added one. Returns null if the user has no memberships
 * (fully archived) or the resolved profile is marked inactive.
 */
export async function resolveUser(
  uid: string,
  preferredCompanyId?: string
): Promise<UserProfile | null> {
  const mapping = await getUserMapping(uid);
  if (!mapping) return null;

  if (mapping.isSuperadmin || mapping.role === "superadmin") {
    return getSuperadminProfile(uid);
  }

  const memberships = await getUserMemberships(uid);
  if (memberships.length === 0) return null;

  const picked =
    (preferredCompanyId &&
      memberships.find((m) => m.companyId === preferredCompanyId)) ||
    memberships[0];

  const profile = await getUserProfile(picked.companyId, uid);
  if (!profile) return null;
  if (profile.isActive === false) return null;
  return profile;
}
