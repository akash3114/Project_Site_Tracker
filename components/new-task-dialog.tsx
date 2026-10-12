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
        onError(
          (data as { error?: string } | null)?.error ??
            `Create failed (${res.status})`,
        );
        return;
      }
      reset({ plazaId, priority: "MEDIUM" });
      onCreated();
      onClose();
    } catch {
      onError("Network error creating task");
    } finally {
      setSaving(false);
    }
  }

  const input =
    "min-h-[44px] w-full rounded-[6px] border border-[rgba(23,34,44,0.08)] bg-white px-3 font-body text-sm text-[#17222C] placeholder:text-[#8A97A3]";
  const err = "font-mono text-xs text-[#DC2626]";

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
        <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[#17222C]">
          New task
        </h2>
        <input type="hidden" {...register("plazaId")} value={plazaId} />
        <div className="flex flex-col gap-1">
          <label htmlFor="nt-title" className="font-body text-sm text-[#5C6F7E]">
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
            className="font-body text-sm text-[#5C6F7E]"
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
              className="font-body text-sm text-[#5C6F7E]"
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
              className="font-body text-sm text-[#5C6F7E]"
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
            className="font-body text-sm text-[#5C6F7E]"
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
            className="min-h-[44px] flex-1 rounded-[6px] border border-[rgba(23,34,44,0.08)] px-4 font-body text-sm text-[#5C6F7E] pst-transition hover:text-[#17222C]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] flex-1 rounded-[6px] bg-[#5E6AD2] px-4 font-body text-sm font-semibold text-white pst-transition hover:brightness-110 disabled:opacity-60"
          >
            {saving ? "Creating…" : "Create task"}
          </button>
        </div>
      </form>
    </div>
  );
}
