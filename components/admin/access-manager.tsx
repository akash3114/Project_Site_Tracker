"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type UserItem = { id: string; name: string; email: string; role: string };
type PlazaItem = {
  id: string;
  name: string;
  projectId: string;
  project?: { id: string; name: string };
};
type ProjectItem = { id: string; name: string };

async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

/** ADMIN plaza-mapping matrix wired to /api/access (GET/PUT). */
export function AccessManager() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [plazas, setPlazas] = useState<PlazaItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selected, setSelected] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
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
        const res = await fetch(`/api/access?userId=${selected}`);
        if (!res.ok) throw new Error(await readError(res));
        const j = (await res.json()) as { plazaIds: string[] };
        setChecked(j.plazaIds);
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

  function toggle(id: string) {
    setChecked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selected, plazaIds: checked }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setNotice(`Saved ${checked.length} plaza mapping(s)`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-[#5C6F7E]">Loading matrix…</p>;

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="text-sm text-[#DC2626]">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-sm text-[#166534]">{notice}</p> : null}

      <label className="flex min-h-[44px] max-w-md flex-col gap-1 text-sm font-medium text-[#17222C]">
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

      <div className="flex flex-col gap-4">
        {grouped.map(({ project, list }) => (
          <fieldset
            key={project?.id ?? list[0]?.projectId}
            className="rounded-[12px] border border-[rgba(23,34,44,0.08)] bg-white p-4"
          >
            <legend className="px-1 text-sm font-semibold text-[#17222C]">
              {project?.name ?? "Project"} (
              {
                list.filter((z: PlazaItem) => checked.includes(z.id)).length
              }
              /{list.length})
            </legend>
            <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
            {list.map((z: PlazaItem) => (
                <label
                  key={z.id}
                  className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[8px] px-2 py-1 hover:bg-[#FAFBFC]"
                >
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[#5E6AD2]"
                    checked={checked.includes(z.id)}
                    onChange={() => toggle(z.id)}
                  />
                  <span className="text-sm text-[#17222C]">{z.name}</span>
                </label>
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
          className="inline-flex min-h-[44px] items-center rounded-[8px] bg-[#5E6AD2] px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : `Save access (${checked.length})`}
        </button>
      </div>
    </div>
  );
}
