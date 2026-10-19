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
      className="flex min-h-[44px] flex-col gap-3 rounded-[12px] border border-[#CDD6CE] bg-white p-4 shadow-[0_1px_2px_rgba(23,34,44,0.04)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-semibold tracking-[-0.02em] text-[#1C2824]">
            {acronym ? `${acronym} · ` : ""}{name}
          </h3>
          <p className="mt-0.5 font-mono text-xs text-[#66756D]">
            {[state, status].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        {updatedAgo ? (
          <span className="shrink-0 font-mono text-xs text-[#66756D]">{updatedAgo}</span>
        ) : null}
      </div>
      <p className="font-body text-sm text-[#586760]">
        {plazaCount} {plazaCount === 1 ? "plaza" : "plazas"}
      </p>
      <ProgressBar value={progressPct} />
      <p className="font-mono text-xs text-[#586760]">{progressPct}% complete</p>
      <dl className="flex flex-wrap gap-4 font-body text-sm">
        <div>
          <dt className="text-[#586760]">Open</dt>
          <dd className="font-semibold text-[#1C2824]">{openCount}</dd>
        </div>
        <div>
          <dt className="text-[#586760]">Blocked</dt>
          <dd className="font-semibold text-[#704900]">{blockedCount}</dd>
        </div>
        <div>
          <dt className="text-[#586760]">Overdue</dt>
          <dd className="font-semibold text-[#8F2824]">{overdueCount}</dd>
        </div>
      </dl>
    </article>
  );
}
