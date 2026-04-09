"use client";

import { useEffect, useState } from "react";

interface Props {
  onStay: () => void;
  onLogout: () => void;
}

const WARNING_SECONDS = 120; // 2 minutes

export default function InactivityWarningModal({ onStay, onLogout }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(WARNING_SECONDS);

  useEffect(() => {
    setSecondsLeft(WARNING_SECONDS);

    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const countdownLabel =
    minutes > 0
      ? `${minutes}:${String(seconds).padStart(2, "0")}`
      : `${seconds}s`;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-primary/60">
      <div
        className="w-full max-w-sm rounded-[4px] bg-white p-8 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inactivity-title"
      >
        <h2
          id="inactivity-title"
          className="mb-2 text-lg font-bold uppercase tracking-wider text-primary"
        >
          Still there?
        </h2>
        <p className="mb-1 text-sm text-primary/70">
          You&apos;ve been inactive for a while. For security, you&apos;ll be
          logged out automatically in:
        </p>
        <p className="mb-6 text-3xl font-bold tabular-nums text-accent">
          {countdownLabel}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onStay}
            className="flex-1 rounded-[4px] bg-primary px-4 py-2 text-sm font-semibold uppercase tracking-wider text-white hover:bg-primary/90"
          >
            Stay Logged In
          </button>
          <button
            onClick={onLogout}
            className="flex-1 rounded-[4px] border border-brand-gray px-4 py-2 text-sm font-semibold uppercase tracking-wider text-primary hover:bg-gray-50"
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
