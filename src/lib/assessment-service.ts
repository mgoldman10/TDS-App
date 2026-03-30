import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Assessment, CultureFitScore, ProductivityActual, PerformanceCategory } from "@/types/assessment";

function assessmentsRef(companyId: string) {
  return collection(db, "companies", companyId, "assessments");
}

/** Get all assessments for a specific quarter */
export async function getAssessmentsByQuarter(
  companyId: string,
  fiscalYear: number,
  fiscalQuarter: number
): Promise<Assessment[]> {
  const q = query(
    assessmentsRef(companyId),
    where("fiscalYear", "==", fiscalYear),
    where("fiscalQuarter", "==", fiscalQuarter),
    orderBy("memberName", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Assessment));
}

/** Get assessment for a specific member in a specific quarter */
export async function getAssessmentForMember(
  companyId: string,
  memberId: string,
  fiscalYear: number,
  fiscalQuarter: number
): Promise<Assessment | null> {
  const q = query(
    assessmentsRef(companyId),
    where("memberId", "==", memberId),
    where("fiscalYear", "==", fiscalYear),
    where("fiscalQuarter", "==", fiscalQuarter)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as Assessment;
}

/** Create a new assessment */
export async function createAssessment(
  companyId: string,
  data: {
    memberId: string;
    memberName: string;
    assessedByUserId: string;
    fiscalYear: number;
    fiscalQuarter: number;
    cultureFitScores: CultureFitScore[];
    cultureFitScore: number;
    productivityActuals: ProductivityActual[];
    productivityScore: number;
    performanceCategory: PerformanceCategory;
  }
): Promise<string> {
  const ref = await addDoc(assessmentsRef(companyId), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Update an existing assessment */
export async function updateAssessment(
  companyId: string,
  assessmentId: string,
  data: Partial<{
    cultureFitScores: CultureFitScore[];
    cultureFitScore: number;
    productivityActuals: ProductivityActual[];
    productivityScore: number;
    performanceCategory: PerformanceCategory;
  }>
): Promise<void> {
  await updateDoc(doc(db, "companies", companyId, "assessments", assessmentId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/** Get all assessments for a company across all quarters */
export async function getAllAssessmentsForCompany(
  companyId: string
): Promise<Assessment[]> {
  const q = query(
    assessmentsRef(companyId),
    orderBy("fiscalYear", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Assessment));
}

/** Get all assessments for a specific member (history) */
export async function getAssessmentHistory(
  companyId: string,
  memberId: string
): Promise<Assessment[]> {
  const q = query(
    assessmentsRef(companyId),
    where("memberId", "==", memberId),
    orderBy("fiscalYear", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Assessment));
}
