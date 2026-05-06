import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { companyId, archivedUserId } = await request.json();

    if (!companyId || !archivedUserId) {
      return NextResponse.json(
        { error: "companyId and archivedUserId are required." },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();
    const archiveRef = adminDb.doc(
      `companies/${companyId}/usersArchived/${archivedUserId}`
    );
    const archiveSnap = await archiveRef.get();

    if (!archiveSnap.exists) {
      return NextResponse.json(
        { error: "Archived user not found." },
        { status: 404 }
      );
    }

    const data = archiveSnap.data() ?? {};
    const uid: string = data.uid ?? archivedUserId.split("_")[0];
    const archivedEmail: string | null = data.archivedEmail ?? data.email ?? null;
    const role: string = data.role;

    if (!archivedEmail) {
      return NextResponse.json(
        {
          error:
            "Cannot restore: original email is missing from the archived record.",
        },
        { status: 400 }
      );
    }

    // Pre-flight: another active user in this company holding this email?
    const conflictSnap = await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("users")
      .where("email", "==", archivedEmail)
      .get();

    if (!conflictSnap.empty) {
      return NextResponse.json(
        {
          error:
            "Email is now in use at this company. Update the archived user's email or create a new user.",
        },
        { status: 409 }
      );
    }

    // Pre-flight: the slot at /users/{uid} must be empty.
    const userRef = adminDb.doc(`companies/${companyId}/users/${uid}`);
    const userSlotSnap = await userRef.get();
    if (userSlotSnap.exists) {
      return NextResponse.json(
        {
          error:
            "Cannot restore: this user's slot is occupied by another account at this company.",
        },
        { status: 409 }
      );
    }

    const now = new Date();

    // Strip archive-only fields when writing back.
    const restoredData: Record<string, unknown> = { ...data };
    delete restoredData.archivedAt;
    delete restoredData.archivedEmail;
    restoredData.email = archivedEmail;
    restoredData.isActive = true;
    restoredData.uid = uid;

    // Cascade: un-archive every team-member row linked to this uid that's
    // currently archived. Keeps the restore symmetric with the cascade
    // archive — the person comes back as a member of the same teams.
    const linkedMembersSnap = await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("teamMembers")
      .where("appUserId", "==", uid)
      .get();
    const archivedLinkedMembers = linkedMembersSnap.docs.filter(
      (d) => (d.data().status ?? "active") === "archived"
    );

    const batch = adminDb.batch();
    batch.set(userRef, restoredData);
    batch.delete(archiveRef);
    for (const memberDoc of archivedLinkedMembers) {
      batch.update(memberDoc.ref, {
        status: "active",
        archivedAt: null,
        archivedReason: null,
        updatedAt: now,
      });
    }
    await batch.commit();

    // Update userMappings: append membership for this company.
    const mappingRef = adminDb.doc(`userMappings/${uid}`);
    const mappingSnap = await mappingRef.get();
    if (mappingSnap.exists) {
      const mapping = mappingSnap.data() ?? {};
      const existing = Array.isArray(mapping.memberships)
        ? mapping.memberships
        : [];
      const filtered = existing.filter(
        (m: { companyId?: string }) => m.companyId !== companyId
      );
      const memberships = [...filtered, { companyId, role, addedAt: now }];

      const updates: Record<string, unknown> = { memberships };
      // If legacy companyId was empty, point it at the restored company.
      if (!mapping.companyId) {
        updates.companyId = companyId;
        updates.role = role;
      }
      await mappingRef.update(updates);
    } else {
      await mappingRef.set({
        companyId,
        role,
        memberships: [{ companyId, role, addedAt: now }],
      });
    }

    return NextResponse.json({
      success: true,
      uid,
      restoredMemberCount: archivedLinkedMembers.length,
    });
  } catch (err) {
    console.error("Restore user error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to restore user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
