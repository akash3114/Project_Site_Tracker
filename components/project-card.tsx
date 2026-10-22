import { cn } from "@/lib/utils";

import { ProgressBar } from "./progress-bar";

export type ProjectCardProps = {
  name: string;
  acronym?: string | null;
  state?: string | null;
  /** Free-form status label, e.g. "Active" / "Archived". */
  status?: string;
  /** Optional bid/tender round, shown in the meta line when present. */
  round?: string | null;
  plazaCount: number;
  progressPct: number;
  openCount: number;
  blockedCount: number;
  overdueCount: number;
  updatedAgo?: string;
};

type StatTone = "neutral" | "blocked" | "overdue";

const STAT_VALUE_TONE: Record<StatTone, string> = {
  neutral: "text-[#1C2824]",
  blocked: "text-[#704900]",
  overdue: "text-[#8F2824]",
};

function StatChip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: StatTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1.5 rounded-[6px] border border-[#CDD6CE] bg-[#FAFBFC] px-2 py-1",
        value === 0 && "opacity-60",
      )}
    >
      <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-[#66756D]">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-sm font-semibold tabular-nums",
          STAT_VALUE_TONE[tone],
        )}
      >
        {value}
      </span>
    </span>
  );
}

/** Turns API round codes such as `ROUND_3` into `Round 3`. */
function formatRound(round: string): string {
  const value = round.trim();
  const numbered = /^round[_\s-]*(\d+)$/i.exec(value);
  if (numbered) return `Round ${numbered[1]}`;
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Compact project card: identity line, context + completion, task counters.
 * The card is normally wrapped in a link, so it carries its own accessible
 * name through `aria-label` on the root element.
 */
export function ProjectCard({
  name,
  acronym,
  state,
  status,
  round,
  plazaCount,
  progressPct,
  openCount,
  blockedCount,
  overdueCount,
  updatedAgo,
}: ProjectCardProps) {
  const statusKey = status?.trim().toLowerCase();
  const isArchived = statusKey === "archived";
  const statusLabel =
    statusKey && statusKey !== "active"
      ? isArchived
        ? "Archived"
        : (status ?? "").trim()
      : null;

  const meta = [
    state?.trim(),
    `${plazaCount} ${plazaCount === 1 ? "plaza" : "plazas"}`,
    round?.trim() ? formatRound(round) : null,
  ].filter((part): part is string => Boolean(part));

  const accessibleName = [
    `${acronym ? `${acronym.trim()} ` : ""}${name}`,
    state?.trim(),
    `${progressPct}% complete`,
    `${openCount} open`,
    `${blockedCount} blocked`,
    `${overdueCount} overdue`,
  ]
    .filter((part): part is string => Boolean(part))
    .join(", ");

  return (
    <article
      data-testid="project-card"
      aria-label={accessibleName}
      className="flex min-h-[44px] flex-col gap-3 rounded-[12px] border border-[#CDD6CE] bg-white p-4 shadow-[0_1px_2px_rgba(23,34,44,0.04)]"
    >
      {/* Row 1 — identity */}
      <div className="flex items-start gap-2">
        {acronym ? (
          <span className="mt-0.5 inline-flex shrink-0 items-center rounded-[6px] bg-[#E2EADD] px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.02em] text-[#173B33]">
            {acronym.trim()}
          </span>
        ) : null}
        <h3 className="line-clamp-2 min-w-0 flex-1 font-display text-base font-semibold tracking-[-0.02em] text-[#1C2824]">
          {name}
        </h3>
        {statusLabel ? (
          <span className="mt-0.5 inline-flex shrink-0 items-center rounded-[6px] border border-[#CDD6CE] bg-[#FAFBFC] px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-[#66756D]">
            {statusLabel}
          </span>
        ) : null}
      </div>

      {/* Row 2 — context + completion */}
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs text-[#66756D]">{meta.join(" · ") || "—"}</p>
        <div className="flex items-center gap-2.5">
          <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-[#66756D]">
            Completion
          </span>
          <ProgressBar value={progressPct} className="min-w-0 flex-1" />
          <span className="w-9 shrink-0 text-right font-mono text-xs font-semibold tabular-nums text-[#173B33]">
            {progressPct}%
          </span>
        </div>
      </div>

      {/* Row 3 — task counters */}
      <div className="flex flex-wrap items-center gap-2">
        <StatChip label="Open" value={openCount} />
        <StatChip label="Blocked" value={blockedCount} tone="blocked" />
        <StatChip label="Overdue" value={overdueCount} tone="overdue" />
        {updatedAgo ? (
          <span className="ml-auto font-mono text-[11px] text-[#66756D]">{updatedAgo}</span>
        ) : null}
      </div>
    </article>
  );
}
