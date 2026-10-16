import { ProgressBar } from "./progress-bar";

export type ProjectCardProps = {
  name: string;
  acronym?: string | null;
  state?: string | null;
  status?: string;
  plazaCount: number;
  progressPct: number;
  openCount: number;
  blockedCount: number;
  overdueCount: number;
  updatedAgo?: string;
};

export function ProjectCard({
  name,
  acronym,
  state,
  status,
  plazaCount,
  progressPct,
  openCount,
  blockedCount,
  overdueCount,
  updatedAgo,
}: ProjectCardProps) {
  return (
    <article
      data-testid="project-card"
      className="flex min-h-[44px] flex-col gap-3 rounded-[12px] border border-[rgba(23,34,44,0.08)] bg-white p-4 shadow-[0_1px_2px_rgba(23,34,44,0.04)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-semibold tracking-[-0.02em] text-[#17222C]">
            {acronym ? `${acronym} · ` : ""}{name}
          </h3>
          <p className="mt-0.5 font-mono text-xs text-[#8A97A3]">
            {[state, status].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        {updatedAgo ? (
          <span className="shrink-0 font-mono text-xs text-[#8A97A3]">{updatedAgo}</span>
        ) : null}
      </div>
      <p className="font-body text-sm text-[#5C6F7E]">
        {plazaCount} {plazaCount === 1 ? "plaza" : "plazas"}
      </p>
      <ProgressBar value={progressPct} />
      <p className="font-mono text-xs text-[#5C6F7E]">{progressPct}% complete</p>
      <dl className="flex flex-wrap gap-4 font-body text-sm">
        <div>
          <dt className="text-[#5C6F7E]">Open</dt>
          <dd className="font-semibold text-[#17222C]">{openCount}</dd>
        </div>
        <div>
          <dt className="text-[#5C6F7E]">Blocked</dt>
          <dd className="font-semibold text-[#92400E]">{blockedCount}</dd>
        </div>
        <div>
          <dt className="text-[#5C6F7E]">Overdue</dt>
          <dd className="font-semibold text-[#DC2626]">{overdueCount}</dd>
        </div>
      </dl>
    </article>
  );
}
