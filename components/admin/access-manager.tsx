"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlazaRole } from "@prisma/client";

import { PLAZA_ROLE_LABELS, PLAZA_ROLE_OPTIONS, roleLabel } from "@/lib/labels";

type UserItem = {
  id: string;
  name: string;
  email: string;
  role: string;
  isAdmin: boolean;
  active: boolean;
  companyIds: string[];
  projectIds: string[];
};

type CompanyItem = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  projectCount: number;
};

type ProjectItem = {
  id: string;
  name: string;
  acronym: string | null;
  round: string;
  active: boolean;
  company: { id: string; name: string; code: string } | null;
};

type PlazaItem = {
  id: string;
  projectId: string;
  project: {
    id: string;
    name: string;
    acronym: string | null;
    company: { id: string; name: string; code: string };
  };
  name: string;
  active: boolean;
};

/** Selected plaza scope: one or more job titles plus a primary flag. */
type PlazaPick = { roles: PlazaRole[]; isPrimary: boolean };

async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

/** "Toll Manager" → "Toll" so three title toggles fit on one row. */
function shortRoleLabel(role: PlazaRole): string {
  return PLAZA_ROLE_LABELS[role].replace(" Manager", "");
}

/**
 * Admin/Head Office team console: company Head Office, project managers and
 * plaza job titles. A person can hold any combination of the three scopes.
 */
