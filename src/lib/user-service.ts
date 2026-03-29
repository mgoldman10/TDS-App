import {
  collection,
  doc,
  getDocs,
  updateDoc,
  deleteDoc,
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

export async function deleteCompanyUser(
  companyId: string,
  userId: string
): Promise<void> {
  await deleteDoc(doc(db, "companies", companyId, "users", userId));
  await deleteDoc(doc(db, "userMappings", userId));
}
