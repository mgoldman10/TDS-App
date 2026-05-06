import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { sendPasswordResetEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { email, displayName } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const adminAuth = getAdminAuth();

    // Look up the user explicitly first so we can give a clean error
    // when no Auth account exists. generatePasswordResetLink doesn't
    // always surface user-not-found cleanly — sometimes the Identity
    // Platform returns "INTERNAL ASSERT FAILED: Unable to create the
    // email action link" instead, which is meaningless to a human.
    try {
      await adminAuth.getUserByEmail(email);
    } catch (lookupErr) {
      const code =
        lookupErr && typeof lookupErr === "object" && "code" in lookupErr
          ? (lookupErr as { code: string }).code
          : "";
      if (code === "auth/user-not-found") {
        return NextResponse.json(
          {
            error:
              "This person doesn't have a login account in Firebase Auth. The Firestore record may say they're an app user, but no actual login exists. Re-invite them as an app user to recreate the account.",
          },
          { status: 404 }
        );
      }
      if (code === "auth/invalid-email") {
        return NextResponse.json(
          { error: "Email address is not valid." },
          { status: 400 }
        );
      }
      throw lookupErr;
    }

    let resetLink: string;
    try {
      resetLink = await adminAuth.generatePasswordResetLink(email);
    } catch (authErr) {
      const code =
        authErr && typeof authErr === "object" && "code" in authErr
          ? (authErr as { code: string }).code
          : "";
      if (code === "auth/invalid-email") {
        return NextResponse.json(
          { error: "Email address is not valid." },
          { status: 400 }
        );
      }
      throw authErr;
    }

    await sendPasswordResetEmail(email, displayName || "there", resetLink);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Password reset email error:", err);
    const message = err instanceof Error ? err.message : "Failed to send reset email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
