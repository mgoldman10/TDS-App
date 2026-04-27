"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useTheme } from "@/contexts/ThemeContext";
import { isAtLeast } from "@/types/auth";

interface NavItem {
  label: string;
  href: string;
  minRole?: "company_admin" | "senior_leader" | "leader";
  superadminOnly?: boolean;
  companyScoped?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "My Work",
    items: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Teams & Users", href: "/teams", minRole: "leader", companyScoped: true },
    ],
  },
  {
    label: "Talent",
    items: [
      { label: "Talent Summary", href: "/talent-summary", companyScoped: true },
      { label: "Reports", href: "/reports", minRole: "senior_leader", companyScoped: true },
    ],
  },
  {
    label: "Setup",
    items: [
      { label: "Core Values", href: "/core-values", companyScoped: true },
      { label: "Company Settings", href: "/settings/company", minRole: "company_admin", companyScoped: true },
      { label: "AskMike", href: "/askmike", superadminOnly: true, companyScoped: true },
    ],
  },
  {
    label: "",
    items: [
      { label: "Help", href: "/help" },
      { label: "Admin", href: "/admin", superadminOnly: true },
    ],
  },
];

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, signOut } = useAuth();
  const { activeCompany, clearActiveCompany } = useCompany();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();

  if (!profile) return null;

  const isSuperadmin = profile.role === "superadmin";
  const hasCompany = !!activeCompany;

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  function isVisible(item: NavItem) {
    if (item.superadminOnly && !isSuperadmin) return false;
    if (item.minRole && !isAtLeast(profile!.role, item.minRole)) return false;
    if (item.companyScoped && isSuperadmin && !hasCompany) return false;
    return true;
  }

  return (
    <aside className="flex h-screen w-56 flex-shrink-0 flex-col border-r border-brand-gray" style={{ backgroundColor: "#212121" }}>
      {/* Logo */}
      <div className="px-6 py-4">
        <Link href="/dashboard" className="text-lg font-extrabold tracking-tight text-white">
          Talent Density Systems
        </Link>
      </div>

      {/* Active Company Indicator */}
      {isSuperadmin && hasCompany && (
        <div className="mx-3 mb-3 rounded-[4px] bg-white/10 px-3 py-2">
          <p className="text-xs font-light uppercase tracking-wider text-white/50">
            Company
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-white">
            {activeCompany.name}
          </p>
          <Link
            href="/admin"
            onClick={clearActiveCompany}
            className="mt-1 inline-block text-xs text-accent transition hover:opacity-70"
          >
            Switch Company
          </Link>
        </div>
      )}

      {isSuperadmin && !hasCompany && (
        <div className="mx-3 mb-3 rounded-[4px] border border-white/10 px-3 py-2">
          <p className="text-xs font-light text-white/40">
            Select a company from Admin to access company features.
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3">
        {NAV_GROUPS.map((group, groupIdx) => {
          const visibleItems = group.items.filter(isVisible);
          if (visibleItems.length === 0) return null;
          const isFirst = groupIdx === 0;
          return (
            <div key={group.label || "_bottom"} className="mb-2">
              {group.label && (
                <>
                  {!isFirst && <div className="mx-3 mb-1 mt-0.5 border-t-2 border-white/20" />}
                  <p className={`mb-0.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/50 ${isFirst ? "pt-0" : ""}`}>
                    {group.label}
                  </p>
                </>
              )}
              {!group.label && !isFirst && <div className="mx-3 mb-1 mt-0.5 border-t-2 border-white/20" />}
              <ul className="space-y-0">
                {visibleItems.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={`block rounded-[4px] px-3 py-1.5 text-sm font-semibold uppercase tracking-wider transition ${
                          active
                            ? "bg-white/10 text-white"
                            : "text-white/60 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* User & Theme & Sign Out */}
      <div className="border-t-2 border-white/20 px-4 py-3">
        <p className="truncate text-xs font-light text-white/50">
          {profile.displayName || profile.email}
        </p>
        <p className="mt-0.5 text-xs font-light text-white/30">
          {profile.role.replace("_", " ")}
        </p>
        <button
          onClick={toggleTheme}
          className="mt-3 flex w-full items-center justify-between rounded-[4px] border border-white/20 bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/60 transition hover:border-white/40 hover:text-white"
        >
          <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          <span className="text-sm">{theme === "dark" ? "☀" : "☾"}</span>
        </button>
        <button
          onClick={signOut}
          className="mt-2 w-full rounded-[4px] border border-white/20 bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/60 transition hover:border-white/40 hover:text-white"
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}
