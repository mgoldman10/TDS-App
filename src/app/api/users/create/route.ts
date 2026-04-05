import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { sendWelcomeEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, email, displayName, role, title, teamId } = body;

    if (!email || !displayName || !role) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    // Superadmins don't require a companyId
    if (role !== "superadmin" && !companyId) {
      return NextResponse.json(
        { error: "Company ID is required for non-superadmin users." },
        { status: 400 }
      );
    }

    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    // Generate temp password
    const tempPassword =
      Math.random().toString(36).slice(2, 8) +
      Math.random().toString(36).slice(2, 4).toUpperCase() +
      "!";

    // Create or reuse Firebase Auth user
    let uid: string;
    try {
      const userRecord = await adminAuth.createUser({
        email,
        password: tempPassword,
        displayName,
      });
      uid = userRecord.uid;
    } catch (createErr: unknown) {
      // If email already exists, look up the existing user and reset their password
      if (createErr && typeof createErr === "object" && "code" in createErr && (createErr as { code: string }).code === "auth/email-already-exists") {
        const existingUser = await adminAuth.getUserByEmail(email);
        uid = existingUser.uid;
        await adminAuth.updateUser(uid, { password: tempPassword, displayName });
      } else {
        throw createErr;
      }
    }

    // Create userMapping
    await adminDb.doc(`userMappings/${uid}`).set({
      companyId: companyId || null,
      role,
    });

    // Create superadmin doc (no company scope)
    if (role === "superadmin") {
      await adminDb.doc(`superadmin/${uid}`).set({
        uid,
        email,
        displayName,
        role,
        createdAt: new Date(),
      });
    }

    // Create company user doc (for non-superadmin users)
    if (companyId) {
      await adminDb.doc(`companies/${companyId}/users/${uid}`).set({
        uid,
        email,
        displayName,
        role,
        isActive: true,
        teamIds: teamId ? [teamId] : [],
        createdAt: new Date(),
      });

      // Auto-create linked team member if team is specified
      if (teamId) {
        // Look up team leader for reportsToUserId
        const teamSnap = await adminDb.doc(`companies/${companyId}/teams/${teamId}`).get();
        const teamData = teamSnap.data();
        const leaderId = teamData?.leaderId ?? "";

        await adminDb.collection(`companies/${companyId}/teamMembers`).add({
          name: displayName,
          role: title || "",
          teamId,
          reportsToUserId: leaderId,
          isAppUser: true,
          appUserId: uid,
          status: "active",
          archivedAt: null,
          archivedReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    // Generate password reset link and send welcome email
    let resetLink = "";
    try {
      resetLink = await adminAuth.generatePasswordResetLink(email);
      await sendWelcomeEmail(email, displayName, resetLink);
    } catch (emailErr) {
      console.error("Welcome email error:", emailErr);
      // Non-critical — user was created, return the link as fallback
    }

    return NextResponse.json({ uid, resetLink });
  } catch (err: unknown) {
    console.error("User creation error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to create user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
