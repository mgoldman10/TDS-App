"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { ensureDefaultCoaches } from "@/lib/coach-service";
import { getAllTeamMembers } from "@/lib/team-service";
import ChatPanel from "@/components/askmike/ChatPanel";
import type { Coach } from "@/types/coach";
import type { TeamMember } from "@/types/team";

export default function AskMikePage() {
  const { profile } = useAuth();
  const { activeCompany } = useCompany();
  const router = useRouter();

  const companyId = activeCompany?.id ?? profile?.companyId;

  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [activeCoach, setActiveCoach] = useState<Coach | null>(null);

  useEffect(() => {
    if (!profile || !companyId) { setLoading(false); return; }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, companyId]);

  async function loadData() {
    try {
      const [coachData, memberData] = await Promise.all([
        ensureDefaultCoaches(),
        getAllTeamMembers(companyId!),
      ]);
      setCoaches(coachData);
      setMembers(memberData.filter((m) => (m.status ?? "active") === "active"));
    } catch (err) {
      console.error("Load error:", err);
    }
    setLoading(false);
  }

  function openCoachForOther(coach: Coach) {
    setActiveCoach(coach);
    setShowChat(true);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="animate-pulse text-lg font-light text-primary/70">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white px-4 py-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary">AskMike</h1>
            <p className="mt-1 text-sm text-primary/50">
              AI-powered coaching to help you take the right actions with your team members.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/askmike/transcripts"
              className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-4 py-2 text-sm font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white"
            >
              Transcripts
            </Link>
            {profile?.role === "superadmin" && (
              <Link
                href="/askmike/admin"
                className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-4 py-2 text-sm font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white"
              >
                Manage Coaches
              </Link>
            )}
          </div>
        </div>

        {/* Coaches */}
        <div className="mt-6 space-y-4">
          {coaches.map((coach) => (
            <div key={coach.id} className="rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-primary">{coach.name}</h2>
              <p className="mt-1 text-xs text-primary/50">{coach.description}</p>
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-primary/40">
                Select a team member to start coaching:
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {members.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => router.push(`/members/${m.id}`)}
                    className="rounded-full border border-brand-gray bg-white px-3 py-1.5 text-xs font-semibold text-primary transition hover:border-primary hover:bg-primary/5"
                  >
                    {m.name}
                  </button>
                ))}
                <button
                  onClick={() => openCoachForOther(coach)}
                  className="rounded-full border border-dashed border-primary/30 bg-white px-3 py-1.5 text-xs font-semibold text-primary/50 transition hover:border-primary hover:text-primary hover:bg-primary/5"
                >
                  Other...
                </button>
              </div>
            </div>
          ))}
          {coaches.length === 0 && (
            <p className="text-sm text-primary/40">No coaches available. They will be created automatically when you visit a team member&apos;s detail page.</p>
          )}
        </div>
      </div>

      {/* ChatPanel for "Other" coaching */}
      {activeCoach && (
        <ChatPanel
          coachId={activeCoach.id}
          coachName={activeCoach.name}
          chatIntro={activeCoach.chatIntro}
          context="The user wants to discuss someone who is not in the system as a team member. Ask them to describe the person and situation."
          isOpen={showChat}
          onClose={() => setShowChat(false)}
          userId={profile?.uid ?? ""}
          userDisplayName={profile?.displayName ?? ""}
          companyId={companyId ?? ""}
        />
      )}
    </div>
  );
}
