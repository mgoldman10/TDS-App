# Follow-ups

Items discovered during work but deferred to keep current scope focused.
Add new items at the top. Strike through items as they're shipped.

## Open

### Migrate transactional email from Resend to Postmark (or similar low-volume specialist)

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

### Set up Firestore backup protection on production (tds-app-b8493)

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

### Staging email env vars — clean up after Resend rotation
Discovered 2026-05-21. Phase 4 (staging deploy context configuration) left the staging email config in an ambiguous state:

- `EMAIL_FROM` and `EMAIL_FROM_NAME` env:set commands on staging contexts were **silent CLI no-ops** — the API view still shows them as only "All"-scoped, so staging contexts inherit the production FROM values.
- `RESEND_API_KEY` staging-context state is ambiguous — the API returned masked display for `branch-deploy` and `deploy-preview` after the env:set attempt; can't tell from the masked text whether the empty-string override took or the original production value remained.

**HARMLESS in practice:** the email.ts code guard (committed `2d48d14` on 2026-05-21) early-returns and logs intended sends when `!isProduction()`, so staging will not email regardless of what the env vars hold. This is config-matches-intent cleanup, not a live risk.

When picked up (alongside the Resend rotation): set empty-string `RESEND_API_KEY` / `EMAIL_FROM` / `EMAIL_FROM_NAME` on `deploy-preview` + `branch-deploy` via authoritative curl PATCH (CLI `env:set` silently no-ops for these; the PATCH endpoint we discovered in Phase 4 — `PATCH /accounts/{slug}/env/{key}?site_id=…` — works). Verify via raw API with ALL contexts' values suppressed in any diagnostic output (per the dev-context leak lesson). Recommend updating CLAUDE.md "Acceptable patterns" with: *when iterating env-var contexts via API for any secret-bearing var, suppress value display for ALL contexts — never assume any context is non-sensitive.*

### AskMike name anonymization round-trip not re-hydrating
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

### 2026-05-20 credential exposure incident — TDS production secrets
Discovered: 2026-05-20

**RESOLVED 2026-05-21:** all three Firebase-side items complete — `bb393c78` revoked, `3b4ee474` revoked, `f2e777ca` deleted. Both exposed credentials (Firebase SA key + Anthropic API key) rotated and verified in production. Detail per checkbox below.

