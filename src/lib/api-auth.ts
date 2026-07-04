import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import type { UserRole } from "@/types/auth";

export class ApiAuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiAuthError";
  }
}

export type VerifiedCaller = { uid: string; email: string | null };
export type CallerTenant = {
  uid: string;
  companyId: string;
  role: UserRole;
  isSuperadmin: boolean;
};

/** Verify the Firebase ID token in the Authorization: Bearer header. 401 on any failure. */
export async function verifyApiCaller(request: Request | NextRequest): Promise<VerifiedCaller> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    throw new ApiAuthError(401, "Missing or malformed Authorization header");
  }
  const token = authHeader.slice(7).trim();
  if (!token) throw new ApiAuthError(401, "Empty bearer token");
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch (err) {
    console.warn("[api-auth] Token verification failed:", err);
    throw new ApiAuthError(401, "Invalid or expired token");
  }
}

/** Is this uid a superadmin? Canonical: existence at /superadmin/{uid}. */
export async function isCallerSuperadmin(uid: string): Promise<boolean> {
  return (await getAdminDb().doc(`superadmin/${uid}`).get()).exists;
}

/** Throw 403 unless the caller is a superadmin. For superadmin-only ops (e.g. delete company). */
export async function requireSuperadmin(uid: string): Promise<void> {
  if (!(await isCallerSuperadmin(uid))) throw new ApiAuthError(403, "Superadmin required");
}

/**
 * Validate the caller's access to a SPECIFIC requested tenant. companyId from the
 * request body is a HINT, validated here — never a grant. Role is read from the
 * tenant user doc (source of truth), NOT from userMappings (which can lag).
 */
export async function resolveTargetTenant(
  uid: string,
  requestedCompanyId: string
): Promise<CallerTenant> {
  const db = getAdminDb();
  const isSuperadmin = await isCallerSuperadmin(uid);

  const companySnap = await db.doc(`companies/${requestedCompanyId}`).get();
  if (!companySnap.exists) {
    throw new ApiAuthError(isSuperadmin ? 404 : 403,
      isSuperadmin ? "Tenant not found" : "Not a member of requested tenant");
  }

  if (isSuperadmin) {
    return { uid, companyId: requestedCompanyId, role: "superadmin", isSuperadmin: true };
  }

  const userSnap = await db.doc(`companies/${requestedCompanyId}/users/${uid}`).get();
  if (!userSnap.exists) throw new ApiAuthError(403, "Not a member of requested tenant");
  if (userSnap.data()?.isActive === false) throw new ApiAuthError(403, "Membership is archived");

  const role = (userSnap.data()?.role as UserRole | undefined) ?? "leader";
  return { uid, companyId: requestedCompanyId, role, isSuperadmin: false };
}

/** Turn an ApiAuthError into a JSON response; re-throw anything else. */
export function apiAuthErrorResponse(err: unknown): NextResponse {
  if (err instanceof ApiAuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  throw err;
}
