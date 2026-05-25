#!/usr/bin/env tsx
/**
 * TDS Staging Seed Script — Phase 6c
 * =====================================================================
 *
 * Seeds THREE tenants into the TDS staging Firebase project:
 *   • Aurora Manufacturing  (fiscal year starts January)
 *   • Beacon Logistics      (fiscal year starts April)
 *   • Crescent Consulting   (fiscal year starts October)
 *
 * Idempotent: re-running with --apply produces no duplicates.
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
 *   npm run seed:staging:fresh    — wipe each tenant's /companies/{cid}
 *                                   then re-seed all three
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
 * WHAT GETS SEEDED (per tenant unless noted)
 * ------------------------------------------
 *   • 1 company:      Aurora / Beacon / Crescent (with correct fiscalYearStartMonth)
 *   • 6 users:        CEO + 3 senior_leaders on SLT + 2 leaders on the functional team
 *   • 2 teams:        Senior Leadership Team + a functional team (Operations / Fleet / Delivery)
 *   • 5 team members: everyone except the CEO (CEO assesses, isn't assessed)
 *   • 5 core values:  tenant-specific
 *   • 15 productivity targets (3 per assessed member, weights sum to 100)
 *   • ~11 assessments across FY2026 Q1/Q2/Q3 with a mix of trajectories
 *     (UP / STABLE / DOWN / Q1-only) and a category mix that covers HP/MP/LP/LCF
 *     somewhere within each tenant
 *   • 5 action plans (one per assessed member)
 *   • 2 AskMike coaches (global; written once, matches ensureDefaultCoaches())
 *
 * EMAIL CONVENTION (applied to ALL tenants)
 * -----------------------------------------
 *   first.last@<tenant>-test.example.com
 *   (e.g. sarah.chen@aurora-test.example.com, eli.tanaka@beacon-test.example.com)
 *
 * WIPE SCOPE
 * ----------
 *   --wipe-and-reseed recursively deletes /companies/{cid} for EACH tenant.
 *   It does NOT touch Firebase Auth accounts or /userMappings docs.
 *   createUser() reuses existing Auth accounts via getUserByEmail() and
 *   idempotently updates userMappings, so leftover Auth/userMappings state
 *   from prior seeds is absorbed cleanly on re-seed.
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
// TYPES
// ────────────────────────────────────────────────────────────────────────────

type AppRole = "superadmin" | "company_admin" | "senior_leader" | "leader";

interface SeedUser {
  slug: string;           // used in deterministic doc IDs
  displayName: string;
  email: string;
  role: Exclude<AppRole, "superadmin">; // no superadmin in this seed
  title: string;          // job title (also used as TeamMember.role)
  teamSlugs: ("slt" | "functional")[];   // teams this user belongs to
  isAssessed: boolean;    // create a teamMember doc + assessment for this user?
  assessedInTeam?: "slt" | "functional"; // which team's member roll they appear on
  reportsToSlug?: string; // slug of the user they report to (for teamMember.reportsToUserId)
}

interface SeedCoreValue {
  slug: string;
  name: string;
  description: string;
  behaviors: string[];
  order: number;
}

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

interface TenantSeed {
  companyId: string;
  companyName: string;
  fiscalYearStartMonth: number;      // 1=Jan, 4=Apr, 10=Oct
  sltTeamId: string;
  functionalTeamId: string;
  functionalTeamName: string;
  users: SeedUser[];
  coreValues: SeedCoreValue[];
  targetsByUser: Record<string, SeedTarget[]>;
  assessmentsByUser: Record<string, SeedAssessment[]>;
}

// Superadmin is intentionally kept separate from SeedUser: a superadmin
// is not tied to any tenant (no companyId, no team membership, no per-
// company users doc). SeedUser's role type still excludes "superadmin"
// so a tenant entry can never accidentally promote someone to global.
interface SeedSuperadmin {
  displayName: string;
  email: string;
}

const FISCAL_YEAR = 2026;
// Per-assessment quarters are stored on each SeedAssessment entry below —
// different members get different numbers of historical quarters. The
// per-tenant fiscalYearStartMonth tells the app how to map quarters to
// calendar months, so the same fiscalYear+quarter numbers are valid across
// tenants with different fiscal calendars.

// ────────────────────────────────────────────────────────────────────────────
// TENANT 1 — AURORA MANUFACTURING (fiscal year starts January)
// ────────────────────────────────────────────────────────────────────────────
// Trajectories:
//   cfo      — Marcus Webb       — DOWN: HP → MP → LP   (numbers slip, then crash)
//   coo      — Priya Patel       — STABLE: HP → HP → HP (consistent star)
//   vp-sales — David Rodriguez   — Q1 only, MP          (partial history)
//   vp-ops   — Hannah Kim        — UP:   LP → MP → HP   (coaching worked)
//   analyst  — Alex Morgan       — Q1 only, LCF         (newer hire)

const AURORA: TenantSeed = {
  companyId: "seed-aurora-manufacturing",
  companyName: "Aurora Manufacturing",
  fiscalYearStartMonth: 1,
  sltTeamId: "seed-aurora-team-slt",
  functionalTeamId: "seed-aurora-team-operations",
  functionalTeamName: "Operations Team",

  users: [
    {
      slug: "ceo",
      displayName: "Sarah Chen",
      email: "sarah.chen@aurora-test.example.com",
      role: "company_admin",
      title: "CEO",
      teamSlugs: ["slt"],
      isAssessed: false, // CEO isn't assessed in the group QTAM per the book
    },
    {
      slug: "cfo",
      displayName: "Marcus Webb",
      email: "marcus.webb@aurora-test.example.com",
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
      email: "priya.patel@aurora-test.example.com",
      role: "senior_leader",
      title: "COO",
      teamSlugs: ["slt", "functional"], // senior leader is on SLT + own functional team
      isAssessed: true,
      assessedInTeam: "slt",
      reportsToSlug: "ceo",
    },
    {
      slug: "vp-sales",
      displayName: "David Rodriguez",
      email: "david.rodriguez@aurora-test.example.com",
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
      email: "hannah.kim@aurora-test.example.com",
      role: "leader",
      title: "VP Operations",
      teamSlugs: ["functional"],
      isAssessed: true,
      assessedInTeam: "functional",
      reportsToSlug: "coo",
    },
    {
      slug: "analyst",
      displayName: "Alex Morgan",
      email: "alex.morgan@aurora-test.example.com",
      role: "leader",
      title: "Operations Analyst",
      teamSlugs: ["functional"],
      isAssessed: true,
      assessedInTeam: "functional",
      reportsToSlug: "coo",
    },
  ],

  coreValues: [
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
  ],

  targetsByUser: {
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
  },

  assessmentsByUser: {
    // ─── Marcus (CFO) — DOWN ────────────────────────────────────────────
    cfo: [
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
  },
};

// ────────────────────────────────────────────────────────────────────────────
// TENANT 2 — BEACON LOGISTICS (fiscal year starts April)
// ────────────────────────────────────────────────────────────────────────────
// Trajectories:
//   cfo      — Eli Tanaka       — UP:     MP → MP → HP   (steady climber)
//   coo      — Maya Lindstrom   — DOWN:   HP → MP → LP   (network strain)
//   vp-cs    — Andre Okafor     — Q1 only, MP            (newer hire)
//   vp-fleet — Sofia Reyes      — Q1 only, LCF           (culture concerns)
//   analyst  — Naomi Park       — Q1 only, HP            (strong newcomer)

const BEACON: TenantSeed = {
  companyId: "seed-beacon-logistics",
  companyName: "Beacon Logistics",
  fiscalYearStartMonth: 4,
  sltTeamId: "seed-beacon-team-slt",
  functionalTeamId: "seed-beacon-team-fleet-ops",
  functionalTeamName: "Fleet Operations Team",

  users: [
    {
      slug: "ceo",
      displayName: "Jordan Bennett",
      email: "jordan.bennett@beacon-test.example.com",
      role: "company_admin",
      title: "CEO",
      teamSlugs: ["slt"],
      isAssessed: false,
    },
    {
      slug: "cfo",
      displayName: "Eli Tanaka",
      email: "eli.tanaka@beacon-test.example.com",
      role: "senior_leader",
      title: "CFO",
      teamSlugs: ["slt"],
      isAssessed: true,
      assessedInTeam: "slt",
      reportsToSlug: "ceo",
    },
    {
      slug: "coo",
      displayName: "Maya Lindstrom",
      email: "maya.lindstrom@beacon-test.example.com",
      role: "senior_leader",
      title: "COO",
      teamSlugs: ["slt", "functional"],
      isAssessed: true,
      assessedInTeam: "slt",
      reportsToSlug: "ceo",
    },
    {
      slug: "vp-cs",
      displayName: "Andre Okafor",
      email: "andre.okafor@beacon-test.example.com",
      role: "senior_leader",
      title: "VP Customer Success",
      teamSlugs: ["slt"],
      isAssessed: true,
      assessedInTeam: "slt",
      reportsToSlug: "ceo",
    },
    {
      slug: "vp-fleet",
      displayName: "Sofia Reyes",
      email: "sofia.reyes@beacon-test.example.com",
      role: "leader",
      title: "VP Fleet Operations",
      teamSlugs: ["functional"],
      isAssessed: true,
      assessedInTeam: "functional",
      reportsToSlug: "coo",
    },
    {
      slug: "analyst",
      displayName: "Naomi Park",
      email: "naomi.park@beacon-test.example.com",
      role: "leader",
      title: "Logistics Analyst",
      teamSlugs: ["functional"],
      isAssessed: true,
      assessedInTeam: "functional",
      reportsToSlug: "coo",
    },
  ],

  coreValues: [
    {
      slug: "deliver-on-promise",
      name: "Deliver on Promise",
      description: "On-time, every time — what we commit to is what we ship.",
      behaviors: ["Confirms ETAs before committing", "Flags slips before they hit the customer"],
      order: 1,
    },
    {
      slug: "earn-trust-daily",
      name: "Earn Trust Daily",
      description: "Reliability builds long relationships.",
      behaviors: ["Follows up without prompting", "Says 'I missed it' before someone else does"],
      order: 2,
    },
    {
      slug: "drive-forward",
      name: "Drive Forward",
      description: "Always look ahead — anticipate the next bottleneck.",
      behaviors: ["Plans two routes ahead", "Spots problems while they're still small"],
      order: 3,
    },
    {
      slug: "one-team-one-route",
      name: "One Team, One Route",
      description: "Hand-offs are sacred — coordination wins over heroics.",
      behaviors: ["Closes loops between dispatch, fleet, and customers", "Pulls peers in early"],
      order: 4,
    },
    {
      slug: "own-the-mile",
      name: "Own the Mile",
      description: "Every handoff is personal — the load is yours until it isn't.",
      behaviors: ["Sees the load through, not just the lane", "Sweats the last detail"],
      order: 5,
    },
  ],

  targetsByUser: {
    cfo: [
      { slug: "cash-conversion", name: "Cash Conversion Cycle Days", type: "smaller", unit: "units",      weight: 40, target: 30,      min: 30,      max: 60 },
      { slug: "ar-aging",        name: "AR Over 60 Days %",          type: "smaller", unit: "percentage", weight: 35, target: 5,       min: 5,       max: 15 },
      { slug: "opex-variance",   name: "Opex Variance to Plan %",    type: "smaller", unit: "percentage", weight: 25, target: 2,       min: 2,       max: 8 },
    ],
    coo: [
      { slug: "on-time-pickup",  name: "On-Time Pickup %",           type: "bigger",  unit: "percentage", weight: 40, target: 97,      min: 85,      max: 97 },
      { slug: "fleet-util",      name: "Fleet Utilization %",        type: "bigger",  unit: "percentage", weight: 35, target: 85,      min: 70,      max: 85 },
      { slug: "cost-per-mile",   name: "Cost per Mile",              type: "smaller", unit: "dollars",    weight: 25, target: 1.20,    min: 1.20,    max: 2.00 },
    ],
    "vp-cs": [
      { slug: "nps",             name: "Customer NPS",               type: "bigger",  unit: "units",      weight: 40, target: 60,      min: 30,      max: 60 },
      { slug: "retention",       name: "Customer Retention %",       type: "bigger",  unit: "percentage", weight: 35, target: 95,      min: 85,      max: 95 },
      { slug: "response-time",   name: "Avg Response Time Hours",    type: "smaller", unit: "units",      weight: 25, target: 2,       min: 2,       max: 8 },
    ],
    "vp-fleet": [
      { slug: "driver-retention", name: "Driver Retention %",        type: "bigger",  unit: "percentage", weight: 40, target: 85,      min: 65,      max: 85 },
      { slug: "maint-on-time",   name: "Preventive Maintenance On-Time %", type: "bigger", unit: "percentage", weight: 35, target: 95, min: 80, max: 95 },
      { slug: "accidents",       name: "Recordable Accidents",       type: "smaller", unit: "units",      weight: 25, target: 0,       min: 0,       max: 4 },
    ],
    analyst: [
      { slug: "reports-otp",     name: "Reports Delivered On Time %", type: "bigger",  unit: "percentage", weight: 50, target: 100,     min: 90,      max: 100 },
      { slug: "data-accuracy",   name: "Data Accuracy %",            type: "bigger",  unit: "percentage", weight: 30, target: 99,      min: 92,      max: 99 },
      { slug: "analyses-count",  name: "Analyses per Quarter",       type: "bigger",  unit: "units",      weight: 20, target: 18,      min: 12,      max: 18 },
    ],
  },

  assessmentsByUser: {
    // ─── Eli (CFO) — UP ────────────────────────────────────────────────
    cfo: [
      {
        fiscalYear: 2026, fiscalQuarter: 1,
        cultureFitRatings: {
          "deliver-on-promise": "lives",
          "earn-trust-daily":   "lives",
          "drive-forward":      "occasional",
          "one-team-one-route": "lives",
          "own-the-mile":       "lives",
        },
        productivityActuals: { "cash-conversion": 45, "ar-aging": 10, "opex-variance": 5 },
        cultureFitScore: 8.4, // occasional cap
        productivityScore: 6.8,
        performanceCategory: "MP",
      },
      {
        fiscalYear: 2026, fiscalQuarter: 2,
        cultureFitRatings: {
          "deliver-on-promise": "lives",
          "earn-trust-daily":   "lives",
          "drive-forward":      "lives",
          "one-team-one-route": "lives",
          "own-the-mile":       "lives",
        },
        productivityActuals: { "cash-conversion": 38, "ar-aging": 8, "opex-variance": 4 },
        cultureFitScore: 9.0,
        productivityScore: 7.8,
        performanceCategory: "MP",
      },
      {
        fiscalYear: 2026, fiscalQuarter: 3,
        cultureFitRatings: {
          "deliver-on-promise": "models",
          "earn-trust-daily":   "lives",
          "drive-forward":      "lives",
          "one-team-one-route": "lives",
          "own-the-mile":       "lives",
        },
        productivityActuals: { "cash-conversion": 32, "ar-aging": 6, "opex-variance": 2.5 },
        cultureFitScore: 9.2,
        productivityScore: 9.2,
        performanceCategory: "HP",
      },
    ],

    // ─── Maya (COO) — DOWN ─────────────────────────────────────────────
    coo: [
      {
        fiscalYear: 2026, fiscalQuarter: 1,
        cultureFitRatings: {
          "deliver-on-promise": "models",
          "earn-trust-daily":   "models",
          "drive-forward":      "lives",
          "one-team-one-route": "lives",
          "own-the-mile":       "lives",
        },
        productivityActuals: { "on-time-pickup": 97, "fleet-util": 86, "cost-per-mile": 1.18 },
        cultureFitScore: 9.4,
        productivityScore: 10,
        performanceCategory: "HP",
      },
      {
        fiscalYear: 2026, fiscalQuarter: 2,
        cultureFitRatings: {
          "deliver-on-promise": "lives",
          "earn-trust-daily":   "lives",
          "drive-forward":      "lives",
          "one-team-one-route": "lives",
          "own-the-mile":       "lives",
        },
        productivityActuals: { "on-time-pickup": 93, "fleet-util": 80, "cost-per-mile": 1.40 },
        cultureFitScore: 9.0,
        productivityScore: 7.5,
        performanceCategory: "MP",
      },
      {
        fiscalYear: 2026, fiscalQuarter: 3,
        cultureFitRatings: {
          "deliver-on-promise": "lives",
          "earn-trust-daily":   "occasional",
          "drive-forward":      "lives",
          "one-team-one-route": "lives",
          "own-the-mile":       "lives",
        },
        productivityActuals: { "on-time-pickup": 87, "fleet-util": 75, "cost-per-mile": 1.75 },
        cultureFitScore: 8.4, // occasional cap
        productivityScore: 5.0,
        performanceCategory: "LP",
      },
    ],

    // ─── Andre (VP CS) — Q1 only, MP ───────────────────────────────────
    "vp-cs": [
      {
        fiscalYear: 2026, fiscalQuarter: 1,
        cultureFitRatings: {
          "deliver-on-promise": "lives",
          "earn-trust-daily":   "lives",
          "drive-forward":      "lives",
          "one-team-one-route": "lives",
          "own-the-mile":       "occasional",
        },
        productivityActuals: { nps: 42, retention: 90, "response-time": 4 },
        cultureFitScore: 8.4, // occasional cap
        productivityScore: 7.5,
        performanceCategory: "MP",
      },
    ],

    // ─── Sofia (VP Fleet) — Q1 only, LCF ───────────────────────────────
    "vp-fleet": [
      {
        fiscalYear: 2026, fiscalQuarter: 1,
        cultureFitRatings: {
          "deliver-on-promise": "lives",
          "earn-trust-daily":   "frequent",
          "drive-forward":      "occasional",
          "one-team-one-route": "frequent",
          "own-the-mile":       "occasional",
        },
        productivityActuals: { "driver-retention": 80, "maint-on-time": 92, accidents: 1 },
        cultureFitScore: 5.0, // raw avg well below frequent cap of 7.4
        productivityScore: 7.8,
        performanceCategory: "LCF",
      },
    ],

    // ─── Naomi (Analyst) — Q1 only, HP ─────────────────────────────────
    analyst: [
      {
        fiscalYear: 2026, fiscalQuarter: 1,
        cultureFitRatings: {
          "deliver-on-promise": "models",
          "earn-trust-daily":   "models",
          "drive-forward":      "lives",
          "one-team-one-route": "models",
          "own-the-mile":       "lives",
        },
        productivityActuals: { "reports-otp": 100, "data-accuracy": 99.5, "analyses-count": 20 },
        cultureFitScore: 9.6,
        productivityScore: 10,
        performanceCategory: "HP",
      },
    ],
  },
};

// ────────────────────────────────────────────────────────────────────────────
// TENANT 3 — CRESCENT CONSULTING (fiscal year starts October)
// ────────────────────────────────────────────────────────────────────────────
// Trajectories:
//   cfo         — Theo Nakamura  — STABLE: HP → HP → HP  (rock-solid)
//   coo         — Rashida Ahmed  — DOWN:   MP → LP → LCF (culture deteriorates)
//   vp-practice — Felix Garcia   — Q1 only, HP           (strong baseline)
//   vp-delivery — Aisha Khan     — UP:     LCF → LP → MP (real recovery)
//   analyst     — Wei Liu        — Q1 only, LP           (output gap)

const CRESCENT: TenantSeed = {
  companyId: "seed-crescent-consulting",
  companyName: "Crescent Consulting",
  fiscalYearStartMonth: 10,
  sltTeamId: "seed-crescent-team-slt",
  functionalTeamId: "seed-crescent-team-delivery",
  functionalTeamName: "Delivery Team",

  users: [
    {
      slug: "ceo",
      displayName: "Olivia Brennan",
      email: "olivia.brennan@crescent-test.example.com",
      role: "company_admin",
      title: "CEO",
      teamSlugs: ["slt"],
      isAssessed: false,
    },
    {
      slug: "cfo",
      displayName: "Theo Nakamura",
      email: "theo.nakamura@crescent-test.example.com",
      role: "senior_leader",
      title: "CFO",
      teamSlugs: ["slt"],
      isAssessed: true,
      assessedInTeam: "slt",
      reportsToSlug: "ceo",
    },
    {
      slug: "coo",
      displayName: "Rashida Ahmed",
      email: "rashida.ahmed@crescent-test.example.com",
      role: "senior_leader",
      title: "COO",
      teamSlugs: ["slt", "functional"],
      isAssessed: true,
      assessedInTeam: "slt",
      reportsToSlug: "ceo",
    },
    {
      slug: "vp-practice",
      displayName: "Felix Garcia",
      email: "felix.garcia@crescent-test.example.com",
      role: "senior_leader",
      title: "VP Consulting Practice",
      teamSlugs: ["slt"],
      isAssessed: true,
      assessedInTeam: "slt",
      reportsToSlug: "ceo",
    },
    {
      slug: "vp-delivery",
      displayName: "Aisha Khan",
      email: "aisha.khan@crescent-test.example.com",
      role: "leader",
      title: "VP Delivery",
      teamSlugs: ["functional"],
      isAssessed: true,
      assessedInTeam: "functional",
      reportsToSlug: "coo",
    },
    {
      slug: "analyst",
      displayName: "Wei Liu",
      email: "wei.liu@crescent-test.example.com",
      role: "leader",
      title: "Engagement Analyst",
      teamSlugs: ["functional"],
      isAssessed: true,
      assessedInTeam: "functional",
      reportsToSlug: "coo",
    },
  ],

  coreValues: [
    {
      slug: "client-first-always",
      name: "Client First, Always",
      description: "The work is the client's, not ours.",
      behaviors: ["Reframes problems from the client's seat", "Pushes back on internal preferences when they don't serve the client"],
      order: 1,
    },
    {
      slug: "speak-the-hard-truth",
      name: "Speak the Hard Truth",
      description: "Tell the client what they need to hear, kindly.",
      behaviors: ["Names the elephant in the room", "Disagrees with the room, not the person"],
      order: 2,
    },
    {
      slug: "sharper-every-day",
      name: "Sharper Every Day",
      description: "Practice is never finished; the craft compounds.",
      behaviors: ["Asks for feedback after every deliverable", "Reads outside their specialty"],
      order: 3,
    },
    {
      slug: "generosity-in-knowledge",
      name: "Generosity in Knowledge",
      description: "Share what you learn — the practice grows when knowledge does.",
      behaviors: ["Writes up insights for the team", "Mentors without being asked"],
      order: 4,
    },
    {
      slug: "outcomes-over-hours",
      name: "Outcomes over Hours",
      description: "Results matter; effort is the price, not the product.",
      behaviors: ["Ends meetings when decisions are made", "Says no to busywork that won't move the outcome"],
      order: 5,
    },
  ],

  targetsByUser: {
    cfo: [
      { slug: "utilization-rate", name: "Billable Utilization %",     type: "bigger",  unit: "percentage", weight: 40, target: 80,      min: 65,      max: 80 },
      { slug: "project-margin",   name: "Project Margin %",           type: "bigger",  unit: "percentage", weight: 35, target: 35,      min: 25,      max: 35 },
      { slug: "dso",              name: "Days Sales Outstanding",     type: "smaller", unit: "units",      weight: 25, target: 45,      min: 45,      max: 75 },
    ],
    coo: [
      { slug: "delivery-quality", name: "Delivery Quality Score",     type: "bigger",  unit: "units",      weight: 40, target: 9,       min: 6,       max: 9 },
      { slug: "staff-engagement", name: "Staff Engagement Score",     type: "bigger",  unit: "units",      weight: 30, target: 85,      min: 65,      max: 85 },
      { slug: "pmo-on-time",      name: "PMO Milestones On Time %",   type: "bigger",  unit: "percentage", weight: 30, target: 95,      min: 80,      max: 95 },
    ],
    "vp-practice": [
      { slug: "new-bookings",     name: "New Engagement Bookings",    type: "bigger",  unit: "dollars",    weight: 50, target: 4000000, min: 2500000, max: 4000000 },
      { slug: "pipeline-cov",     name: "Pipeline Coverage Ratio",    type: "bigger",  unit: "units",      weight: 30, target: 3,       min: 1.5,     max: 3 },
      { slug: "proposal-win",     name: "Proposal Win Rate %",        type: "bigger",  unit: "percentage", weight: 20, target: 45,      min: 25,      max: 45 },
    ],
    "vp-delivery": [
      { slug: "on-time-delivery", name: "Engagement On-Time Delivery %", type: "bigger", unit: "percentage", weight: 40, target: 95, min: 80, max: 95 },
      { slug: "client-csat",      name: "Client CSAT Score",          type: "bigger",  unit: "units",      weight: 35, target: 9,       min: 6,       max: 9 },
      { slug: "rework-rate",      name: "Rework Rate %",              type: "smaller", unit: "percentage", weight: 25, target: 3,       min: 3,       max: 12 },
    ],
    analyst: [
      { slug: "engagement-cov",   name: "Engagements Supported per Quarter", type: "bigger", unit: "units", weight: 50, target: 6, min: 3, max: 6 },
      { slug: "analysis-acc",     name: "Analysis Accuracy Score",    type: "bigger",  unit: "units",      weight: 30, target: 9,       min: 6,       max: 9 },
      { slug: "turnaround",       name: "Avg Turnaround Days",        type: "smaller", unit: "units",      weight: 20, target: 3,       min: 3,       max: 10 },
    ],
  },

  assessmentsByUser: {
    // ─── Theo (CFO) — STABLE HP ────────────────────────────────────────
    cfo: [
      {
        fiscalYear: 2026, fiscalQuarter: 1,
        cultureFitRatings: {
          "client-first-always":     "models",
          "speak-the-hard-truth":    "models",
          "sharper-every-day":       "models",
          "generosity-in-knowledge": "models",
          "outcomes-over-hours":     "models",
        },
        productivityActuals: { "utilization-rate": 82, "project-margin": 37, dso: 42 },
        cultureFitScore: 10,
        productivityScore: 10,
        performanceCategory: "HP",
      },
      {
        fiscalYear: 2026, fiscalQuarter: 2,
        cultureFitRatings: {
          "client-first-always":     "models",
          "speak-the-hard-truth":    "models",
          "sharper-every-day":       "models",
          "generosity-in-knowledge": "models",
          "outcomes-over-hours":     "models",
        },
        productivityActuals: { "utilization-rate": 80, "project-margin": 36, dso: 44 },
        cultureFitScore: 10,
        productivityScore: 9.8,
        performanceCategory: "HP",
      },
      {
        fiscalYear: 2026, fiscalQuarter: 3,
        cultureFitRatings: {
          "client-first-always":     "models",
          "speak-the-hard-truth":    "models",
          "sharper-every-day":       "models",
          "generosity-in-knowledge": "models",
          "outcomes-over-hours":     "lives",
        },
        productivityActuals: { "utilization-rate": 81, "project-margin": 35, dso: 45 },
        cultureFitScore: 9.8,
        productivityScore: 9.5,
        performanceCategory: "HP",
      },
    ],

    // ─── Rashida (COO) — DOWN to LCF ───────────────────────────────────
    coo: [
      {
        fiscalYear: 2026, fiscalQuarter: 1,
        cultureFitRatings: {
          "client-first-always":     "lives",
          "speak-the-hard-truth":    "occasional",
          "sharper-every-day":       "lives",
          "generosity-in-knowledge": "lives",
          "outcomes-over-hours":     "lives",
        },
        productivityActuals: { "delivery-quality": 7, "staff-engagement": 75, "pmo-on-time": 88 },
        cultureFitScore: 8.4, // occasional cap
        productivityScore: 7.5,
        performanceCategory: "MP",
      },
      {
        fiscalYear: 2026, fiscalQuarter: 2,
        cultureFitRatings: {
          "client-first-always":     "lives",
          "speak-the-hard-truth":    "occasional",
          "sharper-every-day":       "occasional",
          "generosity-in-knowledge": "lives",
          "outcomes-over-hours":     "lives",
        },
        productivityActuals: { "delivery-quality": 6, "staff-engagement": 68, "pmo-on-time": 82 },
        cultureFitScore: 8.0, // still capped at occasional
        productivityScore: 5.5,
        performanceCategory: "LP",
      },
      {
        fiscalYear: 2026, fiscalQuarter: 3,
        cultureFitRatings: {
          "client-first-always":     "occasional",
          "speak-the-hard-truth":    "frequent",
          "sharper-every-day":       "frequent",
          "generosity-in-knowledge": "occasional",
          "outcomes-over-hours":     "lives",
        },
        productivityActuals: { "delivery-quality": 7, "staff-engagement": 70, "pmo-on-time": 85 },
        cultureFitScore: 5.0, // raw avg well below frequent cap
        productivityScore: 7.0,
        performanceCategory: "LCF",
      },
    ],

    // ─── Felix (VP Practice) — Q1 only, HP ─────────────────────────────
    "vp-practice": [
      {
        fiscalYear: 2026, fiscalQuarter: 1,
        cultureFitRatings: {
          "client-first-always":     "models",
          "speak-the-hard-truth":    "models",
          "sharper-every-day":       "models",
          "generosity-in-knowledge": "lives",
          "outcomes-over-hours":     "models",
        },
        productivityActuals: { "new-bookings": 4200000, "pipeline-cov": 3.2, "proposal-win": 48 },
        cultureFitScore: 9.8,
        productivityScore: 10,
        performanceCategory: "HP",
      },
    ],

    // ─── Aisha (VP Delivery) — UP from LCF ─────────────────────────────
    "vp-delivery": [
      {
        fiscalYear: 2026, fiscalQuarter: 1,
        cultureFitRatings: {
          "client-first-always":     "lives",
          "speak-the-hard-truth":    "frequent",
          "sharper-every-day":       "frequent",
          "generosity-in-knowledge": "lives",
          "outcomes-over-hours":     "occasional",
        },
        productivityActuals: { "on-time-delivery": 85, "client-csat": 7, "rework-rate": 8 },
        cultureFitScore: 5.4, // raw avg below frequent cap of 7.4
        productivityScore: 7.0,
        performanceCategory: "LCF",
      },
      {
        fiscalYear: 2026, fiscalQuarter: 2,
        cultureFitRatings: {
          "client-first-always":     "lives",
          "speak-the-hard-truth":    "occasional",
          "sharper-every-day":       "occasional",
          "generosity-in-knowledge": "lives",
          "outcomes-over-hours":     "lives",
        },
        productivityActuals: { "on-time-delivery": 85, "client-csat": 7, "rework-rate": 10 },
        cultureFitScore: 8.0,
        productivityScore: 5.5,
        performanceCategory: "LP",
      },
      {
        fiscalYear: 2026, fiscalQuarter: 3,
        cultureFitRatings: {
          "client-first-always":     "lives",
          "speak-the-hard-truth":    "lives",
          "sharper-every-day":       "lives",
          "generosity-in-knowledge": "lives",
          "outcomes-over-hours":     "lives",
        },
        productivityActuals: { "on-time-delivery": 90, "client-csat": 8, "rework-rate": 6 },
        cultureFitScore: 9.0,
        productivityScore: 7.5,
        performanceCategory: "MP",
      },
    ],

    // ─── Wei (Analyst) — Q1 only, LP ───────────────────────────────────
    analyst: [
      {
        fiscalYear: 2026, fiscalQuarter: 1,
        cultureFitRatings: {
          "client-first-always":     "lives",
          "speak-the-hard-truth":    "lives",
          "sharper-every-day":       "lives",
          "generosity-in-knowledge": "lives",
          "outcomes-over-hours":     "lives",
        },
        productivityActuals: { "engagement-cov": 3, "analysis-acc": 7, turnaround: 9 },
        cultureFitScore: 9.0,
        productivityScore: 5.0,
        performanceCategory: "LP",
      },
    ],
  },
};

const TENANTS: TenantSeed[] = [AURORA, BEACON, CRESCENT];

// ────────────────────────────────────────────────────────────────────────────
// GLOBAL SUPERADMIN (not tied to any tenant)
// ────────────────────────────────────────────────────────────────────────────
// Email convention: first.last@tds-test.example.com — the "tds-test" domain
// is intentional. He spans tenants, so a tenant-specific domain would be
// misleading. Password is COMMON_PASSWORD (same as every other seeded user).

const SUPERADMIN: SeedSuperadmin = {
  displayName: "Mike Goldman",
  email: "mike.goldman@tds-test.example.com",
};

// Coach defaults — verbatim from src/lib/coach-service.ts ensureDefaultCoaches().
// Kept inline so this script can run against a clean staging DB without
// needing client-SDK code paths. Coaches are global, not tenant-scoped.
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
  console.log(`  Tenants to seed:                       ${TENANTS.map((t) => t.companyName).join(", ")}`);

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
// PRE-FLIGHT TENANT DATA SANITY CHECKS
// ────────────────────────────────────────────────────────────────────────────

function validateTenantData(): void {
  for (const t of TENANTS) {
    // Targets per assessed member must sum to 100.
    for (const u of t.users.filter((x) => x.isAssessed)) {
      const targets = t.targetsByUser[u.slug];
      if (!targets) {
        console.error(`❌ ABORT: tenant "${t.companyId}" missing targets for assessed user "${u.slug}".`);
        process.exit(3);
      }
      const sum = targets.reduce((s, x) => s + x.weight, 0);
      if (sum !== 100) {
        console.error(`❌ ABORT: targets for "${t.companyId}/${u.slug}" sum to ${sum}, not 100.`);
        process.exit(3);
      }
    }
    // Every assessment's cultureFitRatings must cover all the tenant's CV slugs.
    const cvSlugs = t.coreValues.map((cv) => cv.slug);
    for (const u of t.users.filter((x) => x.isAssessed)) {
      const history = t.assessmentsByUser[u.slug] ?? [];
      for (const a of history) {
        for (const s of cvSlugs) {
          if (!(s in a.cultureFitRatings)) {
            console.error(
              `❌ ABORT: tenant "${t.companyId}" assessment for "${u.slug}" FY${a.fiscalYear}Q${a.fiscalQuarter} is missing CF rating for "${s}".`
            );
            process.exit(3);
          }
        }
      }
    }
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

async function createCompany(tenant: TenantSeed): Promise<string> {
  const ref = db.doc(`companies/${tenant.companyId}`);
  const snap = await ref.get();
  if (snap.exists) {
    logSkip(`Company "${tenant.companyName}"`, tenant.companyId);
    return tenant.companyId;
  }

  const payload = {
    name: tenant.companyName,
    fiscalYearStartMonth: tenant.fiscalYearStartMonth,
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
    logWouldCreate(`Company "${tenant.companyName}"`, tenant.companyId);
    return tenant.companyId;
  }

  await ref.set(payload);
  logCreate(`Company "${tenant.companyName}"`, tenant.companyId);
  return tenant.companyId;
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
// SEED THE GLOBAL SUPERADMIN
// ────────────────────────────────────────────────────────────────────────────
// Idempotency: ensureAuthAccount() reuses an existing Auth user by email;
// createUser() with role "superadmin" check-before-writes both /superadmin/{uid}
// and /userMappings/{uid}. The /superadmin/{uid} doc ID is the Firebase Auth
// uid (matches the recon's superadmin pattern and how createUser() already
// writes it). Per recon: no /companies/{cid}/users doc is written for a
// superadmin (companyId is null and createUser skips that branch).

async function seedSuperadmin(sa: SeedSuperadmin): Promise<void> {
  banner(`GLOBAL — SUPERADMIN: ${sa.displayName}`);
  section("AUTH + /userMappings + /superadmin");

  const { uid, createdFresh } = await ensureAuthAccount(sa.email, sa.displayName);
  logInfo(`Superadmin uid: ${uid} (doc IDs: /superadmin/${uid}, /userMappings/${uid})`);

  await createUser({
    uid,
    email: sa.email,
    displayName: sa.displayName,
    role: "superadmin",
    companyId: null,        // global — no company users doc
    teamIds: [],            // global — no team membership
    createdAuthFresh: createdFresh,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// SEED ONE TENANT
// ────────────────────────────────────────────────────────────────────────────

async function seedTenant(tenant: TenantSeed): Promise<void> {
  banner(`TENANT — ${tenant.companyName} (FY starts month ${tenant.fiscalYearStartMonth})`);

  // ── Company ────────────────────────────────────────────────────────
  section("COMPANY");
  await createCompany(tenant);

  // ── Users (Auth + Firestore fan-out) ───────────────────────────────
  section("USERS (Auth + userMappings + per-company users)");
  const userUidBySlug = new Map<string, string>();

  for (const u of tenant.users) {
    const teamIds = u.teamSlugs.map((s) =>
      s === "slt" ? tenant.sltTeamId : tenant.functionalTeamId
    );
    const { uid, createdFresh } = await ensureAuthAccount(u.email, u.displayName);
    userUidBySlug.set(u.slug, uid);
    await createUser({
      uid,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      companyId: tenant.companyId,
      teamIds,
      createdAuthFresh: createdFresh,
    });
  }

  // ── Teams ──────────────────────────────────────────────────────────
  section("TEAMS");
  const ceoUid = userUidBySlug.get("ceo")!;
  const cooUid = userUidBySlug.get("coo")!;
  const ceoUser = tenant.users.find((u) => u.slug === "ceo")!;
  const cooUser = tenant.users.find((u) => u.slug === "coo")!;

  await createTeam({
    companyId: tenant.companyId,
    teamId: tenant.sltTeamId,
    name: "Senior Leadership Team",
    parentTeamId: null,
    level: 0,
    leaderId: ceoUid,
    leaderName: ceoUser.displayName,
    leaderTitle: ceoUser.title,
  });
  await createTeam({
    companyId: tenant.companyId,
    teamId: tenant.functionalTeamId,
    name: tenant.functionalTeamName,
    parentTeamId: tenant.sltTeamId,
    level: 1,
    leaderId: cooUid,
    leaderName: cooUser.displayName,
    leaderTitle: cooUser.title,
  });

  // ── Team Members (linked to app users for the assessed ones) ───────
  section("TEAM MEMBERS");
  const memberIdBySlug = new Map<string, string>();

  for (const u of tenant.users.filter((x) => x.isAssessed)) {
    const memberId = `seed-member-${tenant.companyId}-${u.slug}`;
    memberIdBySlug.set(u.slug, memberId);
    const teamId = u.assessedInTeam === "slt" ? tenant.sltTeamId : tenant.functionalTeamId;
    const reportsToUid = userUidBySlug.get(u.reportsToSlug!)!;
    await createTeamMember({
      companyId: tenant.companyId,
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
  for (const cv of tenant.coreValues) {
    const id = `seed-cv-${tenant.companyId}-${cv.slug}`;
    coreValueIdBySlug.set(cv.slug, id);
    await createCoreValue({
      companyId: tenant.companyId,
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
  for (const [userSlug, targets] of Object.entries(tenant.targetsByUser)) {
    const memberId = memberIdBySlug.get(userSlug);
    if (!memberId) continue;
    // Weights are pre-validated by validateTenantData(); just write.
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const targetId = `seed-pt-${tenant.companyId}-${userSlug}-${t.slug}`;
      targetIdByUserSlugAndTargetSlug.set(`${userSlug}::${t.slug}`, targetId);
      await createProductivityTarget({
        companyId: tenant.companyId,
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
  for (const u of tenant.users.filter((x) => x.isAssessed)) {
    const memberId = memberIdBySlug.get(u.slug)!;
    const reportsToUid = userUidBySlug.get(u.reportsToSlug!)!;
    const history = tenant.assessmentsByUser[u.slug] ?? [];
    const targets = tenant.targetsByUser[u.slug] ?? [];

    for (const a of history) {
      const cultureFitScores = tenant.coreValues.map((cv) => ({
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
      const assessmentId = `seed-assess-${tenant.companyId}-${u.slug}-fy${a.fiscalYear}-q${a.fiscalQuarter}`;
      await createAssessment({
        companyId: tenant.companyId,
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
  for (const u of tenant.users.filter((x) => x.isAssessed)) {
    const memberId = memberIdBySlug.get(u.slug)!;
    // Base the action plan on the MOST RECENT quarter — that's what a leader
    // would naturally be acting on.
    const history = tenant.assessmentsByUser[u.slug] ?? [];
    const cat = history[history.length - 1].performanceCategory;
    const owner = u.displayName;

    // Sample content varies by category — keeps the seed visually
    // representative without being prescriptive.
    const actions = (() => {
      switch (cat) {
        case "HP":
          return [
            {
              id: `seed-action-${tenant.companyId}-${u.slug}-1`,
              description: "Identify a stretch project for next quarter.",
              targetDate: `${FISCAL_YEAR}-04-15`,
              completedAt: null,
              owner,
            },
          ];
        case "MP":
          return [
            {
              id: `seed-action-${tenant.companyId}-${u.slug}-1`,
              description: "Pair with a HP peer for one quarter on a focused capability.",
              targetDate: `${FISCAL_YEAR}-05-01`,
              completedAt: null,
              owner,
            },
          ];
        case "LP":
          return [
            {
              id: `seed-action-${tenant.companyId}-${u.slug}-1`,
              description: "30/60/90 plan for output recovery — weekly check-ins.",
              targetDate: `${FISCAL_YEAR}-06-30`,
              completedAt: null,
              owner,
            },
          ];
        case "LCF":
          return [
            {
              id: `seed-action-${tenant.companyId}-${u.slug}-1`,
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
        id: `seed-note-${tenant.companyId}-${u.slug}-1`,
        actionItemId: null,
        text: `Initial seed note for ${u.displayName} (${cat}).`,
      },
    ];

    await createActionPlan({
      companyId: tenant.companyId,
      planId: `seed-plan-${tenant.companyId}-${u.slug}`,
      memberId,
      memberName: u.displayName,
      actions: actions!,
      notes,
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadDotEnvLocal();
  const sa = loadStagingServiceAccount();
  runSafetyChecks(sa);
  validateTenantData();
  initAdmin(sa);

  // ── Optional wipe (all tenants) ────────────────────────────────────
  // NOTE: wipe scope is unchanged — only /companies/{cid} is touched.
  // The superadmin (/superadmin/{uid}, /userMappings/{uid}, Auth) is global
  // and is never wiped. createUser's check-before-write makes the
  // superadmin pass idempotent on its own.
  if (WIPE) {
    for (const t of TENANTS) {
      await wipeCompany(t.companyId);
    }
  }

  // ── Global superadmin (runs once, before any tenant) ───────────────
  await seedSuperadmin(SUPERADMIN);

  // ── Tenants (one banner block per tenant) ──────────────────────────
  for (const t of TENANTS) {
    await seedTenant(t);
  }

  // ── AskMike coaches (global, written once) ─────────────────────────
  banner("GLOBAL — ASKMIKE COACHES");
  await seedDefaultCoaches();

  // ── Summary ────────────────────────────────────────────────────────
  banner("SUMMARY");
  console.log(`  Mode:            ${MODE}`);
  console.log(`  Created:         ${counters.created}`);
  console.log(`  Skipped:         ${counters.skipped}`);
  console.log(`  Would create:    ${counters.wouldCreate}`);
  console.log(`  Superadmin:      ${SUPERADMIN.displayName} <${SUPERADMIN.email}>  (global — 1 user, not counted in tenant totals)`);
  console.log(`  Tenant users:    ${TENANTS.reduce((n, t) => n + t.users.length, 0)} across ${TENANTS.length} tenants`);
  console.log(`  Tenants:         ${TENANTS.map((t) => `${t.companyName} [${t.companyId}]`).join(", ")}`);
  console.log(`  Login password:  ${COMMON_PASSWORD}  (every seeded user, superadmin included)`);
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
