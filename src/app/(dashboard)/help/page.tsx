"use client";

import { useState } from "react";

interface HelpSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

function Section({ section, isOpen, onToggle }: { section: HelpSection; isOpen: boolean; onToggle: () => void }) {
  return (
    <div id={section.id} className="rounded-[4px] border border-brand-gray bg-white shadow-sm">
      <button onClick={onToggle} className="flex w-full items-center justify-between p-4 text-left">
        <span className="text-sm font-semibold text-primary">{section.title}</span>
        <span className="text-sm text-primary/40">{isOpen ? "▲" : "▼"}</span>
      </button>
      {isOpen && (
        <div className="border-t border-brand-gray px-4 pb-4 pt-3 text-sm text-primary/70 leading-relaxed space-y-3">
          {section.content}
        </div>
      )}
    </div>
  );
}

const sections: HelpSection[] = [
  {
    id: "framework",
    title: "The Talent Density Framework",
    content: (
      <>
        <p className="font-semibold text-primary">From <em>The Strength of Talent</em> by Mike Goldman</p>
        <p>
          Talent Density is the concentration of high performers on your team. The higher the density, the stronger your team&apos;s results.
          This system implements a five-step framework for building and maintaining high talent density:
        </p>
        <ol className="list-decimal pl-5 space-y-2">
          <li><strong>Define</strong> — Set clear expectations. Define core values (culture fit) and productivity targets (job scorecard) for every role.</li>
          <li><strong>Assess</strong> — Evaluate each team member quarterly on both culture fit and productivity. This produces their performance category.</li>
          <li><strong>Act</strong> — Take differentiated actions based on category. Overinvest in high performers, coach medium performers, and make tough, timely decisions on low performers.</li>
          <li><strong>Review</strong> — Track TDI (Talent Density Index) over time. Use reports to see trends, compare teams, and set benchmarks.</li>
          <li><strong>Repeat</strong> — Do this every quarter. Consistency is what transforms a team.</li>
        </ol>
        <div className="mt-3 rounded-[4px] bg-primary/5 p-3">
          <p className="font-semibold text-primary">Performance Categories</p>
          <ul className="mt-2 space-y-1">
            <li><span className="inline-block rounded-[2px] bg-green-500 px-2 py-0.5 text-[10px] font-semibold text-white">HP</span> <strong>High Performing</strong> — High culture fit AND high productivity. Your most valuable people.</li>
            <li><span className="inline-block rounded-[2px] bg-yellow-400 px-2 py-0.5 text-[10px] font-semibold text-primary">MP</span> <strong>Medium Performing</strong> — Adequate on both dimensions. Coachable — help them grow toward HP.</li>
            <li><span className="inline-block rounded-[2px] bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">LP</span> <strong>Low Producing</strong> — Good culture fit but low productivity. Determine if it&apos;s a skill gap or will gap.</li>
            <li><span className="inline-block rounded-[2px] bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">LCF</span> <strong>Low Culture Fit</strong> — Poor culture fit regardless of productivity. Act decisively — culture issues rarely self-correct.</li>
          </ul>
        </div>
        <div className="mt-3 rounded-[4px] bg-primary/5 p-3">
          <p className="font-semibold text-primary">TDI — Talent Density Index</p>
          <p className="mt-1">TDI = %HP − (%LP + %LCF)</p>
          <p className="mt-1 text-xs text-primary/50">
            Example: 10 team members — 4 HP, 4 MP, 1 LP, 1 LCF → TDI = 40% − (10% + 10%) = +20%
          </p>
          <p className="mt-1">TDI should be treated with the same rigor as revenue or profit metrics. Set goals, track trends, hold leaders accountable.</p>
        </div>
      </>
    ),
  },
  {
    id: "dashboard",
    title: "Dashboard",
    content: (
      <>
        <p className="font-semibold text-primary">Your team&apos;s talent health at a glance</p>
        <p>The dashboard is the first screen you see after login. It shows:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>TDI Score</strong> — Current quarter&apos;s Talent Density Index, color-coded (green = positive, red = negative)</li>
          <li><strong>Category Breakdown</strong> — Count and percentage of HP, MP, LP, and LCF team members</li>
          <li><strong>Talent Density Model</strong> — Mini grid plotting each team member by culture fit (Y-axis) and productivity (X-axis). Click a dot to go to that member&apos;s detail page.</li>
          <li><strong>TDI Trend</strong> — Line chart showing TDI movement over quarters</li>
          <li><strong>Open Action Items</strong> — All open actions across your team, sorted with overdue items first. You can mark actions complete or change owners directly from here.</li>
        </ul>
        <p className="mt-2 italic text-primary/50">Why it matters: A quick daily pulse on whether your team is getting stronger or weaker. If you&apos;re not tracking it, you&apos;re not managing it.</p>
      </>
    ),
  },
  {
    id: "teams",
    title: "Teams & Members",
    content: (
      <>
        <p className="font-semibold text-primary">Build your team hierarchy</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Team Hierarchy</strong> — Create a top-level team (e.g., Senior Leadership Team) with sub-teams underneath (e.g., Sales, Marketing, Finance). Each team has a leader.</li>
          <li><strong>Adding Members</strong> — Add team members with name and title. Members appear under their team and report to the team leader.</li>
          <li><strong>Archive vs Delete</strong> — Use the archive button (▼) instead of deleting. Archived members preserve their assessment history for accurate historical TDI reporting.</li>
          <li><strong>Change Team</strong> — Move a member to a different team. The change is logged with the date so you can track how moves affect performance.</li>
          <li><strong>Promote to Leader</strong> — Promote a member to lead their team. This logs a leader change event on all team members for reporting context.</li>
          <li><strong>Show Archived</strong> — Toggle to see archived members (grayed out) alongside active ones.</li>
        </ul>
        <p className="mt-2 italic text-primary/50">Why it matters: Accurate team structure is the foundation. Every assessment, every TDI calculation, every report depends on knowing who reports to whom.</p>
      </>
    ),
  },
  {
    id: "member-details",
    title: "Team Member Details",
    content: (
      <>
        <p className="font-semibold text-primary">Where coaching meets data</p>
        <p>The member detail page has three tabs:</p>
        <div className="mt-2 space-y-3">
          <div>
            <p className="font-semibold text-primary/80">Overview Tab</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Latest culture fit and productivity scores</li>
              <li>Score trend chart across quarters</li>
              <li>Action items — add, complete, delete, assign owners, set due dates</li>
              <li>Coaching notes — ongoing notes with timestamps</li>
              <li>Assessment history with change annotations (team changes, promotions, leader changes)</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-primary/80">Assessment Tab</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Select fiscal year and quarter</li>
              <li>Rate each core value: Models (10), Lives (9), Occasional Challenges (7), Frequent Challenges (1)</li>
              <li>Enter productivity actuals against targets (monthly or quarterly)</li>
              <li>Category is calculated automatically from the scores</li>
              <li>Quarter incomplete option — assess with only 1 or 2 months of data</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-primary/80">Targets Tab</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Define productivity KPIs (revenue, closing ratio, etc.)</li>
              <li>Set type (bigger is better / smaller is better), unit ($, %, units), frequency (monthly/quarterly)</li>
              <li>Assign weights (must total 100%)</li>
              <li>Optional min/max thresholds for nuanced scoring</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-primary/80">AskMike Coaches</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>People Coach</strong> — AI coaching on how to manage this team member based on their specific scores and category. Can generate action items from coaching advice.</li>
              <li><strong>Difficult Conversations Coach</strong> — Help preparing for tough conversations. Provides specific language and frameworks.</li>
              <li>Both coaches see the member&apos;s full assessment data including individual core value ratings and productivity target details.</li>
            </ul>
          </div>
        </div>
        <p className="mt-2 italic text-primary/50">Why it matters: This is where data becomes action. Assessments without follow-through are just paperwork. The action items and coaching tools ensure leaders actually DO something with what they learn.</p>
      </>
    ),
  },
  {
    id: "talent-summary",
    title: "Talent Summary",
    content: (
      <>
        <p className="font-semibold text-primary">The quarterly talent review</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Talent Density Model</strong> — Full-size grid plotting every team member. Culture fit on Y-axis, productivity on X-axis. Four zones: HP (upper right), MP (center), LP (upper left), LCF (bottom).</li>
          <li><strong>TDI Score</strong> — Current TDI with formula breakdown</li>
          <li><strong>Category Distribution</strong> — HP, MP, LP, LCF counts and percentages</li>
          <li><strong>View Filters</strong> — My Direct Reports, All (admin), by specific team, or Direct Reports of a team (for sub-team reviews)</li>
          <li><strong>Privacy Mode</strong> — Hides member names/initials on the grid for presentation settings</li>
          <li><strong>Quarter Selector</strong> — View any historical quarter</li>
        </ul>
        <p className="mt-2 italic text-primary/50">Why it matters: This is the visual centerpiece of the Quarterly Talent Assessment Meeting (QTAM). It&apos;s where leadership teams see the truth about their talent and commit to action.</p>
      </>
    ),
  },
  {
    id: "reports",
    title: "Reports",
    content: (
      <>
        <p className="font-semibold text-primary">Track TDI with the same rigor as revenue</p>
        <p>Four report tabs:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>TDI Trends</strong> — Line chart of TDI over time. Switch between Overall, By Team, or By Leader to see who&apos;s building talent density and who isn&apos;t.</li>
          <li><strong>Historical Snapshots</strong> — View the Talent Density Model for any past quarter. Filter by team. See how the picture has changed.</li>
          <li><strong>Comparisons</strong> — Side-by-side table comparing teams: TDI, HP%, MP%, LP%, LCF%, total members. Sortable by any column. Bar chart visualization.</li>
          <li><strong>TDI Goals</strong> — Set company-level and per-team TDI targets. Status indicators show green (on/above target), yellow (close), or red (below). Change log shows team member moves and leadership changes that may explain TDI shifts.</li>
        </ul>
        <p className="mt-2 italic text-primary/50">Why it matters: What gets measured gets managed. TDI reports prove whether your talent strategy is working — and where it isn&apos;t. Leaders who track TDI quarterly build significantly stronger teams over time.</p>
      </>
    ),
  },
  {
    id: "askmike",
    title: "AskMike",
    content: (
      <>
        <p className="font-semibold text-primary">AI-powered coaching at your fingertips</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>People Coach</strong> — Get advice on managing team members based on their performance category. The coach sees their full assessment data and gives specific, actionable recommendations aligned with the Talent Density framework.</li>
          <li><strong>Difficult Conversations Coach</strong> — Prepare for tough workplace conversations. Get suggested language, conversation outlines, and guidance on handling reactions.</li>
          <li><strong>Generate Actions</strong> — On People Coach responses, click &quot;Generate Actions&quot; to turn coaching advice into action items on the team member&apos;s plan.</li>
          <li><strong>Other</strong> — Coach about someone not in the system. Click &quot;Other...&quot; on the AskMike page to start a coaching session without a specific team member context.</li>
          <li><strong>History</strong> — Past conversations are saved. Click &quot;History&quot; in the chat panel to review previous sessions.</li>
        </ul>
        <p className="mt-2 italic text-primary/50">Why it matters: Most leaders know WHAT to do but struggle with HOW. AskMike bridges that gap by providing coaching methodology in the moment of need — when you&apos;re preparing for a conversation or deciding what action to take.</p>
      </>
    ),
  },
  {
    id: "core-values",
    title: "Core Values",
    content: (
      <>
        <p className="font-semibold text-primary">The foundation of culture fit</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Define your company&apos;s core values (e.g., &quot;We lift each other up&quot;, &quot;We speak the difficult truth&quot;)</li>
          <li>Each team member is rated on every core value during assessment</li>
          <li>Ratings: Models (10), Lives (9), Occasional Challenges (7), Frequent Challenges (1)</li>
          <li>The average across all core values produces the Culture Fit score</li>
          <li>Caps apply: if any value is rated &quot;Occasional Challenges&quot;, the total is capped at 8.4. If any is &quot;Frequent Challenges&quot;, capped at 7.4.</li>
        </ul>
        <p className="mt-2 italic text-primary/50">Why it matters: Core values aren&apos;t posters on the wall — they&apos;re the behaviors you hire for, coach to, and hold people accountable against. Without clearly defined values, culture fit assessment is just opinion.</p>
      </>
    ),
  },
  {
    id: "company-settings",
    title: "Company Settings (Admin)",
    content: (
      <>
        <p className="font-semibold text-primary">Calibrate how the system works</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Fiscal Year Start Month</strong> — Set when your fiscal year begins (affects quarter calculations throughout the app)</li>
          <li><strong>Scoring Thresholds</strong> — Set the minimum culture fit and productivity scores required for HP, and the maximums that define LP and LCF. These determine where the zone boundaries sit on the Talent Density Model.</li>
          <li><strong>Culture Fit Rating Scores</strong> — Customize the numeric values for Models, Lives, Occasional, and Frequent ratings</li>
          <li><strong>Culture Fit Caps</strong> — Set the maximum culture fit score when someone has an Occasional or Frequent Challenges rating</li>
        </ul>
        <p className="mt-2 italic text-primary/50">Why it matters: Every organization has different standards. A startup&apos;s HP threshold might be different from an enterprise&apos;s. These settings let you calibrate the system to YOUR bar.</p>
      </>
    ),
  },
  {
    id: "users",
    title: "Users (Admin)",
    content: (
      <>
        <p className="font-semibold text-primary">Manage who has access</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Superadmin</strong> — Full access to everything across all companies. Can manage coaches, settings, and all data.</li>
          <li><strong>Company Admin</strong> — Full access within their company. Can manage settings, users, teams, and all assessments.</li>
          <li><strong>Member</strong> — Access scoped to their role. Leaders see their own team&apos;s data and assessments they&apos;ve created. Reports are filtered to their teams and sub-teams only.</li>
        </ul>
        <p className="mt-2 italic text-primary/50">Why it matters: Assessment data is sensitive. Leaders should see their people, not everyone else&apos;s. Proper role-based access builds trust that the system is confidential.</p>
      </>
    ),
  },
  {
    id: "scoring",
    title: "Scoring Logic & Formulas",
    content: (
      <>
        <p className="font-semibold text-primary">How scores are calculated</p>
        <div className="mt-2 space-y-4">
          <div className="rounded-[4px] bg-primary/5 p-3">
            <p className="font-semibold text-primary/80">Culture Fit Score</p>
            <p className="mt-1">Average of all core value ratings.</p>
            <p className="mt-1">Rating values: Models = 10, Lives = 9, Occasional Challenges = 7, Frequent Challenges = 1</p>
            <p className="mt-1">Caps: If any core value is rated &quot;Occasional Challenges&quot;, the total cannot exceed 8.4. If any is &quot;Frequent Challenges&quot;, the total cannot exceed 7.4.</p>
            <p className="mt-1 text-xs text-primary/50">Example: 3 core values rated Lives (9), Lives (9), Occasional (7) → Average = 8.3, but capped at 8.4 → Final = 8.3</p>
          </div>
          <div className="rounded-[4px] bg-primary/5 p-3">
            <p className="font-semibold text-primary/80">Productivity Score</p>
            <p className="mt-1">Weighted average of all productivity targets, scored 0-10 based on actual vs target.</p>
            <p className="mt-1">For &quot;bigger is better&quot; targets: Score = (Actual / Target) × 10, capped at 10</p>
            <p className="mt-1">For &quot;smaller is better&quot; targets: Score = (Target / Actual) × 10, capped at 10</p>
            <p className="mt-1">If a minimum threshold is set: scoring at or below minimum = 0</p>
            <p className="mt-1">Monthly targets: each month is scored individually, then averaged for the quarter</p>
            <p className="mt-1 text-xs text-primary/50">Example: Revenue (weight 50%, target $100K, actual $90K) = 9.0. Closing Ratio (weight 50%, target 50%, actual 44%) = 8.8. Total = (9.0 × 0.5) + (8.8 × 0.5) = 8.9</p>
          </div>
          <div className="rounded-[4px] bg-primary/5 p-3">
            <p className="font-semibold text-primary/80">Category Assignment</p>
            <p className="mt-1">Default thresholds (configurable in Company Settings):</p>
            <ul className="mt-1 list-disc pl-5 space-y-1">
              <li><strong>HP</strong>: Culture Fit ≥ 9.0 AND Productivity ≥ 9.0</li>
              <li><strong>LCF</strong>: Culture Fit ≤ 7.5 (regardless of productivity)</li>
              <li><strong>LP</strong>: Productivity ≤ 6.5 (and not LCF)</li>
              <li><strong>MP</strong>: Everyone else</li>
            </ul>
          </div>
          <div className="rounded-[4px] bg-primary/5 p-3">
            <p className="font-semibold text-primary/80">TDI — Talent Density Index</p>
            <p className="mt-1">TDI = %HP − (%LP + %LCF)</p>
            <p className="mt-1">Range: -100% to +100%</p>
            <p className="mt-1 text-xs text-primary/50">Example: 10 people — 5 HP, 3 MP, 1 LP, 1 LCF → TDI = 50% − (10% + 10%) = +30%</p>
          </div>
        </div>
      </>
    ),
  },
  {
    id: "getting-started",
    title: "Getting Started (Company Admin Setup)",
    content: (
      <>
        <p className="font-semibold text-primary">Step-by-step setup guide</p>
        <ol className="list-decimal pl-5 space-y-2">
          <li><strong>Company Settings</strong> — Set your fiscal year start month. Review and adjust scoring thresholds if needed (defaults work for most companies).</li>
          <li><strong>Core Values</strong> — Enter your company&apos;s 3-5 core values. These are the behaviors you expect everyone to live by.</li>
          <li><strong>Teams</strong> — Create your team hierarchy. Start with the Senior Leadership Team, then add sub-teams (Sales, Marketing, etc.) with their leaders.</li>
          <li><strong>Team Members</strong> — Add members to each team with name and title.</li>
          <li><strong>Productivity Targets</strong> — For each team member, go to their detail page → Targets tab. Define 2-5 KPIs with weights totaling 100%.</li>
          <li><strong>First Assessment</strong> — Go to each member&apos;s detail page → Assessment tab. Rate core values, enter productivity actuals, and save.</li>
          <li><strong>Review</strong> — Visit the Talent Summary to see your first Talent Density Model and TDI score.</li>
        </ol>
        <div className="mt-3 rounded-[4px] border border-yellow-300 bg-yellow-50 p-3">
          <p className="font-semibold text-yellow-800">Common Setup Mistakes</p>
          <ul className="mt-1 list-disc pl-5 space-y-1 text-yellow-800">
            <li>Productivity target weights that don&apos;t add up to 100% — the assessment will still work but scores won&apos;t be accurate</li>
            <li>Forgetting to set the fiscal year start month — defaults to January, which may misalign your quarters</li>
            <li>Not entering all core value ratings during assessment — all must be rated for the category to calculate</li>
            <li>Deleting team members instead of archiving — you lose their assessment history for TDI reporting</li>
          </ul>
        </div>
      </>
    ),
  },
];

export default function HelpPage() {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["framework"]));

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function scrollToSection(id: string) {
    setOpenSections((prev) => new Set([...Array.from(prev), id]));
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  return (
    <div className="min-h-screen bg-white px-4 py-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-5xl lg:flex lg:gap-8">
        {/* Sidebar nav */}
        <nav className="hidden lg:block lg:w-48 lg:flex-shrink-0">
          <div className="sticky top-8 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/40 mb-2">Contents</p>
            {sections.map((s) => (
              <button key={s.id} onClick={() => scrollToSection(s.id)}
                className={`block w-full text-left px-2 py-1 text-xs rounded-[2px] transition ${openSections.has(s.id) ? "text-primary font-semibold bg-primary/5" : "text-primary/50 hover:text-primary"}`}>
                {s.title}
              </button>
            ))}
          </div>
        </nav>

        {/* Main content */}
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-primary">Help</h1>
          <p className="mt-1 text-sm text-primary/50">
            Learn how to use each feature and why it matters for building talent density.
          </p>

          <div className="mt-6 space-y-3">
            {sections.map((s) => (
              <Section key={s.id} section={s} isOpen={openSections.has(s.id)} onToggle={() => toggleSection(s.id)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
