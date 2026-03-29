# Talent Density System — Product Specification

*Source of truth for all features and business logic. Grounded in Mike Goldman's book The Strength of Talent (2025).*

---

## Overview

The Talent Density System (TDS) operationalizes Mike Goldman's five-step Talent Density framework. It enables leaders to set clear expectations, assess team performance quarterly across Culture Fit and Productivity, take differentiated action, and measure progress using the Talent Density Indicator (TDI).

Core premise from the book: **"The #1 driver of profit growth is people growth."**

The two dimensions of performance (from the book):
- **Productivity:** A team member is highly productive when they're achieving measurable results — meeting or beating their target KPIs.
- **Culture Fit:** A team member is a strong culture fit when they make the people around them better — when they're living the company's core values.

---

## The Five Steps and How the App Supports Them

### Step 1: Set Expectations
The app supports setting two types of expectations per team member:
- **Productivity expectations** via the Job Scorecard (KPI targets with weights, targets, and min/max)
- **Culture fit expectations** via company core values (nonnegotiable behaviors, not aspirational phrases)

Per the book, core values must pass three tests: (1) you'd fire someone for repeatedly violating them, (2) you'd take a financial hit to uphold them, (3) they're already alive in the organization today.

### Step 2: Assess Performance
The app provides the Talent Assessment Model — a 0–10 grid with Productivity on the X axis and Culture Fit on the Y axis. Each team member is placed into one of four categories (HP, MP, LP, LCF) based on their scores. Assessments happen quarterly.

### Step 3: Act
The app tracks action plans and coaching notes per team member per quarter. AskMike coaching features help leaders take the right action for each performance category. The book outlines 16 specific actions for high performers and specific guidance for each other category.

### Step 4: Drive Accountability
The app supports the Quarterly Talent Assessment Meeting (QTAM) process and calculates the Talent Density Indicator (TDI). TDI benchmarks are tracked over time at company, team, and leader levels.

### Step 5: Cascade
The multi-level security model supports cascading the process: each leader runs their own QTAM for their team. Senior leaders participate in the senior leadership QTAM and lead their own functional team QTAM.

---

## User Roles & Permissions

### Super Admin (Mike Goldman / Coach)
- Views and administers all companies
- Full access to all data across all tenants
- Can support any company admin

### Company Admin
- Manages their company's setup: users, core values, scoring parameters
- Can view assessments across all teams in their company
- Cannot modify assessments entered by leaders

### Senior Leader
- Member of both the senior leadership team AND their own functional team (e.g., Sales, Marketing)
- Assesses their own direct reports
- Participates in the senior leadership QTAM but is NOT assessed in that meeting (per book: the CEO assesses the leadership team privately with an external coach or accountability partner)
- Leads their own functional team QTAM

### Leader
- Assesses only their own direct reports
- Sees only their team's data
- Cannot see other teams or other leaders' assessments

---

## Module 1: Company Settings

### 1a. User Management
- Add, edit, and deactivate users
- Fields: name, email, security level, team assignment(s)
- Senior leaders are assigned to two teams: senior leadership team + their functional team
- Security levels: Super Admin, Company Admin, Senior Leader, Leader

### 1b. Core Values (Step 1 — Culture Fit Expectations)
Per the book, core values are nonnegotiable behaviors that anchor culture — not aspirational phrases.

- Add and edit company core values
- Each core value has:
  - **Name** (required)
  - **Description** (optional) — what this value means in practice
  - **Behaviors** (optional, multiple) — specific actions that demonstrate this value
- Core values apply uniformly to all team members in the company
- Recommended: 3–7 core values (book guidance: small number, highly meaningful)

### 1c. Scoring Parameters
Company admins customize performance category thresholds. Per the book, use .5 values so no one falls exactly on a line.

**Default parameters (from the book):**

