import type { Team, TeamMember } from "@/types/team";
import type { UserProfile } from "@/types/auth";
import { getTeams, getAllTeamMembers, getTeamsByLeader } from "@/lib/team-service";
import { canViewAllTeams } from "@/lib/permissions";

/** Recursively collect a team ID and all its descendant sub-team IDs */
export function getSubTeamIds(teamId: string, allTeams: Team[]): Set<string> {
  const ids = new Set<string>([teamId]);
  let added = true;
  while (added) {
    added = false;
    for (const t of allTeams) {
      if (t.parentTeamId && ids.has(t.parentTeamId) && !ids.has(t.id)) {
        ids.add(t.id);
        added = true;
      }
    }
  }
  return ids;
}

/** Get the set of team IDs this user is authorized to see */
export async function getAuthorizedTeamIds(
  companyId: string,
  profile: UserProfile
): Promise<Set<string>> {
  const allTeams = await getTeams(companyId);

  if (canViewAllTeams(profile)) {
    return new Set(allTeams.map((t) => t.id));
  }

  const myTeams = await getTeamsByLeader(companyId, profile.uid);
  const authIds = new Set<string>();
  for (const t of myTeams) {
    const subIds = getSubTeamIds(t.id, allTeams);
    Array.from(subIds).forEach((id) => authIds.add(id));
  }
  return authIds;
}

/** Get the set of member IDs this user is authorized to see */
export async function getAuthorizedMemberIds(
  companyId: string,
  profile: UserProfile
): Promise<{ authorizedTeamIds: Set<string>; authorizedMemberIds: Set<string>; allMembers: TeamMember[]; allTeams: Team[] }> {
  const [allTeams, allMembers] = await Promise.all([
    getTeams(companyId),
    getAllTeamMembers(companyId),
  ]);

  if (canViewAllTeams(profile)) {
    return {
      authorizedTeamIds: new Set(allTeams.map((t) => t.id)),
      authorizedMemberIds: new Set(allMembers.map((m) => m.id)),
      allMembers,
      allTeams,
    };
  }

  const myTeams = await getTeamsByLeader(companyId, profile.uid);
  const authTeamIds = new Set<string>();
  for (const t of myTeams) {
    const subIds = getSubTeamIds(t.id, allTeams);
    Array.from(subIds).forEach((id) => authTeamIds.add(id));
  }

  const authMemberIds = new Set(
    allMembers.filter((m) => authTeamIds.has(m.teamId)).map((m) => m.id)
  );

  return {
    authorizedTeamIds: authTeamIds,
    authorizedMemberIds: authMemberIds,
    allMembers: allMembers.filter((m) => authTeamIds.has(m.teamId)),
    allTeams: allTeams.filter((t) => authTeamIds.has(t.id)),
  };
}