During the Phase 3.2 / Phase 4 setup work, two Claude Code commands dumped production credentials to terminal output (and therefore into this session's conversation transcript):

1. **`grep -n FIREBASE_ADMIN_SERVICE_ACCOUNT .env.local`** — meant to locate a line for an env-file edit; instead printed the full `FIREBASE_ADMIN_SERVICE_ACCOUNT` JSON blob, including the private key (`private_key_id` prefix `bb393c78…`) for the production Firebase admin service account `firebase-adminsdk-fbsvc@tds-app-b8493.iam.gserviceaccount.com`.
2. **`netlify env:list --plain`** — assumed `--plain` meant "names only" but it dumps values in env-file format. Exposed (a) the same Firebase SA private key (Netlify production was using the same key as local), (b) `FIREBASE_ADMIN_CLIENT_EMAIL`, and (c) the TDS production `ANTHROPIC_API_KEY` in full (prefix `sk-ant-api03-ZmrjMD5…`). This is the same TDS Anthropic key that was previously discussed on 2026-05-08 but never before fully dumped.

Coincident with the 2026-05-08 BLT Anthropic key exposure (resolved via key rotation that day), this is the third production credential exposure in 48 hours.

Mitigations applied 2026-05-20:
- New CLAUDE.md section "Credential Handling — NEVER LEAK SECRETS TO CHAT" with forbidden/acceptable command patterns, intended to prevent the next occurrence.
- Local captured plaintext files from the offending commands removed from disk (transcript still retains the values; out of our control).

Rotations to complete:
- [x] TDS Firebase admin SA key `bb393c78…` on `tds-app-b8493` — DONE 2026-05-20: rotated to `98722668…`; both `bb393c78…` and the interim partially-leaked `3b4ee474…` revoked; production runtime verified on the new key.
- [x] TDS Anthropic API key `sk-ant-api03-ZmrjMD5…` — DONE 2026-05-20: rotated to TDS-prod-2026-05-20 key; old key revoked in Anthropic console; AskMike verified working in production.
- [x] Orphan SA key `f2e777ca…` on `tds-app-b8493` — DISABLED 2026-05-20 (full id `f2e777ca13de354735b4ac13c73d8bdf05a6ae22`). Observation window through ~2026-05-22. Not referenced in repo / secure-keys / Netlify env / audit logs. **Observation checkpoint #1** (2026-05-20 evening, ~immediately after disable): clean — key still disabled, zero auth/permission/credential errors in GCP audit logs (query verified live against the disable event itself), production stable on `98722668`. **CLOSED 2026-05-21:** orphan key `f2e777ca` deleted after ~23h observation window. Two clean checkpoints (5/20 evening, 5/21 evening) showed zero auth/permission/credential errors, key state holding, production stable on `98722668`. No code / Netlify / disk reference to the key existed. Fresh-read verification confirms `f2e777ca` gone; SA now has only `98722668` (user-managed, production) and `3fa7b2e1` (system-managed).

Status: all three rotations complete. Incident fully resolved on the Firebase + Anthropic sides; transcript-side exposure persists in conversation logs (out of our control) but no longer maps to any live credential.

### TDI goals scoped per-user, not per-company
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

### TDI goals not visible to senior_leader role
Discovered: 2026-05-14

User feedback from Xime via Loom 2026-05-14. After the CEO (company_admin) set TDI goals at company and team levels, a senior_leader under the CEO opened their own report view and the TDI goals page appears empty. They cannot see goals set by their admin, cannot switch quarters to view different goal sets.

This is a downstream symptom of the per-user goals scoping issue (separate FOLLOWUPS entry "TDI goals scoped per-user, not per-company"). If goals are saved scoped to the saving user's UID, then a senior_leader viewing their own page sees nothing because the CEO's goals are scoped to the CEO's UID, not visible to the leader.

Intended behavior (confirmed with Mike 2026-05-14):
- Senior_leader sees company-level goals (read-only — set by company_admin)
- Senior_leader sees and can edit their own team's goals (set initially by company_admin, modifiable by leader)
- Senior_leader does NOT see goals for other teams they don't lead

Fix lands together with the per-user-scoping fix in the related entry. The data model change (goals scoped per company / per team rather than per user) automatically resolves visibility — once goals are stored at company/team scope, the senior_leader's read query (filtered to their team) finds them naturally.

Status: open, depends on the upstream goals-scoping fix. Both should be fixed in the same pass.

### TDS save-confirmation indicator on KPI target editing
Discovered: 2026-05-14

User feedback from Xime via Loom 2026-05-14. When creating or editing KPI targets on a user's profile, there's no visible feedback that the save succeeded. The data does persist correctly, but the user has to navigate away and back to verify, creating uncertainty about whether actions registered. Two sub-issues:

1. No "Saving..." or "Saved" indicator during/after the target save action — user is uncertain whether their click registered
2. After switching between targets and returning to one, the form sometimes appears empty until clicked again — the saved values exist but don't auto-populate

Direct quote from Xime: "that's where I would prefer if it showed me like saving or if it just said saved."

Fix shape: add a brief save state indicator (likely "Saving..." → "Saved" pattern, fading after ~2 seconds), and ensure target form re-populates from state when switching between targets rather than requiring a click. Estimated 30-45 min.

Status: open, low-priority Phase 2 polish — UX improvement, not a functional bug.

## Done

### ~~Resend production API key rotation~~
Originally noted 2026-05-21. The production TDS Resend key was exposed in chat 2026-05-21 (exposure #5 — Netlify raw API returned the `dev`-context value unmasked; the original safety check had covered only the `production` context).

Rotation was initially blocked: three freshly-generated keys all returned 401 on auth tests, with the leading hypothesis being a Resend account/workspace mismatch (the new keys' owning account differed from where the originally-exposed key lived) rather than a key-format or activation problem.

CLOSED 2026-05-25: rotation is complete. Verified manually in the Resend dashboard 2026-05-25 — the active TDS production key is `TDS-prod-2026-05-22` (created and in active use). NO old or orphaned TDS keys remain in the account; the originally-exposed key from 2026-05-21 is no longer present. The 2026-05-21 transcript-side exposure therefore no longer maps to any live credential. Risk: closed.

(The separate "Staging email env vars — clean up after Resend rotation" follow-up remains genuinely open — the rotation is done but the per-context staging env-var cleanup it referenced wasn't done at the same time. See Open section.)

### ~~TDS Firestore rules not in source control~~
Discovered: 2026-05-14

During the chat history persistence diagnosis (2026-05-14), confirmed that TDS's Firestore rules are managed only in the Firebase console — no `firestore.rules` file exists in the repo. This creates several gaps:

- No git history of rules changes
- No code-review pass on rules edits
- No staging-vs-production parity guarantee once a staging environment exists
- No rollback target if the console gets accidentally edited
- Diagnostic work in this repo can't read the live rules directly

Fix shape (when prioritized): extract current rules from Firebase console into `firestore.rules` at repo root; set up `firestore.indexes.json` similarly if not already present; ensure `.firebaserc` correctly identifies the TDS project; deploy rules going forward via `firebase deploy --only firestore:rules`. Matches BLT Planner's established pattern.

Pursue before TDS staging environment is set up so rules-management discipline is in place from the start. Estimated 1-2 hours.

CLOSED 2026-05-19: firestore.rules extracted from production console via Firebase Rules REST API, committed to repo root. firestore.indexes.json corrected from 3 to 9 composite indexes to match deployed production state. firebase.json added at repo root enabling CLI deploy workflow. .firebaserc binds repo to tds-app-b8493 as default and production. Verified via two no-op deploys 2026-05-19 — both `firebase deploy --only firestore:rules` and `firebase deploy --only firestore:indexes` confirmed source canonically matches deployed.
