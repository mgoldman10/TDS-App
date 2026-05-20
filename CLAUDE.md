# CLAUDE.md — Talent Density System (TDS)

Read this file at the start of every session before writing any code.

---

## What This App Is

**Talent Density System (TDS)** is a multi-tenant web application built for executive leadership coach Mike Goldman. It operationalizes the five-step **Talent Density System** from his book *The Strength of Talent* (2025), helping leaders assess their teams across two dimensions — Culture Fit and Productivity — and take structured quarterly action to improve team performance.

The app is used by:
- Mike Goldman (Super Admin / Coach) — to administer all client companies
- Company Admins — to set up their organization, users, and core values
- Senior Leaders and Leaders — to assess their team members quarterly and manage action plans

The framework is built around this core belief from the book: **"The #1 driver of profit growth is people growth."**

---

## The Five-Step Framework (from *The Strength of Talent*)

The app implements all five steps. Every feature maps to one of these:

**Step 1 — Set Expectations**
Leaders define two types of expectations for each direct report:
- **Productivity:** measurable KPI targets (via the Job Scorecard / Functional Accountability Chart)
- **Culture Fit:** nonnegotiable core values everyone must live

**Step 2 — Assess Performance**
Leaders score each direct report on both dimensions quarterly using the Talent Assessment Model — a 0–10 grid placing each person into one of four performance categories (HP, MP, LP, LCF).

**Step 3 — Act**
Leaders take specific, differentiated actions based on each team member's category: overinvest in high performers, coach medium performers, make tough decisions on low performers. Includes one-on-one meetings and difficult conversations.

**Step 4 — Drive Accountability**
The Quarterly Talent Assessment Meeting (QTAM) creates peer accountability across the leadership team. The Talent Density Indicator (TDI) is the master KPI: `TDI = %HP − (%LP + %LCF)`.

**Step 5 — Cascade**
The process rolls top-down through the organization. Each leader runs their own QTAM for their team. Senior leaders participate in the senior leadership QTAM and lead their own functional team QTAM.

---

## Credential Handling — NEVER LEAK SECRETS TO CHAT

Any operation that reads `.env.local`, any `.env*` file, files in `~/Documents/AppDevelopment/secure/firebase-keys/`, Netlify env vars, GCP service account keys, or anything containing secret material **MUST mask output before it reaches stdout.** Never use commands that would dump full credentials, even briefly — terminal output goes into the conversation transcript and out of your control.

### Forbidden without masking
- `cat .env.local`, `grep` on `.env.local`, `head`/`tail` on `.env.local` (or any other env file)
- `netlify env:list --plain` — **forbidden in all forms.** The `--plain` flag dumps values, not just names. Use the masked default `netlify env:list` instead.
- `netlify env:get KEY` without piping the value into a masker
- `gcloud iam service-accounts keys create` — the JSON downloads to stdout if you don't `--output-file`
- `cat`, `head`, `tail`, or any printing of any service-account JSON file

### Acceptable patterns
- **Env var verification:** extract only the first ~10 chars of a string-valued secret, or print only the first 16 chars of its SHA-256.
- **JSON secret files:** parse with Python or `jq`, extract only non-secret fields — `type`, `project_id`, `client_email`, first 8 chars of `private_key_id`. Never print `private_key`.
- **Comparing two secret values:** compare SHA-256 hashes, not the values themselves. SHA-256 is one-way; the hash is safe to display.
- **Netlify env inspection:** use the default `netlify env:list` (values are masked). For a specific value, `netlify env:get KEY | sha256sum` and report the hash.

### When in doubt
Extract only what's needed. If you only need to verify that a value's prefix matches an expected pattern, show only the prefix. If a command accidentally dumps a secret, **flag it immediately in your response** so the user can rotate the credential before the transcript is logged elsewhere. Don't try to bury or undo it — surfacing is the recovery path.

**This rule overrides convenience.** A multi-step masked verification is always preferable to a one-line unmasked grep. The few extra seconds are cheap; rotating a leaked production credential is not.

