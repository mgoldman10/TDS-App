# TDS Seed Schema Reconnaissance — Phase 6a

**Status:** Reconnaissance only. No seed code written, no database touched.

**Purpose:** Inventory every Firestore collection, document shape, and onboarding
side effect in the TDS codebase as a basis for writing the staging seed script
(Phase 6b+).

**Sources of truth read for this report:**
- `firestore.rules` — every named collection / wildcard subcollection rule
- `firestore.indexes.json` — composite-index collection group names
- `src/types/*.ts` — `auth.ts`, `company.ts`, `team.ts`, `corevalue.ts`,
  `productivity.ts`, `assessment.ts`, `actionplan.ts`, `coach.ts`
- `src/lib/*-service.ts` — `auth-service`, `company-service`, `user-service`,
  `team-service`, `corevalue-service`, `productivity-service`,
  `assessment-service`, `actionplan-service`, `coach-service`, `permissions`
- `src/app/api/users/{create,archive,restore,assign-team,update-email}/route.ts`
- `src/app/api/companies/{archive,restore,delete}/route.ts`
- `src/app/api/askmike/route.ts`

---

## SECTION 1 — Firestore Collection Inventory

There are **6 top-level collection paths** and **9 tenant-scoped subcollections**
under `/companies/{companyId}/`. Field shapes are taken from the TypeScript
type definitions and cross-checked against the service-layer writes (those are
what actually lands in Firestore).

### Top-level collections

#### `/userMappings/{uid}`
- **Purpose:** Maps a Firebase Auth UID to one or more company memberships; the
  first lookup every signed-in user does on load. Also flags superadmins.
- **Rules:** Self can read; **any authenticated user can write** (broad write
  rule — flagged in Section 2).
- **Tenant-scoped:** No.
- **Doc ID:** Firebase Auth UID.
- **Fields** (`UserMapping` in `types/auth.ts`):
  - `companyId: string | null` — legacy single-tenant pointer (required, may be `null`)
  - `role: UserRole` — legacy single-tenant role (required)
  - `memberships?: CompanyMembership[]` — preferred multi-tenant form
    - `{ companyId: string, role: UserRole, addedAt: Timestamp }`
  - `isSuperadmin?: boolean` — set true alongside `role: "superadmin"`
- **Notes:** Legacy fields (`companyId`, `role`) are kept populated for
  back-compat with older reader code; `memberships[]` is canonical for new
  writes (see `api/users/create/route.ts` lines 178–226).

#### `/superadmin/{uid}`
- **Purpose:** Marker doc + display profile for superadmins. Existence is
  checked by `firestore.rules` to elevate permissions on `/companies/*` and on
  AskMike admin paths.
- **Rules:** Self read only. **No write rule** → Admin SDK / seed script only.
- **Tenant-scoped:** No.
- **Doc ID:** Firebase Auth UID.
- **Fields** (from `api/users/create/route.ts` line 230):
  - `uid: string` (required)
  - `email: string` (required)
  - `displayName: string` (required)
  - `role: "superadmin"` (required)
  - `createdAt: Timestamp` (required)

#### `/companies/{companyId}`
- **Purpose:** Tenant root. One doc per client company.
- **Rules:** Read by superadmin OR by any user existing at
  `/companies/{cid}/users/{uid}`. Create/update by superadmin only.
- **Tenant-scoped:** This IS the tenant root.
- **Doc ID:** Firestore auto-id (`addDoc` in `company-service.ts` line 35).
- **Fields** (`Company` in `types/company.ts`):
  - `name: string` (required)
  - `fiscalYearStartMonth: number` (required, 1–12, default `1`)
  - `scoringParameters: ScoringParameters` (required, defaults from
    `DEFAULT_SCORING_PARAMETERS`):
    - `hpCultureFitMin: number` (default `9`)
    - `hpProductivityMin: number` (default `9`)
    - `lcfCultureFitMax: number` (default `7.5`)
    - `lpProductivityMax: number` (default `6.5`)
    - `cultureFitRatingScores: { models, lives, occasional, frequent }`
      (defaults 10/9/7/1)
    - `cultureFitCaps: { occasionalCap, frequentCap }` (defaults 8.4/7.4)
  - `tdiGoals?: TdiGoals` — optional, lazily added later by the goals UI
    - `quarterly?: Record<"FY-FQ", QuarterlyTdiGoal>` (canonical)
    - `company?: number`, `teams?: Record<teamId, number>` (legacy flat fallback)
  - `isActive?: boolean` — missing/true = active; false = archived
  - `archivedAt?: Timestamp`
  - `createdAt: Timestamp` (required)
  - `updatedAt: Timestamp` (required)
