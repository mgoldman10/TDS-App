# TDS Build Prompts — with Book Context

Paste these into Claude Code in order. Each references the DESIGN_SYSTEM.md and spec.md already in your project root.

---

## Prompt 1 — Project Setup

> I'm building a new Next.js web application called **Talent Density System (TDS)**. It implements the five-step Talent Density framework from Mike Goldman's book *The Strength of Talent*. Read `CLAUDE.md` and `spec.md` in the project root before writing any code — they contain the full framework, business logic, and design rules.
>
> Also read `DESIGN_SYSTEM.md` for exact styling. This app must match BLT Planner's look and feel: Montserrat font, `#212121` / `#FF3C00` / `#FFFFFF` / `#C6C6C6` color palette, flat design, no gradients.
>
> Set up a new Next.js project with TypeScript, Tailwind CSS, and Firebase. Configure `tailwind.config.ts` and `globals.css` exactly as described in the design system, including CSS custom properties and dark mode strategy.

---

## Prompt 2 — Auth & Multi-Tenant Security

> Add Firebase Authentication and Firestore with a multi-tenant data structure. See `CLAUDE.md` for the full security model and Firestore schema.
>
> The four user levels are: Super Admin (Mike Goldman), Company Admin, Senior Leader, and Leader. Key rule: leaders can only see and assess people who directly report to them.
>
> One important nuance from *The Strength of Talent*: the CEO's assessment of their leadership team is done privately — never in the group QTAM view. Build Firestore security rules to enforce this. Create login/logout pages using the BLT Planner design system.

---

## Prompt 3 — Company Settings

> Build the Company Settings module. Three sections:
>
> **1. User Management:** Add/edit users with name, email, security level, and team assignment. Senior leaders belong to two teams: the senior leadership team plus their functional team.
>
> **2. Core Values (Step 1 of the Talent Density framework):** Add/edit company core values. Per *The Strength of Talent*, core values are nonnegotiable behaviors — not aspirational phrases. Each value has a required Name and optional Description and Behaviors fields.
>
> **3. Scoring Parameters:** Company admins set the thresholds for each performance category. Per the book, use .5 values so no team member ever falls exactly on a line. Defaults are: HP = culture fit ≥ 9 AND productivity ≥ 9 (line at 8.5); LCF = culture fit < 7.5; LP = productivity < 6.5 unless already LCF; MP = everyone else. See `spec.md` for full details.
>
> Match the BLT Planner design system for all UI.

---

## Prompt 4 — Teams & Team Members

> Build the Teams module. A leader must be able to:
> - Create and manage their team
> - Add team members (they don't need to be app users — they're just people being evaluated)
> - Track role, team, and reporting-line changes over time (needed for historical reporting per spec.md)
>
> Team members only become app users if separately set up by a Company Admin. Use BLT Planner card and form patterns.

---

## Prompt 5 — Productivity Targets (Job Scorecard — Step 1)

> Build the Productivity Targets module. This implements the Job Scorecard from *The Strength of Talent* — each role has KPI targets that define what success looks like.
>
> Each target has a name, type (Bigger Is Better or Smaller Is Better), unit (units/dollars/%), and weight. All weights for one person must sum to 100%.
>
> **Bigger Is Better:** Max auto-sets to Target (grayed out). User enters Min only (default 0, must be ≤ Target).
> Raw Score = ((Actual - Min) / (Target - Min)) × 10 → cap at 10, floor at 0 → Weighted Score = Weight × Adjusted Score
>
> **Smaller Is Better:** Min auto-sets to Target (grayed out). User enters Max only (required).
> Raw Score = ((Max - Actual) / (Max - Target)) × 10 → cap at 10, floor at 0 → Weighted Score = Weight × Adjusted Score
>
> See `spec.md` for all validated examples. Add AskMike KPI Coach button (pill-shaped, accent color). Add ability to import from BLT Planner job scorecard.

---

## Prompt 6 — Culture Fit & Performance Assessment (Step 2)

> Build the Assessment module. This implements Step 2 of *The Strength of Talent* — the Talent Assessment Model.
>
> **Culture Fit Scoring:** For each core value, the leader selects: Models (10), Lives (9), Occasional Challenges (7), or Frequent Challenges (1). Average all scores, then apply caps: if any value is Occasional Challenges → total cannot exceed 8.4; if any is Frequent Challenges → total cannot exceed 7.4. Use the lower cap if both apply.
>
> **Productivity Scoring:** Leader enters actual results for each KPI target. System calculates weighted scores automatically.
>
> **Performance Category:** System assigns HP, MP, LP, or LCF based on company scoring parameters. Display with color (green/yellow/red). Important per the book: never encourage leaders to share the specific category label with the team member being assessed — the purpose is to drive actions, not to label people.
>
> Assessments are quarterly. Store full history. See `spec.md` for all validated scoring examples.

