# Follow-ups Archive — Talent Density System

Closed, shipped, and resolved items moved here from FOLLOWUPS.md.
Active backlog lives in docs/FOLLOWUPS.md.
Items are in reverse-chronological order (most recently closed at top).

### Staging environment seeded for the first time (2026-07-04)
Discovered: 2026-07-04, during T-S1 Stage 1 security verification

TDS's staging environment (branch, Firebase project, deploy pipeline) has existed structurally, but had never actually been seeded with test data or working test accounts until 2026-07-04. Running `npm run seed:staging:apply` created 3 test companies (Aurora Manufacturing, Beacon Logistics, Crescent Consulting), 18 tenant users, and 1 global superadmin (mike.goldman@tds-test.example.com), all with password StagingTest2026!. This unblocks manual and scripted testing against staging going forward.

Status: DONE 2026-07-04 — staging now has working seeded test accounts.

---

### Anthropic model id hardcoded — retirement time-bomb (learning from BLT)
STATUS: SHIPPED 2026-06-20
Fix: Centralized Anthropic model config in src/lib/ai-config.ts.
Replaced hardcoded claude-sonnet-4-20250514 with ANTHROPIC_MODEL
constant in both AskMike routes (route.ts, title/route.ts).
Confirmed working in staging (local dev) and production.
Commits: d65a169 (config), b527dc4 (routes).
Priority: HIGH — possible live silent outage; verify ASAP.
Source: 2026-06-20 BLT AskMike outage. BLT hardcoded claude-sonnet-4-20250514,
which Anthropic RETIRED 2026-06-15; every AI call has 404'd silently since, in
both BLT environments. TDS uses the same Anthropic Messages API server-side and
may share the pattern.

Action:
1. URGENT — grep TDS for any hardcoded Anthropic model id, especially
   claude-sonnet-4-20250514 or claude-opus-4-20250514 (both retired 06-15). If
   present, TDS's AI is likely broken right now. Migrate to the current same-tier
   id (Sonnet -> claude-sonnet-4-6; Opus -> claude-opus-4-8; note Opus has
   API-breaking sampling-param changes, Sonnet does not).
2. Centralize the model id in ONE place (env var/constant).
3. Add alerting on AI-call failures so a future retirement surfaces same-day
   (ties to the planned TDS AI cost monitoring).
General principle: silent failures on critical paths need alerting, not just
logging — assume silence != success.

---

### Resend production API key rotation
Originally noted 2026-05-21. The production TDS Resend key was exposed in chat 2026-05-21 (exposure #5 — Netlify raw API returned the `dev`-context value unmasked; the original safety check had covered only the `production` context).

Rotation was initially blocked: three freshly-generated keys all returned 401 on auth tests, with the leading hypothesis being a Resend account/workspace mismatch (the new keys' owning account differed from where the originally-exposed key lived) rather than a key-format or activation problem.

CLOSED 2026-05-25: rotation is complete. Verified manually in the Resend dashboard 2026-05-25 — the active TDS production key is `TDS-prod-2026-05-22` (created and in active use). NO old or orphaned TDS keys remain in the account; the originally-exposed key from 2026-05-21 is no longer present. The 2026-05-21 transcript-side exposure therefore no longer maps to any live credential. Risk: closed.

(The separate "Staging email env vars — clean up after Resend rotation" follow-up remains genuinely open — the rotation is done but the per-context staging env-var cleanup it referenced wasn't done at the same time. See FOLLOWUPS.md #5.)

---

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

---

### TDS Firestore rules not in source control
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
