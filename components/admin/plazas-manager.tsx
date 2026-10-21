"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Company = { id: string; name: string; code: string };

type Project = {
  id: string;
  name: string;
  acronym: string | null;
  round: string;
  active: boolean;
  company?: Company | null;
};

type PlazaItem = {
  id: string;
  projectId: string;
  project?: {
    id: string;
    name: string;
    acronym: string | null;
    company?: Company | null;
  } | null;
  name: string;
  lengthKm: number | null;
  state: string | null;
  piu: string | null;
  ro: string | null;
  active: boolean;
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
  "min-h-[44px] w-full rounded-[8px] border border-[rgba(23,34,44,0.12)] bg-white px-3 py-2 text-sm text-[#1C2824] placeholder:text-[#66756D]";
const thCls =
  "px-3 py-2 text-left font-mono text-xs font-medium uppercase tracking-wide text-[#66756D]";
const tdCls = "px-3 py-2 text-sm text-[#1C2824]";
const btnCls =
  "inline-flex min-h-[44px] items-center rounded-[8px] border border-[rgba(23,34,44,0.12)] px-4 text-sm font-medium text-[#1C2824] disabled:opacity-50";
const primaryBtnCls =
  "inline-flex min-h-[44px] items-center rounded-[8px] bg-[#173B33] px-4 text-sm font-semibold text-white disabled:opacity-50";

const emptyForm = {
  projectId: "",
  name: "",
  lengthKm: "",
  state: "",
  piu: "",
  ro: "",
  active: true,
};

function statusPill(active: boolean) {
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide ${
        active
          ? "bg-[#E8F0DD] text-[#385A2B]"
          : "bg-[#F5F5EF] text-[#586760]"
      }`}
    >
      {active ? "Active" : "Archived"}
    </span>
  );
}

/** ADMIN plazas table + create/edit forms wired to /api/plazas. */
export function PlazasManager() {
  const [items, setItems] = useState<PlazaItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [companyFilter, setCompanyFilter] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pr, pl] = await Promise.all([
        fetch("/api/projects", { credentials: "same-origin" }),
        fetch(
          filter
            ? `/api/plazas?projectId=${encodeURIComponent(filter)}`
            : "/api/plazas",
          { credentials: "same-origin" },
        ),
      ]);
      if (!pr.ok) throw new Error(await readError(pr));
      if (!pl.ok) throw new Error(await readError(pl));
      setProjects((await pr.json()) as Project[]);
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

  const companies = useMemo(() => {
    const map = new Map<string, Company>();
    for (const project of projects) {
      if (project.company) map.set(project.company.id, project.company);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);

  const projectOptions = useMemo(
    () =>
      companyFilter
        ? projects.filter((p) => p.company?.id === companyFilter)
        : projects,
    [projects, companyFilter],
  );

  function changeCompany(value: string) {
    setCompanyFilter(value);
    if (!value) return;
    const current = projects.find((p) => p.id === filter);
    if (!current || current.company?.id !== value) setFilter("");
    const formProject = projects.find((p) => p.id === form.projectId);
    if (formProject && formProject.company?.id !== value) {
      setForm((prev) => ({ ...prev, projectId: "" }));
    }
  }

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
    let lengthKm: number | undefined;
    if (form.lengthKm.trim()) {
      lengthKm = Number(form.lengthKm.trim());
      if (!Number.isFinite(lengthKm) || lengthKm <= 0) {
        setFormError("Length must be a positive number (km)");
        return;
      }
    }
    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/plazas", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: form.projectId,
          active: form.active,
          ...(lengthKm !== undefined ? { lengthKm } : null),
          ...clean({
            name: form.name,
            state: form.state,
            piu: form.piu,
            ro: form.ro,
          }),
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setForm(emptyForm);
      setShowCreate(false);
      setNotice("Plaza created");
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
    setNotice(null);
    try {
      // updatePlazaSchema omits projectId — never send it on PATCH.
      const res = await fetch(`/api/plazas/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), active: editActive }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setEditingId(null);
      setNotice("Plaza updated");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(z: PlazaItem) {
    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/plazas/${z.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !z.active }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setNotice(z.active ? "Plaza archived" : "Plaza restored");
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
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-[#586760]">
            Company
            <select
              className="min-h-[44px] rounded-[8px] border border-[rgba(23,34,44,0.12)] bg-white px-3 text-sm text-[#1C2824]"
              value={companyFilter}
              onChange={(e) => changeCompany(e.target.value)}
            >
              <option value="">All companies</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.code} — {company.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-[#586760]">
            Project
            <select
              className="min-h-[44px] rounded-[8px] border border-[rgba(23,34,44,0.12)] bg-white px-3 text-sm text-[#1C2824]"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="">All projects</option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.company?.code ? `${project.company.code} — ` : ""}
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowCreate((v) => !v);
            setFormError(null);
            setNotice(null);
          }}
          className={primaryBtnCls}
        >
          New plaza
        </button>
      </div>

      {notice ? <p className="text-sm text-[#385A2B]">{notice}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-[#8F2824]">
          {error}
        </p>
      ) : null}

      {showCreate ? (
        <form
          onSubmit={create}
          className="grid grid-cols-1 gap-3 rounded-[12px] border border-[#CDD6CE] bg-white p-4 md:grid-cols-2"
        >
          <label className="flex flex-col gap-1 text-sm font-medium text-[#1C2824]">
            Project
            <select
              className={inputCls}
              value={form.projectId}
              onChange={(e) => setForm({ ...form, projectId: e.target.value })}
              required
            >
              <option value="">Select…</option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.company?.code ? `${project.company.code} — ` : ""}
                  {project.name}
                  {project.active ? "" : " (archived)"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-[#1C2824]">
            Name
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Plaza name (min 3 chars)"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-[#1C2824]">
            Length (km)
            <input
              className={inputCls}
              value={form.lengthKm}
              onChange={(e) => setForm({ ...form, lengthKm: e.target.value })}
              placeholder="81.7"
              inputMode="decimal"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-[#1C2824]">
            State
            <input
              className={inputCls}
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
              placeholder="Madhya Pradesh"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-[#1C2824]">
            PIU
            <input
              className={inputCls}
              value={form.piu}
              onChange={(e) => setForm({ ...form, piu: e.target.value })}
              placeholder="Jabalpur"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-[#1C2824]">
            RO
            <input
              className={inputCls}
              value={form.ro}
              onChange={(e) => setForm({ ...form, ro: e.target.value })}
              placeholder="Bhopal"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-[#1C2824]">
            Status
            <select
              className={inputCls}
              value={form.active ? "ACTIVE" : "ARCHIVED"}
              onChange={(e) =>
                setForm({ ...form, active: e.target.value === "ACTIVE" })
              }
            >
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
          {formError ? (
            <p role="alert" className="text-sm text-[#8F2824] md:col-span-2">
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
        <p role="alert" className="text-sm text-[#8F2824]">
          {formError}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[#586760]">Loading plazas…</p>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-[#CDD6CE] bg-white">
          <table className="w-full min-w-[1080px] border-collapse">
            <thead>
              <tr className="border-b border-[#CDD6CE] bg-[#FAFBFC]">
                <th className={thCls}>Plaza</th>
                <th className={thCls}>Company</th>
                <th className={thCls}>Project</th>
                <th className={thCls}>Length</th>
                <th className={thCls}>State</th>
                <th className={thCls}>PIU</th>
                <th className={thCls}>RO</th>
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
                  <td className={`${tdCls} font-mono text-xs`}>
                    {z.project?.company?.code ?? "—"}
                  </td>
                  <td className={tdCls}>{z.project?.name ?? z.projectId}</td>
                  <td className={tdCls}>
                    {typeof z.lengthKm === "number" ? `${z.lengthKm} km` : "—"}
                  </td>
                  <td className={tdCls}>{z.state ?? "—"}</td>
                  <td className={tdCls}>{z.piu ?? "—"}</td>
                  <td className={tdCls}>{z.ro ?? "—"}</td>
                  <td className={tdCls}>
                    {editingId === z.id ? (
                      <select
                        className={inputCls}
                        value={editActive ? "ACTIVE" : "ARCHIVED"}
                        onChange={(e) =>
                          setEditActive(e.target.value === "ACTIVE")
                        }
                      >
                        <option value="ACTIVE">Active</option>
                        <option value="ARCHIVED">Archived</option>
                      </select>
                    ) : (
                      statusPill(z.active)
                    )}
                  </td>
                  <td className={tdCls}>{z.task.total}</td>
                  <td className={tdCls}>{z.task.completed}</td>
                  <td className={tdCls}>{z.task.blocked}</td>
                  <td className={tdCls}>{z.task.overdue}</td>
                  <td className={tdCls}>{z.progressPct}%</td>
                  <td className={tdCls}>
                    {editingId === z.id ? (
                      <span className="flex flex-wrap gap-2">
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
                      <span className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(z.id);
                            setEditName(z.name);
                            setEditActive(z.active);
                            setFormError(null);
                            setNotice(null);
                          }}
                          className={btnCls}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleActive(z)}
                          disabled={saving}
                          className={btnCls}
                        >
                          {z.active ? "Archive" : "Restore"}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && items.length === 0 ? (
        <p className="text-sm text-[#586760]">
          No plazas match this filter.
        </p>
      ) : null}
    </div>
  );
}
