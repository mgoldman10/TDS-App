import { Timestamp } from "firebase/firestore";

export interface Team {
  id: string;
  name: string;
  parentTeamId: string | null; // null = top-level team
  leaderId: string;       // userId or empty string
  leaderName: string;     // display name for convenience
  leaderTitle: string;    // leader's job title
  level: number;          // 0 = top-level, 1 = sub-team, 2 = sub-sub-team, etc.
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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Tracks changes to a team member's role, team, or reporting line */
export interface TeamMemberChange {
  id: string;
  memberId: string;
  changeType: "role" | "team" | "reporting_line";
  previousValue: string;
  newValue: string;
  changedAt: Timestamp;
  changedByUserId: string;
}
