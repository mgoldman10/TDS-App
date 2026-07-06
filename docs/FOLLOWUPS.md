# Follow-ups

Items discovered during work but deferred to keep current scope focused.
Add new items at the top. When an item ships or closes, move it to
docs/FOLLOWUPS-ARCHIVE.md rather than striking it through here.

## Open

> Note: Ticket numbers are permanent IDs and are never reused or shifted.
> When a ticket is closed, folded into another, or retired, its number is
> retired with it — remaining tickets keep their original numbers rather
> than renumbering to close the gap. (Example: #11 was folded into #13 on
> 2026-07-06 and is intentionally absent below; this is not an error.)

### #47 — Disaster recovery: runbook, Storage backup, Auth backup, backup vault
Priority: High
Discovered: 2026-07-06, gap identified when comparing TDS's backlog to BLT's completed disaster-recovery work

BLT Planner has a written disaster-recovery runbook, backups for Firestore (the main database), Storage (uploaded files), and Auth (user login records), plus a separate backup vault outside the main project so a problem in one place can't take out the backups too. TDS only has the Firestore-backup piece of this (see #6) — there is no DR runbook, no Storage backup, no Auth backup, and no separate vault.

Fix shape: mirror BLT's setup — write a TDS-specific recovery runbook documenting what to do if something goes wrong; add scheduled backups for Storage and Auth alongside the Firestore backups in #6; set up a backup vault outside the main TDS project.

Status: Open, high priority — TDS is heading toward real client data via beta testing and eventual licensed sales; this gap should close before that data accumulates, mirroring why #6 carries the same before-beta urgency.

### #46 — Implement RAG (Retrieval-Augmented Generation) for TDS's AskMike
Priority: Medium
Discovered: 2026-07-06, gap identified when comparing TDS's backlog to BLT's

BLT Planner already tracks this as a priority: AskMike currently sends a large chunk of reference material to the AI on every call, which is slower and more expensive than it needs to be. RAG means fetching only the small, relevant slice of reference material for each specific question instead. TDS's AskMike shares the same underlying cost driver and doesn't yet have an equivalent ticket.

Fix shape: mirror BLT's planned RAG approach once that work is proven out there; scope narrowly to TDS's own reference-doc set rather than building shared infrastructure prematurely.

Status: Open, medium priority — not urgent today, but becomes more pressing as more coaches and companies use AskMike and the cost-per-conversation adds up.

### #45 — Off-palette hardcoded chart color + admin portfolio rollup issue
Priority: Low
Discovered: 2026-07-04, code review (T-U7)

The member trend chart uses a hardcoded blue color instead of pulling from the app's design system, making it look slightly off-brand. Separately, the admin portfolio view's red/yellow/green summary rollup across companies isn't quite working as intended (exact nature not detailed in the review).

Fix shape: replace the hardcoded color with the app's palette; investigate and fix the rollup logic.

Status: Open, low priority — treated as polish pending closer look at the rollup piece.

### #44 — Job scorecard as a table instead of one-at-a-time accordions; 2-column member overview
Priority: Low
Discovered: 2026-07-04, code review (T-U6)

Job scorecards currently display one at a time in an expandable accordion. A table format would let someone see everything at once. Separately, the member overview page uses a single column where a 2-column layout would use screen space better.

Fix shape: convert the scorecard to a table; adopt a 2-column layout for member overview.

Status: Open, low priority — visual efficiency improvement, no functional impact.

### #43 — Extract shared MemberPicker/QuarterPicker/PageHeader; reuse existing dropdown component
Priority: Low
Discovered: 2026-07-04, code review (T-U5)

Several small UI pieces (a person-picker, a page-header layout) are rebuilt separately in multiple places instead of existing as single reusable components. An existing reusable dropdown component should also be reused more instead of similar ones being rebuilt from scratch. Overlaps partly with #35 (quarter-picker).

Fix shape: extract these into shared components used everywhere they're needed.

Status: Open, low priority — maintenance/consistency improvement, no functional risk today.

### #42 — Replace window.confirm/alert with the styled modal already used in Admin
Priority: Low
Discovered: 2026-07-04, code review (T-U4)

Some confirmation dialogs use the browser's plain built-in pop-up instead of the app's own styled modal, which the Admin section already uses correctly.

Fix shape: replace the plain browser pop-ups with the existing styled modal component.

Status: Open, low priority — visual consistency only; these still function correctly today.

### #41 — Goal + threshold reference lines missing from TDI and member trend charts
Priority: Medium
Discovered: 2026-07-04, code review (T-U3)

The TDI chart and individual member trend charts don't show a visual line for the goal or threshold value, even though that data is already loaded. Without it, someone has to mentally compare two separate numbers instead of seeing "on track" at a glance.

Fix shape: add reference lines for goal and threshold values to these charts using the already-loaded data.

Status: Open, medium priority — meaningfully improves at-a-glance readability for a metric central to the coaching use case; should be a contained, lower-risk change since the data is already available.

### #40 — Talent Grid hard-capped at 600px, hard to read on a projector
Priority: High
Discovered: 2026-07-04, code review (T-U2)

The Talent Grid table has a hard width limit of 600 pixels regardless of screen size, making it appear as a narrow strip on large screens. Confirmed this matters in practice: Mike projects this view for clients during live sessions on large screens, where a 600px-wide table would be noticeably harder to read for a room than the available screen width would otherwise allow.

