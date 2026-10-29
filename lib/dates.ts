/**
 * One place for calendar-date arithmetic.
 *
 * `Task.dueDate` is a PostgreSQL `date`, which Prisma returns as a `Date` at
 * UTC midnight. The business day is Asia/Kolkata, so "today" must be computed
 * in IST and then represented as UTC midnight — never with the server's local
 * timezone. Every overdue/due-bucket comparison goes through this module.
 */

export const APP_TIME_ZONE = "Asia/Kolkata";

/**
 * A calendar day as UTC midnight — the shape Prisma returns for `@db.Date`.
 * A date-only string ("2026-10-29") is already UTC midnight; a timestamp is
 * truncated to its UTC calendar day.
 */
export function utcDay(value: Date | string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date(Number.NaN);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

/** Today in the app timezone, represented as UTC midnight. */
export function todayIst(now: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Monday 00:00 of the current week in the app timezone, as UTC midnight. */
export function startOfWeekIst(now: Date = new Date()): Date {
  const day = todayIst(now);
  const weekday = (day.getUTCDay() + 6) % 7; // Monday = 0
  day.setUTCDate(day.getUTCDate() - weekday);
  return day;
}

/**
 * True when a due date is strictly before today in the app timezone and the
 * task is not completed.
 */
export function isOverdue(
  dueDate: Date | string | null | undefined,
  status: string,
  today: Date = new Date(),
): boolean {
  if (!dueDate || status === "COMPLETED" || status === "completed") return false;
  const due = utcDay(dueDate);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < todayIst(today).getTime();
}

/** Whole days from today (app timezone) to `value`; negative means overdue. */
export function daysFromToday(
  value: Date | string,
  now: Date = new Date(),
): number {
  const day = utcDay(value);
  return Math.round(
    (day.getTime() - todayIst(now).getTime()) / 86_400_000,
  );
}
