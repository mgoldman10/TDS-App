import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

/**
 * Restore an archived company. Flips isActive back to true and clears
 * archivedAt. All memberships and subcollection data were left in place
 * during archive, so users return to full access automatically.
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
      isActive: true,
      archivedAt: FieldValue.delete(),
      updatedAt: now,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Restore company error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to restore company.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
