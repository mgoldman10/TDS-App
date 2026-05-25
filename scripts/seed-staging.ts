#!/usr/bin/env tsx
/**
 * TDS Staging Seed Script — Phase 6b
 * =====================================================================
 *
 * Seeds ONE tenant ("Aurora Manufacturing") into the TDS staging Firebase
 * project. Idempotent: re-running with --apply produces no duplicates.
 *
 * SAFETY
 * ------
 * This script REFUSES to run against TDS production (tds-app-b8493). The
 * check is bidirectional: it requires the loaded service-account project_id
 * to MATCH the expected staging value AND NOT MATCH production. If either
 * condition fails, the script aborts before opening any DB handle.
 *
 * PROJECT IDS (confirmed against .firebaserc and the Firebase console)
 *   Production (REFUSED): tds-app-b8493
 *   Staging (target):     tds-app-staging
 *

 * USAGE
 * -----
 *   npm run seed:staging          — dry run, no writes (default)
 *   npm run seed:staging:apply    — apply seed, idempotent
 *   npm run seed:staging:fresh    — wipe /companies/{cid} then re-seed
 *
 * REQUIRED ENV (in .env.local)
 * ----------------------------
 *   FIREBASE_ADMIN_SERVICE_ACCOUNT_STAGING=
 *     {"project_id":"...","client_email":"...","private_key":"...","..."}
 *
 *   The value must be the FULL service-account JSON (single line, escaped
 *   newlines) for the STAGING Firebase project. Use a separate env var
 *   from FIREBASE_ADMIN_SERVICE_ACCOUNT (production) to keep them physically
 *   distinct in the dotenv file.
 *
 * WHAT GETS SEEDED
 * ----------------
 *   • 1 company:      Aurora Manufacturing
 *   • 6 users:        CEO, CFO, COO, VP Sales, VP Ops, Analyst
 *   • 2 teams:        Senior Leadership Team + Operations Team
 *   • 5 team members: everyone except the CEO (CEO assesses, isn't assessed)
 *   • 5 core values
 *   • 15 productivity targets (3 per assessed member, weights sum to 100)
 *   • 11 assessments across FY2026 Q1/Q2/Q3:
 *       — 3 members with full 3-quarter history (UP, STABLE, DOWN trajectories)
 *       — 2 members with Q1 only (newer hires / partial history)
 *       Q1 snapshot still spans all 4 categories: 2× HP, 1× MP, 1× LP, 1× LCF
 *   • 5 action plans (one per assessed member)
 *   • 2 AskMike coaches (global; matches ensureDefaultCoaches())
 *
 * WIPE SCOPE
 * ----------
 *   --wipe-and-reseed recursively deletes /companies/{cid}. It does NOT
 *   touch Firebase Auth accounts or /userMappings docs. createUser() reuses
 *   existing Auth accounts via getUserByEmail() and idempotently updates
 *   userMappings, so leftover Auth/userMappings state from prior seeds is
 *   absorbed cleanly on re-seed.
 *
 * =====================================================================
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as admin from "firebase-admin";

// ────────────────────────────────────────────────────────────────────────────
// SAFETY CONSTANTS
// ────────────────────────────────────────────────────────────────────────────

const PRODUCTION_PROJECT_ID = "tds-app-b8493";
const EXPECTED_STAGING_PROJECT_ID = "tds-app-staging";
const COMMON_PASSWORD = "StagingTest2026!";

// ────────────────────────────────────────────────────────────────────────────
// FLAGS
// ────────────────────────────────────────────────────────────────────────────

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes("--apply");
const WIPE = ARGS.includes("--wipe-and-reseed");

if (WIPE && !APPLY) {
  console.error(
    "❌ ERROR: --wipe-and-reseed requires --apply. Refusing to run."
  );
  process.exit(1);
}

const MODE = APPLY ? (WIPE ? "APPLY + WIPE" : "APPLY") : "DRY RUN";

// ────────────────────────────────────────────────────────────────────────────
// TENANT DATA (the one tenant Phase 6b seeds)
// ────────────────────────────────────────────────────────────────────────────

const COMPANY_ID = "seed-aurora-manufacturing";
const COMPANY_NAME = "Aurora Manufacturing";

const SLT_TEAM_ID = "seed-team-slt";
const OPS_TEAM_ID = "seed-team-operations";

const FISCAL_YEAR = 2026;
// Per-assessment quarters are stored on each SeedAssessment entry below —
// different members get different numbers of historical quarters.

type AppRole = "superadmin" | "company_admin" | "senior_leader" | "leader";

interface SeedUser {
  slug: string;           // used in deterministic doc IDs
  displayName: string;
  email: string;
  role: Exclude<AppRole, "superadmin">; // no superadmin in this seed
  title: string;          // job title (also used as TeamMember.role)
  teamSlugs: string[];    // teams this user belongs to
  isAssessed: boolean;    // create a teamMember doc + assessment for this user?
  assessedInTeam?: "slt" | "ops"; // which team's member roll they appear on
  reportsToSlug?: string; // slug of the user they report to (for teamMember.reportsToUserId)
}

const USERS: SeedUser[] = [
  {
    slug: "ceo",
    displayName: "Sarah Chen",
    email: "sarah.chen@aurora-staging.test",
    role: "company_admin",
    title: "CEO",
    teamSlugs: ["slt"],
    isAssessed: false, // CEO isn't assessed in the group QTAM per the book
  },
  {
    slug: "cfo",
    displayName: "Marcus Webb",
    email: "marcus.webb@aurora-staging.test",
    role: "senior_leader",
    title: "CFO",
    teamSlugs: ["slt"],
    isAssessed: true,
    assessedInTeam: "slt",
    reportsToSlug: "ceo",
  },
  {
    slug: "coo",
    displayName: "Priya Patel",
    email: "priya.patel@aurora-staging.test",
    role: "senior_leader",
    title: "COO",
    teamSlugs: ["slt", "ops"], // senior leader is on SLT + own functional team
    isAssessed: true,
    assessedInTeam: "slt",
    reportsToSlug: "ceo",
  },
  {
    slug: "vp-sales",
    displayName: "David Rodriguez",
    email: "david.rodriguez@aurora-staging.test",
    role: "senior_leader",
    title: "VP Sales",
    teamSlugs: ["slt"],
    isAssessed: true,
    assessedInTeam: "slt",
    reportsToSlug: "ceo",
  },
  {
    slug: "vp-ops",
    displayName: "Hannah Kim",
    email: "hannah.kim@aurora-staging.test",
    role: "leader",
    title: "VP Operations",
    teamSlugs: ["ops"],
    isAssessed: true,
    assessedInTeam: "ops",
    reportsToSlug: "coo",
  },
  {
    slug: "analyst",
    displayName: "Alex Morgan",
    email: "alex.morgan@aurora-staging.test",
    role: "leader",
    title: "Operations Analyst",
    teamSlugs: ["ops"],
    isAssessed: true,
    assessedInTeam: "ops",
    reportsToSlug: "coo",
  },
];

interface SeedCoreValue {
  slug: string;
  name: string;
  description: string;
  behaviors: string[];
  order: number;
}

const CORE_VALUES: SeedCoreValue[] = [
  {
    slug: "customer-obsession",
    name: "Customer Obsession",
    description: "Start with the customer and work backwards.",
    behaviors: ["Talks to customers weekly", "Cites customer impact in decisions"],
    order: 1,
  },
  {
    slug: "take-ownership",
    name: "Take Ownership",
    description: "Own outcomes, not tasks.",
    behaviors: ["Says 'I' before 'we'", "Closes the loop without prompting"],
    order: 2,
  },
  {
    slug: "move-with-urgency",
    name: "Move with Urgency",
    description: "Bias to action; speed matters.",
    behaviors: ["Ships in days, not weeks", "Decides with imperfect information"],
    order: 3,
  },
  {
    slug: "build-together",
    name: "Build Together",
    description: "We win as a team; ego at the door.",
    behaviors: ["Shares credit", "Asks for and acts on feedback"],
    order: 4,
  },
  {
    slug: "question-everything",
    name: "Question Everything",
    description: "Politely challenge assumptions, including your own.",
    behaviors: ["Asks 'why' before agreeing", "Welcomes being proven wrong"],
    order: 5,
  },
];

// Per-member productivity targets. Weights MUST sum to 100 per member.
type TargetType = "bigger" | "smaller";
type UnitType = "units" | "dollars" | "percentage";

interface SeedTarget {
  slug: string;
  name: string;
  type: TargetType;
  unit: UnitType;
  weight: number;
  target: number;
  min: number;
  max: number;
}

const TARGETS_BY_USER: Record<string, SeedTarget[]> = {
  cfo: [
    { slug: "ebitda",         name: "EBITDA",                  type: "bigger",  unit: "dollars",    weight: 40, target: 8000000, min: 6000000, max: 8000000 },
    { slug: "forecast-acc",   name: "Forecast Accuracy",       type: "bigger",  unit: "percentage", weight: 35, target: 95,      min: 85,      max: 95 },
    { slug: "close-cycle",    name: "Monthly Close Cycle Days", type: "smaller", unit: "units",      weight: 25, target: 5,       min: 5,       max: 10 },
  ],
  coo: [
    { slug: "otd",            name: "On-Time Delivery",        type: "bigger",  unit: "percentage", weight: 40, target: 98,      min: 90,      max: 98 },
    { slug: "defect-rate",    name: "Defect Rate (ppm)",        type: "smaller", unit: "units",      weight: 35, target: 500,     min: 500,     max: 2000 },
    { slug: "throughput",     name: "Units per Day",           type: "bigger",  unit: "units",      weight: 25, target: 1200,    min: 900,     max: 1200 },
  ],
  "vp-sales": [
    { slug: "bookings",       name: "Quarterly Bookings",      type: "bigger",  unit: "dollars",    weight: 50, target: 3000000, min: 2000000, max: 3000000 },
    { slug: "win-rate",       name: "Win Rate",                type: "bigger",  unit: "percentage", weight: 30, target: 35,      min: 20,      max: 35 },
    { slug: "sales-cycle",    name: "Avg Sales Cycle Days",    type: "smaller", unit: "units",      weight: 20, target: 45,      min: 45,      max: 90 },
  ],
  "vp-ops": [
    { slug: "shift-output",   name: "Shift Output Units",      type: "bigger",  unit: "units",      weight: 40, target: 400,     min: 300,     max: 400 },
    { slug: "scrap",          name: "Scrap %",                 type: "smaller", unit: "percentage", weight: 30, target: 2,       min: 2,       max: 6 },
    { slug: "safety",         name: "Recordable Incidents",    type: "smaller", unit: "units",      weight: 30, target: 0,       min: 0,       max: 3 },
  ],
  analyst: [
    { slug: "report-on-time", name: "Reports Delivered On Time", type: "bigger",  unit: "percentage", weight: 50, target: 100,     min: 90,      max: 100 },
    { slug: "rework",         name: "Reports Requiring Rework",  type: "smaller", unit: "units",      weight: 30, target: 0,       min: 0,       max: 5 },
    { slug: "throughput",     name: "Reports per Quarter",       type: "bigger",  unit: "units",      weight: 20, target: 24,      min: 16,      max: 24 },
  ],
};

// Assessment shape per assessed user. Hand-picked so the talent model renders
// a mix of categories (2× HP, 1× MP, 1× LP, 1× LCF) under the default scoring
// parameters.
type CFRating = "models" | "lives" | "occasional" | "frequent";
type Category = "HP" | "MP" | "LP" | "LCF";

interface SeedAssessment {
  fiscalYear: number;
  fiscalQuarter: number;
  cultureFitRatings: Record<string, CFRating>; // keyed by core value slug
  productivityActuals: Record<string, number>; // keyed by target slug
  cultureFitScore: number;       // pre-computed; spec confirms denormalized storage
  productivityScore: number;     // pre-computed
  performanceCategory: Category;
}

// Per-user assessment history, in chronological order (earliest quarter first).
// Three members get a full 3-quarter trajectory; two stay Q1-only to represent
// newer hires / partial history. Each entry's fiscalYear+fiscalQuarter is also
// included in its deterministic doc ID, so quarters are distinct docs and the
// check-before-write stays idempotent across re-runs.
//
//   cfo      — Marcus Webb       — DOWN: HP → MP → LP   (numbers slip, then crash)
//   coo      — Priya Patel       — STABLE: HP → HP → HP (consistent star)
//   vp-sales — David Rodriguez   — Q1 only, MP          (partial history)
//   vp-ops   — Hannah Kim        — UP:   LP → MP → HP   (coaching worked)
//   analyst  — Alex Morgan       — Q1 only, LCF         (newer hire)
const ASSESSMENTS_BY_USER: Record<string, SeedAssessment[]> = {
  // ─── Marcus (CFO) — DOWN ────────────────────────────────────────────
  cfo: [
    // Q1: HP — original strong baseline
    {
      fiscalYear: 2026, fiscalQuarter: 1,
      cultureFitRatings: {
        "customer-obsession": "lives",
        "take-ownership":     "models",
        "move-with-urgency":  "lives",
        "build-together":     "lives",
        "question-everything": "lives",
      },
      productivityActuals: { ebitda: 8100000, "forecast-acc": 96, "close-cycle": 4 },
      cultureFitScore: 9.2,
      productivityScore: 10,
      performanceCategory: "HP",
    },
    // Q2: MP — numbers slip, culture still solid
    {
      fiscalYear: 2026, fiscalQuarter: 2,
      cultureFitRatings: {
        "customer-obsession": "lives",
        "take-ownership":     "lives",
        "move-with-urgency":  "lives",
        "build-together":     "lives",
        "question-everything": "lives",
      },
      productivityActuals: { ebitda: 7500000, "forecast-acc": 92, "close-cycle": 6 },
      cultureFitScore: 9.0,
      productivityScore: 7.5,
      performanceCategory: "MP",
    },
    // Q3: LP — numbers crash, first culture wobble (occasional cap kicks in)
    {
      fiscalYear: 2026, fiscalQuarter: 3,
      cultureFitRatings: {
        "customer-obsession": "lives",
        "take-ownership":     "lives",
        "move-with-urgency":  "lives",
        "build-together":     "lives",
        "question-everything": "occasional",
      },
      productivityActuals: { ebitda: 6500000, "forecast-acc": 86, "close-cycle": 9 },
      cultureFitScore: 8.4, // occasional cap
      productivityScore: 5.0,
      performanceCategory: "LP",
    },
  ],

  // ─── Priya (COO) — STABLE ───────────────────────────────────────────
  coo: [
    // Q1: HP
    {
      fiscalYear: 2026, fiscalQuarter: 1,
      cultureFitRatings: {
        "customer-obsession": "models",
        "take-ownership":     "models",
        "move-with-urgency":  "lives",
        "build-together":     "lives",
        "question-everything": "lives",
      },
      productivityActuals: { otd: 98, "defect-rate": 480, throughput: 1210 },
      cultureFitScore: 9.4,
      productivityScore: 10,
      performanceCategory: "HP",
    },
    // Q2: HP — small operational variance, still elite
    {
      fiscalYear: 2026, fiscalQuarter: 2,
      cultureFitRatings: {
        "customer-obsession": "models",
        "take-ownership":     "models",
        "move-with-urgency":  "lives",
        "build-together":     "lives",
        "question-everything": "lives",
      },
      productivityActuals: { otd: 97, "defect-rate": 510, throughput: 1190 },
      cultureFitScore: 9.4,
      productivityScore: 9.5,
      performanceCategory: "HP",
    },
    // Q3: HP — slight uptick on both dimensions
    {
      fiscalYear: 2026, fiscalQuarter: 3,
      cultureFitRatings: {
        "customer-obsession": "models",
        "take-ownership":     "models",
        "move-with-urgency":  "models",
        "build-together":     "lives",
        "question-everything": "lives",
      },
      productivityActuals: { otd: 99, "defect-rate": 470, throughput: 1220 },
      cultureFitScore: 9.6,
      productivityScore: 10,
      performanceCategory: "HP",
    },
  ],

  // ─── David (VP Sales) — Q1 only ─────────────────────────────────────
  "vp-sales": [
    {
      fiscalYear: 2026, fiscalQuarter: 1,
      cultureFitRatings: {
        "customer-obsession": "lives",
        "take-ownership":     "lives",
        "move-with-urgency":  "lives",
        "build-together":     "lives",
        "question-everything": "occasional",
      },
      productivityActuals: { bookings: 2500000, "win-rate": 28, "sales-cycle": 60 },
      cultureFitScore: 8.4, // occasional cap
      productivityScore: 7.4,
      performanceCategory: "MP",
    },
  ],

  // ─── Hannah (VP Ops) — UP ───────────────────────────────────────────
  "vp-ops": [
    // Q1: LP — output low, scrap and safety problems
    {
      fiscalYear: 2026, fiscalQuarter: 1,
      cultureFitRatings: {
        "customer-obsession": "lives",
        "take-ownership":     "lives",
        "move-with-urgency":  "lives",
        "build-together":     "lives",
        "question-everything": "lives",
      },
      productivityActuals: { "shift-output": 310, scrap: 5, safety: 2 },
      cultureFitScore: 9,
      productivityScore: 5.0,
      performanceCategory: "LP",
    },
    // Q2: MP — visible recovery on all three KPIs
    {
      fiscalYear: 2026, fiscalQuarter: 2,
      cultureFitRatings: {
        "customer-obsession": "lives",
        "take-ownership":     "lives",
        "move-with-urgency":  "lives",
        "build-together":     "lives",
        "question-everything": "lives",
      },
      productivityActuals: { "shift-output": 360, scrap: 3.5, safety: 1 },
      cultureFitScore: 9,
      productivityScore: 7.5,
      performanceCategory: "MP",
    },
    // Q3: HP — hits targets, ownership behavior shows up too
    {
      fiscalYear: 2026, fiscalQuarter: 3,
      cultureFitRatings: {
        "customer-obsession": "lives",
        "take-ownership":     "models",
        "move-with-urgency":  "lives",
        "build-together":     "lives",
        "question-everything": "lives",
      },
      productivityActuals: { "shift-output": 405, scrap: 2, safety: 0 },
      cultureFitScore: 9.2,
      productivityScore: 9.8,
      performanceCategory: "HP",
    },
  ],

  // ─── Alex (Analyst) — Q1 only ───────────────────────────────────────
  analyst: [
    {
      fiscalYear: 2026, fiscalQuarter: 1,
      cultureFitRatings: {
        "customer-obsession": "lives",
        "take-ownership":     "occasional",
        "move-with-urgency":  "occasional",
        "build-together":     "frequent",
        "question-everything": "frequent",
      },
      productivityActuals: { "report-on-time": 95, rework: 1, throughput: 22 },
      cultureFitScore: 5.4, // raw avg below frequent cap of 7.4, so cap is moot
      productivityScore: 8.8,
      performanceCategory: "LCF",
    },
  ],
};

// Coach defaults — verbatim from src/lib/coach-service.ts ensureDefaultCoaches().
// Kept inline so this script can run against a clean staging DB without
// needing client-SDK code paths.
const DEFAULT_COACHES = [
  {
    name: "People Coach",
    description:
      "Get coaching advice on managing team members based on their performance category.",
    systemPrompt: `You are Mike Goldman's People Coach AI assistant, embedded in the Talent Density System. You help leaders take differentiated actions based on each team member's performance category.

Your coaching philosophy (from "The Strength of Talent"):
- HIGH PERFORMING (HP): Overinvest. These are your most valuable people. Retain them, give them stretch assignments, increase their visibility, and ensure they feel valued. Never take them for granted.
- MEDIUM PERFORMING (MP): Coach and develop. Help them build skills to reach HP. Set clear expectations, provide regular feedback, create development plans, and give them opportunities to grow.
- LOW PRODUCING (LP): Address quickly. Determine if it's a skill gap (coachable) or will gap (not coachable). Set clear 30/60/90 day improvement plans. If no improvement, make the tough decision.
- LOW CULTURE FIT (LCF): Act decisively. Culture fit issues rarely self-correct. These individuals can be toxic to your team regardless of their productivity. Have the difficult conversation and make a change.

When coaching a leader:
- Always reference the specific team member's scores and category
- Give concrete, actionable advice — not generic platitudes
- Suggest specific conversations to have, questions to ask, and actions to take
- Be direct and honest, even when the advice is uncomfortable
- Help leaders see that NOT acting is itself a decision with consequences`,
    chatIntro:
      "I'm your People Coach. I can see this team member's assessment data. What would you like help with — developing them, having a tough conversation, or creating an action plan?",
    referenceDocIds: [] as string[],
    isActive: true,
    order: 1,
  },
  {
    name: "Difficult Conversations Coach",
    description:
      "Get help preparing for and conducting difficult workplace conversations.",
    systemPrompt: `You are Mike Goldman's Difficult Conversations Coach AI assistant, embedded in the Talent Density System. You help leaders prepare for and navigate tough workplace conversations.

Your approach:
- Help leaders prepare mentally and structurally for the conversation
- Suggest specific language and framing they can use
- Coach on how to be direct yet compassionate
- Help anticipate likely reactions and how to handle them
- Emphasize that avoiding difficult conversations hurts everyone — the team member, the team, and the leader

Common difficult conversation scenarios:
- Performance improvement discussions (LP/LCF team members)
- Letting someone go
- Addressing attitude or culture fit issues
- Giving tough feedback to someone who thinks they're doing well
- Discussing a demotion or role change
- Addressing interpersonal conflicts on the team

When coaching:
- Ask clarifying questions about the situation before giving advice
- Provide a suggested conversation outline they can follow
- Include specific phrases and sentences they can use or adapt
- Help them practice handling defensive or emotional reactions
- Remind them that the goal is clarity and respect, not winning an argument`,
    chatIntro:
      "I'm your Difficult Conversations Coach. I can see this team member's profile and scores. Tell me about the conversation you're preparing for, and I'll help you navigate it effectively.",
    referenceDocIds: [] as string[],
    isActive: true,
    order: 2,
  },
];

// ────────────────────────────────────────────────────────────────────────────
// COUNTERS (for the end-of-run summary)
// ────────────────────────────────────────────────────────────────────────────

const counters = {
  created: 0,
  skipped: 0,
  wouldCreate: 0,
};

// ────────────────────────────────────────────────────────────────────────────
// LOGGING HELPERS
// ────────────────────────────────────────────────────────────────────────────

function banner(text: string) {
  const bar = "━".repeat(72);
  console.log(`\n${bar}\n${text}\n${bar}`);
}

function section(text: string) {
  console.log(`\n─── ${text} ───`);
}

function logCreate(what: string, id: string) {
  counters.created++;
  console.log(`  ✓ CREATED      ${what} [${id}]`);
}

function logSkip(what: string, id: string) {
  counters.skipped++;
  console.log(`  • SKIPPED      ${what} [${id}] (already exists)`);
}

function logWouldCreate(what: string, id: string) {
  counters.wouldCreate++;
  console.log(`  ~ WOULD CREATE ${what} [${id}]`);
}

function logInfo(text: string) {
  console.log(`  · ${text}`);
}

// ────────────────────────────────────────────────────────────────────────────
// .env.local loader (tiny inline parser — avoids adding a dependency)
// ────────────────────────────────────────────────────────────────────────────

function loadDotEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, "utf8");
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // Strip surrounding quotes if present
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SERVICE ACCOUNT LOADER + SAFETY CHECK
// ────────────────────────────────────────────────────────────────────────────

interface ServiceAccountShape {
  project_id: string;
  client_email: string;
  private_key: string;
}

function loadStagingServiceAccount(): ServiceAccountShape {
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_STAGING;
  if (!raw) {
    console.error(
      "❌ ERROR: env var FIREBASE_ADMIN_SERVICE_ACCOUNT_STAGING is not set.\n" +
        "   Expected: a single-line JSON string containing the staging\n" +
        "   service-account credentials. Add it to .env.local."
    );
    process.exit(1);
  }
  let parsed: ServiceAccountShape;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Intentionally do NOT echo the raw value — it contains a private key.
    console.error(
      "❌ ERROR: FIREBASE_ADMIN_SERVICE_ACCOUNT_STAGING is not valid JSON.\n" +
        "   (The raw value is not printed — it contains secret material.)"
    );
    process.exit(1);
  }
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    console.error(
      "❌ ERROR: service-account JSON missing one or more required fields\n" +
        "   (project_id, client_email, private_key)."
    );
    process.exit(1);
  }
  return parsed;
}

function runSafetyChecks(sa: ServiceAccountShape): void {
  banner(`TDS STAGING SEED — MODE: ${MODE}`);
  console.log(`  Loaded service account for project_id: ${sa.project_id}`);
  console.log(`  client_email:                          ${sa.client_email}`);
  console.log(`  Expected staging project_id:           ${EXPECTED_STAGING_PROJECT_ID}`);
  console.log(`  Production project_id (forbidden):     ${PRODUCTION_PROJECT_ID}`);

  if (sa.project_id === PRODUCTION_PROJECT_ID) {
    console.error("\n❌ ABORT: service account points at TDS PRODUCTION.");
    console.error("   This script must never write to production. Refusing to proceed.");
    process.exit(2);
  }

  if (sa.project_id !== EXPECTED_STAGING_PROJECT_ID) {
    console.error(
      `\n❌ ABORT: service-account project_id (${sa.project_id}) does not match\n` +
        `   the expected staging project (${EXPECTED_STAGING_PROJECT_ID}).\n` +
        `   Refusing to proceed — verify which project is actually staging\n` +
        `   and update EXPECTED_STAGING_PROJECT_ID accordingly.`
    );
    process.exit(2);
  }

  console.log("\n  ✓ Safety checks passed. Target is confirmed staging.");
  if (!APPLY) {
    console.log("  ✓ DRY RUN — no writes will be performed.");
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ADMIN SDK HANDLES (assigned after safety checks pass)
// ────────────────────────────────────────────────────────────────────────────

let db: admin.firestore.Firestore;
let auth: admin.auth.Auth;

function initAdmin(sa: ServiceAccountShape): void {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key,
    }),
    projectId: sa.project_id,
  });
  db = admin.firestore();
  auth = admin.auth();
}

// ────────────────────────────────────────────────────────────────────────────
// WIPE
// ────────────────────────────────────────────────────────────────────────────

async function wipeCompany(companyId: string): Promise<void> {
  section(`WIPE /companies/${companyId} (recursive)`);
  const ref = db.doc(`companies/${companyId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    logInfo("Company doc does not exist — nothing to wipe.");
    return;
  }
  logInfo("Running recursiveDelete()… this removes all subcollections too.");
  await db.recursiveDelete(ref);
  logInfo("Wipe complete. (Auth accounts and userMappings NOT touched.)");
}

// ────────────────────────────────────────────────────────────────────────────
// CREATE — COMPANY
// ────────────────────────────────────────────────────────────────────────────

async function createCompany(): Promise<string> {
  const ref = db.doc(`companies/${COMPANY_ID}`);
  const snap = await ref.get();
  if (snap.exists) {
    logSkip(`Company "${COMPANY_NAME}"`, COMPANY_ID);
    return COMPANY_ID;
  }

  const payload = {
    name: COMPANY_NAME,
    fiscalYearStartMonth: 1,
    scoringParameters: {
      hpCultureFitMin: 9,
      hpProductivityMin: 9,
      lcfCultureFitMax: 7.5,
      lpProductivityMax: 6.5,
      cultureFitRatingScores: { models: 10, lives: 9, occasional: 7, frequent: 1 },
      cultureFitCaps: { occasionalCap: 8.4, frequentCap: 7.4 },
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (!APPLY) {
    logWouldCreate(`Company "${COMPANY_NAME}"`, COMPANY_ID);
    return COMPANY_ID;
  }

  await ref.set(payload);
  logCreate(`Company "${COMPANY_NAME}"`, COMPANY_ID);
  return COMPANY_ID;
}

// ────────────────────────────────────────────────────────────────────────────
// CREATE — USER (3-way fan-out: Auth + userMappings + per-company users
//                  OR + superadmin for the superadmin role)
// ────────────────────────────────────────────────────────────────────────────

async function ensureAuthAccount(
  email: string,
  displayName: string
): Promise<{ uid: string; createdFresh: boolean }> {
  if (!APPLY) {
    // Dry-run: don't touch Auth, return a stable fake uid so downstream
    // Firestore IDs are computable.
    const fakeUid = `dryrun-uid-${email.split("@")[0]}`;
    return { uid: fakeUid, createdFresh: false };
  }
  try {
    const existing = await auth.getUserByEmail(email);
    return { uid: existing.uid, createdFresh: false };
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as { code: string }).code
        : "";
    if (code !== "auth/user-not-found") throw err;
    const created = await auth.createUser({
      email,
      password: COMMON_PASSWORD,
      displayName,
    });
    return { uid: created.uid, createdFresh: true };
  }
}

async function createUser(args: {
  uid: string;
  email: string;
  displayName: string;
  role: AppRole;
  companyId: string | null;       // null for superadmin
  teamIds: string[];
  createdAuthFresh: boolean;      // diagnostic only — logged, doesn't affect writes
}): Promise<void> {
  const { uid, email, displayName, role, companyId, teamIds, createdAuthFresh } = args;
  const now = admin.firestore.FieldValue.serverTimestamp();

  // -------------------------------------------------------------- mapping
  const mappingRef = db.doc(`userMappings/${uid}`);
  const mappingSnap = await mappingRef.get();

  if (mappingSnap.exists) {
    // Idempotently ensure this company's membership is present (or that
    // isSuperadmin is set for superadmins). Update only when needed.
    const existing = mappingSnap.data() ?? {};
    const memberships: { companyId: string; role: AppRole; addedAt: unknown }[] =
      Array.isArray(existing.memberships) ? existing.memberships : [];

    let needsUpdate = false;
    const updates: Record<string, unknown> = {};

    if (role === "superadmin") {
      if (!existing.isSuperadmin || existing.role !== "superadmin") {
        updates.isSuperadmin = true;
        updates.role = "superadmin";
        needsUpdate = true;
      }
    } else if (companyId) {
      const hasMembership = memberships.some(
        (m) => m.companyId === companyId && m.role === role
      );
      if (!hasMembership) {
        const filtered = memberships.filter((m) => m.companyId !== companyId);
        updates.memberships = [...filtered, { companyId, role, addedAt: new Date() }];
        if (!existing.companyId) {
          updates.companyId = companyId;
          updates.role = role;
        }
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      if (APPLY) await mappingRef.update(updates);
      logCreate(`userMappings/${uid} (updated)`, uid);
    } else {
      logSkip(`userMappings/${uid}`, uid);
    }
  } else {
    const payload =
      role === "superadmin"
        ? { companyId: null, role, memberships: [], isSuperadmin: true }
        : {
            companyId,
            role,
            memberships: companyId
              ? [{ companyId, role, addedAt: new Date() }]
              : [],
          };
    if (APPLY) {
      await mappingRef.set(payload);
      logCreate(`userMappings/${uid}`, uid);
    } else {
      logWouldCreate(`userMappings/${uid}`, uid);
    }
  }

  // -------------------------------------------------------------- profile
  if (role === "superadmin") {
    const saRef = db.doc(`superadmin/${uid}`);
    const saSnap = await saRef.get();
    if (saSnap.exists) {
      logSkip(`superadmin/${uid}`, uid);
    } else {
      const payload = { uid, email, displayName, role, createdAt: now };
      if (APPLY) {
        await saRef.set(payload);
        logCreate(`superadmin/${uid}`, uid);
      } else {
        logWouldCreate(`superadmin/${uid}`, uid);
      }
    }
  } else if (companyId) {
    const userRef = db.doc(`companies/${companyId}/users/${uid}`);
    const userSnap = await userRef.get();
    if (userSnap.exists) {
      logSkip(`companies/${companyId}/users/${uid}`, uid);
    } else {
      // Per recon: do NOT write `companyId` on this doc — it's reconstructed
      // from the parent path on read.
      const payload = {
        uid,
        email,
        displayName,
        role,
        isActive: true,
        teamIds,
        createdAt: now,
      };
      if (APPLY) {
        await userRef.set(payload);
        logCreate(`companies/${companyId}/users/${uid}`, uid);
      } else {
        logWouldCreate(`companies/${companyId}/users/${uid}`, uid);
      }
    }
  }

  if (createdAuthFresh) {
    logInfo(`Auth account created fresh for ${email} (password: COMMON_PASSWORD)`);
  } else if (APPLY) {
    logInfo(`Auth account reused for ${email}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// CREATE — TEAM
// ────────────────────────────────────────────────────────────────────────────

async function createTeam(args: {
  companyId: string;
  teamId: string;
  name: string;
  parentTeamId: string | null;
  level: number;
  leaderId: string;
  leaderName: string;
  leaderTitle: string;
}): Promise<string> {
  const { companyId, teamId, ...rest } = args;
  const ref = db.doc(`companies/${companyId}/teams/${teamId}`);
  const snap = await ref.get();
  if (snap.exists) {
    logSkip(`Team "${rest.name}"`, teamId);
    return teamId;
  }
  const payload = {
    ...rest,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (APPLY) {
    await ref.set(payload);
    logCreate(`Team "${rest.name}"`, teamId);
  } else {
    logWouldCreate(`Team "${rest.name}"`, teamId);
  }
  return teamId;
}

// ────────────────────────────────────────────────────────────────────────────
// CREATE — TEAM MEMBER
// ────────────────────────────────────────────────────────────────────────────

async function createTeamMember(args: {
  companyId: string;
  memberId: string;
  name: string;
  role: string;            // job title
  teamId: string;
  reportsToUserId: string;
  isAppUser: boolean;
  appUserId: string | null;
}): Promise<string> {
  const { companyId, memberId, ...rest } = args;
  const ref = db.doc(`companies/${companyId}/teamMembers/${memberId}`);
  const snap = await ref.get();
  if (snap.exists) {
    logSkip(`TeamMember "${rest.name}"`, memberId);
    return memberId;
  }
  // Per recon: do NOT write an `email` field — it's not in the type.
  const payload = {
    ...rest,
    status: "active" as const,
    archivedAt: null,
    archivedReason: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (APPLY) {
    await ref.set(payload);
    logCreate(`TeamMember "${rest.name}"`, memberId);
  } else {
    logWouldCreate(`TeamMember "${rest.name}"`, memberId);
  }
  return memberId;
}

// ────────────────────────────────────────────────────────────────────────────
// CREATE — CORE VALUE
// ────────────────────────────────────────────────────────────────────────────

async function createCoreValue(args: {
  companyId: string;
  valueId: string;
  name: string;
  description: string;
  behaviors: string[];
  order: number;
}): Promise<string> {
  const { companyId, valueId, ...rest } = args;
  const ref = db.doc(`companies/${companyId}/coreValues/${valueId}`);
  const snap = await ref.get();
  if (snap.exists) {
    logSkip(`CoreValue "${rest.name}"`, valueId);
    return valueId;
  }
  const payload = {
    ...rest,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (APPLY) {
    await ref.set(payload);
    logCreate(`CoreValue "${rest.name}"`, valueId);
  } else {
    logWouldCreate(`CoreValue "${rest.name}"`, valueId);
  }
  return valueId;
}

// ────────────────────────────────────────────────────────────────────────────
// CREATE — PRODUCTIVITY TARGET
// ────────────────────────────────────────────────────────────────────────────

async function createProductivityTarget(args: {
  companyId: string;
  targetId: string;
  memberId: string;
  name: string;
  type: TargetType;
  unit: UnitType;
  weight: number;
  target: number;
  min: number;
  max: number;
  order: number;
}): Promise<string> {
  const { companyId, targetId, ...rest } = args;
  const ref = db.doc(`companies/${companyId}/productivityTargets/${targetId}`);
  const snap = await ref.get();
  if (snap.exists) {
    logSkip(`Target "${rest.name}"`, targetId);
    return targetId;
  }
  const payload = {
    ...rest,
    frequency: "quarterly" as const,
    monthlyTargets: null,
    monthlyMin: null,
    monthlyMax: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (APPLY) {
    await ref.set(payload);
    logCreate(`Target "${rest.name}"`, targetId);
  } else {
    logWouldCreate(`Target "${rest.name}"`, targetId);
  }
  return targetId;
}

// ────────────────────────────────────────────────────────────────────────────
// CREATE — ASSESSMENT
// ────────────────────────────────────────────────────────────────────────────

async function createAssessment(args: {
  companyId: string;
  assessmentId: string;
  memberId: string;
  memberName: string;
  assessedByUserId: string;
  fiscalYear: number;
  fiscalQuarter: number;
  cultureFitScores: { coreValueId: string; coreValueName: string; rating: CFRating }[];
  cultureFitScore: number;
  productivityActuals: {
    targetId: string;
    targetName: string;
    actual: number | null;
    monthlyActuals: null;
  }[];
  productivityScore: number;
  performanceCategory: Category;
}): Promise<string> {
  const { companyId, assessmentId, ...rest } = args;
  const ref = db.doc(`companies/${companyId}/assessments/${assessmentId}`);
  const snap = await ref.get();
  if (snap.exists) {
    logSkip(`Assessment ${assessmentId}`, assessmentId);
    return assessmentId;
  }
  const payload = {
    ...rest,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (APPLY) {
    await ref.set(payload);
    logCreate(`Assessment for "${rest.memberName}" FY${rest.fiscalYear}Q${rest.fiscalQuarter}`, assessmentId);
  } else {
    logWouldCreate(`Assessment for "${rest.memberName}" FY${rest.fiscalYear}Q${rest.fiscalQuarter}`, assessmentId);
  }
  return assessmentId;
}

// ────────────────────────────────────────────────────────────────────────────
// CREATE — ACTION PLAN
// ────────────────────────────────────────────────────────────────────────────

async function createActionPlan(args: {
  companyId: string;
  planId: string;
  memberId: string;
  memberName: string;
  actions: {
    id: string;
    description: string;
    targetDate: string;       // ISO date
    completedAt: string | null;
    owner: string;
  }[];
  notes: {
    id: string;
    actionItemId: string | null;
    text: string;
  }[];
}): Promise<string> {
  const { companyId, planId, actions, notes, ...rest } = args;
  const ref = db.doc(`companies/${companyId}/actionPlans/${planId}`);
  const snap = await ref.get();
  if (snap.exists) {
    logSkip(`ActionPlan for "${rest.memberName}"`, planId);
    return planId;
  }
  // Stamp note.createdAt as a real Timestamp (the type uses Timestamp, not
  // serverTimestamp — and serverTimestamp() can't go inside an array element).
  const stampedNotes = notes.map((n) => ({
    ...n,
    createdAt: admin.firestore.Timestamp.now(),
  }));
  const payload = {
    ...rest,
    actions,
    notes: stampedNotes,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (APPLY) {
    await ref.set(payload);
    logCreate(`ActionPlan for "${rest.memberName}"`, planId);
  } else {
    logWouldCreate(`ActionPlan for "${rest.memberName}"`, planId);
  }
  return planId;
}

// ────────────────────────────────────────────────────────────────────────────
// CREATE — ASKMIKE COACHES (global, not tenant-scoped)
// ────────────────────────────────────────────────────────────────────────────

async function seedDefaultCoaches(): Promise<void> {
  const coll = db.collection("config/askmike/coaches");
  const snap = await coll.get();
  if (!snap.empty) {
    logSkip(`AskMike coaches (${snap.size} already present)`, "config/askmike/coaches");
    return;
  }
  for (const coach of DEFAULT_COACHES) {
    const payload = {
      ...coach,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (APPLY) {
      const ref = await coll.add(payload);
      logCreate(`Coach "${coach.name}"`, ref.id);
    } else {
      logWouldCreate(`Coach "${coach.name}"`, "<auto-id>");
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadDotEnvLocal();
  const sa = loadStagingServiceAccount();
  runSafetyChecks(sa);
  initAdmin(sa);

  // ── Optional wipe ──────────────────────────────────────────────────
  if (WIPE) {
    await wipeCompany(COMPANY_ID);
  }

  // ── Company ────────────────────────────────────────────────────────
  section("COMPANY");
  await createCompany();

  // ── Users (Auth + Firestore fan-out) ───────────────────────────────
  section("USERS (Auth + userMappings + per-company users)");
  const userUidBySlug = new Map<string, string>();

  for (const u of USERS) {
    const teamIds = u.teamSlugs.map((s) =>
      s === "slt" ? SLT_TEAM_ID : OPS_TEAM_ID
    );
    const { uid, createdFresh } = await ensureAuthAccount(u.email, u.displayName);
    userUidBySlug.set(u.slug, uid);
    await createUser({
      uid,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      companyId: COMPANY_ID,
      teamIds,
      createdAuthFresh: createdFresh,
    });
  }

  // ── Teams ──────────────────────────────────────────────────────────
  section("TEAMS");
  const ceoUid = userUidBySlug.get("ceo")!;
  const cooUid = userUidBySlug.get("coo")!;

  await createTeam({
    companyId: COMPANY_ID,
    teamId: SLT_TEAM_ID,
    name: "Senior Leadership Team",
    parentTeamId: null,
    level: 0,
    leaderId: ceoUid,
    leaderName: USERS.find((u) => u.slug === "ceo")!.displayName,
    leaderTitle: USERS.find((u) => u.slug === "ceo")!.title,
  });
  await createTeam({
    companyId: COMPANY_ID,
    teamId: OPS_TEAM_ID,
    name: "Operations Team",
    parentTeamId: SLT_TEAM_ID,
    level: 1,
    leaderId: cooUid,
    leaderName: USERS.find((u) => u.slug === "coo")!.displayName,
    leaderTitle: USERS.find((u) => u.slug === "coo")!.title,
  });

  // ── Team Members (linked to app users for the assessed ones) ───────
  section("TEAM MEMBERS");
  const memberIdBySlug = new Map<string, string>();

  for (const u of USERS.filter((x) => x.isAssessed)) {
    const memberId = `seed-member-${u.slug}`;
    memberIdBySlug.set(u.slug, memberId);
    const teamId = u.assessedInTeam === "slt" ? SLT_TEAM_ID : OPS_TEAM_ID;
    const reportsToUid = userUidBySlug.get(u.reportsToSlug!)!;
    await createTeamMember({
      companyId: COMPANY_ID,
      memberId,
      name: u.displayName,
      role: u.title,
      teamId,
      reportsToUserId: reportsToUid,
      isAppUser: true,
      appUserId: userUidBySlug.get(u.slug)!,
    });
  }

  // ── Core Values ────────────────────────────────────────────────────
  section("CORE VALUES");
  const coreValueIdBySlug = new Map<string, string>();
  for (const cv of CORE_VALUES) {
    const id = `seed-cv-${cv.slug}`;
    coreValueIdBySlug.set(cv.slug, id);
    await createCoreValue({
      companyId: COMPANY_ID,
      valueId: id,
      name: cv.name,
      description: cv.description,
      behaviors: cv.behaviors,
      order: cv.order,
    });
  }

  // ── Productivity Targets ───────────────────────────────────────────
  section("PRODUCTIVITY TARGETS");
  const targetIdByUserSlugAndTargetSlug = new Map<string, string>();
  for (const [userSlug, targets] of Object.entries(TARGETS_BY_USER)) {
    const memberId = memberIdBySlug.get(userSlug);
    if (!memberId) continue;
    const sum = targets.reduce((s, t) => s + t.weight, 0);
    if (sum !== 100) {
      console.error(`❌ ABORT: targets for "${userSlug}" sum to ${sum}, not 100.`);
      process.exit(3);
    }
    targets.forEach((t, idx) => {
      const targetId = `seed-pt-${userSlug}-${t.slug}`;
      targetIdByUserSlugAndTargetSlug.set(`${userSlug}::${t.slug}`, targetId);
      // fire-and-await sequentially for predictable log ordering
      // (a Promise.all would interleave logs across members)
      void 0;
    });
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const targetId = `seed-pt-${userSlug}-${t.slug}`;
      await createProductivityTarget({
        companyId: COMPANY_ID,
        targetId,
        memberId,
        name: t.name,
        type: t.type,
        unit: t.unit,
        weight: t.weight,
        target: t.target,
        min: t.min,
        max: t.max,
        order: i + 1,
      });
    }
  }

  // ── Assessments (multi-quarter for some, Q1-only for others) ───────
  section(`ASSESSMENTS — FY${FISCAL_YEAR} Q1–Q3 (mixed history depth)`);
  for (const u of USERS.filter((x) => x.isAssessed)) {
    const memberId = memberIdBySlug.get(u.slug)!;
    const reportsToUid = userUidBySlug.get(u.reportsToSlug!)!;
    const history = ASSESSMENTS_BY_USER[u.slug] ?? [];
    const targets = TARGETS_BY_USER[u.slug] ?? [];

    for (const a of history) {
      const cultureFitScores = CORE_VALUES.map((cv) => ({
        coreValueId: coreValueIdBySlug.get(cv.slug)!,
        coreValueName: cv.name,
        rating: a.cultureFitRatings[cv.slug],
      }));

      const productivityActuals = targets.map((t) => ({
        targetId: targetIdByUserSlugAndTargetSlug.get(`${u.slug}::${t.slug}`)!,
        targetName: t.name,
        actual: a.productivityActuals[t.slug] ?? null,
        monthlyActuals: null,
      }));

      // Quarter is baked into the doc ID so Q1/Q2/Q3 are distinct docs and
      // check-before-write idempotency holds across re-runs.
      const assessmentId = `seed-assess-${u.slug}-fy${a.fiscalYear}-q${a.fiscalQuarter}`;
      await createAssessment({
        companyId: COMPANY_ID,
        assessmentId,
        memberId,
        memberName: u.displayName,
        assessedByUserId: reportsToUid,
        fiscalYear: a.fiscalYear,
        fiscalQuarter: a.fiscalQuarter,
        cultureFitScores,
        cultureFitScore: a.cultureFitScore,
        productivityActuals,
        productivityScore: a.productivityScore,
        performanceCategory: a.performanceCategory,
      });
    }
  }

  // ── Action Plans (one per assessed member, with sample content) ────
  section("ACTION PLANS");
  for (const u of USERS.filter((x) => x.isAssessed)) {
    const memberId = memberIdBySlug.get(u.slug)!;
    // Base the action plan on the MOST RECENT quarter — that's what a leader
    // would naturally be acting on.
    const history = ASSESSMENTS_BY_USER[u.slug] ?? [];
    const cat = history[history.length - 1].performanceCategory;
    const owner = u.displayName;

    // Sample content varies by category — keeps the seed visually
    // representative without being prescriptive.
    const actions = (() => {
      switch (cat) {
        case "HP":
          return [
            {
              id: `seed-action-${u.slug}-1`,
              description: "Identify a stretch project for next quarter.",
              targetDate: `${FISCAL_YEAR}-04-15`,
              completedAt: null,
              owner,
            },
          ];
        case "MP":
          return [
            {
              id: `seed-action-${u.slug}-1`,
              description: "Pair with a HP peer for one quarter on bookings strategy.",
              targetDate: `${FISCAL_YEAR}-05-01`,
              completedAt: null,
              owner,
            },
          ];
        case "LP":
          return [
            {
              id: `seed-action-${u.slug}-1`,
              description: "30/60/90 plan for output recovery — weekly check-ins.",
              targetDate: `${FISCAL_YEAR}-06-30`,
              completedAt: null,
              owner,
            },
          ];
        case "LCF":
          return [
            {
              id: `seed-action-${u.slug}-1`,
              description: "Difficult conversation re: collaboration behaviors.",
              targetDate: `${FISCAL_YEAR}-04-01`,
              completedAt: null,
              owner,
            },
          ];
      }
    })();

    const notes = [
      {
        id: `seed-note-${u.slug}-1`,
        actionItemId: null,
        text: `Initial seed note for ${u.displayName} (${cat}).`,
      },
    ];

    await createActionPlan({
      companyId: COMPANY_ID,
      planId: `seed-plan-${u.slug}`,
      memberId,
      memberName: u.displayName,
      actions: actions!,
      notes,
    });
  }

  // ── AskMike coaches (global) ───────────────────────────────────────
  section("ASKMIKE COACHES (global)");
  await seedDefaultCoaches();

  // ── Summary ────────────────────────────────────────────────────────
  banner("SUMMARY");
  console.log(`  Mode:           ${MODE}`);
  console.log(`  Created:        ${counters.created}`);
  console.log(`  Skipped:        ${counters.skipped}`);
  console.log(`  Would create:   ${counters.wouldCreate}`);
  console.log(`  Company ID:     ${COMPANY_ID}`);
  console.log(`  Login password: ${COMMON_PASSWORD}  (every seeded user)`);
  console.log("");
  if (!APPLY) {
    console.log("  This was a DRY RUN. Re-run with --apply to actually write.");
  } else {
    console.log("  Apply complete. Verify via the staging app or Firestore console.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ UNHANDLED ERROR:");
    console.error(err);
    process.exit(99);
  });
