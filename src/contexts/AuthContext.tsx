"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserMemberships, resolveUser } from "@/lib/auth-service";
import type {
  AuthState,
  CompanyMembership,
  UserProfile,
} from "@/types/auth";

const ACTIVE_COMPANY_KEY = "tds-active-company";

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [memberships, setMemberships] = useState<CompanyMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const signingOutRef = useRef(false);

  const loadProfile = useCallback(
    async (firebaseUser: User, preferredCompanyId?: string) => {
      const [resolved, mems] = await Promise.all([
        resolveUser(firebaseUser.uid, preferredCompanyId),
        getUserMemberships(firebaseUser.uid),
      ]);

      if (!resolved) {
        setProfile(null);
        setMemberships([]);
        setError("Account not provisioned. Contact your administrator.");
        signingOutRef.current = true;
        await firebaseSignOut(auth);
        return;
      }

      if (resolved.isActive === false) {
        setProfile(null);
        setMemberships([]);
        setError("This account has been deactivated. Contact your administrator.");
        signingOutRef.current = true;
        await firebaseSignOut(auth);
        return;
      }

      setProfile(resolved);
      setMemberships(mems);
    },
    []
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setProfile(null);
        setMemberships([]);
        if (!signingOutRef.current) setError(null);
        setLoading(false);
        signingOutRef.current = false;
        return;
      }

      setError(null);
      setUser(firebaseUser);

      const preferred =
        typeof window !== "undefined"
          ? localStorage.getItem(ACTIVE_COMPANY_KEY) ?? undefined
          : undefined;

      try {
        await loadProfile(firebaseUser, preferred);
      } catch {
        setError("Failed to load user profile.");
        setProfile(null);
        setMemberships([]);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, [loadProfile]);

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setProfile(null);
    setMemberships([]);
  };

  const refreshProfile = useCallback(
    async (preferredCompanyId?: string) => {
      if (!user) return;
      try {
        await loadProfile(user, preferredCompanyId);
      } catch {
        setError("Failed to load user profile.");
      }
    },
    [user, loadProfile]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        memberships,
        loading,
        error,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
