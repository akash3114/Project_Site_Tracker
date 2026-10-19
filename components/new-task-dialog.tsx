"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createTaskSchema } from "@/lib/validations";
import type { AssigneeOption } from "./task-filters";

type NewTaskValues = z.infer<typeof createTaskSchema>;

/**
 * New Task dialog. Uses the shared createTaskSchema (no duplicate literals).
 * Assignee options are plaza members when the caller can list users
 * (admin/lead via GET /api/users); site users get a 403 there, so the
 * parent falls back to assignees already visible on this plaza's tasks.
 */
export function NewTaskDialog({
  plazaId,
  assignees,
  open,
  onClose,
  onCreated,
  onError,
}: {
  plazaId: string;
  assignees: AssigneeOption[];
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NewTaskValues>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: { plazaId, priority: "MEDIUM" },
  });

  if (!open) return null;

  async function submit(values: NewTaskValues) {
    setSaving(true);
    setApiError(null);
    try {
      // Strip empties: server coerces ""→undefined too, but never send junk.
      const body: Record<string, unknown> = { plazaId: values.plazaId, title: values.title };
      if (values.description) body.description = values.description;
      if (values.priority) body.priority = values.priority;
      if (values.dueDate) body.dueDate = values.dueDate;
      if (values.assigneeId) body.assigneeId = values.assigneeId;
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          (data as { error?: string } | null)?.error ?? `Create failed (${res.status})`;
        setApiError(message);
        onError(message);
        return;
      }
      reset({ plazaId, priority: "MEDIUM" });
      setApiError(null);
      onCreated();
      onClose();
    } catch {
      setApiError("Network error creating task");
      onError("Network error creating task");
    } finally {
      setSaving(false);
    }
  }

  const input =
    "min-h-[44px] w-full rounded-[6px] border border-[#CDD6CE] bg-white px-3 font-body text-sm text-[#1C2824] placeholder:text-[#66756D]";
  const err = "font-mono text-xs text-[#8F2824]";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New task"
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit(submit)}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-[12px] bg-white p-6 sm:rounded-[12px]"
      >
        <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[#102D27]">
          New task
        </h2>
        <p className="font-body text-xs text-[#586760]">The task will be recorded under the selected plaza.</p>
        {apiError ? <p role="alert" className="border border-[#8F2824]/30 bg-[#FBE8E4] px-3 py-2 font-body text-sm text-[#8F2824]">{apiError}</p> : null}
        <input type="hidden" {...register("plazaId")} value={plazaId} />
        <div className="flex flex-col gap-1">
          <label htmlFor="nt-title" className="font-body text-sm text-[#586760]">
            Title
          </label>
          <input
            id="nt-title"
            placeholder="Canopy bolt tightening LHS"
            {...register("title")}
            className={input}
          />
          {errors.title ? (
            <span className={err}>{errors.title.message}</span>
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="nt-desc"
            className="font-body text-sm text-[#586760]"
          >
            Description (optional)
          </label>
          <textarea
            id="nt-desc"
            rows={3}
            {...register("description")}
            className={`${input} min-h-[44px] py-2`}
          />
          {errors.description ? (
            <span className={err}>{errors.description.message}</span>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="nt-priority"
              className="font-body text-sm text-[#586760]"
            >
              Priority
            </label>
            <select id="nt-priority" {...register("priority")} className={input}>
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="nt-due"
              className="font-body text-sm text-[#586760]"
            >
              Due date (optional)
            </label>
            <input
              id="nt-due"
              type="date"
              {...register("dueDate", {
                setValueAs: (v: string) => (v === "" ? undefined : v),
              })}
              className={input}
            />
            {errors.dueDate ? (
              <span className={err}>{errors.dueDate.message}</span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="nt-assignee"
            className="font-body text-sm text-[#586760]"
          >
            Assignee (optional, plaza members)
          </label>
          <select
            id="nt-assignee"
            {...register("assigneeId", {
              setValueAs: (v: string) => (v === "" ? undefined : v),
            })}
            className={input}
          >
            <option value="">Unassigned</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {errors.assigneeId ? (
            <span className={err}>{errors.assigneeId.message}</span>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] flex-1 rounded-[6px] border border-[#CDD6CE] px-4 font-body text-sm text-[#586760] pst-transition hover:text-[#1C2824]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] flex-1 rounded-[6px] bg-[#173B33] px-4 font-body text-sm font-semibold text-white pst-transition hover:brightness-110 disabled:opacity-60"
          >
            {saving ? "Creating…" : "Create task"}
          </button>
        </div>
      </form>
    </div>
  );
}
