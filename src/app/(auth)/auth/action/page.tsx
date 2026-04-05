"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  verifyPasswordResetCode,
  confirmPasswordReset,
  applyActionCode,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Suspense } from "react";

function AuthActionContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const mode = searchParams.get("mode");
  const oobCode = searchParams.get("oobCode");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!oobCode) {
      setError("Invalid or missing action code.");
      setLoading(false);
      return;
    }

    if (mode === "resetPassword") {
      verifyPasswordResetCode(auth, oobCode)
        .then((email) => {
          setEmail(email);
          setLoading(false);
        })
        .catch(() => {
          setError("This password reset link has expired or already been used.");
          setLoading(false);
        });
    } else if (mode === "verifyEmail") {
      applyActionCode(auth, oobCode)
        .then(() => {
          setSuccess("Your email has been verified!");
          setLoading(false);
        })
        .catch(() => {
          setError("This verification link has expired or already been used.");
          setLoading(false);
        });
    } else {
      setError("Unknown action.");
      setLoading(false);
    }
  }, [mode, oobCode]);

  async function handleResetPassword() {
    if (!oobCode) return;
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPw) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setSuccess("Your password has been set! Redirecting to login...");
      setTimeout(() => router.push("/login"), 2500);
    } catch {
      setError("Failed to reset password. The link may have expired.");
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <p className="animate-pulse text-lg font-light text-primary/70">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-md rounded-[4px] border border-brand-gray bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-primary">
            Talent Density System
          </h1>
        </div>

        {/* Password Reset Form */}
        {mode === "resetPassword" && !success && (
          <>
            <h2 className="mt-6 text-center text-2xl font-semibold text-primary">
              Set Your Password
            </h2>
            {email && (
              <p className="mt-2 text-center text-sm text-primary/50">{email}</p>
            )}

            <div className="mt-8 space-y-5">
              <div>
                <label className="block text-sm font-medium uppercase tracking-wider text-primary">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-4 py-3 text-primary outline-none focus:border-primary"
                  placeholder="At least 6 characters"
                />
              </div>

              <div>
                <label className="block text-sm font-medium uppercase tracking-wider text-primary">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-4 py-3 text-primary outline-none focus:border-primary"
                />
              </div>

              {error && <p className="text-sm text-accent">{error}</p>}

              <button
                onClick={handleResetPassword}
                disabled={submitting}
                className="w-full rounded-[4px] bg-primary py-3 font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Setting Password..." : "Set Password"}
              </button>
            </div>
          </>
        )}

        {/* Email Verification */}
        {mode === "verifyEmail" && !success && !error && (
          <p className="mt-6 text-center text-sm text-primary/70">Verifying your email...</p>
        )}

        {/* Success Message */}
        {success && (
          <div className="mt-6 text-center">
            <p className="text-sm font-medium text-primary">{success}</p>
            <button
              onClick={() => router.push("/login")}
              className="mt-4 rounded-[4px] bg-primary px-6 py-3 font-semibold uppercase tracking-wider text-white transition hover:opacity-90"
            >
              Go to Login
            </button>
          </div>
        )}

        {/* Error with no form */}
        {error && mode !== "resetPassword" && (
          <div className="mt-6 text-center">
            <p className="text-sm text-accent">{error}</p>
            <button
              onClick={() => router.push("/login")}
              className="mt-4 rounded-[4px] bg-primary px-6 py-3 font-semibold uppercase tracking-wider text-white transition hover:opacity-90"
            >
              Go to Login
            </button>
          </div>
        )}

        {/* Error on expired reset link */}
        {error && mode === "resetPassword" && !email && (
          <div className="mt-6 text-center">
            <p className="text-sm text-accent">{error}</p>
            <button
              onClick={() => router.push("/login")}
              className="mt-4 rounded-[4px] bg-primary px-6 py-3 font-semibold uppercase tracking-wider text-white transition hover:opacity-90"
            >
              Go to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuthActionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white">
          <p className="animate-pulse text-lg font-light text-primary/70">Loading...</p>
        </div>
      }
    >
      <AuthActionContent />
    </Suspense>
  );
}
