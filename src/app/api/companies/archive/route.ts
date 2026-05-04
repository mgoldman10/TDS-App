import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * Archive a company. Flips the isActive flag — does NOT touch any
 * subcollection or userMapping. Login resolution filters memberships
 * pointing at archived companies, so all users at this company are
 * blocked from logging into it. Reversible via /api/companies/restore.
 */
export async function POST(request: NextRequest) {
  try {
    const { companyId } = (await request.json()) as { companyId?: string };
    if (!companyId) {
      return NextResponse.json(
        { error: "companyId is required." },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();
    const companyRef = adminDb.doc(`companies/${companyId}`);
    const snap = await companyRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const now = new Date();
    await companyRef.update({
      isActive: false,
      archivedAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Archive company error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to archive company.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
