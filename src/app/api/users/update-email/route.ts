import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { sendEmailChangedEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { companyId, userId, newEmail, displayName } = await request.json();

    if (!companyId || !userId || !newEmail) {
      return NextResponse.json({ error: "companyId, userId, and newEmail are required." }, { status: 400 });
    }

    const adminDb = getAdminDb();

    // Check uniqueness: find any other user in this company with the same email
    const usersSnap = await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("users")
      .where("email", "==", newEmail.trim())
      .get();

    const conflict = usersSnap.docs.find((d) => d.id !== userId);
    if (conflict) {
      return NextResponse.json({ error: "A user with this email address already exists." }, { status: 409 });
    }

    // Update Firebase Auth
    const adminAuth = getAdminAuth();
    await adminAuth.updateUser(userId, { email: newEmail.trim() });

    // Update Firestore
    await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("users")
      .doc(userId)
      .update({ email: newEmail.trim() });

    // Notify the user at their new address
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://talentdensity.app"}/login`;
    await sendEmailChangedEmail(newEmail.trim(), displayName || "there", loginUrl);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Update email error:", err);
    const message = err instanceof Error ? err.message : "Failed to update email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