Three production credentials were exposed via this pattern in the 48 hours preceding 2026-05-20 (TDS Firebase admin SA key, TDS Anthropic API key, BLT Planner Anthropic API key). This rule exists to prevent a fourth.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router, TypeScript) |
| Styling | Tailwind CSS |
| Backend / Auth | Firebase (Firestore + Firebase Auth) |
| Hosting | Netlify |
| Charts | Recharts |
| AI Coaching | Anthropic Claude API (AskMike feature) |

---

## Design System — CRITICAL

**Always read `DESIGN_SYSTEM.md` before building any UI component.**

This app must match BLT Planner's look and feel exactly. Key rules:

- Font: **Montserrat** (weights 300–800)
- Colors — use only these tokens, never hardcode hex values in components:
  - `primary` = `#212121` (text, headings, nav)
  - `accent` = `#FF3C00` (CTAs, AskMike buttons, errors)
  - `white` = `#FFFFFF` (page backgrounds)
  - `surface` = `#FFFFFF` (cards, inputs)
  - `gray` = `#C6C6C6` (borders, dividers)
- Border radius: `rounded-[4px]` for cards/inputs/buttons, `rounded-[2px]` for badges, `rounded-full` for AskMike pill buttons
- No gradients. Flat palette only.
- Sidebar: fixed `w-56`, always dark (`#212121`), stays dark in both light and dark mode
- Buttons: always `uppercase font-semibold tracking-wider`
- Section labels and nav items: `uppercase tracking-wider text-xs font-semibold text-primary/40`
- Status colors (not brand colors): green `#22c55e`, yellow `#eab308`, red `#ef4444`
- AskMike buttons: always `bg-accent text-white rounded-full` (pill shape)

CSS custom properties live in `src/app/globals.css`. Tailwind tokens in `tailwind.config.ts`.

---

## Multi-Tenant Data Structure (Firestore)

```
/companies/{companyId}
  - name, settings, scoringParameters, createdAt

/companies/{companyId}/users/{userId}
  - name, email, role, teamIds[], securityLevel

/companies/{companyId}/teams/{teamId}
  - name, leaderId, memberIds[]

/companies/{companyId}/teamMembers/{memberId}
  - name, role, reportsToUserId, teamId, isAppUser

/companies/{companyId}/coreValues/{valueId}
  - name, description, behaviors[]

/companies/{companyId}/productivityTargets/{memberId}
  - targets[]: { name, type (bigger/smaller), unit, weight, min, max, target }

/companies/{companyId}/assessments/{assessmentId}
  - memberId, quarter, year
  - cultureFitScores[]: { coreValueId, rating (Models/Lives/OccasionalChallenges/FrequentChallenges) }
  - cultureFitScore (calculated)
  - productivityActuals[]: { targetId, actual }
  - productivityScore (calculated)
  - performanceCategory (HP/MP/LP/LCF)
  - createdAt, updatedAt

/companies/{companyId}/actionPlans/{planId}
  - memberId, quarter, year
  - actions[]: { description, targetDate, completedAt }
  - notes[]: { text, createdAt }
```

---

## Security Model

Four user levels — enforce in both Firestore security rules and UI:

1. **Super Admin** (Mike Goldman) — sees and administers all companies
2. **Company Admin** — manages users, core values, scoring parameters for their company only
3. **Senior Leader** — member of senior leadership team AND their own functional team; assesses direct reports; NOT assessed in the group QTAM they attend (per the book, CEO assessments of the leadership team happen privately with a coach)
4. **Leader** — assesses direct reports only; cannot see other teams or other leaders' assessments

**Critical security rules:**
- Users can only enter assessments for people who directly report to them
- Users can only see team members at or below their level
- Never expose one leader's assessments to another leader at the same level
- The CEO's assessment of their leadership team is done privately — never surfaced in the group QTAM view

---

## Key Business Logic

### Performance Categories (company-configurable, book defaults)
Per the book, use .5 thresholds so no team member ever falls exactly on a line:
- **High Performing (HP):** culture fit ≥ 9 AND productivity ≥ 9 *(book threshold line: 8.5)*
- **Low Culture Fit (LCF):** culture fit < 7.5 — regardless of productivity score
  *"It doesn't matter how productive they are; if they're not living the core values, they are toxic."*
