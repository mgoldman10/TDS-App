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

    // Check uniqueness within this company.
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

    // Update the per-company Firestore email field.
    await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("users")
      .doc(userId)
      .update({ email: newEmail.trim() });

    // Only update the global Firebase Auth email when this is the user's
    // sole company. If they belong to multiple companies, changing the Auth
    // email would silently change their login email everywhere — surprising
    // and potentially conflicting with another company's records.
    const mappingSnap = await adminDb.doc(`userMappings/${userId}`).get();
    const memberships = mappingSnap.exists
      ? (mappingSnap.data()?.memberships ?? [])
      : [];
    const multiCompany =
      Array.isArray(memberships) && memberships.length > 1;

    if (!multiCompany) {
      const adminAuth = getAdminAuth();
      await adminAuth.updateUser(userId, { email: newEmail.trim() });
    }

    // Notify the user at their new address. Derive the login URL from the
    // request so dev / preview / prod all just work — falling back to env
    // and finally the known prod hostname if neither is available.
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const origin = forwardedHost
      ? `${forwardedProto ?? "https"}://${forwardedHost}`
      : new URL(request.url).origin;
    const baseUrl =
      origin ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://talentdensity.netlify.app";
    const loginUrl = `${baseUrl}/login`;
    await sendEmailChangedEmail(newEmail.trim(), displayName || "there", loginUrl);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Update email error:", err);
    const message = err instanceof Error ? err.message : "Failed to update email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
