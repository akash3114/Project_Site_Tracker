"use client";

import type { TaskStatus } from "@prisma/client";

import { canTransition } from "@/lib/transitions";

const STEPS: TaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED"];

const LABELS: Record<TaskStatus, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
};

/** Status stepper: illegal targets disabled via shared canTransition. */
export function StatusStepper({
  from,
  disabled,
  pending,
  onChange,
}: {
  from: TaskStatus;
  disabled?: boolean;
  pending?: boolean;
  onChange: (to: TaskStatus) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Change status"
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {STEPS.map((step) => {
        const isCurrent = step === from;
        const legal = canTransition(from, step);
        const off = disabled || pending || isCurrent || !legal;
        return (
          <button
            key={step}
            type="button"
            disabled={off}
            title={
              isCurrent
                ? "Current status"
                : !legal
                  ? `Illegal transition ${from} → ${step}`
                  : `Move to ${LABELS[step]}`
            }
            onClick={() => onChange(step)}
            className={`min-h-[44px] rounded-[6px] border px-2 font-body text-sm pst-transition ${
              isCurrent
                ? "border-[#173B33] bg-[#173B33]/10 font-semibold text-[#173B33]"
                : off
                  ? "cursor-not-allowed border-[#CDD6CE] bg-[#FAFBFC] text-[#66756D]"
                  : "border-[#CDD6CE] bg-white text-[#1C2824] hover:border-[#173B33]"
            }`}
          >
            {LABELS[step]}
          </button>
        );
      })}
    </div>
  );
}
