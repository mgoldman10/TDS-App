import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * Assign an existing user as the leader of a team.
 * Either flips leadership on an existing team or creates a new team with this user as leader.
 * Does NOT touch team membership — leadership and membership are independent (a leader of
 * one team need not be a member of any specific other team).
 */
export async function POST(request: NextRequest) {
  try {
    const { companyId, userId, leadsExistingTeamId, leadsNewTeam } =
      (await request.json()) as {
        companyId?: string;
        userId?: string;
        leadsExistingTeamId?: string;
        leadsNewTeam?: { name?: string; parentTeamId?: string };
      };

    if (!companyId || !userId) {
      return NextResponse.json(
        { error: "companyId and userId are required." },
        { status: 400 }
      );
    }

    if (leadsExistingTeamId && leadsNewTeam) {
      return NextResponse.json(
        { error: "Specify either an existing team or a new team to lead, not both." },
        { status: 400 }
      );
    }

    if (!leadsExistingTeamId && !leadsNewTeam) {
      return NextResponse.json(
        { error: "Specify a team to lead." },
        { status: 400 }
      );
    }

    if (leadsNewTeam && (!leadsNewTeam.name?.trim() || !leadsNewTeam.parentTeamId)) {
      return NextResponse.json(
        { error: "New team requires both a name and a parent team." },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();

    // Look up the user to get their displayName for leaderName.
    const userSnap = await adminDb.doc(`companies/${companyId}/users/${userId}`).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found in this company." }, { status: 404 });
    }
    const userData = userSnap.data() ?? {};
    const displayName: string = userData.displayName ?? "";

    const now = new Date();
    let ledTeamId: string;
    let replacedLeaderId: string | null = null;

    if (leadsExistingTeamId) {
      const teamRef = adminDb.doc(`companies/${companyId}/teams/${leadsExistingTeamId}`);
      const teamSnap = await teamRef.get();
      if (!teamSnap.exists) {
        return NextResponse.json({ error: "Team not found." }, { status: 404 });
      }
      const prev = teamSnap.data() ?? {};
      replacedLeaderId = prev.leaderId || null;
      await teamRef.update({
        leaderId: userId,
        leaderName: displayName,
        leaderTitle: prev.leaderTitle || "",
        updatedAt: now,
      });
      ledTeamId = leadsExistingTeamId;
    } else {
      // leadsNewTeam (validated above)
      const parentRef = adminDb.doc(`companies/${companyId}/teams/${leadsNewTeam!.parentTeamId!}`);
      const parentSnap = await parentRef.get();
      if (!parentSnap.exists) {
        return NextResponse.json({ error: "Parent team not found." }, { status: 404 });
      }
      const proposedName = leadsNewTeam!.name!.trim();
      const dupSnap = await adminDb
        .collection("companies")
        .doc(companyId)
        .collection("teams")
        .where("parentTeamId", "==", leadsNewTeam!.parentTeamId!)
        .where("name", "==", proposedName)
        .get();
      if (!dupSnap.empty) {
        return NextResponse.json(
          { error: `A team named "${proposedName}" already exists under this parent.` },
          { status: 409 }
        );
      }

      const parent = parentSnap.data() ?? {};
      const parentLevel = typeof parent.level === "number" ? parent.level : 0;
      const newTeamRef = adminDb.collection(`companies/${companyId}/teams`).doc();
      await newTeamRef.set({
        name: proposedName,
        parentTeamId: leadsNewTeam!.parentTeamId!,
        level: parentLevel + 1,
        leaderId: userId,
        leaderName: displayName,
        leaderTitle: "",
        createdAt: now,
        updatedAt: now,
      });
      ledTeamId = newTeamRef.id;
    }

    return NextResponse.json({ success: true, ledTeamId, replacedLeaderId });
  } catch (err) {
    console.error("Assign team error:", err);
    const message = err instanceof Error ? err.message : "Failed to assign team.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
