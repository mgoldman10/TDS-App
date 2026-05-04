import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * Permanently delete an archived company. Recursively wipes all
 * subcollections (teams, users, usersArchived, teamMembers, plans,
 * assessments, etc.), removes the company from every userMapping, and
 * deletes Firebase Auth accounts for users left with zero memberships.
 *
 * Refuses unless the company is already archived (forces archive-first
 * as a speed bump) and the typed-name confirmation matches.
 */
export async function POST(request: NextRequest) {
  try {
    const { companyId, confirmName } = (await request.json()) as {
      companyId?: string;
      confirmName?: string;
    };

    if (!companyId || !confirmName) {
      return NextResponse.json(
        { error: "companyId and confirmName are required." },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();
    const adminAuth = getAdminAuth();
    const companyRef = adminDb.doc(`companies/${companyId}`);
    const snap = await companyRef.get();
    if (!snap.exists) {
      return NextResponse.json(
        { error: "Company not found." },
        { status: 404 }
      );
    }

    const data = snap.data() ?? {};
    if (data.isActive !== false) {
      return NextResponse.json(
        { error: "Company must be archived before it can be permanently deleted." },
        { status: 409 }
      );
    }

    if (data.name !== confirmName) {
      return NextResponse.json(
        { error: "Typed name does not match the company name." },
        { status: 400 }
      );
    }

    // Collect every uid that has touched this company:
    //  - active users in /users
    //  - archived users in /usersArchived
    //  - any uid whose userMappings.memberships includes this companyId
    const uidSet = new Set<string>();

    const usersSnap = await adminDb
      .collection(`companies/${companyId}/users`)
      .get();
    for (const d of usersSnap.docs) uidSet.add(d.id);

    const archivedSnap = await adminDb
      .collection(`companies/${companyId}/usersArchived`)
      .get();
    for (const d of archivedSnap.docs) {
      // Archive doc IDs may be `${uid}` or `${uid}_<timestamp>` — peel the suffix.
      const stored = (d.data().uid as string | undefined) ?? d.id.split("_")[0];
      uidSet.add(stored);
    }

    // Sweep userMappings as well — covers any uid whose per-company user
    // doc was removed but whose membership wasn't cleaned up. Cheap because
    // userMappings is one doc per global user.
    const mappingsSnap = await adminDb.collection("userMappings").get();
    for (const d of mappingsSnap.docs) {
      const m = d.data();
      const memberships = Array.isArray(m.memberships) ? m.memberships : [];
      if (
        memberships.some(
          (x: { companyId?: string }) => x.companyId === companyId
        ) ||
        m.companyId === companyId
      ) {
        uidSet.add(d.id);
      }
    }

    // Recursively delete the company doc + all subcollections in one call.
    await adminDb.recursiveDelete(companyRef);

    // Update userMappings for each affected uid; collect uids whose Auth
    // accounts can now be deleted (zero remaining memberships, not superadmin).
    const authDeleteCandidates: string[] = [];
    let mappingsUpdated = 0;

    for (const uid of Array.from(uidSet)) {
      const mappingRef = adminDb.doc(`userMappings/${uid}`);
      const mSnap = await mappingRef.get();
      if (!mSnap.exists) continue;
      const m = mSnap.data() ?? {};
      const memberships = Array.isArray(m.memberships) ? m.memberships : [];
      const remaining = memberships.filter(
        (x: { companyId?: string }) => x.companyId !== companyId
      );

      const updates: Record<string, unknown> = { memberships: remaining };
      if (m.companyId === companyId) {
        if (remaining.length > 0) {
          updates.companyId = remaining[0].companyId;
          updates.role = remaining[0].role;
        } else {
          updates.companyId = null;
        }
      }

      const isSuperadmin = m.isSuperadmin === true || m.role === "superadmin";

      if (remaining.length === 0 && !isSuperadmin) {
        // No remaining memberships and not a superadmin → wipe the mapping
        // and queue Auth deletion. They have no way to use the app anymore.
        await mappingRef.delete();
        authDeleteCandidates.push(uid);
      } else {
        await mappingRef.update(updates);
      }
      mappingsUpdated++;
    }

    // Delete orphaned Auth accounts. Failures here are non-fatal — the
    // Firestore side is already consistent and we don't want to roll back.
    let authDeleted = 0;
    const authErrors: string[] = [];
    for (const uid of authDeleteCandidates) {
      try {
        await adminAuth.deleteUser(uid);
        authDeleted++;
      } catch (e) {
        authErrors.push(
          `${uid}: ${e instanceof Error ? e.message : "unknown error"}`
        );
      }
    }

    return NextResponse.json({
      success: true,
      mappingsUpdated,
      authDeleted,
      authErrors,
    });
  } catch (err) {
    console.error("Delete company error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to delete company.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

