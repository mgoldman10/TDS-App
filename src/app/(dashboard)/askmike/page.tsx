"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

export default function AskMikePage() {
  const { profile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!profile) return;
    if (profile.role !== "superadmin") router.replace("/dashboard");
  }, [profile, router]);

  if (!profile || profile.role !== "superadmin") return null;

  return (
    <div className="min-h-screen bg-white px-4 py-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-primary">AskMike</h1>
        <p className="mt-1 text-sm text-primary/50">
          Manage coach instructions and review chat transcripts.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href="/askmike/admin"
            className="rounded-[4px] border border-brand-gray bg-white p-5 shadow-sm transition hover:border-primary"
          >
            <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">Manage Coaches</h2>
            <p className="mt-2 text-xs text-primary/50">
              View and modify the system prompts and chat intros for each AskMike coach.
            </p>
          </Link>

          <Link
            href="/askmike/transcripts"
            className="rounded-[4px] border border-brand-gray bg-white p-5 shadow-sm transition hover:border-primary"
          >
            <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">Transcripts</h2>
            <p className="mt-2 text-xs text-primary/50">
              Review chat history across all coaches and users.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
