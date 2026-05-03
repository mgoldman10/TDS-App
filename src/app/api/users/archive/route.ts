import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { companyId, userId } = await request.json();

    if (!companyId || !userId) {
      return NextResponse.json(
        { error: "companyId and userId are required." },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();
    const userRef = adminDb.doc(`companies/${companyId}/users/${userId}`);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const data = userSnap.data() ?? {};
    const originalEmail = data.email ?? null;
    const now = new Date();

    // Pick an archive slot. One per uid; on re-archive, append timestamp.
    let archiveDocId = userId;
    const baseArchiveRef = adminDb.doc(
      `companies/${companyId}/usersArchived/${userId}`
    );
    const baseArchiveSnap = await baseArchiveRef.get();
    if (baseArchiveSnap.exists) {
      archiveDocId = `${userId}_${now.getTime()}`;
    }
    const archiveRef = adminDb.doc(
      `companies/${companyId}/usersArchived/${archiveDocId}`
    );

    const batch = adminDb.batch();

    batch.set(archiveRef, {
      ...data,
      uid: userId,
      isActive: false,
      archivedAt: now,
      archivedEmail: originalEmail,
    });
    batch.delete(userRef);

    // Clear app-user link on any team members that point to this uid.
    // The team member record itself stays — it's the historical anchor for
    // assessments — but it no longer claims to have a login.
    const linkedMembersSnap = await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("teamMembers")
      .where("appUserId", "==", userId)
      .get();
    for (const memberDoc of linkedMembersSnap.docs) {
      batch.update(memberDoc.ref, { isAppUser: false, appUserId: null });
    }

    await batch.commit();

    // Update userMappings: remove this company's membership.
    const mappingRef = adminDb.doc(`userMappings/${userId}`);
    const mappingSnap = await mappingRef.get();
    if (mappingSnap.exists) {
      const mapping = mappingSnap.data() ?? {};
      const memberships = Array.isArray(mapping.memberships)
        ? mapping.memberships.filter(
            (m: { companyId?: string }) => m.companyId !== companyId
          )
        : [];

      const updates: Record<string, unknown> = { memberships };

      if (mapping.companyId === companyId) {
        if (memberships.length > 0) {
          updates.companyId = memberships[0].companyId;
          updates.role = memberships[0].role;
        } else {
          updates.companyId = null;
          // Leave role as-is so legacy reads don't crash; resolveUser will
          // see no memberships and return null anyway.
        }
      }

      await mappingRef.update(updates);
    }

    return NextResponse.json({ success: true, archiveDocId });
  } catch (err) {
    console.error("Archive user error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to archive user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
