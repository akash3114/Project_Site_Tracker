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
  officeName: string | null;
  projectIds: string[];
};

type DepartmentItem = {
  id: string;
  name: string;
  code: string;
  sortOrder: number;
  active: boolean;
  memberCount: number;
};

type MembershipItem = {
  userId: string;
  departmentId: string;
  isPrimary: boolean;
  assignedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    office: { name: string } | null;
  };
  department: { id: string; name: string; code: string; sortOrder: number };
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

type FetchResult<T> = { data: T | null; error: string | null };

async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

/** Fetch JSON without throwing: non-2xx and network failures become `error`. */
async function fetchJson<T>(url: string): Promise<FetchResult<T>> {
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) return { data: null, error: await readError(res) };
    return { data: (await res.json()) as T, error: null };
  } catch {
    return { data: null, error: "Network error — check the connection and retry" };
  }
}

/** "Toll Manager" → "Toll" so three title toggles fit on one row. */
function shortRoleLabel(role: PlazaRole): string {
  return PLAZA_ROLE_LABELS[role].replace(" Manager", "");
}

const smallBtnCls =
  "inline-flex min-h-[36px] items-center rounded-[8px] border border-[rgba(23,34,44,0.12)] px-3 text-xs font-medium text-[#1C2824] disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Admin/Head Office team console: Head Office departments, project managers
 * and plaza job titles. A person can hold any combination of the three scopes.
 */
