import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ProductivityTarget, TargetType, UnitType } from "@/types/productivity";
import type { Frequency, MonthlyValues } from "@/types/productivity";

function targetsRef(companyId: string) {
  return collection(db, "companies", companyId, "productivityTargets");
}

export async function getTargetsForMember(
  companyId: string,
  memberId: string
): Promise<ProductivityTarget[]> {
  const q = query(
    targetsRef(companyId),
    where("memberId", "==", memberId),
    orderBy("order", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductivityTarget));
}

export async function createTarget(
  companyId: string,
  data: {
    memberId: string;
    name: string;
    type: TargetType;
    unit: UnitType;
    frequency: Frequency;
    weight: number;
    target: number;
    min: number;
    max: number;
    monthlyTargets: MonthlyValues | null;
    monthlyMin: MonthlyValues | null;
    monthlyMax: MonthlyValues | null;
    order: number;
  }
): Promise<string> {
  const ref = await addDoc(targetsRef(companyId), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTarget(
  companyId: string,
  targetId: string,
  data: Partial<{
    name: string;
    type: TargetType;
    unit: UnitType;
    frequency: Frequency;
    weight: number;
    target: number;
    min: number;
    max: number;
    monthlyTargets: MonthlyValues | null;
    monthlyMin: MonthlyValues | null;
    monthlyMax: MonthlyValues | null;
    order: number;
  }>
): Promise<void> {
  await updateDoc(doc(db, "companies", companyId, "productivityTargets", targetId), data);
}

export async function deleteTarget(
  companyId: string,
  targetId: string
): Promise<void> {
  await deleteDoc(doc(db, "companies", companyId, "productivityTargets", targetId));
}
