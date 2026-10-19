export type KpiItem = {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "overdue" | "blocked" | "completed";
};

const TONE_STYLES: Record<NonNullable<KpiItem["tone"]>, string> = {
  default: "text-[#1C2824]",
  overdue: "text-[#8F2824]",
  blocked: "text-[#704900]",
  completed: "text-[#385A2B]",
};

export function KpiRow({ items }: { items: KpiItem[] }) {
  return (
    <section aria-label="Key metrics" data-testid="kpi-row">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map((kpi) => (
          <div
            key={kpi.label}
            className="min-h-[44px] rounded-[12px] border border-[#CDD6CE] bg-white p-4 shadow-[0_1px_2px_rgba(23,34,44,0.04)]"
          >
            <p className="font-body text-sm text-[#586760]">{kpi.label}</p>
            <p
              className={`font-display text-2xl font-semibold tracking-[-0.02em] ${TONE_STYLES[kpi.tone ?? "default"]}`}
            >
              {kpi.value}
            </p>
            {kpi.hint ? (
              <p className="font-mono text-xs text-[#66756D]">{kpi.hint}</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