Fix shape: remove the hard width cap so the grid can use available screen width.

Status: Open, high priority — real, recurring client-facing use case (projected during live coaching sessions), not a hypothetical.

### #39 — Widen narrow containers + multi-column layouts (Dashboard is the good reference)
Priority: Low
Discovered: 2026-07-04, code review (T-U1)

Most pages constrain content to a narrow single column, unlike the Dashboard page, which already uses full width and multiple columns effectively.

Fix shape: widen containers and adopt multi-column layouts elsewhere, using the Dashboard as the template.

Status: Open, low priority — visual/space-efficiency improvement, no functional impact.

### #38 — Stale duplicate RATING_SCORES constant vs. the configurable version
Priority: Very low
Discovered: 2026-07-04, code review (T-Q9)

A hardcoded list of rating values (RATING_SCORES) is a leftover from before TDS supported configurable scoring. It's unused now that a newer configurable version exists elsewhere, but it's still sitting in the code and could confuse someone later.

Fix shape: delete the stale constant.

Status: Open, very low priority — pure cleanup, not causing any bugs today.

### #37 — Dead exports; permissions.ts/team-auth.ts unused at the API layer
Priority: Very low
Discovered: 2026-07-04, code review (T-Q8)

Some browser-only permission-checking code (permissions.ts, team-auth.ts, and related service files) isn't called from anywhere anymore. It was never a reliable security check on its own (client-side checks can be bypassed) and is now fully superseded by the server-side checks added in #12/#16/#17.

Fix shape: delete the unused exports/files.

Status: Open, very low priority — pure cleanup, mainly to avoid confusing future readers of the code.

### #36 — Recharts eagerly imported in 4 routes instead of loaded on demand
Priority: Low
Discovered: 2026-07-04, code review (T-Q7)

Four pages load the entire charting library the moment the page opens, even before a chart is visible, making initial page load slightly slower than necessary.

Fix shape: use dynamic import so the charting library only loads when a chart is about to be shown.

Status: Open, low priority — page-load-speed nicety, nothing broken.

### #35 — Fiscal-quarter picker copy-pasted in 4 pages
Priority: Low
Discovered: 2026-07-04, code review (T-Q6)

The same quarter-selection dropdown is built separately from scratch in four different pages instead of as one reusable component.

Fix shape: build a single shared <QuarterPicker> component and use it in all four places.

Status: Open, low priority — maintenance/consistency risk (pages could drift apart visually over time), no functional impact today.

### #34 — TDI calc + color ternary + yearOptions duplicated across dashboard, talent-summary, reports
Priority: Medium
Discovered: 2026-07-04, code review (T-Q5)

The core TDI (Talent Density Index) calculation is duplicated across 4 files, a red/yellow/green color rule is duplicated 6 times, and a year-options list is duplicated 3 times. Nothing is wrong today, but if the TDI formula or color thresholds ever need to change, someone has to remember to update every copy — miss one and different parts of the app could quietly disagree about the same person's score.

Fix shape: consolidate the TDI calculation, color logic, and year-options list each into one shared file (e.g. lib/tdi.ts) and have all call sites use the shared version.

Status: Open, medium priority — TDI is the core metric of the whole product; the risk here is future silent drift, not a current bug, but it's worth closing before more coaches/companies are relying on this number.

### #33 — Zero useMemo; new Date() in render bodies (reports, talent-summary)
Priority: Low
Discovered: 2026-07-04, code review (T-Q4)

Some calculations, including figuring out "today's date," are redone from scratch every time the reports and talent-summary pages redraw, rather than being calculated once and reused.

Fix shape: use memoization (a standard React technique for "calculate once, reuse until something changes") for these values.

Status: Open, low priority — performance nicety, no incorrect data.

### #32 — Admin does two full companies collection scans
Priority: Low
Discovered: 2026-07-04, code review (T-Q3)

The admin screen reads the entire companies list from the database twice instead of once and reusing the result.

Fix shape: read the list once and reuse it for both purposes.

Status: Open, low priority — unnecessary cost/slowdown as the companies list grows, nothing incorrect.

### #31 — members/[id] double-fetches teams+members, then full refetch after every save
Priority: Low
Discovered: 2026-07-04, code review (T-Q2)

The member detail page fetches teams and members data twice each unnecessarily on load, and after every save, reloads all of the page's data from scratch instead of updating just the changed piece.

Fix shape: remove duplicate fetches; update only the changed data locally after a save instead of a full reload.

Status: Open, low priority — performance/smoothness issue, no risk of incorrect data.

### #30 — Teams N+1 (query per team) instead of one batched query
Priority: Low
Discovered: 2026-07-04, code review (T-Q1)

The Teams page asks the database for each team one at a time in a loop instead of requesting all teams in a single query.

Fix shape: rewrite as one batched query.

Status: Open, low priority — unnecessary database load as team count grows, nothing incorrect.

### #29 — Inconsistent error handling; CompanyContext silently swallows load failures
Priority: Medium
Discovered: 2026-07-04, code review (T-A5)

Different parts of the app handle data-loading failures inconsistently. Specifically, the code that loads a company's basic info swallows failures entirely — if it fails, the user sees no error message, just a blank or broken-looking screen. The auth/login code already handles this properly and can serve as the pattern to follow.

Fix shape: adopt one consistent error-handling convention app-wide; specifically fix the company-info loader to surface errors to the user the way the auth code already does.

