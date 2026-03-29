import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { UserMapping, UserProfile } from "@/types/auth";

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

export async function resolveUser(uid: string): Promise<UserProfile | null> {
  const mapping = await getUserMapping(uid);
  if (!mapping) return null;

  if (mapping.role === "superadmin") {
    return getSuperadminProfile(uid);
  }

  if (!mapping.companyId) return null;
  return getUserProfile(mapping.companyId, uid);
}
