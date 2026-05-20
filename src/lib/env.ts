/**
 * Environment awareness helpers.
 *
 * NEXT_PUBLIC_ENVIRONMENT is a build-time env var set per deployment
 * context. Expected values:
 *   - "production"  — Netlify production build, Firebase project tds-app-b8493
 *   - "staging"     — Netlify staging build, Firebase project tds-app-staging
 *   - "development" — local `npm run dev`, points at whichever Firebase
 *                     project is in .env.local (currently production)
 *
 * Set in Netlify deploy contexts in Phase 4. Falls back to "development"
 * if unset so local dev always works without extra config.
 *
 * On first client-side load also runs a sanity check: if the declared
 * environment doesn't match the known Firebase project ID, a loud
 * console.error fires. Catches misconfigured Netlify contexts at first
 * page load instead of letting prod data get hit while the UI says
 * "staging" (or vice versa).
 */

export type Environment = "production" | "staging" | "development";

const PRODUCTION_PROJECT_ID = "tds-app-b8493";
const STAGING_PROJECT_ID = "tds-app-staging";

export function getEnvironment(): Environment {
  const raw = process.env.NEXT_PUBLIC_ENVIRONMENT;
  if (raw === "production" || raw === "staging") return raw;
  return "development";
}

export function isProduction(): boolean {
  return getEnvironment() === "production";
}

export function isStaging(): boolean {
  return getEnvironment() === "staging";
}

// One-shot startup validation. Client-side only — server-side this would
// spam logs on every SSR pass and the env vars are inlined at build time
// anyway, so the answer is identical.
if (typeof window !== "undefined") {
  const env = getEnvironment();
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (env === "production" && projectId !== PRODUCTION_PROJECT_ID) {
    console.error(
      `ENV MISMATCH: NEXT_PUBLIC_ENVIRONMENT=production but Firebase project is "${projectId}". ` +
        `Expected "${PRODUCTION_PROJECT_ID}". This is a misconfiguration — fix the Netlify env vars.`
    );
  } else if (env === "staging" && projectId !== STAGING_PROJECT_ID) {
    console.error(
      `ENV MISMATCH: NEXT_PUBLIC_ENVIRONMENT=staging but Firebase project is "${projectId}". ` +
        `Expected "${STAGING_PROJECT_ID}". This is a misconfiguration — fix the Netlify env vars.`
    );
  }
}
