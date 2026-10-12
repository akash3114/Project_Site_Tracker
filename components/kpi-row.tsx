export type KpiItem = {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "overdue" | "blocked" | "completed";
};

const TONE_STYLES: Record<NonNullable<KpiItem["tone"]>, string> = {
  default: "text-[#17222C]",
  overdue: "text-[#DC2626]",
  blocked: "text-[#92400E]",
  completed: "text-[#166534]",
};

export function KpiRow({ items }: { items: KpiItem[] }) {
  return (
    <section aria-label="Key metrics" data-testid="kpi-row">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map((kpi) => (
          <div
            key={kpi.label}
            className="min-h-[44px] rounded-[12px] border border-[rgba(23,34,44,0.08)] bg-white p-4 shadow-[0_1px_2px_rgba(23,34,44,0.04)]"
          >
            <p className="font-body text-sm text-[#5C6F7E]">{kpi.label}</p>
            <p
              className={`font-display text-2xl font-semibold tracking-[-0.02em] ${TONE_STYLES[kpi.tone ?? "default"]}`}
            >
              {kpi.value}
            </p>
            {kpi.hint ? (
              <p className="font-mono text-xs text-[#8A97A3]">{kpi.hint}</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
