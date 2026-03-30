import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DEFAULT_SCORING_PARAMETERS } from "@/types/company";
import type { Company } from "@/types/company";

export async function getCompany(companyId: string): Promise<Company | null> {
  const snap = await getDoc(doc(db, "companies", companyId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Company;
}

export async function getCompanies(): Promise<Company[]> {
  const snap = await getDocs(collection(db, "companies"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Company));
}

export async function createCompany(name: string): Promise<string> {
  const ref = await addDoc(collection(db, "companies"), {
    name,
    fiscalYearStartMonth: 1,
    scoringParameters: { ...DEFAULT_SCORING_PARAMETERS },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCompany(
  companyId: string,
  data: Partial<Pick<Company, "name" | "fiscalYearStartMonth" | "scoringParameters" | "tdiGoals">>
): Promise<void> {
  await updateDoc(doc(db, "companies", companyId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}
