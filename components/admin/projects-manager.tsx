"use client";

import { useCallback, useEffect, useState } from "react";

import { ProjectForm, type ProjectFormValue } from "@/components/project-form";

type ProjectItem = {
  id: string;
  name: string;
  acronym: string | null;
  round: string;
  active: boolean;
  status: string;
  company?: { id: string; name: string; code: string } | null;
  plazaCount: number;
  task: { total: number; completed: number; blocked: number; overdue: number };
  progressPct: number;
};

async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

const thCls =
  "px-3 py-2 text-left font-mono text-xs font-medium uppercase tracking-wide text-[#66756D]";
const tdCls = "px-3 py-2 text-sm text-[#1C2824]";
const btnCls =
  "inline-flex min-h-[44px] items-center rounded-[8px] border border-[rgba(23,34,44,0.12)] px-4 text-sm font-medium text-[#1C2824]";
const primaryBtnCls =
  "inline-flex min-h-[44px] items-center rounded-[8px] bg-[#173B33] px-4 text-sm font-semibold text-white disabled:opacity-50";

/** ADMIN projects table + create/edit forms wired to /api/projects. */
export function ProjectsManager() {
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ProjectItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error(await readError(res));
      setItems((await res.json()) as ProjectItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(value: ProjectFormValue) {
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      if (!res.ok) throw new Error(await readError(res));
      setShowCreate(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function update(value: ProjectFormValue) {
    if (!editing) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/projects/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      if (!res.ok) throw new Error(await readError(res));
      setEditing(null);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs text-[#586760]">
          {items.length} project{items.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={() => {
            setShowCreate((v) => !v);
            setEditing(null);
            setFormError(null);
          }}
          className={primaryBtnCls}
        >
          New project
        </button>
      </div>

      {showCreate ? (
        <ProjectForm
          submitLabel="Create project"
          submitting={saving}
          serverError={formError}
          onSubmit={create}
          onCancel={() => setShowCreate(false)}
        />
      ) : null}

      {editing ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-[#1C2824]">
            Edit {editing.name}
          </h2>
          <ProjectForm
            initial={{
              companyId: editing.company?.id,
              name: editing.name,
              acronym: editing.acronym ?? undefined,
              round: editing.round as ProjectFormValue["round"],
              active: editing.active,
            }}
            submitLabel="Save changes"
            submitting={saving}
            serverError={formError}
            onSubmit={update}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-[#586760]">Loading projects…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-[#8F2824]">
          {error}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-[#CDD6CE] bg-white">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-[#CDD6CE] bg-[#FAFBFC]">
                <th className={thCls}>Name</th>
                <th className={thCls}>Company</th>
                <th className={thCls}>Acronym</th>
                <th className={thCls}>Round</th>
                <th className={thCls}>Status</th>
                <th className={thCls}>Plazas</th>
                <th className={thCls}>Tasks</th>
                <th className={thCls}>Done</th>
                <th className={thCls}>Blocked</th>
                <th className={thCls}>Overdue</th>
                <th className={thCls}>Progress</th>
                <th className={thCls}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-[rgba(23,34,44,0.06)] last:border-0"
                >
                  <td className={`${tdCls} font-medium`}>{p.name}</td>
                  <td className={tdCls}>{p.company?.code ?? "—"}</td>
                  <td className={tdCls}>{p.acronym ?? "—"}</td>
                  <td className={tdCls}>{p.round}</td>
                  <td className={tdCls}>{p.status}</td>
                  <td className={tdCls}>{p.plazaCount}</td>
                  <td className={tdCls}>{p.task.total}</td>
                  <td className={tdCls}>{p.task.completed}</td>
                  <td className={tdCls}>{p.task.blocked}</td>
                  <td className={tdCls}>{p.task.overdue}</td>
                  <td className={tdCls}>{p.progressPct}%</td>
                  <td className={tdCls}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(p);
                        setShowCreate(false);
                        setFormError(null);
                      }}
                      className={btnCls}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
