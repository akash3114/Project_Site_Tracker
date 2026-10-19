"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type UserItem = { id: string; name: string; email: string; role: string };
type PlazaItem = {
  id: string;
  name: string;
  projectId: string;
  project?: { id: string; name: string };
};
type ProjectItem = { id: string; name: string; round: string };
type PlazaRole = "TOLL" | "MAINTENANCE" | "CORRIDOR";

type Checked = Record<string, PlazaRole>; // plazaId -> role

async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

/** ADMIN/MANAGEMENT team console: PM assignments + plaza role matrix. */
export function AccessManager() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [plazas, setPlazas] = useState<PlazaItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selected, setSelected] = useState("");
  const [checked, setChecked] = useState<Checked>({});
  const [pmProjects, setPmProjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadBase = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ur, zr, pr] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/plazas"),
        fetch("/api/projects"),
      ]);
      if (!ur.ok) throw new Error(await readError(ur));
      if (!zr.ok) throw new Error(await readError(zr));
      if (!pr.ok) throw new Error(await readError(pr));
      const u = (await ur.json()) as UserItem[];
      setUsers(u);
      setPlazas((await zr.json()) as PlazaItem[]);
      setProjects((await pr.json()) as ProjectItem[]);
      if (!selected && u.length > 0) setSelected(u[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load matrix");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (!selected) return;
    (async () => {
      try {
        const [ar, pr] = await Promise.all([
          fetch(`/api/access?userId=${selected}`),
          fetch(`/api/project-assignments?userId=${selected}`),
        ]);
        if (!ar.ok) throw new Error(await readError(ar));
        if (!pr.ok) throw new Error(await readError(pr));
        const a = (await ar.json()) as {
          assignments: { plazaId: string; role: PlazaRole }[];
        };
        const p = (await pr.json()) as {
          assignments: { projectId: string }[];
        };
        const next: Checked = {};
        for (const row of a.assignments) {
          if (!next[row.plazaId]) next[row.plazaId] = row.role;
        }
        setChecked(next);
        setPmProjects(p.assignments.map((r) => r.projectId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load access");
      }
    })();
  }, [selected]);

  const grouped = useMemo(() => {
    const byProject = new Map<string, PlazaItem[]>();
    for (const z of plazas) {
      const list = byProject.get(z.projectId) ?? [];
      list.push(z);
      byProject.set(z.projectId, list);
    }
    return Array.from(byProject.entries()).map(
      ([projectId, list]: [string, PlazaItem[]]) => ({
        project: projects.find((p) => p.id === projectId),
        list: list.sort((a: PlazaItem, b: PlazaItem) =>
          a.name.localeCompare(b.name),
        ),
      }),
    );
  }, [plazas, projects]);

  function togglePlaza(id: string) {
    setChecked((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = "TOLL";
      return next;
    });
  }

  function setRole(id: string, role: PlazaRole) {
    setChecked((prev) => ({ ...prev, [id]: role }));
  }

  function togglePm(projectId: string) {
    setPmProjects((prev) =>
      prev.includes(projectId)
        ? prev.filter((x) => x !== projectId)
        : [...prev, projectId],
    );
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const assignments = Object.entries(checked).map(([plazaId, role]) => ({
        plazaId,
        role,
        isPrimary: false,
      }));
      const res = await fetch("/api/access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selected, assignments }),
      });
      if (!res.ok) throw new Error(await readError(res));

      // Sync PM assignments: add missing, remove deselected.
      const cur = await (
        await fetch(`/api/project-assignments?userId=${selected}`)
      ).json() as { assignments: { projectId: string }[] };
      const curIds = new Set(cur.assignments.map((r) => r.projectId));
      const wantIds = new Set(pmProjects);
      for (const pid of Array.from(wantIds)) {
        if (!curIds.has(pid)) {
          const r = await fetch("/api/project-assignments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId: pid,
              userId: selected,
              isPrimary: false,
            }),
          });
          if (!r.ok) throw new Error(await readError(r));
        }
      }
      for (const pid of Array.from(curIds)) {
        if (!wantIds.has(pid)) {
          const r = await fetch(
            `/api/project-assignments?projectId=${pid}&userId=${selected}`,
            { method: "DELETE" },
          );
          if (!r.ok) throw new Error(await readError(r));
        }
      }
      setNotice(
        `Saved ${assignments.length} plaza role(s) + ${pmProjects.length} project(s)`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-[#586760]">Loading matrix…</p>;

  const checkedCount = Object.keys(checked).length;

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="text-sm text-[#8F2824]">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-sm text-[#385A2B]">{notice}</p> : null}

      <label className="flex min-h-[44px] max-w-md flex-col gap-1 text-sm font-medium text-[#1C2824]">
        User
        <select
          className="min-h-[44px] rounded-[8px] border border-[rgba(23,34,44,0.12)] bg-white px-3 py-2 text-sm"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} — {u.email} ({u.role})
            </option>
          ))}
        </select>
      </label>

      <fieldset className="rounded-[12px] border border-[#CDD6CE] bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-[#1C2824]">
          Project Manager of ({pmProjects.length}/{projects.length})
        </legend>
        <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
          {projects.map((p) => (
            <label
              key={p.id}
              className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[8px] px-2 py-1 hover:bg-[#FAFBFC]"
            >
              <input
                type="checkbox"
                className="h-5 w-5 accent-[#173B33]"
                checked={pmProjects.includes(p.id)}
                onChange={() => togglePm(p.id)}
              />
              <span className="text-sm text-[#1C2824]">
                {p.name}{" "}
                <span className="text-xs text-[#66756D]">{p.round}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-4">
        {grouped.map(({ project, list }) => (
          <fieldset
            key={project?.id ?? list[0]?.projectId}
            className="rounded-[12px] border border-[#CDD6CE] bg-white p-4"
          >
            <legend className="px-1 text-sm font-semibold text-[#1C2824]">
              {project?.name ?? "Project"} (
              {list.filter((z: PlazaItem) => checked[z.id]).length}/
              {list.length})
            </legend>
            <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
              {list.map((z: PlazaItem) => (
                <div
                  key={z.id}
                  className="flex min-h-[44px] items-center gap-3 rounded-[8px] px-2 py-1 hover:bg-[#FAFBFC]"
                >
                  <label className="flex flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-[#173B33]"
                      checked={Boolean(checked[z.id])}
                      onChange={() => togglePlaza(z.id)}
                    />
                    <span className="text-sm text-[#1C2824]">{z.name}</span>
                  </label>
                  {checked[z.id] ? (
                    <select
                      aria-label={`Role at ${z.name}`}
                      className="min-h-[44px] rounded-[8px] border border-[rgba(23,34,44,0.12)] bg-white px-2 text-sm"
                      value={checked[z.id]}
                      onChange={(e) =>
                        setRole(z.id, e.target.value as PlazaRole)
                      }
                    >
                      <option value="TOLL">TOLL</option>
                      <option value="MAINTENANCE">MAINTENANCE</option>
                      <option value="CORRIDOR">CORRIDOR</option>
                    </select>
                  ) : null}
                </div>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !selected}
          className="inline-flex min-h-[44px] items-center rounded-[8px] bg-[#173B33] px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : `Save access (${checkedCount})`}
        </button>
      </div>
    </div>
  );
}
