# TDS Staging Environment — Project Plan

**Talent Density System (TDS) — full setup of staging environment, seed script, verification harnesses, and test handoff**

Mirrors BLT Planner's phased journey from the earlier work. Adapts where TDS differs.

---

## How to use this document

This is a **multi-week project plan**, not an afternoon's work. BLT Planner went through eight phases over multiple sessions to reach a working staging environment with realistic test data. TDS has many of the same building blocks already in place (Netlify connected to GitHub, production deploys auto-running, Firebase Auth + Firestore working), so the actual path may be shorter — but the structure is the same.

The plan is organized as phases mirroring BLT's. Each phase contains:

- **Goal** — what "done" looks like
- **Why** — what this phase unlocks
- **Prompts for Claude Code** — copy-paste-ready, ASCII-clean for terminal paste
- **Manual steps** — clearly marked with 🛑
- **Verification gates** — how to confirm the phase actually worked before moving on
- **What can go wrong** — failure modes and how to recover

> **Important:** don't skip phases or do them out of order. Each phase produces something the next phase depends on. BLT's hardest moments came from trying to compress phases together.

> **Tip for VS Code:** open this file in VS Code and press `Cmd+Shift+V` (Mac) or `Ctrl+Shift+V` (Windows) to open the Preview pane. Every code block has a one-click copy icon in the top-right corner of the block.

---

## What TDS already has (vs what BLT had at start)

Some things are already in place for TDS that BLT had to build from scratch. Worth knowing before we start:

| Capability | TDS state today | BLT at equivalent start |
|---|---|---|
| Production Netlify site | ✅ `talentdensity.netlify.app` deploying from main | Had to be set up |
| GitHub repo connected | ✅ Auto-deploy on push to main | Had to be set up |
| Firebase production project | ✅ Working | Had to be set up |
| Firebase staging project | ❌ Not yet created | Had to be set up |
| Firestore rules in source control | ❌ Console-only (FOLLOWUPS #4) | Same gap initially |
| `netlify.toml` | Unknown — verify in Phase 0 | Had to be set up |
| Seed script | ❌ None exists | Had to be set up |
| Verification harnesses | ❌ None exist | Had to be set up |
| Test data on production | ⚠️ Real customer data only | Same |

The phases below assume nothing about what's currently set up beyond the production deployment. Phase 0 verifies the baseline.

---

## Phase 0 — Discovery and baseline

**Goal:** Understand exactly what's already configured in TDS so we don't reinvent or accidentally break things.

**Why:** BLT had multiple "wait, I didn't know that existed" moments — production credentials in unexpected places, multiple Anthropic keys, two Ximena identities. Discovery up-front prevents those costing time later.

### Prompt for Claude Code

```
TDS Phase 0 — Discovery and baseline. Read-only investigation.
Don't make any changes.

Open the TDS repo at ~/Documents/AppDevelopment/Talent Density Systems/
(or wherever it lives — find it first if path differs).

Report on each of the following, with concrete file paths and
current values where possible:

1. REPOSITORY STATE
   - What branch is currently checked out
   - Whether main is in sync with origin/main
   - Any uncommitted changes
   - Recent commits on main (last 5)

2. ENVIRONMENT FILES
   - Which .env files exist in the repo root (.env, .env.local,
     .env.production.local, .env.example, etc.)
   - For each, list the variable NAMES only (no values printed)
   - Identify which Firebase project NEXT_PUBLIC_FIREBASE_PROJECT_ID
     in .env.local points at (if .env.local exists)

3. NETLIFY CONFIG
   - Does netlify.toml exist? If yes, show its contents.
   - Is the repo currently linked to a Netlify site? If yes, which
     one (via .netlify/state.json or netlify status)
   - What does the production Netlify site name look like (it
     should be 'talentdensity' per the dashboard screenshot)

4. FIREBASE PROJECT REFERENCES
   - Does .firebaserc exist? If yes, show its contents.
   - Does firestore.rules exist at the repo root? If yes, show
     filesize and last-modified date.
   - Does firestore.indexes.json exist?
   - Are there any service account JSON files referenced by env
     vars (look for FIREBASE_ADMIN_SDK_PATH or similar)?
   - Is there a 'secure/firebase-keys/' directory or similar
     outside the repo? Don't read keys, just confirm existence
     and list filenames.

5. SEED AND VERIFICATION SCRIPTS
   - Does scripts/ exist? List the contents.
   - Specifically: any seed-*.ts files? Any verify-*.ts files?

6. PACKAGE.JSON SCRIPTS
   - Show the "scripts" section of package.json
   - Specifically flag whether any scripts named seed:*, verify:*,
     or staging:* exist

7. ANTHROPIC KEY CONFIG
   - Check .env.local for ANTHROPIC_API_KEY
   - Report first 10 characters only of any key found

8. FOLLOWUPS DOCUMENT
   - Confirm docs/FOLLOWUPS.md exists and has 4 open items
     (TDI goals scoping, TDI goals visibility, KPI save indicator,
     Firestore rules not in source control)

After reporting, give me a one-paragraph summary: "TDS is at
[baseline state]. The phases that need the most work are [X, Y]
because [reason]."

Don't make any changes. Just report.
```

### Verification gate

You should have, after this prompt:

- A complete inventory of TDS's current state
- A clear answer to "does TDS have a staging Firebase project already" (probably no, based on FOLLOWUPS, but verify)
- Identification of any production credentials sitting in local files (BLT's biggest issue — TDS should be checked the same way)
- A baseline against which we measure progress in later phases

### What can go wrong

**Discovery reveals TDS already has partial staging setup** that nobody documented. Possible — TDS has been live for months. If Phase 0 surfaces a forgotten staging Firebase project or seed script attempt, we adapt the later phases to build on what's there.

**Discovery reveals production credentials in `.env.production.local`** like BLT had. Treat seriously — rotate credentials before any other phase work. The BLT playbook for credential rotation applies.

---

## Phase 1 — Audit and codify Firestore rules in source control

**Goal:** Pull TDS's current Firestore security rules out of the Firebase Console and into `firestore.rules` in the repo, version-controlled.

**Why:** This is FOLLOWUPS item #4 — rules currently exist only in the Firebase console with no git history, no review, no rollback target. Fixing this BEFORE creating a staging environment means staging rules can be deployed from source from day one. If we skip it, we'll be playing catchup later.

This was BLT's Phase 1 too. Critical foundation work.

### Prompts for Claude Code

#### Step 1.1 — Extract current rules

```
TDS Phase 1.1 — Extract current Firestore security rules from the
Firebase production console into source control.

Goal: get the live production rules into a firestore.rules file
at the repo root, version-controlled, deployable via firebase CLI
going forward.

Please:

1. Confirm whether firebase CLI is installed:
   firebase --version
   If not installed: tell me to run npm install -g firebase-tools

2. Confirm whether I'm logged into firebase CLI:
   firebase login:list
   If not logged in: tell me to run firebase login

3. Confirm/create .firebaserc that defaults to TDS production project
   (NOT staging — staging doesn't exist yet). Show me current
   contents or what you'd create.

4. Pull current rules from the production Firebase project:
   firebase firestore:rules get --project=[TDS production project ID]
   
   Save to firestore.rules at the repo root.

5. Show me the rules file. Don't redact anything — security rules
   are meant to be readable code.

6. Also pull indexes:
   firebase firestore:indexes --project=[TDS production project ID]
   
   Save to firestore.indexes.json.

7. Add both files to git but DO NOT commit yet. Just stage them.

Tell me which Firebase project you connected to. Verify it's
production, not anything else.
```

#### Step 1.2 — Review and commit the rules

After Claude Code shows you the rules file, **eyeball it for a minute.** Things to look for:

- Does the rules file match what your app actually does? (Multi-tenant scoping, role checks, etc.)
- Anything obviously missing or weird?
- Any references to collections that don't exist anymore?

Once you've reviewed:

```
Commit the firestore.rules and firestore.indexes.json files to main.

Commit message:
"chore: extract Firestore rules and indexes into source control

Per FOLLOWUPS item: TDS Firestore rules not in source control.
Rules extracted from production Firebase console as of 2026-05-19.
Going forward, rule changes happen in firestore.rules and deploy
via firebase deploy --only firestore:rules --project=production."

Don't push yet — let me decide when. Show me the commit confirmation
and current branch state.
```

### Verification gate

- ✅ `firestore.rules` exists at repo root
- ✅ `firestore.indexes.json` exists at repo root
- ✅ Both committed locally (not pushed yet)
- ✅ `.firebaserc` correctly identifies the TDS production project
- ✅ You've read through the rules and they look sensible

### What can go wrong

**Rules are very long and you don't recognize what some sections do.** Normal. Rules in mature apps grow over time. As long as nothing looks actively wrong, commit what's there. You can refine later.

**Indexes pull fails** because there are no composite indexes set up. Fine — `firestore.indexes.json` may be near-empty. That's a valid starting state.

**You don't have the production Firebase project ID handy.** Look in `.env.local` for `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, or in the Firebase Console URL when you're looking at the project.

---

## Phase 2 — Create the staging Firebase project

**Goal:** A second Firebase project, dedicated to TDS staging, mirroring production's setup but isolated.

**Why:** Need a place for test data that's completely separate from production. Real customer data must never touch staging, and vice versa.

### Step 2.1 — Manual creation in Firebase Console

🛑 **MANUAL STOP — Browser, ~10 minutes**

1. Open `console.firebase.google.com`
2. Click **"Add project"** (or similar)
3. Project name: **`talent-density---staging`** (three dashes — matches BLT's convention)
4. Disable Google Analytics for the project (not needed for staging)
5. Wait for the project to provision (~30 seconds)
6. Once created:
   - Go to **Project Settings → General**
   - Note the Project ID (should be `talent-density---staging` or similar)
   - Scroll to "Your apps" → add a **Web app** (the </> icon)
   - Name: "TDS Staging"
   - Don't set up Firebase Hosting
   - **Copy the firebaseConfig object** — you'll need these 6 values for env vars later

7. **Enable Authentication:**
   - Left nav: Authentication → Get started
   - Sign-in providers: enable **Email/Password**

8. **Enable Firestore:**
   - Left nav: Firestore Database → Create database
   - Start in **production mode** (we'll deploy our rules in Phase 3)
   - Choose location (use same region as production — likely `nam5` or `us-central`)

9. **Create a service account key:**
   - Project Settings → Service Accounts tab
   - Click "Generate new private key" → save the JSON file
   - Move it to your `secure/firebase-keys/` directory:
     - Path: `~/Documents/AppDevelopment/secure/firebase-keys/talent-density-staging-adminsdk.json`
     - (Or wherever your TDS staging keys folder lives — outside the repo, gitignored)

### Step 2.2 — Add staging project to .firebaserc

```
TDS Phase 2.2 — Update .firebaserc to recognize both production
and staging Firebase projects so we can deploy rules to each
explicitly.

Currently .firebaserc points only at production. We need to add
staging.

Please:

1. Show me current .firebaserc contents.

2. Update it to this structure (or equivalent):
   {
     "projects": {
       "default": "[TDS production project ID]",
       "production": "[TDS production project ID]",
       "staging": "talent-density---staging"
     }
   }

3. After update, verify:
   firebase use --project=staging
   firebase use --project=production
   Both should succeed without error.

4. Stage the change but don't commit yet.
```

### Verification gate

- ✅ Staging Firebase project exists in Firebase Console
- ✅ Service account JSON downloaded to `secure/firebase-keys/`
- ✅ `.firebaserc` recognizes both projects
- ✅ You have the staging `firebaseConfig` values noted somewhere

---

## Phase 3 — Deploy rules to staging, wire staging into the codebase

**Goal:** Push the version-controlled rules to BOTH production and staging Firebase projects. Configure the codebase to read environment-specific Firebase config.

**Why:** From this phase forward, rule changes happen in `firestore.rules` and deploy to whichever environment you choose. No more rules drift.

### Step 3.1 — Deploy rules to staging

```
TDS Phase 3.1 — Deploy the firestore.rules file to the staging
Firebase project.

Please:

1. Confirm we're targeting staging:
   firebase use --project=staging
   firebase projects:list
   The active project should be talent-density---staging.

2. Deploy rules ONLY (not full deploy):
   firebase deploy --only firestore:rules --project=staging

3. Also deploy indexes:
   firebase deploy --only firestore:indexes --project=staging

4. Report the output. Confirm both succeeded.

5. CRITICAL: Don't run a deploy against production unless I explicitly
   ask. We're only touching staging here.
```

### Step 3.2 — Update code to support multi-environment Firebase config

This is where TDS's existing Firebase initialization code needs to be made environment-aware. BLT did this by adding a `NEXT_PUBLIC_ENVIRONMENT` env var and a visible STAGING badge.

```
TDS Phase 3.2 — Make the codebase environment-aware.

Goal: when running in staging context (deploy previews, branch
deploys, future staging deploys), the app should:
1. Use staging Firebase config (not production)
2. Show a visible STAGING badge in the UI so it's impossible to
   confuse staging with production

Currently TDS probably reads Firebase config from NEXT_PUBLIC_*
env vars without environment switching. The setup we want:

- NEXT_PUBLIC_FIREBASE_* env vars on production Netlify context
  point at the production Firebase project
- Same env var names on deploy-preview and branch-deploy contexts
  point at the staging Firebase project (we'll set these in Phase 4)
- Adds a new env var NEXT_PUBLIC_ENVIRONMENT that's "production"
  in production context, "staging" in deploy-preview/branch-deploy
- Code reads NEXT_PUBLIC_ENVIRONMENT to decide whether to show
  the STAGING badge

Please:

1. Read src/lib/firebase.ts (or wherever Firebase is initialized
   in this repo). Show me the current init code.

2. Propose changes that:
   - Log to console which Firebase project is being used at init
     (so staging-vs-production is visible in browser console)
   - Read NEXT_PUBLIC_ENVIRONMENT and expose a helper isStaging()
     or similar

3. Propose a STAGING badge component:
   - Top-right of every page when NEXT_PUBLIC_ENVIRONMENT === "staging"
   - Orange background (#FF3C00 per design system), white text,
     uppercase "STAGING"
   - Doesn't render when env is production

4. Show me the proposed changes BUT don't apply them yet.
   I want to review the diff before any code changes land.

This is similar to BLT's Phase 4 work — you can pattern-match
from src/components/StagingBadge.tsx in the BLT Planner repo if
you have access to it (~/Documents/AppDevelopment/Client Planning System/).
```

### Step 3.3 — Apply the changes after review

After Claude Code shows you the proposed diff, eyeball it. If it looks reasonable:

```
Apply the proposed changes to Firebase init and add the STAGING
badge component. Run npm run dev briefly to verify nothing breaks
locally (it'll still hit whatever .env.local points at — that's
fine for now).

After verification, commit but don't push:
"feat: environment-aware Firebase init with STAGING badge

Adds NEXT_PUBLIC_ENVIRONMENT support so deploy-preview and
branch-deploy contexts can use staging Firebase config while
production stays untouched. Visible STAGING badge prevents
confusion between environments."
```

### Verification gate

- ✅ Rules deployed to staging Firebase project (visible in console)
- ✅ Codebase reads `NEXT_PUBLIC_ENVIRONMENT` and shows STAGING badge in staging
- ✅ Local `npm run dev` still works
- ✅ Changes committed locally, not pushed yet

---

## Phase 4 — Netlify env vars for staging context

**Goal:** Configure the existing production Netlify site (`talentdensity`) so that deploy previews and branch deploys hit the staging Firebase project, while production deploys (from `main`) keep hitting production Firebase.

**Why:** This is the magic of "three environments, one Netlify site." Production stays untouched. Deploy previews and branch deploys become safe-to-test against staging.

### Step 4.1 — Set staging-context env vars

🛑 **MANUAL STOP — Netlify dashboard, ~15 minutes**

This is mostly clicking. Could be done via Netlify CLI for speed, but the dashboard is fine.

1. Go to `app.netlify.com` → `talentdensity` site → **Site configuration** → **Environment variables**
2. For each variable below, you need it set DIFFERENTLY for production vs deploy-preview/branch-deploy. Click each variable, switch from "Same value for all contexts" to "Different value for each deploy context":

**Production context value: leave whatever's already there (production Firebase)**

**Deploy Previews + Branch deploys context value: the staging Firebase config from Phase 2.1.6**

Variables to update:
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID` (production value vs `talent-density---staging`)
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

3. **Add a new variable:** `NEXT_PUBLIC_ENVIRONMENT`
   - Production context: `production`
   - Deploy preview + branch deploy contexts: `staging`

4. **Add the staging service account:** `FIREBASE_ADMIN_SERVICE_ACCOUNT`
   - Already exists (probably) with production value
   - Add a different value for deploy-preview + branch-deploy contexts:
     paste the ENTIRE contents of the staging service account JSON
     downloaded in Phase 2.1.9

5. **Anthropic key:** if TDS uses Anthropic (it does for AskMike):
   - You'll need a separate staging Anthropic API key
   - Create one in Anthropic Console (name it `TDS-staging-2026-05-19` or similar)
   - Set `ANTHROPIC_API_KEY` per context: production value stays, staging context gets the new staging key
   - Production keeps its current key untouched

### Step 4.2 — Push staging branch and verify

```
TDS Phase 4.2 — Create a staging branch and push to trigger the
first staging-context build.

Please:

1. Confirm local main is in sync with origin/main and contains the
   commits from Phase 1, 2.2, and 3.3 (firestore.rules, .firebaserc,
   Firebase init refactor, STAGING badge).

2. Push main to origin first. This will trigger a production deploy
   on talentdensity.netlify.app. Watch for build success. This is a
   no-functional-change deploy from production's perspective (just
   docs + code that reads new env vars that production has set to
   production values). But verify production /api/health (or
   whatever TDS's health endpoint is) returns clean.

3. Create a staging branch:
   git checkout -b staging
   git push origin staging

4. This triggers a Netlify branch-deploy on the talentdensity site,
   using deploy-preview/branch-deploy context env vars (i.e., the
   staging Firebase config we just set).

5. Wait for build success. Report the deploy URL (will look like
   https://staging--talentdensity.netlify.app).

6. Open the URL in browser. Confirm:
   - STAGING badge visible top-right
   - Browser console shows "Firebase initialized: talent-density---staging"
   - Sign-in page renders (sign-in won't work yet — no users in staging)
```

### Verification gate

- ✅ Production deploy from `main` succeeded
- ✅ Production still works correctly (do a real sanity check in browser)
- ✅ Staging deploy URL accessible
- ✅ STAGING badge visible on staging URL
- ✅ Browser console confirms staging Firebase project on staging URL
- ✅ Three-way isolation real: local dev / staging deploy / production deploy all use the right Firebase project

### What can go wrong

**Production breaks after the push.** Most likely cause: a code change in Phase 3 introduced a bug. Roll back immediately with `git revert <commit>` and push. Investigate before retrying.

**Staging build fails.** Most likely cause: missing or malformed env var. Read Netlify build log carefully.

**STAGING badge shows on production.** `NEXT_PUBLIC_ENVIRONMENT` is set to `staging` in the production context by mistake. Fix in Netlify dashboard.

---

## Phase 5 — netlify.toml for explicit build config

**Goal:** Version-control the build configuration so future-you (or a teammate, or Claude Code six months from now) can see how TDS deploys without poking through Netlify's dashboard.

**Why:** Until this exists, build config lives only in Netlify's web UI — invisible to git history, lost if Netlify is replaced or migrated.

### Prompt for Claude Code

```
TDS Phase 5 — Create netlify.toml at repo root.

Please:

1. Confirm netlify.toml does NOT already exist (per Phase 0
   discovery, it shouldn't). If it does, show me contents and stop.

2. Check what Node version recent Netlify builds have been using
   (look at the build log for a successful recent deploy). Default
   to 20 if uncertain.

3. Create netlify.toml at repo root with this structure:

   # Comment block at top explaining:
   # - This file controls how TDS builds on Netlify
   # - Env vars are managed in the Netlify dashboard, NOT here
   # - Changes to this file go through git history and review

   [build]
   command = "npm run build"
   publish = ".next"

   [build.environment]
   NODE_VERSION = "20"
   NEXT_TELEMETRY_DISABLED = "1"

   [context.production]
   # Triggered by main branch pushes
   # Uses production-context env vars from Netlify dashboard
   # Deploys to talentdensity.netlify.app

   [context.deploy-preview]
   # Triggered by pull requests
   # Uses deploy-preview-context env vars (staging Firebase)
   # Each PR gets its own URL: deploy-preview-N--talentdensity.netlify.app

   [context.branch-deploy]
   # Triggered by pushes to any non-main branch (including staging)
   # Uses branch-deploy-context env vars (staging Firebase)
   # URL pattern: <branch>--talentdensity.netlify.app

4. Stage the file. Don't commit yet.
```

### Step 5.2 — Commit and verify it doesn't break anything

```
Commit netlify.toml to main:
"chore: explicit build config in netlify.toml

Documents the three deploy contexts (production, deploy-preview,
branch-deploy) in source control. Env vars stay managed via
Netlify dashboard. No functional change to current deploys."

Push to main. Watch for the auto-triggered Netlify production
build. Verify it succeeds. The netlify.toml addition should be a
no-op for behavior — Netlify just picks up explicit config instead
of inferring from defaults.

Also push to staging branch (fast-forward merge from main, then
push) so staging gets the same change. Verify the staging build
also succeeds.
```

### Verification gate

- ✅ `netlify.toml` exists at repo root
- ✅ Production build succeeded with the new toml
- ✅ Staging build succeeded with the new toml

---

## Phase 6 — Seed script (the biggest phase)

**Goal:** A repeatable script that wipes staging Firestore and re-populates with realistic test data — multiple fake companies, leadership teams, full assessments, action plans, the whole TDS data model.

**Why:** Without realistic test data, staging is just an empty database. Testers can't exercise meaningful flows. With it, staging feels like a real app with real-feeling tenants.

This is BLT's Phase 6, broken into four sub-phases. Plan for **several hours minimum**, possibly spread across multiple sittings.

### Phase 6a — Schema reconnaissance

**Don't write any seed code yet.** First, understand exactly what TDS's data model is.

```
TDS Phase 6a — Schema reconnaissance for the staging seed script.

Goal: produce a written report of TDS's Firestore data model
so we can write a seed script that creates data the app accepts
without crashes.

Read the TDS codebase carefully and produce a markdown report
at scripts/SEED-SCHEMA-RECON.md covering:

SECTION 1 — Firestore Collection Inventory
For every collection used by TDS, list:
- Collection path (e.g., companies/{cid}/teams or top-level)
- Purpose (one line)
- Document structure (key fields + types)
- Required vs optional fields
- Subcollections
- Whether tenant-scoped

Look at:
- firestore.rules paths (every collection the app touches is named there)
- Component code (search for collection() and doc() calls)
- Any TypeScript types defining doc shapes
- Server-side API routes

SECTION 2 — User Model
- Where do user records live after Firebase Auth creates them?
- What fields are required on user docs?
- What roles exist (per CLAUDE.md: superadmin, company_admin,
  senior_leader, leader)?
- Is there a top-level /superadmin/{uid} doc for superadmins?
- Is there a /userMappings or similar lookup table?
- What's the relationship between Firebase Auth UID and Firestore
  user docs?

SECTION 3 — Company Model
- What fields are required on /companies/{cid}?
- What subcollections must exist for a company to function?
- Are there "starter" docs that have to be created when a company
  is first set up?

SECTION 4 — Team/Member Model (TDS-specific)
- /companies/{cid}/teams structure
- /companies/{cid}/teamMembers structure
- How team membership is represented
- How reportsToUserId relationships work
- Whether teamMembers are also app users or just data records

SECTION 5 — Assessment Model
- /companies/{cid}/assessments structure
- cultureFitScores array shape
- productivityActuals array shape
- How quarter/year is represented
- How performanceCategory is computed
- Required fields vs computed-on-read

SECTION 6 — Productivity Targets
- /companies/{cid}/productivityTargets structure
- bigger/smaller type handling
- weight summing rules

SECTION 7 — Core Values
- /companies/{cid}/coreValues structure
- behaviors array
- relationship to assessment cultureFitScores

SECTION 8 — TDI Goals (Phase 1 incomplete per FOLLOWUPS)
- Where ARE goals currently stored (note the per-user bug)
- Where SHOULD they be stored (per Mike's confirmation in FOLLOWUPS)
- Don't fix the bug here — just document the current and intended
  state

SECTION 9 — Action Plans
- /companies/{cid}/actionPlans structure
- actions[] and notes[] shape

SECTION 10 — Dependency Order
- In what order must docs be created during seed?
  (Company before users? Users before teams? Teams before
  teamMembers? Etc.)

SECTION 11 — Pitfalls
- Anything weird discovered along the way
- Fields that look optional but break the app if missing
- Computed fields the app expects pre-computed on write
- Any "config" docs that aren't tenant-scoped

Write the full report. Don't write any seed code yet.
Save to scripts/SEED-SCHEMA-RECON.md.

Estimate: ~20-30 minutes of careful code reading.
```

After Claude Code finishes, **read the report.** This is the most important review of the entire project. If the schema is wrong, the seed script will fail. Worth 30 minutes of careful reading.

### Phase 6b — Seed script foundation (one company, end-to-end)

```
TDS Phase 6b — Seed script foundation with critical safety checks.

Based on the schema recon document at scripts/SEED-SCHEMA-RECON.md,
write scripts/seed-staging.ts with:

1. CRITICAL safety checks at the top:
   - Hardcode the production project ID (whatever TDS's production
     is). Abort immediately if the loaded SA project_id matches.
   - Log loudly which project is being targeted at startup.
   - Require explicit --apply flag for any write operations.
     Default is dry-run.

2. Constants block:
   - COMMON_PASSWORD = "StagingTest2026!"  (same convention as BLT)
   - List of seed users with displayName, email, role
   - For TDS specifically: one fake company (start with one — we'll
     add more in Phase 6c)

3. Functions for each collection type:
   - createUser(uid, profile)
   - createCompany(cid, name, settings)
   - createTeam(...)
   - createTeamMember(...)
   - createCoreValue(...)
   - createProductivityTarget(...)
   - createAssessment(...)
   - createActionPlan(...)

4. A wipe function that recursively deletes all docs under
   /companies/{cid} for the target tenant (only if --apply).

5. Main flow:
   - Parse flags
   - Run safety checks
   - Wipe target tenant if --wipe-and-reseed flag
   - Create company
   - Create users + Firebase Auth records (with COMMON_PASSWORD)
   - Create teams, team members
   - Create core values
   - Create productivity targets
   - Create one round of assessments
   - Create action plans
   - Print summary at end

6. Add npm scripts to package.json:
   - "seed:staging": "tsx scripts/seed-staging.ts"
   - "seed:staging:apply": "tsx scripts/seed-staging.ts --apply"
   - "seed:staging:fresh": "tsx scripts/seed-staging.ts --apply --wipe-and-reseed"

For this phase, ONE tenant only. The first tenant should be:
- Company name: "Aurora Manufacturing" (or similar fake-but-real-feeling)
- 6 users: CEO, CFO, COO, VP Sales, VP Ops, Analyst
- 2 teams (Senior Leadership Team + one functional team)
- Full core values, productivity targets, assessment scores
- 1 quarter of assessments completed

After writing, DO NOT run yet. Show me the file. I want to review.
```

### Phase 6c — Expand to multiple tenants

After 6b is working (verified manually), expand:

```
TDS Phase 6c — Expand seed to multiple tenants.

The 6b seed creates one tenant (Aurora Manufacturing). Now add
two more, mirroring BLT's three-tenant pattern:

- Aurora Manufacturing (existing) — fiscal year starts January
- Beacon Logistics — fiscal year starts April
- Crescent Consulting — fiscal year starts October

For Beacon and Crescent, similar shape (CEO/CFO/COO/etc.) but:
- Different display names for users
- Different email convention for variety (some role-based, some
  first.last) — matches BLT's email convention split
- Slightly different team structures
- Different quarterly assessment data (mix of HP/MP/LP/LCF
  categories so testers can exercise edge cases)

Also add the superadmin user (Mike Goldman) at /superadmin/{uid}
and /userMappings/{uid} with companyId: null, following the BLT
pattern.

Show me the diff before applying.
```

### Phase 6d — Verification

```
TDS Phase 6d — Run the seed and verify.

Please:

1. Confirm we're targeting staging (project_id check).

2. Run: npm run seed:staging
   This is a dry run. Should print what WOULD be created without
   creating anything. Verify output looks sensible.

3. If dry-run looks good:
   npm run seed:staging:apply
   This actually writes. Watch the output.

4. After completion, verify a sample:
   - Read /companies and confirm 3 tenants exist
   - Read /companies/aurora-manufacturing/users and confirm 6 users
   - Read /superadmin and confirm Mike's doc exists
   - Read a few assessment docs and confirm structure matches the
     schema recon

5. Try signing in to staging:
   - Open the staging deploy URL
   - Sign in as one of the seeded users (Aurora's CEO email,
     password StagingTest2026!)
   - Confirm successful login
   - Confirm dashboard loads with seeded data

6. Report findings.
```

### Verification gate

- ✅ `scripts/seed-staging.ts` exists and runs without errors
- ✅ `scripts/SEED-SCHEMA-RECON.md` exists and accurately describes the data model
- ✅ Staging Firestore has 3 fake companies with realistic data
- ✅ Sign-in as a seeded user works on the staging URL
- ✅ Dashboard loads with the seeded data

---

## Phase 7 — Verification harnesses

**Goal:** Two npm scripts that confirm the staging environment is correctly set up at any time, without manual checking.

**Why:** When something feels off, you want a one-line command that tells you "yes, staging is correctly configured" or "no, here's what's wrong." BLT built `verify:admin-sdk` and `verify:seed-auth`. TDS should have equivalents.

### Prompts for Claude Code

```
TDS Phase 7 — Verification harnesses.

Create two scripts:

scripts/verify-admin-sdk.ts:
- Loads the staging service account
- Confirms project_id is talent-density---staging
- Initializes Firebase Admin SDK
- Reads /companies and counts tenants
- Reads /superadmin and confirms Mike's doc exists
- Reports green/red for each check

scripts/verify-seed-auth.ts:
- For each seeded user email (Aurora CEO, Beacon CEO, Crescent CEO,
  plus a member from each), attempts to sign in via Firebase Auth
  REST API using COMMON_PASSWORD
- Reports success/failure for each
- This is the "can my testers actually log in" check

Add npm scripts:
- "verify:admin-sdk": "tsx scripts/verify-admin-sdk.ts"
- "verify:seed-auth": "tsx scripts/verify-seed-auth.ts"

Show me the files before applying.
```

### Verification gate

- ✅ `npm run verify:admin-sdk` passes
- ✅ `npm run verify:seed-auth` passes
- ✅ Both committed to main, pushed

---

## Phase 8 — Operational documentation

**Goal:** A single document — `docs/README-DEPLOYMENT.md` — that captures everything someone needs to know to operate the TDS staging+production setup.

**Why:** All of this work evaporates if it's not documented. BLT learned this — without the runbook, future-you (or a successor) has to reverse-engineer the setup.

### Prompt for Claude Code

```
TDS Phase 8 — Operational deployment documentation.

Create docs/README-DEPLOYMENT.md modeled after the BLT Planner
equivalent (~/Documents/AppDevelopment/Client Planning System/docs/README-DEPLOYMENT.md).

Cover these sections:

1. Overview — purpose, audience, last-verified date, cross-refs

2. Project topology
   - Two Firebase projects (production vs staging) with IDs
   - Three Netlify contexts (production/deploy-preview/branch-deploy)
   - Local dev config
   - Admin SDK keys (where they live, file vs env-var mode)

3. Seed workflow
   - npm run seed:staging (dry run)
   - npm run seed:staging:apply (writes)
   - npm run seed:staging:fresh (wipe + write)
   - Production safety hardcode

4. Test user accounts
   - Per-tenant tables with names, emails, roles, UIDs
   - Shared password StagingTest2026!
   - Mike's superadmin separate

5. Verification harnesses
   - What each script checks
   - When to re-run

6. Common operational tasks
   - "Provision a new staging superadmin"
   - "Rotate a credential"
   - "Bootstrap staging from scratch" (10-step checklist)
   - "Deploy a change to staging"
   - "Deploy a change to production"

7. Known limitations & gotchas
   - Pointer to docs/FOLLOWUPS.md for the live list
   - Flat table format, one row per known issue

8. Production deploy process
   - Rules don't auto-deploy (Netlify only deploys app code, not
     Firestore rules — those need firebase deploy)
   - Safe deploy direction guidance
   - Rollback playbook

9. Quick reference
   - File locations
   - Key UIDs
   - One-liner cheatsheet

Target length: 400-600 lines. Heavy cross-references to keep it
focused. Don't restate content from CLAUDE.md or FOLLOWUPS.md —
link instead.

Show me the draft. Don't commit yet.
```

### Verification gate

- ✅ `docs/README-DEPLOYMENT.md` exists, reviewed by you, accurate
- ✅ Committed and pushed

---

## Phase 9 — Test plan for tester handoff

**Goal:** A test plan tailored to TDS, in the same shape as Ximena's BLT test plan, ready to hand to whoever tests TDS.

**Why:** Without a structured plan, testing is ad-hoc and incomplete. With one, the tester knows exactly what to exercise and can be specific about findings.

### What this phase produces

Pattern this after the Xime-Test-Plan-v2.docx (BLT version):

- Welcome and orientation
- Test environment + seeded users
- Auth section
- First impressions section
- Deep section per major feature (TDS's are: Teams/Members, Core Values, Productivity Targets, Assessments, Talent Assessment Summary, Action Plans, AskMike, Reporting)
- Role matrix at end of each major section (superadmin, company_admin, senior_leader, leader)
- Permissions and confidentiality section
- AskMike deep section
- Cross-tenant section
- Click-everything pass
- Mobile smoke test
- Wrap-up

### Prompt for Claude Code

Don't run this yet — wait until Phase 8 is done.

```
TDS Phase 9 — Test plan document.

Generate docs/Test-Plan.md (or .docx if preferred) modeled after
the BLT Planner equivalent (Xime-Test-Plan-v2 in the Client Planning
System project).

Adapt for TDS specifics:
- Different role names (superadmin, company_admin, senior_leader,
  leader vs BLT's roles)
- TDS-specific features (assessments, talent grid, TDI, action plans)
- TDS-specific data model (teams, team members, productivity targets,
  core values)
- BUG-CHECK rows for known issues from docs/FOLLOWUPS.md:
  - TDI goals scoped per-user (most important to verify)
  - TDI goals not visible to senior_leader
  - KPI save indicator missing
  - Any other open items by then

Use the seeded test users from Phase 6 (Aurora, Beacon, Crescent
tenants). Reference them by name in test cases — "sign in as
[Aurora CEO's name]" not "sign in as a company_admin user."

Target: ~150 test cases across all sections.
Target time for the tester: 4-5 hours across 2-3 sittings.

Show me the draft before applying.
```

### Verification gate

- ✅ Test plan exists, reflects TDS's actual current build state
- ✅ All seeded users named in test cases
- ✅ BUG-CHECK rows for current FOLLOWUPS items

---

## Phase 10 — Tester handoff

Mirror what we did for Ximena with BLT:

1. Pick the tester (probably Ximena again — she already knows the BLT workflow)
2. Provision her as a TDS staging superadmin (Phase 6 already does this for Mike; add Ximena similarly via a small script or one-time prompt)
3. Send her:
   - URL: `staging--talentdensity.netlify.app` (or whatever it resolves to)
   - Her account credentials
   - The test plan from Phase 9
   - The shared password `StagingTest2026!` for the seeded test users
4. Be available for the first 30-60 min of her first session

---

## Estimated total time

| Phase | Work | Estimated time |
|---|---|---|
| 0 | Discovery and baseline | 15 min |
| 1 | Codify Firestore rules | 30 min |
| 2 | Create staging Firebase project | 30 min |
| 3 | Deploy rules, environment-aware code | 1-2 hours |
| 4 | Netlify env vars for staging context | 30 min |
| 5 | netlify.toml | 15 min |
| 6 | Seed script (the big one) | 4-8 hours |
| 7 | Verification harnesses | 1 hour |
| 8 | Operational docs | 1-2 hours |
| 9 | Test plan | 2-3 hours |
| 10 | Tester handoff | 1 hour |

**Total: roughly 15-25 hours of focused work, realistically spread across 2-4 weeks of evenings/sessions.**

This matches BLT's actual journey — it wasn't a weekend project, and TDS shouldn't be either.

---

## Lessons baked in from BLT's journey

Things that bit BLT and shouldn't bite TDS:

- **Never run `netlify deploy --build --prod` from your laptop** — it bundles `.env*.local` files into deploys, exposing credentials. Always use git-CI (git push → Netlify builds on its servers).

- **`.env.production.local` should not exist in the repo root.** Period. If you need production access locally for some operational reason, source the credentials from outside the project directory or use a separate secrets folder.

- **Anthropic Console "Last used" can lag indefinitely.** Use the cost column or account credits delta as the primary signal of key activity.

- **Each environment needs dedicated keys.** Anthropic key for production. Different Anthropic key for staging. Different Firebase Admin SA for each project. No sharing.

- **Service accounts can have multiple keys.** When rotating, add the new key first, verify it works, then revoke the old one. Never single-cutover.

- **Update FOLLOWUPS as you discover issues.** Don't trust memory. Each session's learnings should land in `docs/FOLLOWUPS.md` before you walk away from the keyboard.

- **Verify after every phase.** Each phase has a verification gate. Don't skip them, even when you're confident. The 5 minutes saved by skipping verification is 2 hours lost when something silent breaks 3 phases later.

- **Read what Claude Code reports back carefully.** The most valuable diagnostic moments in BLT's journey came from Claude Code surfacing things like "wait, there are 3 Anthropic keys" or "this credential is bundled into the deploy." Don't speed-read past surprises.

---

## When you're ready

Start with **Phase 0** (Discovery). It's the cheapest phase and the most informative.

After Phase 0, paste me Claude Code's report and we'll decide which subsequent phases need the most attention based on what TDS already has vs. doesn't.
