"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getCompany } from "@/lib/company-service";
import type { Company } from "@/types/company";

interface CompanyState {
  activeCompany: Company | null;
  setActiveCompanyId: (id: string) => void;
  clearActiveCompany: () => void;
  loading: boolean;
}

const CompanyContext = createContext<CompanyState | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(false);

  // For non-superadmin users, auto-load their company
  useEffect(() => {
    if (!profile) return;
    if (profile.role !== "superadmin" && profile.companyId) {
      loadCompany(profile.companyId);
    }
  }, [profile]);

  async function loadCompany(companyId: string) {
    setLoading(true);
    try {
      const company = await getCompany(companyId);
      setActiveCompany(company);
    } catch {
      // silently handle
    }
    setLoading(false);
  }

  function setActiveCompanyId(id: string) {
    loadCompany(id);
  }

  function clearActiveCompany() {
    setActiveCompany(null);
  }

  return (
    <CompanyContext.Provider
      value={{ activeCompany, setActiveCompanyId, clearActiveCompany, loading }}
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
