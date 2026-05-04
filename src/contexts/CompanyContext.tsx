"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getCompany } from "@/lib/company-service";
import type { Company } from "@/types/company";

const ACTIVE_COMPANY_KEY = "tds-active-company";

interface CompanyState {
  activeCompany: Company | null;
  setActiveCompanyId: (id: string) => Promise<void>;
  clearActiveCompany: () => void;
  loading: boolean;
  needsPicker: boolean;
  pickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
}

const CompanyContext = createContext<CompanyState | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { profile, memberships, refreshProfile } = useAuth();
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsPicker, setNeedsPicker] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const loadCompany = useCallback(async (companyId: string) => {
    setLoading(true);
    try {
      const company = await getCompany(companyId);
      if (company && company.isActive !== false) {
        setActiveCompany(company);
        if (typeof window !== "undefined") {
          localStorage.setItem(ACTIVE_COMPANY_KEY, companyId);
        }
      } else {
        // Either company doesn't exist or it has been archived. Don't pin
        // the user to a dead selection — clear the saved choice and let
        // the picker / membership logic re-resolve.
        setActiveCompany(null);
        if (typeof window !== "undefined") {
          localStorage.removeItem(ACTIVE_COMPANY_KEY);
        }
      }
    } catch {
      // silently handle
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!profile) {
      setActiveCompany(null);
      setNeedsPicker(false);
      return;
    }

    // Superadmin: pick from /admin (existing flow). Restore last selection if any.
    if (profile.role === "superadmin") {
      const savedId =
        typeof window !== "undefined"
          ? localStorage.getItem(ACTIVE_COMPANY_KEY)
          : null;
      if (savedId && (!activeCompany || activeCompany.id !== savedId)) {
        loadCompany(savedId);
      }
      setNeedsPicker(false);
      return;
    }

    // Company users: drive from memberships
    if (memberships.length === 0) {
      setActiveCompany(null);
      setNeedsPicker(false);
      return;
    }

    if (memberships.length === 1) {
      const only = memberships[0].companyId;
      if (!activeCompany || activeCompany.id !== only) {
        loadCompany(only);
      }
      setNeedsPicker(false);
      return;
    }

    // Multi-membership: prefer saved choice; otherwise fall back + flag picker
    const savedId =
      typeof window !== "undefined"
        ? localStorage.getItem(ACTIVE_COMPANY_KEY)
        : null;
    const matched =
      savedId && memberships.find((m) => m.companyId === savedId);

    if (matched) {
      if (!activeCompany || activeCompany.id !== matched.companyId) {
        loadCompany(matched.companyId);
      }
      setNeedsPicker(false);
    } else {
      const fallback = memberships[0].companyId;
      if (!activeCompany || activeCompany.id !== fallback) {
        loadCompany(fallback);
      }
      setNeedsPicker(true);
    }
  }, [profile, memberships, loadCompany, activeCompany]);

  const setActiveCompanyId = useCallback(
    async (id: string) => {
      await loadCompany(id);
      // For company users, switching company changes role/teamIds — refresh
      // the profile so the rest of the UI keys off the right membership.
      if (profile && profile.role !== "superadmin") {
        await refreshProfile(id);
      }
      setNeedsPicker(false);
      setPickerOpen(false);
    },
    [loadCompany, profile, refreshProfile]
  );

  const clearActiveCompany = useCallback(() => {
    setActiveCompany(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(ACTIVE_COMPANY_KEY);
    }
  }, []);

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  return (
    <CompanyContext.Provider
      value={{
        activeCompany,
        setActiveCompanyId,
        clearActiveCompany,
        loading,
        needsPicker,
        pickerOpen,
        openPicker,
        closePicker,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany(): CompanyState {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error("useCompany must be used within a CompanyProvider");
  }
  return context;
}
