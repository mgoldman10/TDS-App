import { Timestamp } from "firebase/firestore";

export interface TeamLeaderChange {
  previousLeaderId: string;
  previousLeaderName: string;
  newLeaderId: string;
  newLeaderName: string;
  changedAt: Timestamp;
  changedByUserId: string;
  effectiveDate: string;     // ISO date string (YYYY-MM-DD)
  fiscalYear: number;
  fiscalQuarter: number;
}

export interface Team {
  id: string;
  name: string;
  parentTeamId: string | null; // null = top-level team
  leaderId: string;       // userId or empty string
  leaderName: string;     // display name for convenience
  leaderTitle: string;    // leader's job title
  level: number;          // 0 = top-level, 1 = sub-team, 2 = sub-sub-team, etc.
  leaderHistory?: TeamLeaderChange[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;           // job title / role description
  teamId: string;
  reportsToUserId: string; // the leader who evaluates this person
  isAppUser: boolean;     // true only if separately set up as a company user
  appUserId: string | null; // linked userId if isAppUser
  status: "active" | "archived";
  archivedAt: Timestamp | null;
  archivedReason: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type MemberChangeType = "role" | "team" | "reporting_line" | "promoted_to_leader" | "archived" | "leader_change";

/** Tracks changes to a team member's role, team, or reporting line */
export interface TeamMemberChange {
  id: string;
  memberId: string;
  changeType: MemberChangeType;
  previousValue: string;
  newValue: string;
  changedAt: Timestamp;
  changedByUserId: string;
  effectiveDate: string;     // ISO date string (YYYY-MM-DD)
  fiscalYear: number;
  fiscalQuarter: number;
}