| Category | Default Threshold |
|----------|-----------------|
| High Performing (HP) | Culture fit ≥ 9 AND productivity ≥ 9 (line set at 8.5) |
| Low Culture Fit (LCF) | Culture fit < 7.5, regardless of productivity |
| Low Producing (LP) | Productivity < 6.5, unless already LCF |
| Medium Performing (MP) | Everyone not in HP, LCF, or LP |

---

## Module 2: Teams & Team Members

### Teams
- Leaders create and manage their team
- A team has a name and a designated leader
- Senior leaders belong to two teams simultaneously

### Team Members
- Leaders add team members to the system for evaluation purposes
- Team members do not need to be app users — they are evaluated by their leader
- A team member becomes an app user only if separately set up by a Company Admin
- Team member fields: name, role/title, reporting leader, team assignment
- Track role and team changes over time (for historical reporting)

---

## Module 3: Productivity Targets — Job Scorecard (Step 1)

The book calls this the Functional Accountability Chart / Job Scorecard. Each role has 1–3 KPIs that define what success looks like for that function. Leaders set these targets for each of their direct reports.

### Target Fields
- **Name/Description** — what is being measured and why it matters
- **Type:** Bigger Is Better or Smaller Is Better
- **Unit:** Units, Dollars, or Percentage (%)
- **Weight:** percentage (all weights for one person must sum to 100%)
- **Target value**
- **Min** (Bigger Is Better — user-entered, defaults to 0, must be ≤ Target)
- **Max** (Smaller Is Better — user-entered, required, no default)

*For Bigger Is Better: Max is auto-set to Target (grayed out).*
*For Smaller Is Better: Min is auto-set to Target (grayed out).*

### Bigger Is Better — Scoring Formula
```
Raw Score = ((Actual - Min) / (Target - Min)) × 10
Adjusted Score = max(0, min(10, Raw Score))
Weighted Score = Weight × Adjusted Score
```

**Examples:**
- Target 50,000 / Min 45,000 / Actual 48,000 / Weight 30% → Raw 6.0 → Weighted Score = 1.8
- Target 50,000 / Min 45,000 / Actual 52,000 / Weight 30% → Raw 14 → Adjusted 10 → Weighted Score = 3.0
- Target 50,000 / Min 45,000 / Actual 42,000 / Weight 30% → Raw -6 → Adjusted 0 → Weighted Score = 0

### Smaller Is Better — Scoring Formula
```
Raw Score = ((Max - Actual) / (Max - Target)) × 10
Adjusted Score = max(0, min(10, Raw Score))
Weighted Score = Weight × Adjusted Score
```

**Examples:**
- Target 5% / Max 10% / Actual 6% / Weight 40% → Raw 8 → Weighted Score = 3.2
- Target 5% / Max 10% / Actual 4% / Weight 40% → Raw 12 → Adjusted 10 → Weighted Score = 4.0
- Target 5% / Max 10% / Actual 12% / Weight 40% → Raw -4 → Adjusted 0 → Weighted Score = 0

### Total Productivity Score
Sum of all Weighted Scores = the team member's Productivity Score (0–10).

### Validation
- Weights must sum to exactly 100% before targets can be saved
- Min must be ≤ Target for Bigger Is Better
- Max must be entered (no default) for Smaller Is Better

### Integrations
- Import productivity targets from BLT Planner job scorecard
- AskMike KPI Coach available to help leaders set meaningful targets

---

## Module 4: Performance Assessment (Step 2)

Assessments are quarterly. History is preserved indefinitely.

### 4a. Culture Fit Scoring

The book's Culture Fit Guidelines map to four ratings in the app:

| App Rating | Book Description | Score |
|-----------|-----------------|-------|
| Models | Lives core values at a high level; a model for the rest of the organization | 10 |
| Lives | Lives all core values consistently | 9 |
| Occasional Challenges | Occasionally has challenges with one or two core values | 7 |
| Frequent Challenges | Frequently has challenges; large negative impact on others | 1 |

