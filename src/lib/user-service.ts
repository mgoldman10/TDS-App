import {
  collection,
  doc,
  getDocs,
  updateDoc,
  setDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { UserProfile, UserRole } from "@/types/auth";

function usersRef(companyId: string) {
  return collection(db, "companies", companyId, "users");
}

export async function getCompanyUsers(companyId: string): Promise<UserProfile[]> {
  const q = query(usersRef(companyId), orderBy("displayName", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), companyId } as UserProfile));
}

export async function updateUserRole(
  companyId: string,
  userId: string,
  role: UserRole
): Promise<void> {
  await updateDoc(doc(db, "companies", companyId, "users", userId), { role });
  await updateDoc(doc(db, "userMappings", userId), { role });
}

export async function createUserMapping(
  uid: string,
  companyId: string,
  role: UserRole
): Promise<void> {
  await setDoc(doc(db, "userMappings", uid), { companyId, role });
}

/** Soft-delete: deactivate a user (preserves all history) */
export async function deactivateUser(
  companyId: string,
  userId: string
): Promise<void> {
  await updateDoc(doc(db, "companies", companyId, "users", userId), { isActive: false });
}

export async function updateUserEmail(
  companyId: string,
  userId: string,
  newEmail: string,
  displayName: string
): Promise<{ error?: string }> {
  const res = await fetch("/api/users/update-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId, userId, newEmail, displayName }),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Failed to update email." };
  return {};
}

/** Reactivate a previously deactivated user */
export async function reactivateUser(
  companyId: string,
  userId: string
): Promise<void> {
  await updateDoc(doc(db, "companies", companyId, "users", userId), { isActive: true });
}
