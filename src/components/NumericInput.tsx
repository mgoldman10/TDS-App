"use client";

import { useEffect, useState } from "react";
import { formatNumber, stripCommas } from "@/lib/formatNumber";

type Props = {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

function toDisplay(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return formatNumber(v);
}

function formatPartial(raw: string): string {
  if (raw === "" || raw === "-") return raw;
  const negative = raw.startsWith("-");
  const body = negative ? raw.slice(1) : raw;
  const [intPart, decPart] = body.split(".");
  const intFormatted = intPart === "" ? "" : intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const result = decPart !== undefined ? `${intFormatted}.${decPart}` : intFormatted;
  return (negative ? "-" : "") + result;
}

export default function NumericInput({
  value,
  onChange,
  disabled,
  placeholder,
  className,
}: Props) {
  const [text, setText] = useState<string>(toDisplay(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (focused) return;
    setText(toDisplay(value));
  }, [value, focused]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = stripCommas(e.target.value);
    if (raw !== "" && !/^-?\d*\.?\d*$/.test(raw)) return;
    setText(formatPartial(raw));
    if (raw === "" || raw === "-" || raw === "." || raw === "-.") {
      onChange(null);
      return;
    }
    const n = parseFloat(raw);
    if (!isNaN(n)) onChange(n);
  }

  function handleBlur() {
    setFocused(false);
    setText(toDisplay(value));
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={handleChange}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
    />
  );
}