**Calculating the Culture Fit Score:**
1. Average all core value scores
2. Apply caps:
   - If **any** core value is "Occasional Challenges" → total cannot exceed **8.4**
   - If **any** core value is "Frequent Challenges" → total cannot exceed **7.4**
   - If both apply, use the lower cap (7.4)

**Validated examples (5 core values):**

| Combination | Raw Avg | Cap | Final Score |
|-------------|---------|-----|-------------|
| 5 Models | 10.0 | — | 10.0 |
| 4 Models, 1 Occasional | 9.4 | 8.4 | 8.4 |
| 3 Models, 2 Lives | 9.6 | — | 9.6 |
| 4 Models, 1 Frequent | 8.2 | 7.4 | 7.4 |
| 3 Lives, 2 Occasional | 8.4 | 8.4 | 8.4 |
| 3 Lives, 2 Frequent | 6.4 | 7.4 | 6.4 |
| 5 Occasional | 7.0 | 8.4 | 7.0 |
| 2 Occasional, 3 Frequent | 3.8 | 7.4 | 3.8 |

**Validated examples (3 core values):**

| Combination | Raw Avg | Cap | Final Score |
|-------------|---------|-----|-------------|
| 3 Models | 10.0 | — | 10.0 |
| 2 Models, 1 Occasional | 9.2 | 8.4 | 8.4 |
| 2 Lives, 1 Occasional | 8.5 | 8.4 | 8.4 |
| 1 Lives, 2 Occasional | 8.0 | 8.4 | 8.0 |
| 2 Occasional, 1 Frequent | 5.3 | 7.4 | 5.3 |
| 1 Occasional, 2 Frequent | 3.2 | 7.4 | 3.2 |

### 4b. Productivity Scoring
- For each productivity target, leader enters the actual result
- The system calculates weighted scores automatically using the Module 3 formulas
- Total productivity score = sum of all weighted scores

### 4c. Performance Category Assignment
System assigns category automatically based on company scoring parameters. Display with color:

| Category | Abbreviation | Color |
|----------|-------------|-------|
| High Performing | HP | Green |
| Medium Performing | MP | Yellow |
| Low Producing | LP | Red |
| Low Culture Fit | LCF | Red |

**Important from the book:** The purpose of the assessment is NOT to label team members or share their category with them. It is to determine the right actions to take. Leaders should share feedback and discuss actions — never share the specific category rating with the team member being assessed.

---

## Module 5: Talent Assessment Summary (Step 2 Output)

The core visual of the app — directly from the book (page 67).

### The Model Grid
- 2-axis chart: X = Productivity (0–10), Y = Culture Fit (0–10)
- Four quadrants positioned per the book's diagram:
  - HP: upper right (productivity ≥ 9, culture fit ≥ 9)
  - LP: upper left (culture fit acceptable, productivity low)
  - MP: middle area
  - LCF: bottom band spanning full width (culture fit below threshold, any productivity)
- Each assessed team member appears at their (productivity, culture fit) coordinate as an avatar circle with initials
- **Hover:** tooltip showing full name, culture fit score, productivity score
- **Click:** navigate to that team member's detail/assessment page

### Filtering
- Filter by: one team, multiple teams, or all teams
- **Privacy Filter:** leader can hide names and scores before the view renders — for use in QTAM meetings where participants should not see how the CEO scored them

### TDI Display
`TDI = %HP − (%LP + %LCF)` — shown prominently on the summary page

### Editing
- Scores can be modified directly from this view
- Model updates in real time when scores change

### History
- Assessments stored by quarter/year
- Previous quarter snapshots viewable and comparable

---

## Module 6: Action Plans & Coaching (Step 3)

The book specifies differentiated actions based on performance category. The app tracks these actions and coaching notes.

### Action Plans
- Per team member, per quarter
- Each action has: description, target date, completion status
- Mark actions complete; completed actions retained in history
- View action plans from previous quarters for accountability
- Per the book: low performers (LP and LCF) must be discussed individually in the QTAM, not as a group