Status: Open, medium priority — real usability/debugging gap, not currently producing wrong data.

### #28 — Multi-doc users/create has no transaction/rollback, can leave orphaned accounts
Priority: Medium
Discovered: 2026-07-04, code review (T-A4)

Creating a new user requires several separate database writes. If one step fails partway through (e.g. a network hiccup), the earlier steps aren't automatically undone, potentially leaving a broken, orphaned partial account behind.

Fix shape: batch the writes together as one atomic operation where possible; if a step fails mid-process, automatically clean up what was already created (e.g. delete the login that was made) rather than leaving orphaned data.

Status: Open, medium priority — requires an actual mid-process failure to trigger; not a risk during ordinary successful signups.

### #27 — No CI/commit gates; ANTHROPIC_MODEL unvalidated at startup
Priority: High
Discovered: 2026-07-04, code review (T-A3)

There's no automated gatekeeper (lint/test/type-check) that runs before code merges, so mistakes could slip through unnoticed. Separately, TDS doesn't check at startup whether its configured AI model name is still valid — this is the exact gap that let the earlier Anthropic model-retirement incident happen silently (see the resolved item in FOLLOWUPS-ARCHIVE.md).

Fix shape: set up automated pre-merge checks (lint/test/type-check); add a startup check confirming the configured model name is current and valid.

Status: Open, high priority — this specifically closes the gap that already caused one real, silent production outage.

### #26 — No shared cache; 3 pages each re-pull full assessments+teams+members every navigation; unbounded query
Priority: Medium
Discovered: 2026-07-04, code review (T-A2)

Three pages independently re-fetch the full set of assessments, teams, and members data every time they're visited, with no shared cache to avoid repeat fetching. One specific query (all assessments for a company) also has no upper limit on how much it can return, which is a real scaling risk as assessment history accumulates over time.

Fix shape: introduce a shared caching layer (e.g. SWR) so pages reuse recently-fetched data; add a reasonable bound to the unbounded query.

Status: Open, medium priority — the caching piece is a "gets annoying as you scale" issue; the unbounded query is worth addressing proactively before a company builds up years of assessment history.

### #25 — Zero automated tests while scoring libs are pure and high-value
Priority: High
Discovered: 2026-07-04, code review (T-A1)

TDS has no automated tests at all. This matters especially for the scoring logic, which is straightforward to test automatically (pure functions: numbers in, a number out, no complex app state). BLT Planner already has a proven test setup (Vitest) that TDS can copy. This ticket directly addresses the class of bug found in #18, #19, and #24 — automated tests are exactly what would catch a scoring mistake like those before it reaches a real client.

Fix shape: copy BLT's Vitest setup into TDS; write tests for the scoring functions (category/culture-fit/productivity) and the fiscal-year date math. Note: fiscalUtils is byte-identical between BLT and TDS but currently tested only in BLT — the minimum fix is copying those existing tests into TDS as part of this work. Longer-term, if it ever makes sense, a small shared code package between the two apps for pure logic like this (fiscalUtils, ai-config, design tokens) could be considered — scoped narrowly, not a full monorepo effort.

Status: Open, high priority — this is the guardrail that prevents scoring bugs like #18/#19/#24 from recurring; three such bugs were found in this single review.

### #24 — Blank bigger-is-better target scores everyone a perfect 10
Priority: High
Discovered: 2026-07-04, code review (T-B7)

For KPIs where a higher number is better, leaving the target field blank isn't caught as missing data — instead, the system treats it as if everyone hit the target perfectly and scores every person a 10 out of 10 on that measure, regardless of their actual number.

Fix shape: treat a blank/unfilled target as "no data" rather than as an automatic perfect score.

Status: Open, high priority — same failure shape as #19 (missing input silently produces a confidently wrong answer); no reason to treat one direction of this bug more leniently than the other.

### #23 — Clearing a scoring threshold silently becomes 0; no cross-field validation
Priority: Medium
Discovered: 2026-07-04, code review (T-B6)

If a scoring threshold field gets cleared (accidentally or otherwise), the system silently accepts zero as the new value rather than flagging it as likely wrong.

Fix shape: add guardrails so this can't save as zero without confirmation, plus cross-field validation to catch clearly-wrong values before they're saved.

Status: Open, medium priority — an easy accidental slip that could meaningfully skew scoring for a company if it happens.

### #22 — Read-modify-write races overwrite whole action/note/goal arrays from stale state
Priority: Medium
Discovered: 2026-07-04, code review (T-B5)

If two people edit the same record (e.g. a list of action items or notes) around the same time, saving works by reading the whole list, changing it, and writing the whole list back — not just the one changed item. Whoever saves second can silently overwrite the first person's changes with no warning to either person.

Fix shape: use a database transaction, or update only the specific field/item that changed rather than the entire list.

Status: Open, medium priority — requires a timing coincidence (two people editing the same record close together) to trigger; confirmed this is rare in TDS's actual usage pattern, unlike BLT's more collaborative use case.

### #21 — fiscalYearStartMonth not in load deps → wrong current quarter for non-Jan tenants on first load
Priority: High
Discovered: 2026-07-04, code review (T-B4)

For companies whose fiscal year doesn't start in January, the code that determines "today's quarter" can run before it's actually loaded that company's custom fiscal start month, causing the wrong quarter to be assumed by default when a page first loads.

