"use client";

import { getEnvironment } from "@/lib/env";

/**
 * Environment indicator pill — visible in staging and local-dev,
 * returns null in production. Mounted in the dashboard sidebar header
 * and the mobile top bar so it's visible on every screen. Acts as a
 * safety reminder so anyone using the app notices immediately when
 * they're on staging (test data) vs production (real client data).
 */
export default function StagingBadge() {
  const env = getEnvironment();
  if (env === "production") return null;
  const label = env === "staging" ? "STAGING" : "DEV";
  return (
    <span className="rounded-[2px] bg-accent px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-white">
      {label}
    </span>
  );
}
