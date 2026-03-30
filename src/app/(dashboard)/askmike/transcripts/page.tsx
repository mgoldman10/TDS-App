"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getAllTranscripts, getTranscriptsForUser, getCoaches } from "@/lib/coach-service";
import type { Transcript, Coach } from "@/types/coach";

export default function TranscriptsPage() {
  const { profile } = useAuth();
  const router = useRouter();

  const isSuperadmin = profile?.role === "superadmin";

  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterCoach, setFilterCoach] = useState("");

  const loadData = useCallback(async () => {
    if (!profile) return;
    try {
      const [transcriptData, coachData] = await Promise.all([
        isSuperadmin ? getAllTranscripts() : getTranscriptsForUser(profile.uid),
        getCoaches().catch(() => []),
      ]);
      setTranscripts(transcriptData);
      setCoaches(coachData);
    } catch (err) {
      console.error("Failed to load transcripts:", err);
    }
    setLoading(false);
  }, [profile, isSuperadmin]);

  useEffect(() => {
    if (!profile) return;
    loadData();
  }, [profile, loadData]);

  const coachNameMap = new Map(coaches.map((c) => [c.id, c.name]));

  const filtered = filterCoach
    ? transcripts.filter((t) => t.coachId === filterCoach)
    : transcripts;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="animate-pulse text-lg font-light text-primary/70">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white px-4 py-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary">
              {isSuperadmin ? "All Transcripts" : "My Transcripts"}
            </h1>
            <p className="mt-1 text-sm text-primary/50">
              {filtered.length} conversation{filtered.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={() => router.push("/askmike")}
            className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-4 py-2 text-sm font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white"
          >
            Back to AskMike
          </button>
        </div>

        {/* Filter by coach */}
        {coaches.length > 0 && (
          <div className="mt-4 flex items-center gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/40">Filter:</span>
            <button
              onClick={() => setFilterCoach("")}
              className={`rounded-[4px] px-3 py-1 text-xs font-semibold transition ${!filterCoach ? "bg-primary text-white" : "border border-brand-gray text-primary/50 hover:text-primary"}`}
            >
              All
            </button>
            {coaches.map((c) => (
              <button
                key={c.id}
                onClick={() => setFilterCoach(filterCoach === c.id ? "" : c.id)}
                className={`rounded-[4px] px-3 py-1 text-xs font-semibold transition ${filterCoach === c.id ? "bg-primary text-white" : "border border-brand-gray text-primary/50 hover:text-primary"}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {filtered.length === 0 && (
          <p className="mt-8 text-sm font-light text-primary/70">No transcripts yet.</p>
        )}

        <div className="mt-6 space-y-3">
          {filtered.map((t) => (
            <div
              key={t.id}
              className="rounded-[4px] border border-brand-gray bg-white shadow-sm"
            >
              <button
                onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                className="flex w-full items-center justify-between p-4 text-left"
              >
                <div>
                  <p className="text-sm font-semibold text-primary">
                    {isSuperadmin && <span>{t.userDisplayName} · </span>}
                    <span className="text-primary/60">{coachNameMap.get(t.coachId) ?? "Coach"}</span>
                    {t.memberName && (
                      <span className="ml-2 font-normal text-primary/50">
                        — {t.memberName}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-primary/40">
                    {t.messages.length} messages ·{" "}
                    {t.createdAt?.toDate
                      ? t.createdAt.toDate().toLocaleDateString()
                      : ""}
                  </p>
                  {/* Preview of first user message */}
                  <p className="mt-0.5 truncate text-[10px] text-primary/30 max-w-lg">
                    {t.messages.find((m) => m.role === "user")?.content ?? ""}
                  </p>
                </div>
                <span className="text-sm text-primary/50">
                  {expandedId === t.id ? "▲" : "▼"}
                </span>
              </button>

              {expandedId === t.id && (
                <div className="border-t border-brand-gray p-4 space-y-2">
                  {t.messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`rounded-[4px] px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "ml-8 bg-primary/5 text-primary"
                          : "mr-8 border border-brand-gray bg-white text-primary"
                      }`}
                    >
                      <p className="text-[10px] font-semibold uppercase text-primary/30">
                        {msg.role === "user" ? t.userDisplayName : coachNameMap.get(t.coachId) ?? "AskMike"}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