Fix shape: ensure the company's fiscal start month is loaded before calculating the current quarter; if a user had already selected a specific quarter, preserve that selection rather than silently resetting it.

Status: Open, high priority — confirmed this will affect real coaching clients on non-January fiscal years soon; not a theoretical edge case.

### #20 — Stored performanceCategory/scores go stale when scoring params change
Priority: Medium
Discovered: 2026-07-04, code review (T-B3)

When scoring rules (thresholds, targets, etc.) are changed by an admin, previously-computed assessment scores aren't recalculated — every screen that displays them (dashboard, reports, talent grid, etc.) keeps showing the score as it was originally computed.

Decision (confirmed with Mike, 2026-07-06): keep historical scores unchanged — do not recompute past assessments, since they reflect what the rules said at the time. What's needed instead is a visual marker on affected assessments/views indicating "scoring parameters have changed since this assessment was taken," so nobody mistakes an old score for one computed under today's rules.

Fix shape: add the "scoring parameters changed since this assessment" marker to the relevant reporting/trend views. Do not alter stored historical scores.

Status: Open, medium priority — a trust/clarity item, not currently producing incorrect-looking numbers on its own.

### #19 — Smaller-is-better target saved without a max defaults max=0 → inverted scoring
Priority: High
Discovered: 2026-07-04, code review (T-B2)

For KPIs where a lower number is better, saving a target without filling in the required "max" value silently defaults that max to zero, which flips the scoring math backwards — the best-performing people end up showing the lowest scores.

Fix shape: require and validate that max is filled in and greater than the target before allowing the save.

Status: Open, high priority — a plain data-entry gap with no guardrail today, producing confidently wrong, inverted results for an entire KPI's ranking.

### #18 — LCF boundary uses <= instead of <; settings UI also describes the wrong operator
Priority: High
Discovered: 2026-07-04, code review (T-B1)

A scoring boundary check uses "less than or equal to" (<=) where it should use "less than" (<), meaning someone scoring exactly at the threshold (7.5) is wrongly flagged as "toxic." The settings screen that explains this rule to admins also describes it using the incorrect operator, so the wrong rule is being actively communicated to anyone who reads that screen.

Fix shape: change <= to < in the scoring code; correct the two settings-screen strings that describe the rule to match.

Status: Open, high priority — a one-character code fix with a real, sensitive consequence: mislabeling an actual person at a boundary score.

### #17 — userMappings/{uid} security rule allows any logged-in user to write to any user's record
Priority: High
Discovered: 2026-07-04, code review

Every user has a small lookup record (userMappings/{uid}) that maps their login to their company and role. The security rule protecting these records is too permissive: any logged-in user can write to any other user's record, not just their own. This creates two concrete risks: (1) a malicious or careless user could edit someone else's record and effectively force-log-them-out or lock them out of their own account; (2) if role or company-membership fields live in this same record, the same looseness could let someone hand themselves or another user a different role than they're supposed to have — a privilege-escalation path related to, but distinct from, #16's confidentiality gap.

Fix shape: tighten the rule so a user can only write to their own record (uid == request.auth.uid), and move any role or company-membership changes to server-side code rather than allowing a direct client write to those fields.

Status: Open, high priority — reachable by any logged-in user; touches both account-lockout and privilege-escalation risk.

### #16 — Assessment confidentiality enforced only in the UI, not the data layer
Priority: High
Discovered: 2026-07-04, code review

Some assessments are meant to be confidential — visible only to their owner
and specifically authorized viewers. Today that privacy is enforced only by
what the app's screens choose to display; the underlying Firestore security
rules don't check who's asking, so any logged-in company member can bypass
the UI (for example, via browser devtools) and read assessments they were
never meant to see, including another person's confidential ones.

Fix shape: move enforcement into Firestore's security rules themselves,
gated per-document on an owner/authorized-viewer field, so the data store
itself refuses unauthorized reads rather than relying on the screen to hide
them.

Status: Open, high priority — genuine confidentiality gap reachable by any
logged-in user; worth resolving before broader beta rollout given TDS
handles sensitive personal/performance data.

### #15 — PDF text extraction broken in extract-pdf route (pre-existing bug, unrelated to T-S1)
Priority: Low
Discovered: 2026-07-04, during T-S1 Stage 3 verification

While verifying the new superadmin-only gate on extract-pdf, uploading a real PDF file returns a 500 error. The installed pdf-parse library (version 2.x) has a different interface than the one this route's code was written for, so PDF text extraction has been broken since before Stage 3 — invisible until now because only a superadmin can reach this feature, and it hadn't been recently tested. Word document (.docx) uploads through the same route work correctly; this is specific to PDF files. This bug exists in production too, not just staging.

Fix shape: update the route's PDF-parsing code to match pdf-parse 2.x's actual interface (or pin the library to a compatible older version, whichever is less disruptive).

