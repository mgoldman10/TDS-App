"use client";

const COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#f43f5e",
  "#0891b2", "#059669", "#d97706", "#7c3aed", "#db2777",
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getColor(name: string): string {
  return COLORS[hashName(name) % COLORS.length];
}

interface Props {
  name: string;
  size?: "sm" | "md" | "lg";
  category?: "HP" | "MP" | "LP" | "LCF";
}

const SIZES = {
  sm: { container: "h-6 w-6", text: "text-[9px]" },
  md: { container: "h-8 w-8", text: "text-[11px]" },
  lg: { container: "h-10 w-10", text: "text-xs" },
};

const CATEGORY_BG: Record<string, string> = {
  HP: "#22c55e",
  MP: "#eab308",
  LP: "#ef4444",
  LCF: "#ef4444",
};

export default function UserAvatar({ name, size = "sm", category }: Props) {
  if (!name) return null;
  const initials = getInitials(name);
  const bg = category ? CATEGORY_BG[category] : getColor(name);
  const s = SIZES[size];

  return (
    <div
      className={`${s.container} flex flex-shrink-0 items-center justify-center rounded-full font-semibold text-white`}
      style={{ backgroundColor: bg }}
      title={name}
    >
      <span className={s.text}>{initials}</span>
    </div>
  );
}

export { getInitials, getColor, CATEGORY_BG };