export function AccessManager() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [memberships, setMemberships] = useState<MembershipItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [plazas, setPlazas] = useState<PlazaItem[]>([]);
  const [selected, setSelected] = useState("");
  const [projectPicks, setProjectPicks] = useState<
    Record<string, { isPrimary: boolean }>
  >({});
  const [plazaPicks, setPlazaPicks] = useState<Record<string, PlazaPick>>({});
  const [loading, setLoading] = useState(true);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberNotice, setMemberNotice] = useState<string | null>(null);
  const [memberBusy, setMemberBusy] = useState<string | null>(null);
  const [addDepartmentId, setAddDepartmentId] = useState("");

  const loadBase = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const [u, p, z, d, m] = await Promise.all([
      fetchJson<UserItem[]>("/api/users"),
      fetchJson<ProjectItem[]>("/api/projects"),
      fetchJson<PlazaItem[]>("/api/plazas"),
      fetchJson<DepartmentItem[]>("/api/departments"),
      fetchJson<{ memberships: MembershipItem[] }>(
        "/api/head-office-memberships",
      ),
    ]);

    const errors: string[] = [];
    if (u.data) {
      const list = u.data;
      setUsers(list);
      setSelected(
        (prev) => prev || list.find((row) => row.active)?.id || list[0]?.id || "",
      );
    } else if (u.error) {
      errors.push(u.error);
    }
    if (p.data) setProjects(p.data);
    else if (p.error) errors.push(p.error);
    if (z.data) setPlazas(z.data);
    else if (z.error) errors.push(z.error);
    if (d.data) setDepartments(d.data);
    else if (d.error) errors.push(d.error);
    if (m.data) setMemberships(m.data.memberships);
    else if (m.error) errors.push(m.error);

    setLoadError(errors.length ? errors.join(" · ") : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  /** Re-read the roster, catalogue and memberships after a membership change. */
  const refreshRoster = useCallback(async (): Promise<string | null> => {
    const [u, d, m] = await Promise.all([
      fetchJson<UserItem[]>("/api/users"),
      fetchJson<DepartmentItem[]>("/api/departments"),
      fetchJson<{ memberships: MembershipItem[] }>(
        "/api/head-office-memberships",
      ),
    ]);

    const errors: string[] = [];
    if (u.data) setUsers(u.data);
    else if (u.error) errors.push(u.error);
    if (d.data) setDepartments(d.data);
    else if (d.error) errors.push(d.error);
    if (m.data) setMemberships(m.data.memberships);
    else if (m.error) errors.push(m.error);
    return errors.length ? errors.join(" · ") : null;
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setAssignmentsLoading(true);
    setAccessError(null);
    setMemberError(null);
    setMemberNotice(null);
    setAddDepartmentId("");
    setProjectPicks({});
    setPlazaPicks({});
    setDirty(false);

    void (async () => {
      const [a, p] = await Promise.all([
        fetchJson<{
          assignments: { plazaId: string; role: PlazaRole; isPrimary: boolean }[];
        }>(`/api/access?userId=${selected}`),
        fetchJson<{
          assignments: { projectId: string; isPrimary: boolean }[];
        }>(`/api/project-assignments?userId=${selected}`),
      ]);
      if (cancelled) return;

      const errors: string[] = [];
      if (a.error) errors.push(a.error);
      if (p.error) errors.push(p.error);
      setAccessError(errors.length ? errors.join(" · ") : null);

      if (a.data) {
        const nextPlazas: Record<string, PlazaPick> = {};
        for (const row of a.data.assignments) {
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
            (x, y) =>
              PLAZA_ROLE_OPTIONS.indexOf(x) - PLAZA_ROLE_OPTIONS.indexOf(y),
          );
        }
        setPlazaPicks(nextPlazas);
      }

      if (p.data) {
        const nextProjects: Record<string, { isPrimary: boolean }> = {};
        for (const row of p.data.assignments) {
          nextProjects[row.projectId] = { isPrimary: row.isPrimary };
        }
        setProjectPicks(nextProjects);
      }

      setAssignmentsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selected, reloadKey]);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selected) ?? null,
    [users, selected],
  );

  /** The selected person's department memberships, primary first. */
  const selectedMemberships = useMemo(
    () =>
      memberships
        .filter((m) => m.userId === selected)
        .sort(
          (a, b) =>
            Number(b.isPrimary) - Number(a.isPrimary) ||
            a.department.sortOrder - b.department.sortOrder,
        ),
    [memberships, selected],
  );

  const heldDepartmentIds = useMemo(
    () => new Set(selectedMemberships.map((m) => m.departmentId)),
    [selectedMemberships],
  );

  const availableDepartments = useMemo(
    () =>
      departments.filter((d) => d.active && !heldDepartmentIds.has(d.id)),
    [departments, heldDepartmentIds],
  );

  /** Department catalogue plus the names of everyone holding each department. */
  const overview = useMemo(
    () =>
      departments.map((department) => ({
        ...department,
        members: memberships
          .filter((m) => m.departmentId === department.id)
          .sort((a, b) => a.user.name.localeCompare(b.user.name)),
      })),
    [departments, memberships],
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

  /**
   * Run one membership change immediately, then refresh the roster and
   * memberships. API errors are shown inline, never thrown.
   */
  async function mutateMembership(
    key: string,
    method: "POST" | "PUT" | "DELETE",
    url: string,
    body: unknown,
    successMessage: string,
  ): Promise<boolean> {
    setMemberBusy(key);
    setMemberError(null);
    setMemberNotice(null);
    try {
      const res = await fetch(url, {
        method,
        credentials: "same-origin",
        ...(body === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
      });
      if (!res.ok) {
        setMemberError(await readError(res));
        return false;
      }
      const refreshError = await refreshRoster();
      if (refreshError) {
        setMemberError(`Saved, but refreshing the panel failed: ${refreshError}`);
        return true;
      }
      setMemberNotice(successMessage);
      return true;
    } catch {
      setMemberError("Network error — no change was saved");
      return false;
    } finally {
      setMemberBusy(null);
    }
  }

  function addMembership() {
    if (!selected || !addDepartmentId) return;
    const isPrimary = selectedMemberships.length === 0;
    void mutateMembership(
      "add",
      "POST",
      "/api/head-office-memberships",
      { userId: selected, departmentId: addDepartmentId, isPrimary },
      isPrimary
        ? "Department added as the primary department"
        : "Department added",
    ).then((ok) => {
      if (ok) setAddDepartmentId("");
    });
  }

  function makePrimary(membership: MembershipItem) {
    void mutateMembership(
      `primary:${membership.departmentId}`,
      "PUT",
      "/api/head-office-memberships",
      {
        userId: membership.userId,
        departmentId: membership.departmentId,
        isPrimary: true,
      },
      `${membership.department.name} is now the primary department`,
    );
  }

  function removeMembership(membership: MembershipItem) {
    const params = new URLSearchParams({
      userId: membership.userId,
      departmentId: membership.departmentId,
    });
    void mutateMembership(
      `remove:${membership.departmentId}`,
      "DELETE",
      `/api/head-office-memberships?${params.toString()}`,
      undefined,
      `${membership.department.name} removed`,
    );
  }

  async function save() {
    if (!selected || assignmentsLoading) return;
    setSaving(true);
    setSaveError(null);
    setNotice(null);
    try {
      // 1. Project Manager: add/remove and keep primary flags in sync.
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

      // 2. Plaza job titles: PUT replaces the user's full plaza assignment set.
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
        `Saved ${Object.keys(projectPicks).length} project and ${
          assignments.length
        } plaza role assignment${assignments.length === 1 ? "" : "s"}.`,
      );
    } catch (e) {
      setSaveError(
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
        {loadError ? (
          <p role="alert" className="text-sm text-[#8F2824]">
            {loadError}
          </p>
        ) : null}
        <p className="text-sm text-[#586760]">
          No users yet. Create people in the Users console first.
        </p>
      </div>
    );
  }

  const bannerError = [loadError, accessError, saveError]
    .filter(Boolean)
    .join(" · ");

  const busy = memberBusy !== null;

  return (
    <div className="flex flex-col gap-4">
      {bannerError ? (
        <p role="alert" className="text-sm text-[#8F2824]">
          {bannerError}
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
            {selectedMemberships.length} department
            {selectedMemberships.length === 1 ? "" : "s"} ·{" "}
            {Object.keys(projectPicks).length} project · {plazaRoleCount} plaza
            role{plazaRoleCount === 1 ? "" : "s"}
            {selectedUser.officeName ? ` · ${selectedUser.officeName}` : ""}
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
          This account is a platform Admin and can already see every project and
          plaza. The scopes below are optional and mainly useful for derived
          labels and on-site assignments.
        </p>
      ) : null}

      {assignmentsLoading ? (
        <p className="text-sm text-[#586760]">Loading access…</p>
      ) : (
        <>
          <fieldset className="rounded-[12px] border border-[#CDD6CE] bg-white p-4">
            <legend className="px-1 text-sm font-semibold text-[#1C2824]">
              Head Office departments ({selectedMemberships.length}
              {departments.length ? ` of ${departments.length}` : ""})
            </legend>
            <p className="mb-3 text-xs text-[#586760]">
              Head Office is an internal department membership. Holding any
              department grants portfolio-wide visibility; the primary
              department is the one shown in the header badge. Departments do
              not restrict approvals. Changes here apply immediately — the
              button below saves the project and plaza scopes only.
            </p>

            {selectedMemberships.length === 0 ? (
              <p className="mb-3 rounded-[8px] border border-[#E4EAE4] bg-[#FAFBFC] px-3 py-2 text-xs text-[#586760]">
                No Head Office department yet. Adding one makes this person Head
                Office.
              </p>
            ) : (
              <ul className="mb-3 flex flex-col gap-2">
                {selectedMemberships.map((membership) => (
                  <li
                    key={membership.departmentId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[8px] border border-[#E4EAE4] px-3 py-2"
                  >
                    <span className="font-mono text-[11px] uppercase tracking-wide text-[#66756D]">
                      {membership.department.code}
                    </span>
                    <span className="text-sm text-[#1C2824]">
                      {membership.department.name}
                    </span>
                    {membership.isPrimary ? (
                      <span className="rounded bg-[#E8F0DD] px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-[#385A2B]">
                        Primary
                      </span>
                    ) : null}
                    <span className="text-xs text-[#66756D]">
                      Office: {membership.user.office?.name ?? "—"}
                    </span>
                    <span className="ml-auto flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy || membership.isPrimary}
                        onClick={() => makePrimary(membership)}
                        className={smallBtnCls}
                      >
                        {memberBusy === `primary:${membership.departmentId}`
                          ? "Saving…"
                          : "Make primary"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => removeMembership(membership)}
                        className={smallBtnCls}
                      >
                        {memberBusy === `remove:${membership.departmentId}`
                          ? "Removing…"
                          : "Remove"}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {memberError ? (
              <p role="alert" className="mb-2 text-xs text-[#8F2824]">
                {memberError}
              </p>
            ) : null}
            {memberNotice ? (
              <p className="mb-2 text-xs text-[#385A2B]">{memberNotice}</p>
            ) : null}

            <div className="flex flex-wrap items-end gap-2 border-t border-[#E4EAE4] pt-3">
              <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-xs font-medium text-[#1C2824]">
                Add department
                <select
                  className="min-h-[44px] w-full rounded-[8px] border border-[rgba(23,34,44,0.12)] bg-white px-3 py-2 text-sm"
                  value={addDepartmentId}
                  onChange={(e) => setAddDepartmentId(e.target.value)}
                  disabled={busy || availableDepartments.length === 0}
                >
                  <option value="">
                    {availableDepartments.length === 0
                      ? "All departments already held"
                      : "Choose a department…"}
                  </option>
                  {availableDepartments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.code} — {department.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={addMembership}
                disabled={busy || !addDepartmentId}
                className="inline-flex min-h-[44px] items-center rounded-[8px] bg-[#173B33] px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {memberBusy === "add" ? "Adding…" : "Add"}
              </button>
            </div>
          </fieldset>

          <details
            className="rounded-[12px] border border-[#CDD6CE] bg-white p-4"
            open
          >
            <summary className="cursor-pointer text-sm font-semibold text-[#1C2824]">
              Department overview · {departments.length} department
              {departments.length === 1 ? "" : "s"} · {memberships.length} Head
              Office member{memberships.length === 1 ? "" : "s"}
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              {overview.map((department) => (
                <div
                  key={department.id}
                  className="rounded-[8px] border border-[#E4EAE4] px-3 py-2"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm text-[#1C2824]">
                      <span className="mr-1.5 font-mono text-[11px] text-[#66756D]">
                        {department.code}
                      </span>
                      {department.name}
                      {department.active ? null : (
                        <span className="ml-1.5 text-[11px] text-[#66756D]">
                          (inactive)
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-[#586760]">
                      {department.memberCount} member
                      {department.memberCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#586760]">
                    {department.members.length
                      ? department.members.map((m) => m.user.name).join(", ")
                      : "No members"}
                  </p>
                </div>
              ))}
            </div>
          </details>

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
