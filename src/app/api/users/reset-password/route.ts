import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { sendPasswordResetEmail } from "@/lib/email";
import { resolveTargetTenant, verifyApiCaller } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/** Anti-enumeration reply: identical whether or not the account exists. */
function neutralResponse() {
  return NextResponse.json({
    success: true,
    message: "If an account exists for this email, a password reset email has been sent.",
  });
}

export async function POST(request: NextRequest) {
  try {
    const { email, displayName, companyId } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    // Optional auth — this route MUST keep working for anonymous callers
    // (the login page's Forgot Password flow). A verified superadmin or
    // company_admin of the named tenant gets detailed diagnostics; everyone
    // else gets the same neutral reply whether or not the account exists,
    // so the route can't be used to discover which emails have accounts.
    let detailedResponses = false;
    try {
      const { uid: callerUid } = await verifyApiCaller(request);
      if (typeof companyId === "string" && companyId) {
        const caller = await resolveTargetTenant(callerUid, companyId);
        detailedResponses = caller.isSuperadmin || caller.role === "company_admin";
      }
    } catch {
      // No token, bad token, or no tenant access — treat as anonymous.
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
        if (!detailedResponses) return neutralResponse();
        return NextResponse.json(
          {
            error:
              "This person doesn't have a login account in Firebase Auth. The Firestore record may say they're an app user, but no actual login exists. Re-invite them as an app user to recreate the account.",
          },
          { status: 404 }
        );
      }
      if (code === "auth/invalid-email") {
        // A malformed address reveals nothing about account existence,
        // so both modes may return the real validation error.
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

    if (!detailedResponses) return neutralResponse();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Password reset email error:", err);
    // Log the detail server-side only — raw provider errors could undermine
    // the anti-enumeration behavior above.
    return NextResponse.json({ error: "Failed to send reset email." }, { status: 500 });
  }
}