Status: Open, low priority — affects only an admin-only, infrequently-used feature (uploading reference PDFs for the AI assistant's knowledge base).

### #14 — Cost monitoring on AskMike
Priority: Medium
Discovered: 2026-07-04, during T-S1 Stage 3 (mirrors the BLT Planner entry of the same name)

No per-coach, per-tenant, or per-user-session cost visibility for Anthropic API spend through TDS's AskMike feature. There's currently no telemetry showing usage trajectory: how many AskMike turns happen per day, which coaches are most-used, which queries are most expensive, how cost scales with concurrent users across TDS's tenants.

Why it matters: informs infrastructure decisions (like the rate-limiting work noted separately), detects abuse or runaway costs before they appear on the bill, and matters more as more of the six certified coaches and their client companies use AskMike.

Fix shape: log per-request token usage (input/output tokens) from the Anthropic API response on every AskMike call; write to a Firestore collection tracking daily aggregates per coach per company; a simple superadmin-only admin view showing spend trends; optional alerting when daily spend crosses a threshold.

Cross-reference: this mirrors an existing entry in BLT Planner's docs/FOLLOWUPS.md by the same name — the two apps share the same underlying cost driver (Anthropic API via AskMike) and could eventually share monitoring infrastructure.

Status: Open, medium priority — becomes more urgent as coach/client usage scales.

### #13 — Rate limiting needed for public-facing and AI-proxy routes (askmike, askmike/title, reset-password)
Priority: Low-to-Medium
Discovered: 2026-07-04, during T-S1 Stage 3

Stage 3 added login gates and input/file-size caps to these routes, which closes the "unlimited anonymous abuse" risk — a stranger on the internet can no longer burn the Anthropic budget or trigger reset emails at all. What is NOT in place is true rate limiting: blocking a specific user or IP after too many requests in a short window. That requires shared infrastructure (something like Redis, or a platform-level rate-limiting feature) that this app doesn't currently have — the serverless functions don't share memory between requests, so a simple in-code counter can't work reliably.

Remaining gap this would close: a logged-in bad actor (or a compromised account) could still hammer askmike/askmike/title (cost, per-call bounded by the 50k-char input cap and max_tokens) or reset-password (annoyance-spam of reset emails to a victim's inbox; the anti-enumeration fix means they learn nothing from the responses).

Distinct from, but related to, two entries in the BLT repo's docs/FOLLOWUPS.md: "Cost monitoring on AskMike" and "#37 — Cost and rate-limit monitoring (Anthropic + Netlify + Resend)". Those are about tracking and managing legitimate usage costs; this entry is specifically about preventing abusive/excessive request volume regardless of cost. Whatever infrastructure decision is made should probably serve both apps.

Status: Open, low-to-medium priority — the Stage 3 login gate already removes the worst-case "anyone on Earth, unlimited" scenario.

Note (2026-07-06): Ticket #11 ("users/reset-password route is still unauthenticated") has been folded into this ticket and removed. Direct code inspection confirmed reset-password already calls verifyApiCaller — but by design, an auth failure is treated as anonymous rather than rejected, since the route must keep working for someone who isn't logged in yet (Forgot Password). Login state only affects how much detail is in the response, not whether the reset email is sent. #11 was written before this Stage 3 change and described the old, fully-unauthenticated state. The one real gap it raised — preventing repeated reset-email spam to one inbox — is the same gap this ticket already tracks, so no separate ticket is needed.

Note (2026-07-06), re: code review finding T-S1: the July 4 review's top-line finding — "no API route authenticates the caller" — is resolved. All 12 routes now have some form of caller check (Stages 0-3, see repo history). The two gaps that remain are exactly what #12 and this ticket (#13) already track: missing role/scope enforcement on three routes (#12), and no rate limiting on logged-in callers (#13, this ticket). No new ticket needed for T-S1 itself. The original TDS-Code-Review-Findings-2026-07-04.docx document is left unedited as a historical record; this note is the authoritative current status.

### #12 — Server-side leadership-scope enforcement for tenant-member routes
Priority: Low-to-Medium
Discovered: 2026-07-04, during T-S1 Stage 2 (gating the Tier 2 routes)

As of Stage 2, `users/archive`, `users/restore`, and `users/assign-team` verify that the caller is a logged-in, active member of the company named in the request (superadmin passes). What they do NOT yet verify is whether the caller's specific team-leadership scope covers the person or team being acted on. The app's UI already restricts this correctly — a team leader only sees archive/restore/assign buttons for people and teams within their own scope — so this gap only affects someone who bypasses the UI and calls the API directly with a valid login for that company. Concretely: a leader at Company X could hand-craft an API call to archive a colleague outside their team, or assign themselves leadership of a team they shouldn't manage (which affects visibility of private assessment data).

Fix shape: replicate the team-scope logic (own teams plus descendant sub-teams, as computed client-side via getAuthorizedTeamIds) on the server, and enforce it in these three routes for non-admin callers. Company admins and superadmins would be unaffected.

Status: Open, low-to-medium priority — requires a valid tenant login to exploit, so the exposure is a malicious or compromised *insider*, not the open internet. Candidate for a future T-S1 stage.

### #10 — Staging seed credential (FIREBASE_ADMIN_SERVICE_ACCOUNT_STAGING) only exists on Mike's local machine
Priority: Low
Discovered: 2026-07-04, while unblocking T-S1 Stage 1 verification

The seed script requires a dedicated staging service-account credential (`FIREBASE_ADMIN_SERVICE_ACCOUNT_STAGING`) in `.env.local` to run. This was missing entirely until added locally on 2026-07-04. It currently exists only on Mike's laptop — if Ximena or a future developer needs to re-run the seed script from a different machine, they'll hit the same missing-credential block. Related to the existing open item about TDS staging service-account key rotation/hygiene.

Fix shape: document where to retrieve this credential (Firebase Console > tds-app-staging > Project Settings > Service Accounts) and decide on a shared, secure way for the team to access it if more than one person needs to run staging seed/admin operations.

Status: Open, low priority (only matters if someone besides Mike needs to run staging admin scripts).

### #9 — Seed script document count discrepancy (170 planned vs 169 confirmed) — likely benign
Priority: Very low
Discovered: 2026-07-04, during staging seed verification

The dry-run for `seed:staging` projected 170 documents would be created. The subsequent idempotent re-run (after a successful apply) reported 169 skipped. No errors occurred in either run. Likely explanation: the two AskMike coach records are matched idempotently by name/type rather than a fixed ID, causing a 1-document counting discrepancy that isn't a real data problem.

Status: Open, very low priority — cosmetic/counting nuance, not a functional issue. Worth a quick look next time someone is in the seed script for other reasons, not worth a dedicated session.

### #8 — FIREBASE_ADMIN_SERVICE_ACCOUNT: mark Secret in Netlify + rotate service account keys
Priority: Medium
Captured: 2026-07-01
Priority: Medium

The `FIREBASE_ADMIN_SERVICE_ACCOUNT` environment variable grants full Firestore/Auth/Storage admin access. It is currently sitting in Netlify as plain text on both TDS staging and TDS production Netlify projects. It should be marked "Contains secret values" in both.

In addition, generate fresh Firebase Admin SDK service account keys for both TDS Firebase projects — do NOT carry over the existing keys as part of the Secret marking:
- **TDS staging:** Firebase project `tds-app-staging`
- **TDS production:** Firebase project `tds-app-b8493`

Apply the lessons from the BLT production rotation (2026-06-27):

- Apple Keychain silently truncates large service-account JSON values — do NOT use Keychain (or any password manager) as an intermediary. Paste directly from a text editor into each of the five Netlify deploy context fields.
- Netlify Secret-typed env vars cannot use the "same value for all deploy contexts" option — each of the five contexts (production, deploy-preview, branch-deploy, dev, and Preview Server & Agent Runners) must have the value pasted individually.
- Do a full production sign-in verification after each rotation before revoking the old key.
- Soak the old key 24–48 hours before revoking, to guard against cached references in Cloud Functions or scheduled jobs.

After each rotation:
- Revoke the old service account key in GCP Console after the soak window.
- Securely delete the downloaded JSON key file from the local machine.
- Do NOT leave a copy in Apple Keychain, notes, or any other credential store.

**Origin:** Separated from BLT's FOLLOWUPS #43 (Firebase Admin service account not marked as secret in Netlify) on 2026-07-01. BLT's Secret marking was completed 2026-06-27, but the TDS portion of that ticket was never actioned. Rather than keep TDS-scoped work on a BLT ticket, it belongs in this repo's backlog. BLT's #43 has been narrowed to BLT-only remaining cleanup (old-key revocation, downloaded-JSON deletion, Keychain-entry fix); this ticket owns the entire TDS-side scope.

**Estimate:** 1–2 hours per project (2–4 hours total), heavily gated by the 24–48h soak between rotation and old-key revocation.

**Verification:** After rotation, verify TDS staging and production sign-in work under the new credentials. Test at least one Firestore read and one Firestore write per environment through the app UI.

### #7 — Migrate transactional email from Resend to Postmark (or similar low-volume specialist)
Priority: Low (rises once beta clients start receiving email)

Discovered: 2026-06-01, in parallel with the same finding on BLT Planner.

TDS sends transactional email through Resend, same as BLT Planner. The Resend shared Amazon SES IP reputation issue applies equally — even with full authentication passing (SPF/DKIM/DMARC), receivers route to spam on a new sending domain. Diagnostic work was completed on the BLT side (see BLT FOLLOWUPS entry "Auth email deliverability — re-diagnosed"); the conclusion applies here without re-investigation.

Verify before scheduling: confirm which domain TDS sends from (check production Netlify env vars on tds-app-b8493 for `SMTP_FROM_EMAIL`). If it's noreply@mike-goldman.com (same as BLT), the two apps share a reputation pool — a single Postmark migration could cover both. If different, TDS migration can be sequenced independently.

Migration scope (~1-2 hours, mirrors BLT's plan):
- Sign up for / extend Postmark account
- Verify TDS sending domain on Postmark (DKIM TXT + Return-Path CNAME at Bluehost)
- Create a Postmark "Server" for the TDS sending stream
- Update Netlify PRODUCTION env vars on tds-app-b8493 — the specific vars depend on the chosen migration path (see "Code changes" note below)
- Test end-to-end on production: trigger reset/notification to a Gmail and Outlook inbox, verify delivery and Authentication-Results
- Revoke TDS Resend API key once verified

Cost: same as BLT — free tier up to 100 emails/month, paid plans from ~$15/mo for 10k emails.

Code changes: YES, expected. Unlike BLT (which uses nodemailer + generic SMTP env vars and is provider-agnostic at the code level), TDS uses the Resend SDK directly (env vars include `EMAIL_FROM`, `EMAIL_FROM_NAME`, `RESEND_API_KEY`). Two viable migration paths: (a) swap Resend SDK calls for Postmark SDK calls (`postmark` npm package) — keeps the API-direct pattern; new env var would be Postmark's server token, replacing `RESEND_API_KEY`. (b) Refactor TDS to use nodemailer + SMTP first (mirroring BLT's pattern), then point it at Postmark via standard `SMTP_*` env vars. Path (a) is the smaller change. Path (b) is more refactoring up front but makes any future provider switch a config-only operation. Decide which before starting.

Best done in tandem with BLT's migration if the sending domain is shared. Not blocking anything urgent (TDS has no live external users yet).

### #6 — Set up Firestore backup protection on production (tds-app-b8493)
Priority: Medium (raise to High before any beta client loads real data into TDS)

Discovered: 2026-06-01, in parallel with the same finding on BLT Planner.

Production Firestore on TDS likely has the same total-absence-of-protection that BLT had before this session: no PITR, no delete protection, 1-hour version retention, zero scheduled backups. Inventory needed to confirm, then apply the same recipe.

Inventory (read-only):
- `gcloud firestore databases list --project=tds-app-b8493` — note location, check pointInTimeRecoveryEnablement / deleteProtectionState / versionRetentionPeriod
- `gcloud firestore backups schedules list --database='(default)' --project=tds-app-b8493`

If inventory confirms the same gap (likely), apply the same four-layer protection as BLT (see BLT FOLLOWUPS for full reasoning):

1. Enable Delete Protection:
   `gcloud firestore databases update --database='(default)' --delete-protection --project=tds-app-b8493`

2. Enable Point-in-Time Recovery:
   `gcloud firestore databases update --database='(default)' --enable-pitr --project=tds-app-b8493`

3. Daily backup schedule (retain 14 days):
   `gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=14d --project=tds-app-b8493`

4. Weekly Sunday backup schedule (retain 84d = 12 weeks):
   `gcloud firestore backups schedules create --database='(default)' --recurrence=weekly --day-of-week=SUN --retention=84d --project=tds-app-b8493`

Verify by re-running the two inventory commands. Expected end-state: PITR enabled, delete protection enabled, versionRetentionPeriod 604800s (7 days), two backup schedules listed.

Then in a separate follow-on (matches BLT's Step 4): test an actual restore into a throwaway scratch project to verify the recovery path works.

Time: ~30 min for inventory + protection setup; restore test is a separate 1-2 hour session.

Cost: pennies/month for a small-volume free-tier database.

Lower urgency than BLT (TDS has no live external clients yet), but the gap is identical and the recipe is already proven. Worth knocking out at the same priority level since the work is mechanical.

### #5 — Staging email env vars — clean up after Resend rotation
Priority: Low
Discovered 2026-05-21. Phase 4 (staging deploy context configuration) left the staging email config in an ambiguous state:

- `EMAIL_FROM` and `EMAIL_FROM_NAME` env:set commands on staging contexts were **silent CLI no-ops** — the API view still shows them as only "All"-scoped, so staging contexts inherit the production FROM values.
- `RESEND_API_KEY` staging-context state is ambiguous — the API returned masked display for `branch-deploy` and `deploy-preview` after the env:set attempt; can't tell from the masked text whether the empty-string override took or the original production value remained.

**HARMLESS in practice:** the email.ts code guard (committed `2d48d14` on 2026-05-21) early-returns and logs intended sends when `!isProduction()`, so staging will not email regardless of what the env vars hold. This is config-matches-intent cleanup, not a live risk.

When picked up (alongside the Resend rotation): set empty-string `RESEND_API_KEY` / `EMAIL_FROM` / `EMAIL_FROM_NAME` on `deploy-preview` + `branch-deploy` via authoritative curl PATCH (CLI `env:set` silently no-ops for these; the PATCH endpoint we discovered in Phase 4 — `PATCH /accounts/{slug}/env/{key}?site_id=…` — works). Verify via raw API with ALL contexts' values suppressed in any diagnostic output (per the dev-context leak lesson). Recommend updating CLAUDE.md "Acceptable patterns" with: *when iterating env-var contexts via API for any secret-bearing var, suppress value display for ALL contexts — never assume any context is non-sensitive.*

### #4 — AskMike name anonymization round-trip not re-hydrating
Priority: Medium-high
Discovered: 2026-05-20

INTENDED DESIGN (per Mike): AskMike is supposed to protect privacy via an anonymize-then-rehydrate round trip:
- **OUTBOUND** (app → Anthropic): real person name and company name are replaced with anonymized tokens/placeholders before the prompt leaves our infrastructure, so Anthropic never receives or could retain the real names.
- **INBOUND** (Anthropic response → AskMike → user): the app re-hydrates the tokens back into the real names before display, so the coach appears to know the real name even though Anthropic never did.

OBSERVED (production, `talentdensity.netlify.app`, People Coach, member route `/members/Ek6h1PwmfBUUf60Af1B3`): asked "Do you know the name of my SVP people?", the coach replied it can see the role (SVP People) but does NOT have the person's actual name "in the information provided to me," and asked what to call them.

This means the round trip is failing — the coach should have been able to use the real name after re-hydration, but it's behaving as if no name was ever provided. Likely failure modes to check:

1. **Over-stripping outbound:** anonymization removes the name entirely instead of replacing it with a reversible token, so there's nothing to re-hydrate. (Model sees role only → correctly says "no name.")
2. **Missing re-hydration inbound:** name IS tokenized outbound (e.g. `PERSON_1`) but the inbound mapping is empty/lost, so the token never gets swapped back. (Would more likely show the raw token, but the model may rationalize a meaningless token as "no name.")
3. **Name never tokenized:** outbound step passes role but never includes a name token at all.

The model's phrasing ("don't have their actual name in the information provided") points toward #1 or #3 — it received no name-token, only a role.

Diagnostic angle when picked up:
- Find the AskMike API route(s) and locate the outbound anonymization step. Confirm whether person/company names are (a) replaced with reversible tokens, (b) stripped entirely, or (c) never included.
- Locate the inbound re-hydration step. Confirm a token→realname map is built outbound and applied to the response inbound.
- Check whether the map is per-request (built fresh each call) and whether it's being lost between request and response (e.g. not persisted across the API round trip, scoping bug).
- Test across all three coaches (KPI / People / Difficult Conversations) — the anonymization may live in shared code or be duplicated per coach with drift.
- Verify the privacy guarantee still holds: whatever the fix, confirm real names do NOT reach Anthropic (the outbound tokenization must keep working even as inbound re-hydration is repaired).

Status: open. Privacy mechanism partially working — names appear NOT to be reaching Anthropic (good), but re-hydration is not restoring them for the user (the bug). Medium-high priority: it degrades AskMike's usefulness (can't reference people by name) and indicates the privacy round-trip code has a gap worth understanding fully.

### #3 — TDI goals scoped per-user, not per-company
Priority: High
Discovered: 2026-05-14

User feedback from Xime via Loom 2026-05-14. When the Super Admin sets TDI goals (company-level and team-level for Q2 across quarters), those goals do not appear to other users — specifically, the CEO (company_admin) signing in afterward sees an empty TDI goals page and has to re-enter the same goals as if from scratch.

Likely root cause: goals are being persisted scoped to the saving user's UID rather than to the company. Each user gets their own private "goals" record. Multiple authors of the "same" goal create multiple parallel records, none of which are visible to other users.

Intended model (confirmed with Mike 2026-05-14):
- Two scopes of goals only: company-level and team-level. No personal goals.
- Company goals are set by the company_admin. Visible to all users in their respective scopes.
- Team goals: company_admin can set goals across all teams (oversight), and each team leader can also set/modify their own team's goals (autonomy). Both can edit; admin sees all, leader sees only their own team.
- Senior_leader cross-team visibility: leaders can only see goals (and actuals) for teams they lead. No cross-team visibility for senior_leader role.
- Goals at the company level are visible to all users (read-only for non-admins).

Diagnostic angle when picking this up:
- Trace the TDI goals save and load code path
- Identify what scope/key the goals are saved under today (companyId only? userId + companyId? userId only?)
- Check whether there are separate flows by role that write to different paths/collections
- Review Firestore data: count how many goals records exist, what UIDs they're associated with, and confirm whether multiple authors of the "same" goal create multiple records

Fix shape:
- Goals should be saved at the company level for company goals (e.g., companies/{cid}/tdiGoals/company-{quarter} or similar)
- Team goals should be saved scoped to the team (e.g., companies/{cid}/teams/{teamId}/tdiGoals/{quarter})
- Write authorization: company_admin can write all; senior_leader can write only their team's goals
- Read authorization: company_admin can read all; senior_leader can read company-level goals (read-only) + their own team's goals
- If multiple users have already saved divergent goals on staging or production, decide on reconciliation (likely: take the most recent set as canonical, archive others; the data volume is small)

Status: open, real data-modeling bug. Affects trust in the goals feature. High priority once picked up.

### #2 — TDI goals not visible to senior_leader role
Priority: High
Discovered: 2026-05-14

User feedback from Xime via Loom 2026-05-14. After the CEO (company_admin) set TDI goals at company and team levels, a senior_leader under the CEO opened their own report view and the TDI goals page appears empty. They cannot see goals set by their admin, cannot switch quarters to view different goal sets.

This is a downstream symptom of the per-user goals scoping issue (separate FOLLOWUPS entry "TDI goals scoped per-user, not per-company"). If goals are saved scoped to the saving user's UID, then a senior_leader viewing their own page sees nothing because the CEO's goals are scoped to the CEO's UID, not visible to the leader.

Intended behavior (confirmed with Mike 2026-05-14):
- Senior_leader sees company-level goals (read-only — set by company_admin)
- Senior_leader sees and can edit their own team's goals (set initially by company_admin, modifiable by leader)
- Senior_leader does NOT see goals for other teams they don't lead

Fix lands together with the per-user-scoping fix in the related entry. The data model change (goals scoped per company / per team rather than per user) automatically resolves visibility — once goals are stored at company/team scope, the senior_leader's read query (filtered to their team) finds them naturally.

Status: open, depends on the upstream goals-scoping fix. Both should be fixed in the same pass.

### #1 — TDS save-confirmation indicator on KPI target editing
Priority: Low
Discovered: 2026-05-14

User feedback from Xime via Loom 2026-05-14. When creating or editing KPI targets on a user's profile, there's no visible feedback that the save succeeded. The data does persist correctly, but the user has to navigate away and back to verify, creating uncertainty about whether actions registered. Two sub-issues:

1. No "Saving..." or "Saved" indicator during/after the target save action — user is uncertain whether their click registered
2. After switching between targets and returning to one, the form sometimes appears empty until clicked again — the saved values exist but don't auto-populate

Direct quote from Xime: "that's where I would prefer if it showed me like saving or if it just said saved."

Fix shape: add a brief save state indicator (likely "Saving..." → "Saved" pattern, fading after ~2 seconds), and ensure target form re-populates from state when switching between targets rather than requiring a click. Estimated 30-45 min.

Status: open, low-priority Phase 2 polish — UX improvement, not a functional bug.