export function AccessManager() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [plazas, setPlazas] = useState<PlazaItem[]>([]);
  const [selected, setSelected] = useState("");
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [projectPicks, setProjectPicks] = useState<
    Record<string, { isPrimary: boolean }>
  >({});
  const [plazaPicks, setPlazaPicks] = useState<Record<string, PlazaPick>>({});
  const [loading, setLoading] = useState(true);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadBase = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ur, cr, pr, zr] = await Promise.all([
        fetch("/api/users", { credentials: "same-origin" }),
        fetch("/api/companies", { credentials: "same-origin" }),
        fetch("/api/projects", { credentials: "same-origin" }),
        fetch("/api/plazas", { credentials: "same-origin" }),
      ]);
      if (!ur.ok) throw new Error(await readError(ur));
      if (!cr.ok) throw new Error(await readError(cr));
      if (!pr.ok) throw new Error(await readError(pr));
      if (!zr.ok) throw new Error(await readError(zr));

      const u = (await ur.json()) as UserItem[];
      setUsers(u);
      setCompanies((await cr.json()) as CompanyItem[]);
      setProjects((await pr.json()) as ProjectItem[]);
      setPlazas((await zr.json()) as PlazaItem[]);
      setSelected((prev) => prev || u.find((row) => row.active)?.id || u[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load access console");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setAssignmentsLoading(true);
    setError(null);
    setNotice(null);
    setCompanyIds([]);
    setProjectPicks({});
    setPlazaPicks({});
    setDirty(false);

    void (async () => {
      try {
        const [ar, cr, pr] = await Promise.all([
          fetch(`/api/access?userId=${selected}`, {
            credentials: "same-origin",
          }),
          fetch(`/api/company-assignments?userId=${selected}`, {
            credentials: "same-origin",
          }),
          fetch(`/api/project-assignments?userId=${selected}`, {
            credentials: "same-origin",
          }),
        ]);
        if (!ar.ok) throw new Error(await readError(ar));
        if (!cr.ok) throw new Error(await readError(cr));
        if (!pr.ok) throw new Error(await readError(pr));

        const access = (await ar.json()) as {
          assignments: {
            plazaId: string;
            role: PlazaRole;
            isPrimary: boolean;
          }[];
        };
        const company = (await cr.json()) as {
          assignments: { companyId: string }[];
        };
        const project = (await pr.json()) as {
          assignments: { projectId: string; isPrimary: boolean }[];
        };
        if (cancelled) return;

        const nextPlazas: Record<string, PlazaPick> = {};
        for (const row of access.assignments) {
          const pick = nextPlazas[row.plazaId] ?? {
            roles: [],
            isPrimary: false,
          };
          if (!pick.roles.includes(row.role)) pick.roles.push(row.role);
          pick.isPrimary = pick.isPrimary || row.isPrimary;
          nextPlazas[row.plazaId] = pick;
        }
        for (const pick of Object.values(nextPlazas)) {
          pick.roles.sort(
            (a, b) =>
              PLAZA_ROLE_OPTIONS.indexOf(a) - PLAZA_ROLE_OPTIONS.indexOf(b),
          );
        }

        const nextProjects: Record<string, { isPrimary: boolean }> = {};
        for (const row of project.assignments) {
          nextProjects[row.projectId] = { isPrimary: row.isPrimary };
        }

        setPlazaPicks(nextPlazas);
        setProjectPicks(nextProjects);
        setCompanyIds(company.assignments.map((row) => row.companyId));
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load access");
        }
      } finally {
        if (!cancelled) setAssignmentsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selected, reloadKey]);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selected) ?? null,
    [users, selected],
  );

  const grouped = useMemo(() => {
    const byProject = new Map<string, PlazaItem[]>();
    for (const z of plazas) {
      const list = byProject.get(z.projectId) ?? [];
      list.push(z);
      byProject.set(z.projectId, list);
    }
    return Array.from(byProject.entries())
      .map(([projectId, list]) => ({
        project: list[0]?.project ?? null,
        projectId,
        list: [...list].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) =>
        (a.project?.name ?? a.projectId).localeCompare(
          b.project?.name ?? b.projectId,
        ),
      );
  }, [plazas]);

  const plazaRoleCount = useMemo(
    () =>
      Object.values(plazaPicks).reduce(
        (total, pick) => total + pick.roles.length,
        0,
      ),
    [plazaPicks],
  );

  function toggleCompany(id: string) {
    setDirty(true);
    setCompanyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleProject(id: string) {
    setDirty(true);
    setProjectPicks((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = { isPrimary: false };
      return next;
    });
  }

  function setProjectPrimary(id: string, isPrimary: boolean) {
    setDirty(true);
    setProjectPicks((prev) => {
      const pick = prev[id];
      if (!pick) return prev;
      return { ...prev, [id]: { isPrimary } };
    });
  }

  function togglePlaza(id: string) {
    setDirty(true);
    setPlazaPicks((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = { roles: ["TOLL"], isPrimary: false };
      return next;
    });
  }

  function togglePlazaRole(id: string, role: PlazaRole) {
    setDirty(true);
    setPlazaPicks((prev) => {
      const pick = prev[id];
      if (!pick) return prev;
      const next = { ...prev };
      if (pick.roles.includes(role)) {
        const roles = pick.roles.filter((r) => r !== role);
        // A plaza scope with no title would grant nothing; remove it instead.
        if (roles.length === 0) delete next[id];
        else next[id] = { ...pick, roles };
      } else {
        next[id] = {
          ...pick,
          roles: PLAZA_ROLE_OPTIONS.filter(
            (r) => r === role || pick.roles.includes(r),
          ),
        };
      }
      return next;
    });
  }

  function setPlazaPrimary(id: string, isPrimary: boolean) {
    setDirty(true);
    setPlazaPicks((prev) => {
      const pick = prev[id];
      if (!pick) return prev;
      return { ...prev, [id]: { ...pick, isPrimary } };
    });
  }

  async function save() {
    if (!selected || assignmentsLoading) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      // 1. Company Head Office: add/remove the company assignments.
      const companyRes = await fetch(
        `/api/company-assignments?userId=${selected}`,
        { credentials: "same-origin" },
      );
      if (!companyRes.ok) throw new Error(await readError(companyRes));
      const currentCompanies = new Set(
        ((await companyRes.json()) as {
          assignments: { companyId: string }[];
        }).assignments.map((row) => row.companyId),
      );
      const wantedCompanies = new Set(companyIds);
      for (const companyId of Array.from(wantedCompanies)) {
        if (currentCompanies.has(companyId)) continue;
        const res = await fetch("/api/company-assignments", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId, userId: selected }),
        });
        if (!res.ok) throw new Error(await readError(res));
      }
      for (const companyId of Array.from(currentCompanies)) {
        if (wantedCompanies.has(companyId)) continue;
        const res = await fetch(
          `/api/company-assignments?companyId=${companyId}&userId=${selected}`,
          { method: "DELETE", credentials: "same-origin" },
        );
        if (!res.ok) throw new Error(await readError(res));
      }

      // 2. Project Manager: add/remove and keep primary flags in sync.
      const projectRes = await fetch(
        `/api/project-assignments?userId=${selected}`,
        { credentials: "same-origin" },
      );
      if (!projectRes.ok) throw new Error(await readError(projectRes));
      const currentProjects = new Map(
        ((await projectRes.json()) as {
          assignments: { projectId: string; isPrimary: boolean }[];
        }).assignments.map((row) => [row.projectId, row.isPrimary]),
      );
      for (const [projectId, pick] of Object.entries(projectPicks)) {
        const existing = currentProjects.get(projectId);
        if (existing !== undefined && existing === pick.isPrimary) continue;
        const res = await fetch("/api/project-assignments", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            userId: selected,
            isPrimary: pick.isPrimary,
          }),
        });
        if (!res.ok) throw new Error(await readError(res));
      }
      for (const projectId of Array.from(currentProjects.keys())) {
        if (projectPicks[projectId]) continue;
        const res = await fetch(
          `/api/project-assignments?projectId=${projectId}&userId=${selected}`,
          { method: "DELETE", credentials: "same-origin" },
        );
        if (!res.ok) throw new Error(await readError(res));
      }

      // 3. Plaza job titles: PUT replaces the user's full plaza assignment set.
      const assignments = Object.entries(plazaPicks).flatMap(
        ([plazaId, pick]) =>
          pick.roles.map((role) => ({
            plazaId,
            role,
            isPrimary: pick.isPrimary,
          })),
      );
      const accessRes = await fetch("/api/access", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selected, assignments }),
      });
      if (!accessRes.ok) throw new Error(await readError(accessRes));

      setDirty(false);
      setNotice(
        `Saved ${wantedCompanies.size} company, ${
          Object.keys(projectPicks).length
        } project and ${assignments.length} plaza role assignment${
          assignments.length === 1 ? "" : "s"
        }.`,
      );
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : "Save failed"} — some changes may already have been saved; reload the user if unsure.`,
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-[#586760]">Loading matrix…</p>;

  if (users.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {error ? (
          <p role="alert" className="text-sm text-[#8F2824]">
            {error}
          </p>
        ) : null}
        <p className="text-sm text-[#586760]">
          No users yet. Create people in the Users console first.
        </p>
      </div>
    );
  }

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
              {u.name} — {u.email} ({roleLabel(u.role)})
              {u.active ? "" : " · inactive"}
            </option>
          ))}
        </select>
      </label>

      {selectedUser ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[12px] border border-[#CDD6CE] bg-[#FAFBFC] px-4 py-3 text-sm">
          <span className="font-medium text-[#1C2824]">{selectedUser.name}</span>
          <span className="rounded bg-[#E8F0DD] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide text-[#385A2B]">
            {roleLabel(selectedUser.role)}
          </span>
          <span className="font-mono text-xs text-[#586760]">
            {companyIds.length} company · {Object.keys(projectPicks).length}{" "}
            project · {plazaRoleCount} plaza role
            {plazaRoleCount === 1 ? "" : "s"}
          </span>
          {dirty ? (
            <span className="ml-auto font-mono text-[11px] uppercase tracking-wide text-[#704900]">
              Unsaved changes
            </span>
          ) : null}
        </div>
      ) : null}

      {selectedUser?.isAdmin ? (
        <p className="rounded-[8px] border border-[#CDD6CE] bg-white px-3 py-2 text-xs text-[#586760]">
          This account is a platform Admin and can already see every company.
          The scopes below are optional and mainly useful for derived labels and
          on-site assignments.
        </p>
      ) : null}

      {assignmentsLoading ? (
        <p className="text-sm text-[#586760]">Loading access…</p>
      ) : (
        <>
          <fieldset className="rounded-[12px] border border-[#CDD6CE] bg-white p-4">
            <legend className="px-1 text-sm font-semibold text-[#1C2824]">
              Head Office ({companyIds.length} of {companies.length} companies)
            </legend>
            <p className="mb-3 text-xs text-[#586760]">
              Adding any company makes this person Head Office. Head Office sees
              every company, project and plaza in the portfolio, so the specific
              companies below mark their home companies rather than limiting
              visibility.
            </p>
            <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
              {companies.map((company) => (
                <label
                  key={company.id}
                  className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[8px] px-2 py-1 hover:bg-[#FAFBFC]"
                >
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[#173B33]"
                    checked={companyIds.includes(company.id)}
                    onChange={() => toggleCompany(company.id)}
                  />
                  <span className="text-sm text-[#1C2824]">
                    <span className="font-mono text-xs text-[#586760]">
                      {company.code}
                    </span>{" "}
                    {company.name}{" "}
                    <span className="text-xs text-[#66756D]">
                      · {company.projectCount} project
                      {company.projectCount === 1 ? "" : "s"}
                      {company.active ? "" : " · archived"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="rounded-[12px] border border-[#CDD6CE] bg-white p-4">
            <legend className="px-1 text-sm font-semibold text-[#1C2824]">
              Project Manager ({Object.keys(projectPicks).length} of{" "}
              {projects.length} projects)
            </legend>
            <p className="mb-3 text-xs text-[#586760]">
              A project assignment gives full visibility of that project and all
              of its plazas. Tick <em>Primary</em> for the person&apos;s main
              project.
            </p>
            <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
              {projects.map((project) => {
                const pick = projectPicks[project.id];
                return (
                  <div
                    key={project.id}
                    className="flex min-h-[44px] items-center gap-3 rounded-[8px] px-2 py-1 hover:bg-[#FAFBFC]"
                  >
                    <label className="flex flex-1 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[#173B33]"
                        checked={Boolean(pick)}
                        onChange={() => toggleProject(project.id)}
                      />
                      <span className="text-sm text-[#1C2824]">
                        {project.name}{" "}
                        <span className="text-xs text-[#66756D]">
                          {project.company
                            ? `${project.company.code} — ${project.company.name}`
                            : "—"}{" "}
                          · {project.round}
                          {project.acronym ? ` · ${project.acronym}` : ""}
                          {project.active ? "" : " · archived"}
                        </span>
                      </span>
                    </label>
                    {pick ? (
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[#586760]">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[#173B33]"
                          checked={pick.isPrimary}
                          onChange={(e) =>
                            setProjectPrimary(project.id, e.target.checked)
                          }
                        />
                        Primary
                      </label>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-[#1C2824]">
              Plaza job titles ({plazaRoleCount} role
              {plazaRoleCount === 1 ? "" : "s"} at{" "}
              {Object.keys(plazaPicks).length} plaza
              {Object.keys(plazaPicks).length === 1 ? "" : "s"})
            </h2>
            <p className="text-xs text-[#586760]">
              A site manager can hold more than one title at the same plaza, and
              can also be a Project Manager elsewhere. Tick a plaza, then choose
              one or more titles.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {grouped.map(({ project, projectId, list }) => (
              <fieldset
                key={projectId}
                className="rounded-[12px] border border-[#CDD6CE] bg-white p-4"
              >
                <legend className="px-1 text-sm font-semibold text-[#1C2824]">
                  {project?.name ?? "Project"}{" "}
                  <span className="font-normal text-[#66756D]">
                    {project?.company?.code ? `· ${project.company.code} · ` : ""}
                    ({list.filter((z) => plazaPicks[z.id]).length}/{list.length})
                  </span>
                </legend>
                <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
                  {list.map((z) => {
                    const pick = plazaPicks[z.id];
                    return (
                      <div
                        key={z.id}
                        className="flex min-h-[44px] flex-col justify-center gap-1 rounded-[8px] px-2 py-1 hover:bg-[#FAFBFC]"
                      >
                        <label className="flex cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-[#173B33]"
                            checked={Boolean(pick)}
                            onChange={() => togglePlaza(z.id)}
                          />
                          <span className="text-sm text-[#1C2824]">
                            {z.name}
                            {z.active ? null : (
                              <span className="ml-2 text-xs text-[#66756D]">
                                archived
                              </span>
                            )}
                          </span>
                        </label>
                        {pick ? (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-8">
                            {PLAZA_ROLE_OPTIONS.map((role) => (
                              <label
                                key={role}
                                className="flex cursor-pointer items-center gap-1.5 text-xs text-[#586760]"
                                title={PLAZA_ROLE_LABELS[role]}
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-[#173B33]"
                                  checked={pick.roles.includes(role)}
                                  onChange={() => togglePlazaRole(z.id, role)}
                                />
                                {shortRoleLabel(role)}
                              </label>
                            ))}
                            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[#586760]">
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-[#173B33]"
                                checked={pick.isPrimary}
                                onChange={(e) =>
                                  setPlazaPrimary(z.id, e.target.checked)
                                }
                              />
                              Primary
                            </label>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || assignmentsLoading || !selected}
          className="inline-flex min-h-[44px] items-center rounded-[8px] bg-[#173B33] px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save access"}
        </button>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          disabled={saving || assignmentsLoading || !dirty}
          className="inline-flex min-h-[44px] items-center rounded-[8px] border border-[rgba(23,34,44,0.12)] px-4 text-sm font-medium text-[#1C2824] disabled:opacity-50"
        >
          Discard changes
        </button>
      </div>
    </div>
  );
}
