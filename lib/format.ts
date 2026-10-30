const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Format a date as dd-MMM-yyyy (e.g. 02-Oct-2026). UTC-based, IST-display safe. */
export function fmtDate(d: Date | string | null | undefined): string {
  if (d === null || d === undefined) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const mmm = MONTHS[dt.getUTCMonth()];
  return `${dd}-${mmm}-${dt.getUTCFullYear()}`;
}

/** Format a date as dd-MMM-yyyy in Asia/Kolkata (e.g. 09-Oct-2026). */
export function fmtDateIST(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  })
    .format(date)
    .replace(/ /g, "-");
}

/** Date + short time for feed entries (e.g. 09-Oct-2026 14:32). */
export function fmtDateTimeIST(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  const day = fmtDateIST(date);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(date);
  return `${day} ${time}`;
}

// Re-exported for callers that already import date formatting from here.
// The implementation lives in `lib/dates.ts` so overdue logic exists once.
export { isOverdue } from "./dates";