- **Subcollections used:** `users`, `usersArchived`, `teams`, `teamMembers`,
  `teamMemberChanges`, `coreValues`, `productivityTargets`, `assessments`,
  `actionPlans` (all listed below; none are pre-created on company creation).

#### `/config/askmike/coaches/{coachId}`
- **Purpose:** AskMike coach personas (system prompt, intro, refdoc links).
  Global to the app, not per-company.
- **Rules:** Read by any authenticated user; write by superadmin only.
- **Tenant-scoped:** No.
- **Doc ID:** Firestore auto-id (`addDoc` in `coach-service.ts` line 49).
- **Fields** (`Coach` in `types/coach.ts`):
  - `name: string` (required)
  - `description: string` (required)
  - `systemPrompt: string` (required)
  - `chatIntro: string` (required)
  - `referenceDocIds: string[]` (required, may be empty)
  - `isActive: boolean` (required)
  - `order: number` (required)
  - `createdAt: Timestamp` (required)
  - `updatedAt: Timestamp` (required)
- **Notes:** `ensureDefaultCoaches()` in `coach-service.ts` lazily seeds two
  coaches ("People Coach", "Difficult Conversations Coach") the first time the
  collection is read empty. Called from the member detail page on render
  (`src/app/(dashboard)/members/[id]/page.tsx` line 130). The seed script can
  either reuse this helper or pre-write the same two docs explicitly.

#### `/config/askmike/refdocs/{id}`
- **Purpose:** Reference documents (uploaded PDFs/text) that coaches can cite.
- **Rules:** Same as `/config/askmike/coaches`.
- **Tenant-scoped:** No.
- **Doc ID:** Firestore auto-id (`addDoc` in `coach-service.ts` line 255).
- **Fields** (`ReferenceDocument` in `types/coach.ts`):
  - `title: string` (required)
  - `fileName: string` (required)
  - `fileUrl: string` (required, points at Cloud Storage)
  - `textContent: string` (required, full extracted text for prompt assembly)
  - `createdAt: Timestamp` (required)

#### `/config/askmike/transcripts/{transcriptId}`
- **Purpose:** Saved AskMike chat transcripts per user/member/coach.
- **Rules:** Create: requester writes `userId === auth.uid`. Update: only
  transcript owner. Read: owner OR superadmin.
- **Tenant-scoped:** No (but each doc carries `companyId` for filtering).
- **Doc ID:** Firestore auto-id (`addDoc` in `coach-service.ts` line 161).
- **Fields** (`Transcript` in `types/coach.ts`):
  - `coachId: string` (required)
  - `companyId: string` (required)
  - `userId: string` (required, must match `auth.uid` on create — rule-enforced)
  - `userDisplayName: string` (required)
  - `memberId: string | null` (required)
  - `memberName: string | null` (required)
  - `title?: string` (optional, auto-generated)
  - `messages: ChatMessage[]` (required, `{ role: "user"|"assistant", content: string }`)
  - `createdAt: Timestamp` (required)
  - `updatedAt: Timestamp` (required)

---

### Company-scoped subcollections (under `/companies/{companyId}/...`)

All of these match the catch-all rule
`/companies/{companyId}/{subcollection}/{docId}` (read/write by superadmin OR
any user existing at `/companies/{companyId}/users/{uid}`), **except** `users`
itself which has its own explicit (functionally equivalent) rule block. The
specific subcollection names are determined entirely by the application code,
not by the rules.

