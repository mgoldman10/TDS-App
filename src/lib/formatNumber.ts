/** Format a number with commas as thousands separator */
export function formatNumber(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "";
  // Handle decimals
  const parts = num.toString().split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

/** Strip commas from a formatted number string for parsing */
export function stripCommas(value: string): string {
  return value.replace(/,/g, "");
}

/** Parse a potentially comma-formatted string to a number */
export function parseFormattedNumber(value: string): number {
  return parseFloat(stripCommas(value)) || 0;
}
