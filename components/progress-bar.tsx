import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  className,
}: {
  /** 0–100 completion percentage */
  value: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      data-testid="progress-bar"
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-[#CDD6CE]", className)}
    >
      <div
        className="h-full rounded-full bg-[#173B33] pst-layout"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