---

## Prompt 7 — Talent Assessment Summary (Step 2 Visual)

> Build the Talent Assessment Summary — the core visual of the app, based on the Talent Assessment Model from page 67 of *The Strength of Talent*.
>
> Display a 2-axis grid (X = Productivity 0–10, Y = Culture Fit 0–10) with four quadrants matching the book's layout: HP (upper right), LP (upper left), MP (middle), LCF (bottom band spanning full width — the culture fit line goes all the way across because culture fit failure disqualifies regardless of productivity).
>
> Each assessed team member appears as an avatar circle at their (productivity, culture fit) coordinate showing their initials. Hover shows full name and scores. Click navigates to their detail page.
>
> Features:
> - Filter by team, multiple teams, or all teams
> - **Privacy filter** — hides names/scores before view renders (for QTAM meetings)
> - Show TDI = %HP − (%LP + %LCF) prominently
> - Scores editable inline, model updates in real time
> - Quarter selector for historical views

---

## Prompt 8 — Action Plans & Coaching (Step 3)

> Build the Action Plans module — this implements Step 3 (Act) of *The Strength of Talent*.
>
> Per the book, leaders must take differentiated actions based on performance category: overinvest in high performers, coach medium performers, and make tough, timely decisions on low performers. The app tracks these commitments and holds leaders accountable.
>
> For each team member, a leader can:
> - Add action items with description and target date
> - Mark actions complete
> - Add coaching notes (ongoing updates throughout the quarter)
> - View actions from previous quarters for accountability
>
> Add email reminders for upcoming/overdue actions. The email must contain **only a link** back to the app — never coaching details or names (security requirement).
>
> Add **AskMike People Coach** and **AskMike Difficult Conversations Coach** buttons (pill-shaped, accent color) — these help leaders take the right actions per their team member's performance category.

---

## Prompt 9 — QTAM Workflow (Step 4)

> Build the QTAM (Quarterly Talent Assessment Meeting) workflow — this is the "secret sauce" of the Talent Density System per *The Strength of Talent*.
>
> The QTAM is a structured group process where the leadership team reviews each other's team member assessments and holds each other accountable. Build a workflow view that guides a facilitator through the 11 steps from the book:
> 1. List all team members being assessed
> 2. Record scores for each direct report
> 3. Present scores to the group (format: initials + scores, e.g., "MG 8, 9")
> 4. Peers support or challenge scores
> 5-6. Group discussion and actions for high and medium performers
> 7-8. Individual discussion and actions for each LP and LCF team member (discussed one at a time, never as a group)
> 9. High-potential team member discussion
> 10. Overall team TDI reflection
>
> Privacy rule: the CEO is not assessed in the group QTAM — enforce this in the UI.

---

## Prompt 10 — Dashboard

> Build the Dashboard — first screen users see after login.
>
> Show:
> - Latest team assessment (mini Talent Density Model)
> - Action items for each team member (flagging overdue items)
> - TDI trend line over time (Recharts line chart, matching BLT Planner chart style)
>
> Per *The Strength of Talent*: TDI should be treated with the same rigor as revenue or profit metrics.

---

## Prompt 11 — Reporting & TDI Trends (Step 4)

> Build the Reporting module. Per *The Strength of Talent*, TDI benchmarks should be set and tracked at company level, function/team level, and by individual leader.
>
> Include:
> - TDI over time — overall, by level, by team, by leader (line charts)
> - Historical talent density model snapshots (previous quarters)
> - Team and org-level comparisons
> - TDI goal setting with red/yellow/green status
> - Role/team change tracking — flag how changes correlated with assessment changes
> - Productivity bar change tracking — flag when a category improvement coincides with a lowered target (per spec.md advanced tracking requirements)

---

## Prompt 12 — Help Screens

> Build a Help module with contextual help for each feature. Each help section should explain not just how to use the feature, but WHY it matters — grounding it in the Talent Density framework from *The Strength of Talent*.
>
> Include:
> - Overview of the five-step framework
> - Help for each module (Company Settings, Teams, Productivity Targets, Assessment, Summary, Action Plans, QTAM, Reporting)
> - Separate Company Admin help focused on setup
> - Inline tooltips for scoring logic and formulas

---

## Note on Referencing the Book in Claude Code

When asking Claude Code to make judgment calls on UI or logic, you can say:

> "Per *The Strength of Talent*, [describe the concept]. See spec.md for the full rules."

For example:
> "Per *The Strength of Talent*, the culture fit line on the Talent Assessment Model spans the full width — it doesn't matter how productive someone is if they're not living the core values. Make sure the LCF band in the visual spans the entire bottom of the grid."
