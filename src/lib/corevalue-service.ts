import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { CoreValue, CoreValueFormData } from "@/types/corevalue";

function coreValuesRef(companyId: string) {
  return collection(db, "companies", companyId, "coreValues");
}

export async function getCoreValues(companyId: string): Promise<CoreValue[]> {
  const q = query(coreValuesRef(companyId), orderBy("order", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CoreValue));
}

export async function createCoreValue(
  companyId: string,
  data: CoreValueFormData
): Promise<string> {
  const ref = await addDoc(coreValuesRef(companyId), {
    name: data.name,
    description: data.description,
    behaviors: data.behaviors,
    order: data.order,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCoreValue(
  companyId: string,
  valueId: string,
  data: Partial<CoreValueFormData>
): Promise<void> {
  await updateDoc(doc(db, "companies", companyId, "coreValues", valueId), data);
}

export async function deleteCoreValue(
  companyId: string,
  valueId: string
): Promise<void> {
  await deleteDoc(doc(db, "companies", companyId, "coreValues", valueId));
}

export async function reorderCoreValues(
  companyId: string,
  values: { id: string; order: number }[]
): Promise<void> {
  const batch = writeBatch(db);
  for (const v of values) {
    batch.update(doc(db, "companies", companyId, "coreValues", v.id), {
      order: v.order,
    });
  }
  await batch.commit();
}
