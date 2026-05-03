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

function archivedUsersRef(companyId: string) {
  return collection(db, "companies", companyId, "usersArchived");
}

export async function getCompanyUsers(companyId: string): Promise<UserProfile[]> {
  const q = query(usersRef(companyId), orderBy("displayName", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), companyId } as UserProfile));
}

export interface ArchivedUser extends UserProfile {
  archivedDocId: string;
}

export async function getArchivedUsers(
  companyId: string
): Promise<ArchivedUser[]> {
  const snap = await getDocs(archivedUsersRef(companyId));
  return snap.docs.map(
    (d) =>
      ({
        ...d.data(),
        companyId,
        archivedDocId: d.id,
      } as ArchivedUser)
  );
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

/**
 * Archive a user from a company. Removes them from this company's user list,
 * deletes their per-company membership entry, and preserves their record at
 * /companies/{cid}/usersArchived/{uid}. Does NOT touch Firebase Auth, so the
 * user can still log in to other companies they belong to.
 */
export async function deactivateUser(
  companyId: string,
  userId: string
): Promise<{ error?: string }> {
  const res = await fetch("/api/users/archive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId, userId }),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Failed to archive user." };
  return {};
}

/**
 * Restore an archived user back into a company. Fails if the email is now in
 * use by another active user in this company, or if the user's slot is
 * occupied by a different account.
 */
export async function reactivateUser(
  companyId: string,
  archivedUserId: string
): Promise<{ error?: string }> {
  const res = await fetch("/api/users/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId, archivedUserId }),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Failed to restore user." };
  return {};
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