#### `/companies/{cid}/users/{userId}`
- **Purpose:** App-user profile within a specific company. One doc per
  `(companyId, uid)` pair.
- **Doc ID:** Firebase Auth UID (same uid as `/userMappings`).
- **Fields** (`UserProfile` in `types/auth.ts`, write site at
  `api/users/create/route.ts` line 241):
  - `uid: string` (required)
  - `email: string` (required)
  - `displayName: string` (required)
  - `role: UserRole` (required — `"company_admin"`, `"senior_leader"`, or
    `"leader"`; never `"superadmin"` at this path)
  - `companyId: string` — present in the type but **not written** by the create
    route; it's reconstructed at read time from the doc's parent path (see
    `auth-service.ts` line 37). The type definition is misleading on this point.
  - `teamIds: string[]` (required, may be empty)
  - `isActive: boolean` (required, defaults true)
  - `archivedAt?: Timestamp`
  - `archivedEmail?: string`
  - `createdAt: Timestamp` (required)

#### `/companies/{cid}/usersArchived/{userId}`
- **Purpose:** Soft-delete destination for archived users. Cascade target when
  a user is archived.
- **Doc ID:** Either the original `uid`, or `${uid}_${timestamp}` if that
  user was previously archived/restored in this company (see
  `api/users/archive/route.ts` lines 57–67).
- **Fields:** Same shape as `/companies/{cid}/users/{userId}` plus:
  - `isActive: false` (always)
  - `archivedAt: Timestamp` (required)
  - `archivedEmail: string` (original email at time of archive)

#### `/companies/{cid}/teams/{teamId}`
- **Purpose:** Org-chart team with a leader and an optional parent team.
- **Doc ID:** Firestore auto-id.
- **Fields** (`Team` in `types/team.ts`, write site in `team-service.ts` line 40):
  - `name: string` (required)
  - `parentTeamId: string | null` (required; `null` = top-level)
  - `leaderId: string` (required; uid of leader, or empty string if vacant)
  - `leaderName: string` (required; denormalized display name)
  - `leaderTitle: string` (required; denormalized job title)
  - `level: number` (required; 0 = top-level, 1 = sub-team, etc.)
  - `leaderHistory?: TeamLeaderChange[]` (optional, appended via `arrayUnion`)
  - `createdAt: Timestamp` (required)
  - `updatedAt: Timestamp` (required)
- **Notes:** `ensureTopLevelTeam()` lazily creates a `"Senior Leadership Team"`
  top-level team the first time it's needed (`team-service.ts` lines 49–63).
  A new company starts with **zero** team docs.

#### `/companies/{cid}/teamMembers/{memberId}`
- **Purpose:** A person being evaluated. May or may not also be an app user.
- **Doc ID:** Firestore auto-id.
- **Fields** (`TeamMember` in `types/team.ts`, write site in `team-service.ts` line 118):
  - `name: string` (required)
  - `role: string` (required; job title)
  - `teamId: string` (required)
  - `reportsToUserId: string` (required; uid of the evaluating leader)
  - `isAppUser: boolean` (required, defaults false)
  - `appUserId: string | null` (required, defaults null; links to
    `/companies/{cid}/users/{uid}` when `isAppUser`)
  - `status: "active" | "archived"` (required, defaults `"active"`)
  - `archivedAt: Timestamp | null` (required, defaults null)
  - `archivedReason: string | null` (required, defaults null)
  - `createdAt: Timestamp` (required)
  - `updatedAt: Timestamp` (required)
- **Schema oddity worth noting:** `team-service.ts` line 432 queries
  `teamMembers` by an `email` field for duplicate detection, but no `email`
  field appears in the `TeamMember` type or in `createTeamMember`. Either
  legacy data has it, or that branch is dead. Seed script does not need to
  write `email` on `teamMembers`.

#### `/companies/{cid}/teamMemberChanges/{changeId}`
- **Purpose:** Audit log of role / team / reporting-line / leadership /
  archive changes for each team member. Used by reporting to correlate
  category shifts with org changes.
