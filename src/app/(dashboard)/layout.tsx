"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import LoadingScreen from "@/components/LoadingScreen";
import Sidebar from "@/components/Sidebar";
import InactivityWarningModal from "@/components/InactivityWarningModal";
import { useInactivityLogout } from "@/lib/useInactivityLogout";
import { CompanyProvider } from "@/contexts/CompanyContext";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !profile)) {
      router.replace("/login");
    }
  }, [loading, user, profile, router]);

  const handleWarn = useCallback(() => setShowWarning(true), []);
  const handleLogout = useCallback(async () => {
    setShowWarning(false);
    await signOut();
  }, [signOut]);

  const { resetTimers } = useInactivityLogout({
    onWarn: handleWarn,
    onLogout: handleLogout,
    enabled: !loading && !!user && !!profile,
  });

  const handleStay = useCallback(() => {
    setShowWarning(false);
    resetTimers();
  }, [resetTimers]);

  if (loading) return <LoadingScreen />;
  if (!user || !profile) return <LoadingScreen />;

  return (
    <CompanyProvider>
    <div className="flex h-screen">
      {showWarning && (
        <InactivityWarningModal onStay={handleStay} onLogout={handleLogout} />
      )}
      {/* Mobile top bar */}
      <div className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between border-b border-brand-gray px-4 lg:hidden" style={{ backgroundColor: "#212121" }}>
        <button
          onClick={() => setSidebarOpen(true)}
          className="text-2xl text-white"
        >
          ☰
        </button>
        <span className="text-sm font-extrabold tracking-tight text-white">
          Talent Density Systems
        </span>
        <div className="w-8" />
      </div>

      {/* Sidebar — always visible on desktop, drawer on mobile */}
      <div className="hidden lg:block">
        <Sidebar onNavigate={() => {}} />
      </div>

      {/* Mobile drawer overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 bg-primary/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={`fixed left-0 top-0 z-50 h-full transform transition-transform duration-200 lg:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">{children}</main>
      </div>
    </div>
    </CompanyProvider>
  );
}
