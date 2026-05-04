import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { sendWelcomeEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      companyId,
      email,
      displayName,
      role,
      teamId,
      // Optional: assign the new user as the leader of an existing team.
      // The UI must already have confirmed any leader replacement.
      leadsExistingTeamId,
      // Optional: create a brand-new team and make the new user its leader.
      // { name: string, parentTeamId: string }
      leadsNewTeam,
    } = body as {
      companyId?: string;
      email?: string;
      displayName?: string;
      role?: string;
      teamId?: string;
      leadsExistingTeamId?: string;
      leadsNewTeam?: { name?: string; parentTeamId?: string };
    };

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

    if (leadsExistingTeamId && leadsNewTeam) {
      return NextResponse.json(
        { error: "Specify either an existing team or a new team to lead, not both." },
        { status: 400 }
      );
    }

    if (leadsNewTeam && (!leadsNewTeam.name?.trim() || !leadsNewTeam.parentTeamId)) {
      return NextResponse.json(
        { error: "New team requires both a name and a parent team." },
        { status: 400 }
      );
    }

    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();
    const trimmedEmail = email.trim();

    // Pre-flight: if creating a new team, verify the parent exists and the
    // proposed name doesn't duplicate an existing sibling.
    if (companyId && leadsNewTeam) {
      const parentRef = adminDb.doc(`companies/${companyId}/teams/${leadsNewTeam.parentTeamId}`);
      const parentSnap = await parentRef.get();
      if (!parentSnap.exists) {
        return NextResponse.json(
          { error: "Parent team not found." },
          { status: 404 }
        );
      }

      const proposedName = leadsNewTeam.name!.trim();
      const dupSnap = await adminDb
        .collection("companies")
        .doc(companyId)
        .collection("teams")
        .where("parentTeamId", "==", leadsNewTeam.parentTeamId)
        .where("name", "==", proposedName)
        .get();
      if (!dupSnap.empty) {
        return NextResponse.json(
          { error: `A team named "${proposedName}" already exists under this parent.` },
          { status: 409 }
        );
      }
    }

    // Pre-flight: if assigning to an existing team, verify it exists.
    if (companyId && leadsExistingTeamId) {
      const teamRef = adminDb.doc(`companies/${companyId}/teams/${leadsExistingTeamId}`);
      const teamSnap = await teamRef.get();
      if (!teamSnap.exists) {
        return NextResponse.json(
          { error: "Team to lead not found." },
          { status: 404 }
        );
      }
    }

    // Per-company duplicate check (only for company users — superadmins live
    // outside any company). Archived users live in /usersArchived and won't
    // match this query, so the email is correctly free at this company.
    if (companyId) {
      const dupSnap = await adminDb
        .collection("companies")
        .doc(companyId)
        .collection("users")
        .where("email", "==", trimmedEmail)
        .get();

      if (!dupSnap.empty) {
        return NextResponse.json(
          { error: "A user with this email already exists at this company." },
          { status: 409 }
        );
      }
    }

    // Generate temp password (used only for fresh Auth accounts).
    const tempPassword =
      Math.random().toString(36).slice(2, 8) +
      Math.random().toString(36).slice(2, 4).toUpperCase() +
      "!";

    let uid: string;
    let createdFreshAuthAccount = false;

    try {
      const userRecord = await adminAuth.createUser({
        email: trimmedEmail,
        password: tempPassword,
        displayName,
      });
      uid = userRecord.uid;
      createdFreshAuthAccount = true;
    } catch (createErr: unknown) {
      const code =
        createErr && typeof createErr === "object" && "code" in createErr
          ? (createErr as { code: string }).code
          : "";
      if (code === "auth/email-already-exists") {
        // Email belongs to an existing Auth account — this is the
        // multi-company case. Reuse the same global Auth identity and add
        // a NEW per-company membership. Do NOT touch the existing
        // password, displayName, or other companies' Firestore docs.
        const existingUser = await adminAuth.getUserByEmail(trimmedEmail);
        uid = existingUser.uid;

        if (companyId) {
          // Defensive: confirm /companies/{cid}/users/{uid} is empty.
          // Should be — the per-company duplicate check above already
          // proved no active doc holds this email at this company, but
          // the doc could still exist with a different email field.
          const slotSnap = await adminDb
            .doc(`companies/${companyId}/users/${uid}`)
            .get();
          if (slotSnap.exists) {
            return NextResponse.json(
              {
                error:
                  "This person is already a member of this company under a different email. Update their existing record instead.",
              },
              { status: 409 }
            );
          }
        }
      } else {
        throw createErr;
      }
    }

    // Update userMappings: set legacy fields if absent, append membership.
    const mappingRef = adminDb.doc(`userMappings/${uid}`);
    const mappingSnap = await mappingRef.get();
    const now = new Date();

    if (mappingSnap.exists) {
      const existing = mappingSnap.data() ?? {};
      const memberships = Array.isArray(existing.memberships)
        ? existing.memberships
        : [];
      const updates: Record<string, unknown> = {};

      if (companyId) {
        const filtered = memberships.filter(
          (m: { companyId?: string }) => m.companyId !== companyId
        );
        updates.memberships = [
          ...filtered,
          { companyId, role, addedAt: now },
        ];
      }

      // Keep legacy fields populated for back-compat. If this is a fresh
      // mapping or the legacy companyId was cleared, point it at the new
      // company so old reader code still works.
      if (role === "superadmin") {
        updates.role = "superadmin";
        updates.isSuperadmin = true;
      } else if (companyId && (!existing.companyId || existing.role !== role)) {
        // Don't overwrite an existing companyId/role that points at a
        // different active membership. Only set if currently empty.
        if (!existing.companyId) {
          updates.companyId = companyId;
          updates.role = role;
        }
      }

      await mappingRef.update(updates);
    } else {
      const memberships =
        companyId && role !== "superadmin"
          ? [{ companyId, role, addedAt: now }]
          : [];
      await mappingRef.set({
        companyId: companyId || null,
        role,
        memberships,
        ...(role === "superadmin" ? { isSuperadmin: true } : {}),
      });
    }

    // Create superadmin doc (no company scope)
    if (role === "superadmin") {
      await adminDb.doc(`superadmin/${uid}`).set({
        uid,
        email: trimmedEmail,
        displayName,
        role,
        createdAt: now,
      });
    }

    // Create company user doc (for non-superadmin users)
    if (companyId) {
      await adminDb.doc(`companies/${companyId}/users/${uid}`).set({
        uid,
        email: trimmedEmail,
        displayName,
        role,
        isActive: true,
        teamIds: teamId ? [teamId] : [],
        createdAt: now,
      });
    }

    // Team-to-lead assignment.
    //  - leadsExistingTeamId → flip leaderId on the existing team.
    //  - leadsNewTeam       → create a new team with the new user as leader.
    let ledTeamId: string | null = null;
    let replacedLeaderId: string | null = null;
    if (companyId && leadsExistingTeamId) {
      const teamRef = adminDb.doc(`companies/${companyId}/teams/${leadsExistingTeamId}`);
      const teamSnap = await teamRef.get();
      const prev = teamSnap.data() ?? {};
      replacedLeaderId = prev.leaderId || null;
      await teamRef.update({
        leaderId: uid,
        leaderName: displayName,
        leaderTitle: prev.leaderTitle || "",
        updatedAt: now,
      });
      ledTeamId = leadsExistingTeamId;
    } else if (companyId && leadsNewTeam) {
      const parentRef = adminDb.doc(`companies/${companyId}/teams/${leadsNewTeam.parentTeamId!}`);
      const parentSnap = await parentRef.get();
      const parent = parentSnap.data() ?? {};
      const parentLevel = typeof parent.level === "number" ? parent.level : 0;
      const newTeamRef = adminDb.collection(`companies/${companyId}/teams`).doc();
      await newTeamRef.set({
        name: leadsNewTeam.name!.trim(),
        parentTeamId: leadsNewTeam.parentTeamId!,
        level: parentLevel + 1,
        leaderId: uid,
        leaderName: displayName,
        leaderTitle: "",
        createdAt: now,
        updatedAt: now,
      });
      ledTeamId = newTeamRef.id;
    }

    // Email handling:
    //  - Fresh Auth account → send welcome email with password reset link.
    //  - Existing Auth account (added to a new company) → skip the password
    //    reset. The user already has working credentials; sending a reset
    //    link would be confusing and a security footgun.
    let resetLink = "";
    let emailSent = false;
    let emailError: string | null = null;
    if (createdFreshAuthAccount) {
      try {
        resetLink = await adminAuth.generatePasswordResetLink(trimmedEmail);
        await sendWelcomeEmail(trimmedEmail, displayName, resetLink);
        emailSent = true;
      } catch (emailErr) {
        console.error("Welcome email error:", emailErr);
        emailError =
          emailErr instanceof Error
            ? emailErr.message
            : "Failed to send welcome email.";
      }
    }

    return NextResponse.json({
      uid,
      resetLink,
      reusedExistingAuth: !createdFreshAuthAccount,
      emailSent,
      emailError,
      ledTeamId,
      replacedLeaderId,
    });
  } catch (err: unknown) {
    console.error("User creation error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to create user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