- **Low Producing (LP):** productivity < 6.5 AND not already LCF
- **Medium Performing (MP):** everyone else

### Culture Fit Scoring
Score each core value individually, then average all scores:
- **Models** = 10 *(a model for the rest of the organization)*
- **Lives** = 9 *(lives all core values consistently)*
- **Occasional Challenges** = 7 *(occasionally has challenges with one or two core values)*
- **Frequent Challenges** = 1 *(frequently challenges; large negative impact on others)*

Apply caps after averaging:
- If any core value is "Occasional Challenges" → total score cannot exceed **8.4**
- If any core value is "Frequent Challenges" → total score cannot exceed **7.4**
- If both apply, use the lower cap (7.4)

### Productivity Scoring — Bigger Is Better
- Max auto-sets to Target (grayed out). User enters Min only (default 0, must be ≤ Target).
- Raw Score = ((Actual - Min) / (Target - Min)) × 10
- Adjusted Score: cap at 10, floor at 0
- Weighted Score = Weight × Adjusted Score
- Total Productivity Score = sum of all Weighted Scores

### Productivity Scoring — Smaller Is Better
- Min auto-sets to Target (grayed out). User enters Max only (required, no default).
- Raw Score = ((Max - Actual) / (Max - Target)) × 10
- Adjusted Score: cap at 10, floor at 0
- Weighted Score = Weight × Adjusted Score

### Weights
All productivity target weights for one person must sum to exactly 100%. Validate before saving.

### Talent Density Indicator (TDI)
`TDI = %HP − (%LP + %LCF)`
Range: -100% to +100%. This is the master leading indicator of organizational health per the book. Measure at company, team, and leader level.

---

## Modules (Build Order)

1. Auth & security setup
2. Company Settings (users, core values, scoring parameters)
3. Teams & Team Members
4. Productivity Targets — Job Scorecard (Step 1)
5. Assessment entry — culture fit + productivity (Step 2)
6. Talent Assessment Summary — the visual model (Step 2)
7. Action Plans & Coaching (Step 3)
8. QTAM workflow — quarterly assessment process (Step 4)
9. Dashboard
10. Reporting & TDI trends (Step 4)
11. Super Admin view
12. Help screens per module

---

## AskMike AI Coaching

Three AskMike coaches integrated via the Anthropic Claude API — all map to Step 3 (Act):
- **KPI Coach** — helps leaders set meaningful productivity targets (Step 1 support)
- **People Coach** — recommends development actions per performance category (Step 3)
- **Difficult Conversations Coach** — helps leaders prepare for conversations with low performers (Step 3)

AskMike buttons always use: `bg-accent text-white rounded-full font-semibold uppercase tracking-wider shadow-md`

---

## Privacy Rules — NON-NEGOTIABLE

- **Never include specific coaching content, assessment scores, or team member names in emails.**
- Email reminders contain only a link back to the app. The user must log in to see details.
- The Talent Assessment Summary has a **privacy filter** — hides names/scores before the view renders, for use in meetings where participants should not see how the CEO scored them.
- Per the book: leaders should NOT share a team member's specific performance category rating with that team member. The app should never encourage sharing raw scores with the person being evaluated.

---

## What NOT To Do

- Never hardcode hex color values in components — always use Tailwind tokens
- Never use gradients
- Never put coaching details, scores, or names in email notifications
- Never let a leader see another leader's assessments at the same level
- Never let weights save if they don't sum to 100%
- Never use `rounded-full` except for AskMike buttons and avatar circles
- Never use `<form>` tags in React components — use `onClick`/`onChange` handlers
- Never surface the CEO's assessment of their leadership team in a group QTAM view

---

## Current Build Status

[ ] Update this section as modules are completed.

- [x] Project setup & design system configuration
- [x] Auth & Firestore security rules
- [x] Company Settings
- [x] Teams & Team Members
- [x] Productivity Targets (Job Scorecard)
- [x] Assessment entry
- [x] Talent Assessment Summary
- [x] Action Plans
- [ ] QTAM workflow
- [ ] Dashboard
- [ ] Reporting / TDI trends
- [ ] Super Admin view
- [ ] Help screens