### Coaching Notes
- Throughout the quarter, leaders add updates/notes on coaching given and results observed
- Notes are timestamped and retained permanently
- Supports accountability: "Didn't you say last quarter you were going to do X?" (book, Step 4)

### Email Reminders
- System sends reminders for upcoming and overdue actions
- Email contains **only a link back to the app** — the user must log in to see details
- **NEVER include specific coaching content, scores, or team member names in email**

### AskMike Integrations (Step 3 tools)
- **AskMike People Coach** — recommends development actions for a team member based on their category
- **AskMike Difficult Conversations Coach** — helps leaders prepare for conversations with LP/LCF team members
- Both use the pill-shaped accent button style

---

## Module 7: QTAM Support (Step 4)

The Quarterly Talent Assessment Meeting is the "secret sauce" of the system per the book. The app supports the QTAM process.

### QTAM Process (11 steps from the book)
1. List all team members being assessed
2. Record productivity and culture fit scores for each direct report
3. Share scores with the leadership team (initials + scores format: "MG 8, 9")
4. Leaders present their assessments one at a time
5. Peers support or challenge each other's scores
6. Discuss and document actions for high performers (can be done as a group)
7. Discuss and document actions for medium performers (can be done as a group)
8. Discuss and document actions for each low-producing team member (individually)
9. Discuss and document actions for each low culture fit team member (individually)
10. Discuss high-potential team members
11. Reflect on overall team strength of talent vs. last quarter

### QTAM Privacy Rules (from the book)
- The CEO does not assess their leadership team in the group QTAM — this happens privately with an external coach
- The app must enforce this: senior leaders' direct reports are not assessed in the group view they attend

---

## Module 8: Dashboard

Shown immediately after login.

- Latest team assessment summary (mini Talent Density Model)
- Action items for each team member (flagging overdue items)
- TDI trend line over time (line chart using Recharts)

---

## Module 9: Reporting & TDI Trends (Step 4)

Per the book: "We need to measure people growth with the same rigor as revenue or profit growth."

### TDI Over Time
- Line chart showing TDI history
- Filter by: overall, by organizational level, by team, by leader

### Historical Snapshots
- View previous quarters' Talent Assessment Summary models
- Compare talent distribution across quarters

### Organizational Views
- Talent density by team
- Talent density by organizational level
- Identify high-talent and low-talent teams

### Goals & Status
- Set a TDI target
- Color-code actual TDI vs. goal: green (at/above), yellow (close), red (below)

### Advanced Tracking
- Track when team members change roles, teams, or reporting lines — flag correlation with assessment changes
- Track productivity bar changes over time: a move from LP → MP is only meaningful if the bar stayed the same or went up
- Flag if a category improvement coincides with a lowered productivity target

---

## Module 10: Super Admin (Coach View)

- Mike Goldman views and administers all companies
- See TDI trends across all client companies
- Support any company admin

---

## Module 11: Help

- Help screen for each module explaining the corresponding step from the book
- Separate Company Admin help focused on setup (core values, scoring parameters)
- Inline tooltips explaining scoring logic and formulas
- Context for why each step matters (rooted in the book's framework)

---

## Non-Functional Requirements

### Performance
- Assessment calculations happen client-side in real time
- Firestore queries scoped to company + user level for security and speed

### Security
- Firebase Auth for all authentication
- Firestore security rules enforce data isolation between companies and users
- No cross-tenant data access under any circumstances

### Privacy
- Assessment details never appear in email notifications
- Privacy filter on Talent Assessment Summary for QTAM use
- Leaders cannot see peer leaders' assessments
- Per the book: never encourage sharing performance category labels with the team member being assessed

### Data Integrity
- Productivity weights must sum to 100% — enforced on save
- Assessment history is immutable once saved (edits create new versions)
- Productivity target history retained so bar changes are trackable over time
- Role and team change history tracked for reporting

### Accessibility
- All interactive elements keyboard accessible
- Color-coded status always accompanied by text label (not color alone)
