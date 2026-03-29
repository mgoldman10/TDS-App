import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, email, displayName, role } = body;

    if (!companyId || !email || !displayName || !role) {
      return NextResponse.json(
        { error: "Missing required fields." },
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

    // Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email,
      password: tempPassword,
      displayName,
    });

    const uid = userRecord.uid;

    // Create userMapping
    await adminDb.doc(`userMappings/${uid}`).set({
      companyId,
      role,
    });

    // Create company user doc
    await adminDb.doc(`companies/${companyId}/users/${uid}`).set({
      uid,
      email,
      displayName,
      role,
      teamIds: [],
      createdAt: new Date(),
    });

    return NextResponse.json({ uid, tempPassword });
  } catch (err: unknown) {
    console.error("User creation error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to create user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
