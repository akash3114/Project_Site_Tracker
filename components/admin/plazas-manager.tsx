"use client";

import { useCallback, useEffect, useState } from "react";

type Project = { id: string; name: string };
type PlazaItem = {
  id: string;
  projectId: string;
  project?: { id: string; name: string };
  name: string;
  chainage: string | null;
  highway: string | null;
  location: string | null;
  status: string;
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

const inputCls =
  "min-h-[44px] w-full rounded-[8px] border border-[rgba(23,34,44,0.12)] bg-white px-3 py-2 text-sm text-[#17222C] placeholder:text-[#8A97A3]";
const thCls =
  "px-3 py-2 text-left font-mono text-xs font-medium uppercase tracking-wide text-[#8A97A3]";
const tdCls = "px-3 py-2 text-sm text-[#17222C]";
const btnCls =
  "inline-flex min-h-[44px] items-center rounded-[8px] border border-[rgba(23,34,44,0.12)] px-4 text-sm font-medium text-[#17222C]";
const primaryBtnCls =
  "inline-flex min-h-[44px] items-center rounded-[8px] bg-[#5E6AD2] px-4 text-sm font-semibold text-white disabled:opacity-50";

const emptyForm = {
  projectId: "",
  name: "",
  chainage: "",
  highway: "",
  location: "",
  status: "ACTIVE",
};

/** ADMIN plazas table + create/edit forms wired to /api/plazas. */
export function PlazasManager() {
  const [items, setItems] = useState<PlazaItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pr, pl] = await Promise.all([
        fetch("/api/projects"),
        fetch(filter ? `/api/plazas?projectId=${filter}` : "/api/plazas"),
      ]);
      if (!pr.ok) throw new Error(await readError(pr));
      if (!pl.ok) throw new Error(await readError(pl));
      const pj = (await pr.json()) as { id: string; name: string }[];
      setProjects(pj.map((p) => ({ id: p.id, name: p.name })));
      setItems((await pl.json()) as PlazaItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load plazas");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  function clean(body: Record<string, string>) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) {
      const t = v.trim();
      if (t) out[k] = t;
    }
    return out;
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (form.name.trim().length < 3) {
      setFormError("Name must be at least 3 characters");
      return;
    }
    if (!form.projectId) {
      setFormError("Pick a project");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/plazas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: form.projectId,
          status: form.status,
          ...clean({
            name: form.name,
            chainage: form.chainage,
            highway: form.highway,
            location: form.location,
          }),
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setForm(emptyForm);
      setShowCreate(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function update(id: string) {
    if (editName.trim().length < 3) {
      setFormError("Name must be at least 3 characters");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/plazas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), status: editStatus }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setEditingId(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-h-[44px] items-center gap-2 text-sm text-[#5C6F7E]">
          Project
          <select
            className="min-h-[44px] rounded-[8px] border border-[rgba(23,34,44,0.12)] bg-white px-3 text-sm text-[#17222C]"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            setShowCreate((v) => !v);
            setFormError(null);
          }}
          className={primaryBtnCls}
        >
          New plaza
        </button>
      </div>

      {showCreate ? (
        <form
          onSubmit={create}
          className="grid grid-cols-1 gap-3 rounded-[12px] border border-[rgba(23,34,44,0.08)] bg-white p-4 md:grid-cols-2"
        >
          <label className="flex flex-col gap-1 text-sm font-medium text-[#17222C]">
            Project
            <select
              className={inputCls}
              value={form.projectId}
              onChange={(e) => setForm({ ...form, projectId: e.target.value })}
              required
            >
              <option value="">Select…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-[#17222C]">
            Name
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Plaza name (min 3 chars)"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-[#17222C]">
            Chainage
            <input
              className={inputCls}
              value={form.chainage}
              onChange={(e) => setForm({ ...form, chainage: e.target.value })}
              placeholder="KM 123+450"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-[#17222C]">
            Highway
            <input
              className={inputCls}
              value={form.highway}
              onChange={(e) => setForm({ ...form, highway: e.target.value })}
              placeholder="NH-48"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-[#17222C]">
            Location
            <input
              className={inputCls}
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Town, State"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-[#17222C]">
            Status
            <select
              className={inputCls}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="ON_HOLD">ON_HOLD</option>
              <option value="COMPLETED">COMPLETED</option>
            </select>
          </label>
          {formError ? (
            <p role="alert" className="text-sm text-[#DC2626] md:col-span-2">
              {formError}
            </p>
          ) : null}
          <div className="flex gap-2 md:col-span-2">
            <button type="submit" disabled={saving} className={primaryBtnCls}>
              {saving ? "Saving…" : "Create plaza"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className={btnCls}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {formError && !showCreate ? (
        <p role="alert" className="text-sm text-[#DC2626]">
          {formError}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[#5C6F7E]">Loading plazas…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-[#DC2626]">
          {error}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-[rgba(23,34,44,0.08)] bg-white">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="border-b border-[rgba(23,34,44,0.08)] bg-[#FAFBFC]">
                <th className={thCls}>Plaza</th>
                <th className={thCls}>Project</th>
                <th className={thCls}>Status</th>
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
              {items.map((z) => (
                <tr
                  key={z.id}
                  className="border-b border-[rgba(23,34,44,0.06)] last:border-0"
                >
                  <td className={`${tdCls} font-medium`}>
                    {editingId === z.id ? (
                      <input
                        className={inputCls}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    ) : (
                      z.name
                    )}
                  </td>
                  <td className={tdCls}>{z.project?.name ?? z.projectId}</td>
                  <td className={tdCls}>
                    {editingId === z.id ? (
                      <select
                        className={inputCls}
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="ON_HOLD">ON_HOLD</option>
                        <option value="COMPLETED">COMPLETED</option>
                      </select>
                    ) : (
                      z.status
                    )}
                  </td>
                  <td className={tdCls}>{z.task.total}</td>
                  <td className={tdCls}>{z.task.completed}</td>
                  <td className={tdCls}>{z.task.blocked}</td>
                  <td className={tdCls}>{z.task.overdue}</td>
                  <td className={tdCls}>{z.progressPct}%</td>
                  <td className={tdCls}>
                    {editingId === z.id ? (
                      <span className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void update(z.id)}
                          disabled={saving}
                          className={primaryBtnCls}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className={btnCls}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(z.id);
                          setEditName(z.name);
                          setEditStatus(z.status);
                          setFormError(null);
                        }}
                        className={btnCls}
                      >
                        Edit
                      </button>
                    )}
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
