"use client";

import { useState } from "react";

import { projectSchema } from "@/lib/validations";

export type ProjectFormValue = {
  name: string;
  acronym?: string;
  round: "ROUND_1" | "ROUND_2" | "ROUND_3" | "ROUND_4";
  status?: "ACTIVE" | "ON_HOLD" | "COMPLETED";
};

type Props = {
  initial?: ProjectFormValue;
  submitLabel: string;
  submitting?: boolean;
  serverError?: string | null;
  onSubmit: (value: ProjectFormValue) => Promise<void>;
  onCancel?: () => void;
};

const inputCls =
  "min-h-[44px] w-full rounded-[8px] border border-[rgba(23,34,44,0.12)] bg-white px-3 py-2 text-sm text-[#1C2824] placeholder:text-[#66756D]";

/** Shared create/edit form for projects. Validated by projectSchema. */
export function ProjectForm({
  initial,
  submitLabel,
  submitting,
  serverError,
  onSubmit,
  onCancel,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [acronym, setAcronym] = useState(initial?.acronym ?? "");
  const [round, setRound] = useState<ProjectFormValue["round"]>(
    initial?.round ?? "ROUND_1",
  );
  const [status, setStatus] = useState<ProjectFormValue["status"]>(
    initial?.status ?? "ACTIVE",
  );
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const opt = (v: string) => (v.trim() ? v.trim() : undefined);
    const parsed = projectSchema.safeParse({
      name: name.trim(),
      acronym: opt(acronym),
      round,
      status,
    });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setFieldError(null);
    await onSubmit({
      name: parsed.data.name,
      acronym: parsed.data.acronym,
      round: parsed.data.round,
      status: parsed.data.status,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-[12px] border border-[#CDD6CE] bg-white p-4"
    >
      <label className="flex flex-col gap-1 text-sm font-medium text-[#1C2824]">
        Name
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name (min 3 chars)"
          minLength={3}
          maxLength={150}
          required
        />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-[#1C2824]">
          Acronym
          <input
            className={inputCls}
            value={acronym}
            onChange={(e) => setAcronym(e.target.value)}
            placeholder="RKJL"
            maxLength={20}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-[#1C2824]">
          Round
          <select
            className={inputCls}
            value={round}
            onChange={(e) =>
              setRound(e.target.value as ProjectFormValue["round"])
            }
            required
          >
            <option value="ROUND_1">ROUND_1</option>
            <option value="ROUND_2">ROUND_2</option>
            <option value="ROUND_3">ROUND_3</option>
            <option value="ROUND_4">ROUND_4</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-[#1C2824]">
          Status
          <select
            className={inputCls}
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as ProjectFormValue["status"])
            }
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="ON_HOLD">ON_HOLD</option>
            <option value="COMPLETED">COMPLETED</option>
          </select>
        </label>
      </div>
      {fieldError ? (
        <p role="alert" className="text-sm text-[#8F2824]">
          {fieldError}
        </p>
      ) : null}
      {serverError ? (
        <p role="alert" className="text-sm text-[#8F2824]">
          {serverError}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="min-h-[44px] rounded-[8px] bg-[#173B33] px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Saving…" : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] rounded-[8px] border border-[rgba(23,34,44,0.12)] px-4 text-sm font-medium text-[#586760]"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
