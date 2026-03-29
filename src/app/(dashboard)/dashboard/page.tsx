"use client";

import { useAuth } from "@/contexts/AuthContext";

export default function DashboardPage() {
  const { profile } = useAuth();

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-white px-4 py-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
        <p className="mt-2 text-sm text-primary/50">
          Welcome, {profile.displayName}. Your talent density dashboard will appear here.
        </p>
      </div>
    </div>
  );
}