- **Doc ID:** Firestore auto-id.
- **Fields** (`TeamMemberChange` in `types/team.ts`, write site in
  `team-service.ts` line 270):
  - `memberId: string` (required)
  - `changeType: "role" | "team" | "reporting_line" | "promoted_to_leader" | "archived" | "leader_change"` (required)
  - `previousValue: string` (required)
  - `newValue: string` (required)
  - `changedAt: Timestamp` (required)
  - `changedByUserId: string` (required)
  - `effectiveDate: string` (required; ISO `YYYY-MM-DD`)
  - `fiscalYear: number` (required)
  - `fiscalQuarter: number` (required)
- **Notes:** Not needed for a minimal seed. Only populated as users edit
  members over time.

#### `/companies/{cid}/coreValues/{valueId}`
- **Purpose:** Company core values for culture-fit scoring.
- **Doc ID:** Firestore auto-id.
- **Fields** (`CoreValue` in `types/corevalue.ts`, write site in
  `corevalue-service.ts` line 30):
  - `name: string` (required)
  - `description: string` (required, may be empty)
  - `behaviors: string[]` (required, may be empty)
  - `order: number` (required; controls display sort)
  - `createdAt: Timestamp` (required)
- **Notes:** A company with zero core values can still log in, but culture-fit
  assessment cannot be entered. Recommended for a usable seed: 3–7 values.

#### `/companies/{cid}/productivityTargets/{targetId}`
- **Purpose:** Per-member KPI targets (Job Scorecard, Step 1). Weights across
  one member's targets must sum to 100%.
- **Doc ID:** Firestore auto-id.
- **Fields** (`ProductivityTarget` in `types/productivity.ts`, write site in
  `productivity-service.ts` line 52):
  - `memberId: string` (required; refers to a `teamMembers` doc)
  - `name: string` (required)
  - `type: "bigger" | "smaller"` (required)
  - `unit: "units" | "dollars" | "percentage"` (required)
  - `frequency: "quarterly" | "monthly"` (required)
  - `weight: number` (required; 0–100, sums to 100 across one member)
  - `target: number` (required)
  - `min: number` (required; for `bigger`)
  - `max: number` (required; for `smaller`)
  - `monthlyTargets: MonthlyValues | null` (required field, null when quarterly)
  - `monthlyMin: MonthlyValues | null` (required field)
  - `monthlyMax: MonthlyValues | null` (required field)
  - `order: number` (required; controls display sort within a member)
  - `createdAt: Timestamp` (required)

#### `/companies/{cid}/assessments/{assessmentId}`
- **Purpose:** Quarterly culture-fit + productivity assessment per member.
  Composite key is effectively `(memberId, fiscalYear, fiscalQuarter)` —
  there's no uniqueness enforcement in code; the UI looks up by that triple.
- **Doc ID:** Firestore auto-id.
- **Fields** (`Assessment` in `types/assessment.ts`, write site in
  `assessment-service.ts` line 71):
  - `memberId: string` (required)
  - `memberName: string` (required; denormalized for sort/display)
  - `assessedByUserId: string` (required)
  - `fiscalYear: number` (required)
  - `fiscalQuarter: number` (required; 1–4)
  - `cultureFitScores: CultureFitScore[]` (required; one per core value
    — `{ coreValueId, coreValueName, rating: "models"|"lives"|"occasional"|"frequent" }`)
  - `cultureFitScore: number` (required; calculated 0–10 with caps applied)
  - `productivityActuals: ProductivityActual[]` (required; one per target —
    `{ targetId, targetName, actual: number | null, monthlyActuals: NullableMonthlyValues | null }`)
  - `productivityScore: number` (required; weighted sum 0–10)
  - `performanceCategory: "HP" | "MP" | "LP" | "LCF"` (required)
  - `quarterIncomplete?: boolean` (optional)
  - `completedMonths?: number` (optional; 1 or 2)
  - `createdAt: Timestamp` (required)
  - `updatedAt: Timestamp` (required)

