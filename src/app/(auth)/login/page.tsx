"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

function getErrorMessage(code: string): string {
  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    default:
      return "An error occurred. Please try again.";
  }
}

export default function LoginPage() {
  const { user, profile, error: authError } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && profile) {
      router.replace("/dashboard");
    }
  }, [user, profile, router]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("Enter your email address first, then click Forgot Password.");
      return;
    }
    try {
      const res = await fetch("/api/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) throw new Error();
      setResetSent(true);
      setError("");
    } catch {
      setError("Failed to send reset email. Check your email address.");
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      setError(getErrorMessage(firebaseError.code ?? ""));
    }

    setSubmitting(false);
  };

  const displayError = error || authError;

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-md rounded-[4px] border border-brand-gray bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-primary">
            Talent Density System
          </h1>
          <h2 className="mt-6 text-2xl font-semibold text-primary">
            Sign In
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium uppercase tracking-wider text-primary"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-4 py-3 text-primary outline-none focus:border-primary"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium uppercase tracking-wider text-primary"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-4 py-3 text-primary outline-none focus:border-primary"
            />
          </div>

          {displayError && (
            <p className="text-sm text-accent">{displayError}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-[4px] bg-primary py-3 font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Signing in..." : "Sign In"}
          </button>

          <button
            type="button"
            onClick={handleForgotPassword}
            className="mt-3 w-full text-center text-sm text-primary/50 transition hover:text-primary"
          >
            Forgot Password?
          </button>

          {resetSent && (
            <p className="mt-2 text-center text-sm text-primary/70">
              Password reset email sent! Check your inbox.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
