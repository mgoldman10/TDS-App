import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { companyId, userId, reason } = await request.json();

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

    // Block the archive if this user leads any teams. Forces an explicit
    // leadership reassignment first — otherwise a sub-team would be left
    // pointing at an archived leader and visually orphaned.
    const ledTeamsSnap = await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("teams")
      .where("leaderId", "==", userId)
      .get();
    if (!ledTeamsSnap.empty) {
      const leadingTeams = ledTeamsSnap.docs.map((d) => ({
        id: d.id,
        name: (d.data().name as string) || "(unnamed team)",
      }));
      return NextResponse.json(
        {
          error: "User leads one or more teams. Reassign leadership first.",
          leadingTeams,
        },
        { status: 409 }
      );
    }

    const data = userSnap.data() ?? {};
    const originalEmail = data.email ?? null;
    const now = new Date();
    const archiveReason =
      typeof reason === "string" && reason.trim()
        ? reason.trim()
        : "Archived from company";

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

    // Cascade: archive every team-member row linked to this user. Keep
    // appUserId set so restore can flip them back to active without
    // having to re-link by name.
    const linkedMembersSnap = await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("teamMembers")
      .where("appUserId", "==", userId)
      .get();
    for (const memberDoc of linkedMembersSnap.docs) {
      batch.update(memberDoc.ref, {
        status: "archived",
        archivedAt: now,
        archivedReason: archiveReason,
        updatedAt: now,
      });
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

    return NextResponse.json({
      success: true,
      archiveDocId,
      archivedMemberCount: linkedMembersSnap.size,
    });
  } catch (err) {
    console.error("Archive user error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to archive user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
