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
    const resetLink = await adminAuth.generatePasswordResetLink(email);

    await sendPasswordResetEmail(email, displayName || "there", resetLink);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Password reset email error:", err);
    const message = err instanceof Error ? err.message : "Failed to send reset email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