#### `/companies/{cid}/actionPlans/{planId}`
- **Purpose:** Per-member action plan (Step 3). One plan doc per member,
  containing arrays of actions and coaching notes.
- **Doc ID:** Firestore auto-id.
- **Fields** (`ActionPlan` in `types/actionplan.ts`, write site in
  `actionplan-service.ts` line 151):
  - `memberId: string` (required)
  - `memberName: string` (required; denormalized)
  - `actions: ActionItem[]` (required, may be empty;
    `{ id, description, targetDate (ISO), completedAt (ISO|null), owner }`)
  - `notes: ActionNote[]` (required, may be empty;
    `{ id, actionItemId (string|null), text, createdAt: Timestamp }`)
  - `createdAt: Timestamp` (required)
  - `updatedAt: Timestamp` (required)
- **Notes:** The code has a known race that can produce >1 plan per member;
  the read path merges them (`getActionPlanForMember`, lines 61–106). The seed
  script should create at most one plan per member.

---

### Collection summary table

| Path | Tenant-scoped? | Doc ID | Required for basic login |
|---|---|---|---|
| `/userMappings/{uid}` | No | uid | YES — looked up on every session |
| `/superadmin/{uid}` | No | uid | Only for superadmin |
| `/companies/{cid}` | (is the root) | auto | YES (for company users) |
| `/companies/{cid}/users/{uid}` | Yes | uid | YES (for company users) |
| `/companies/{cid}/usersArchived/{docId}` | Yes | uid or `uid_ts` | No |
| `/companies/{cid}/teams/{teamId}` | Yes | auto | No (lazy-created) |
| `/companies/{cid}/teamMembers/{memberId}` | Yes | auto | No |
| `/companies/{cid}/teamMemberChanges/{id}` | Yes | auto | No |
| `/companies/{cid}/coreValues/{valueId}` | Yes | auto | No (but blocks culture-fit UI if missing) |
| `/companies/{cid}/productivityTargets/{id}` | Yes | auto | No |
| `/companies/{cid}/assessments/{id}` | Yes | auto | No |
| `/companies/{cid}/actionPlans/{planId}` | Yes | auto | No |
| `/config/askmike/coaches/{coachId}` | No | auto | No (lazy-seeded by `ensureDefaultCoaches`) |
| `/config/askmike/refdocs/{id}` | No | auto | No |
| `/config/askmike/transcripts/{id}` | No | auto | No |

---

## SECTION 2 — User Model

### Where do user records live after Firebase Auth creates them?

A single user creation flow (`POST /api/users/create`) writes to **three**
locations using the Admin SDK:

1. **`/userMappings/{uid}`** — always. Created or updated to include this
   company in `memberships[]`. Legacy `companyId`/`role` fields kept populated.
2. **`/superadmin/{uid}`** — only if `role === "superadmin"`.
3. **`/companies/{companyId}/users/{uid}`** — only if a `companyId` was
   supplied (i.e., role is not `"superadmin"`).

The Firebase Auth account is created first (`adminAuth.createUser`), giving the
uid that anchors all three Firestore writes. If the Auth account already exists
(e.g., adding an existing user to a second company), the existing uid is
reused and a new `/companies/{cid}/users/{uid}` doc is written.

### Required user fields

`/companies/{cid}/users/{uid}` write site (`api/users/create/route.ts` line 241):
```
{ uid, email, displayName, role, isActive: true, teamIds: [...], createdAt }
```

`/superadmin/{uid}` write site (line 230):
```
{ uid, email, displayName, role: "superadmin", createdAt }
```

`/userMappings/{uid}` (multi-tenant shape, written line 220):
```
{
  companyId: string | null,
  role: UserRole,
  memberships: [{ companyId, role, addedAt }],
  isSuperadmin?: true,  // only for superadmins
}
```

### Roles

Confirmed from `src/types/auth.ts` line 3:
```
type UserRole = "superadmin" | "company_admin" | "senior_leader" | "leader"
```

Hierarchy (line 6): `superadmin: 4 > company_admin: 3 > senior_leader: 2 > leader: 1`.
`isAtLeast()` enforces ordered comparisons in `src/lib/permissions.ts`.

