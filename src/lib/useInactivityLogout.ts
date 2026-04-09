"use client";

import { useEffect, useRef, useCallback } from "react";

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE_MS = 2 * 60 * 1000;       // warn 2 minutes before logout

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
] as const;

interface Options {
  onWarn: () => void;    // called when warning should appear
  onLogout: () => void;  // called when session should be terminated
  enabled: boolean;
}

export function useInactivityLogout({ onWarn, onLogout, enabled }: Options) {
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
    if (warningTimer.current) clearTimeout(warningTimer.current);
  }, []);

  const resetTimers = useCallback(() => {
    clearTimers();
    warningTimer.current = setTimeout(onWarn, INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_MS);
    logoutTimer.current = setTimeout(onLogout, INACTIVITY_TIMEOUT_MS);
  }, [clearTimers, onWarn, onLogout]);

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      return;
    }

    resetTimers();

    const handleActivity = () => resetTimers();

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [enabled, resetTimers, clearTimers]);

  // Expose reset so the "Stay logged in" button can call it
  return { resetTimers };
}
