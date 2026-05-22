import StagingBadge from "@/components/StagingBadge";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="fixed top-3 right-3 z-50">
        <StagingBadge />
      </div>
      {children}
    </>
  );
}