### Top-level `/superadmin/{uid}` doc

**Yes — exists and is load-bearing.** `firestore.rules` checks
`exists(/superadmin/$(auth.uid))` to grant elevated permissions on:
- `/companies/{companyId}` create/update
- `/config/askmike/{subcollection}` writes
- `/config/askmike/transcripts/{id}` cross-user reads

`resolveUser()` in `auth-service.ts` routes superadmins to read from
`/superadmin/{uid}` instead of any `/companies/{cid}/users/{uid}` doc.

### `/userMappings` lookup table

**Yes — exists and is the very first read every signed-in user does.**
`getUserMapping()` (`auth-service.ts` line 25) fetches it; the result drives
the rest of `resolveUser()`:
- If `isSuperadmin: true` or `role === "superadmin"` → load `/superadmin/{uid}`.
- Otherwise → look at `memberships[]` (or fall back to legacy single
  `companyId`), filter against active companies, pick the preferred or
  earliest membership, and load `/companies/{cid}/users/{uid}`.

### Relationship between Auth UID and Firestore docs

Firebase Auth UID is the **doc ID** for `/userMappings/{uid}`,
`/superadmin/{uid}`, and `/companies/{cid}/users/{uid}`. One Auth identity
can therefore have:
- exactly one `/userMappings/{uid}` doc
- exactly one `/superadmin/{uid}` doc (only if superadmin)
- **N** `/companies/{cid}/users/{uid}` docs, one per company they're a member of
  (the multi-tenant case — `api/users/create/route.ts` line 151 reuses the
  existing Auth uid when `auth/email-already-exists` fires).

### Rules quirk to be aware of for seeding

The `/userMappings/{uid}` rule allows **any authenticated user to write any
userMappings doc**:
```
match /userMappings/{uid} {
  allow read: if request.auth != null && request.auth.uid == uid;
  allow write: if request.auth != null;
}
```
This is permissive by design (the create flow needs to be able to write
mappings for users other than the current one when an admin creates them via
the API route — and that route runs server-side under Admin SDK anyway), but
it means any seed script using the **client SDK with auth** could write these
docs without further setup. A seed script using the **Admin SDK** bypasses
rules entirely.

---

## SECTION 3 — Company Model

### Required fields on `/companies/{cid}`

From `createCompany()` in `company-service.ts` lines 35–42 (the only code path
that writes a fresh company doc):

```
{
  name,                                    // required from caller
  fiscalYearStartMonth: 1,                 // hardcoded default
  scoringParameters: DEFAULT_SCORING_PARAMETERS,  // hardcoded default
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
}
```

Optional fields that may appear later via `updateCompany()`:
- `tdiGoals` (added by the goals UI)
- `isActive: false` + `archivedAt` (when archived)

The seed script must write at minimum: `name`, `fiscalYearStartMonth`,
`scoringParameters` (full nested shape), `createdAt`, `updatedAt`. Use
`DEFAULT_SCORING_PARAMETERS` from `src/types/company.ts` verbatim unless the
seed needs to demonstrate custom thresholds.

### Subcollections that must exist for a company to function

**None at the storage layer.** Firestore creates subcollections implicitly on
the first write. A freshly created company doc is valid by itself; no
subcollection docs are required for login or for the dashboard to render
empty states.

**Functional requirements (what you need to seed for a USABLE company):**

| Need | Minimum seed |
|---|---|
| At least one user can log in | One `/companies/{cid}/users/{uid}` doc + matching `/userMappings/{uid}` + Auth account |
| User can see the org chart | At least one `/companies/{cid}/teams/{teamId}` doc (top-level, `parentTeamId: null`, `level: 0`) — code will lazy-create `"Senior Leadership Team"` if missing |
| User can enter culture-fit assessments | At least one `/companies/{cid}/coreValues/{valueId}` doc (recommended 3–7) |
| User can enter productivity assessments | At least one `/companies/{cid}/productivityTargets/{id}` doc per member, weights summing to 100 |
| User can see HP/MP/LP/LCF model populated | Above + at least one `/companies/{cid}/teamMembers/{memberId}` + one `/companies/{cid}/assessments/{id}` |
| AskMike works | `/config/askmike/coaches/*` populated (handled globally by `ensureDefaultCoaches`, not per-company) |

