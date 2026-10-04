export function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${value > 0 ? "+" : ""}${value}%`;
}

/** A source-qualified UTC date is stable across server and browser hydration. */
export function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Never use the host locale for server-rendered audit timestamps: Node and the
 * browser can have distinct locale and timezone settings. This UTC format is
 * intentionally deterministic for SSR and hydration.
 */
export function formatTimestamp(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "Timestamp unavailable";
  return `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

export function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
