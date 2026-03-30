"use client";

interface Props {
  onClick: () => void;
  label?: string;
}

export default function AskMikeButton({ onClick, label = "AskMike" }: Props) {
  return (
    <button
      onClick={onClick}
      className="rounded-full bg-accent px-5 py-2 text-sm font-semibold uppercase tracking-wider text-white shadow-md transition hover:opacity-90 hover:shadow-lg"
    >
      {label}
    </button>
  );
}
