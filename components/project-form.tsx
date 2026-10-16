"use client";

import { useState } from "react";

import { projectSchema } from "@/lib/validations";

export type ProjectFormValue = {
  name: string;
  description?: string;
  acronym?: string;
  state?: string;
  round?: string;
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
  "min-h-[44px] w-full rounded-[8px] border border-[rgba(23,34,44,0.12)] bg-white px-3 py-2 text-sm text-[#17222C] placeholder:text-[#8A97A3]";

/** Shared create/edit form for projects (T-012). Validated by projectSchema. */
export function ProjectForm({
  initial,
  submitLabel,
  submitting,
  serverError,
  onSubmit,
  onCancel,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [acronym, setAcronym] = useState(initial?.acronym ?? "");
  const [state, setState] = useState(initial?.state ?? "");
  const [round, setRound] = useState(initial?.round ?? "");
  const [status, setStatus] = useState<ProjectFormValue["status"]>(
    initial?.status ?? "ACTIVE",
  );
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const opt = (v: string) => (v.trim() ? v.trim() : undefined);
    const parsed = projectSchema.safeParse({
      name: name.trim(),
      description: opt(description),
      acronym: opt(acronym),
      state: opt(state),
      round: opt(round),
      status,
    });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setFieldError(null);
    await onSubmit({
      name: parsed.data.name,
      description: parsed.data.description,
      acronym: parsed.data.acronym,
      state: parsed.data.state,
      round: parsed.data.round,
      status: parsed.data.status,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-[12px] border border-[rgba(23,34,44,0.08)] bg-white p-4"
    >
      <label className="flex flex-col gap-1 text-sm font-medium text-[#17222C]">
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
      <label className="flex flex-col gap-1 text-sm font-medium text-[#17222C]">
        Description
        <textarea
          className={`${inputCls} min-h-[88px]`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          maxLength={2000}
        />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-[#17222C]">
          Acronym
          <input
            className={inputCls}
            value={acronym}
            onChange={(e) => setAcronym(e.target.value)}
            placeholder="RKJL"
            maxLength={20}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-[#17222C]">
          State
          <input
            className={inputCls}
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="Madhya Pradesh"
            maxLength={100}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-[#17222C]">
          Round
          <input
            className={inputCls}
            value={round}
            onChange={(e) => setRound(e.target.value)}
            placeholder="Round 3"
            maxLength={50}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium text-[#17222C]">
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
      {fieldError ? (
        <p role="alert" className="text-sm text-[#DC2626]">
          {fieldError}
        </p>
      ) : null}
      {serverError ? (
        <p role="alert" className="text-sm text-[#DC2626]">
          {serverError}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="min-h-[44px] rounded-[8px] bg-[#5E6AD2] px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Saving…" : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] rounded-[8px] border border-[rgba(23,34,44,0.12)] px-4 text-sm font-medium text-[#5C6F7E]"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