### "Starter" docs created automatically by the app

There is **no company-onboarding code path that pre-creates subcollection
docs**. `createCompany()` writes only the root doc. The two lazy seeders the
codebase does have:

1. **`ensureTopLevelTeam(companyId)`** in `team-service.ts` lines 49–63 —
   when called and no team with `parentTeamId === null` exists, creates one
   named `"Senior Leadership Team"` with vacant leader fields. Called on
   demand by features that need a default parent team, not at company creation.
2. **`ensureDefaultCoaches()`** in `coach-service.ts` lines 73–138 —
   when the global `/config/askmike/coaches` collection is empty, seeds
   "People Coach" and "Difficult Conversations Coach" with full
   `systemPrompt` and `chatIntro` strings embedded in the helper. Called from
   the member detail page render. **Note:** this is global, not per-company,
   so it runs at most once across the whole staging environment.

The spec mentions a third coach ("KPI Coach") that is **not** present in
`ensureDefaultCoaches`. The current code seeds only two. The seed script
should follow the code, not the spec, unless we're explicitly adding the
third coach as part of this work.

---

## Cross-cutting notes for whoever writes the seed script (Phase 6b)

These are observations the writer will want before designing the script —
not directives.

1. **Admin SDK vs client SDK.** Most rules let an authenticated user write
   what's needed (superadmin can write everything; `/userMappings` write is
   open to any authenticated user). But `/superadmin/{uid}` has **no write
   rule** → Admin SDK is required for the bootstrap superadmin doc. Simplest
   architecture: write the whole seed using Admin SDK and bypass rules entirely,
   consistent with how `api/users/create/route.ts` already works.
2. **Auth uid is the linchpin.** The same uid must appear as doc ID in
   `/userMappings/{uid}`, optionally `/superadmin/{uid}`, and each
   `/companies/{cid}/users/{uid}`. Seed flow needs to create the Auth account
   first, capture the uid, then write the three (or two) Firestore docs.
3. **All `Timestamp` fields are real Firestore Timestamps**, written via
   `serverTimestamp()` from client code or `new Date()` from the Admin SDK
   (which the SDK converts). Don't write ISO strings into `createdAt` /
   `updatedAt` — code paths read them as `Timestamp` and call `.toMillis()`
   in places (e.g., `getUserMemberships`, `getActionPlanForMember`).
4. **`scoringParameters` is a deeply nested object.** Spread
   `DEFAULT_SCORING_PARAMETERS` rather than building it field-by-field, and
   double-check that nested objects (`cultureFitRatingScores`,
   `cultureFitCaps`) are cloned, not referenced — the default constant uses
   `{ ...DEFAULT_CULTURE_FIT_RATING_SCORES }` precisely for this reason.
5. **No uniqueness enforcement.** Nothing prevents two assessments for the
   same `(memberId, fiscalYear, fiscalQuarter)` triple, two productivity
   targets with the same name, or two action plans per member. The seed
   script should be idempotent on its own (e.g., check-before-write).
6. **Denormalized name fields.** `Team.leaderName`, `TeamMember.name` (copied
   to `Assessment.memberName` and `ActionPlan.memberName`), and
   `CoreValue.name` (copied into each assessment's `cultureFitScores[].coreValueName`)
   are all denormalized. The seed script should write consistent copies; the
   app has propagation helpers (`propagateMemberNameChange`,
   `propagateMemberTitleChange`) for fixing drift but those run on updates,
   not on seeds.
7. **Collection-name typos would silently work.** The catch-all rule
   `/companies/{companyId}/{subcollection}/{docId}` accepts any name. There
   is no enforcement that you write to `teamMembers` vs `team_members` vs
   `members`. The names listed in this report are the ones the application
   code reads from. A seed script writing under a different name would
   produce docs that nothing in the app can see.
