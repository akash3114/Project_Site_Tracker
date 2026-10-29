/**
 * Shared task-scope contract.
 *
 * A task belongs to exactly one scope: a project (optionally narrowed to one
 * of its plazas) or Head Office (optionally narrowed to one department).
 * These helpers are the single source of truth for turning a task row into a
 * scope, serialising scopes to the keys used by filters and the scope picker,
 * and deciding whether a task belongs to a given scope.
 *
 * Keep this module dependency-free apart from Prisma *types* so it can be
 * imported from client components, route handlers and seed-adjacent scripts.
 */

import type { Prisma } from "@prisma/client";

/** A task's location. `departmentId: null` means Head Office level. */
export type TaskScope =
  | { kind: "project"; projectId: string; plazaId: string | null }
  | { kind: "department"; departmentId: string | null };

/** A selectable location in the scope picker / filter. */
export type ScopeRef =
  | { kind: "project"; id: string }
  | { kind: "plaza"; id: string }
  | { kind: "department"; id: string }
  | { kind: "head-office" };

/** The three scope columns, as selected from `Task`. */
export type TaskScopeFields = {
  projectId: string | null;
  plazaId: string | null;
  departmentId: string | null;
};

const HEAD_OFFICE_KEY = "head-office";

/**
 * Serialise a scope reference to its stable key:
 * `"project:<id>" | "plaza:<id>" | "department:<id>" | "head-office"`.
 */
export function scopeKey(ref: ScopeRef): string {
  switch (ref.kind) {
    case "head-office":
      return HEAD_OFFICE_KEY;
    case "project":
      return `project:${ref.id}`;
    case "plaza":
      return `plaza:${ref.id}`;
    case "department":
      return `department:${ref.id}`;
  }
}

/** Inverse of {@link scopeKey}. Returns `null` for anything unrecognised. */
export function parseScopeKey(key: string): ScopeRef | null {
  if (key === HEAD_OFFICE_KEY) return { kind: "head-office" };

  const separator = key.indexOf(":");
  if (separator <= 0) return null;

  const kind = key.slice(0, separator);
  const id = key.slice(separator + 1);
  if (!id) return null;

  switch (kind) {
    case "project":
      return { kind: "project", id };
    case "plaza":
      return { kind: "plaza", id };
    case "department":
      return { kind: "department", id };
    default:
      return null;
  }
}

/**
 * The scope of a task row. Department scope wins because a department task
 * never has a project. A row with neither column set is Head Office level.
 */
export function taskScopeOf(task: TaskScopeFields): TaskScope | null {
  if (task.departmentId !== null) {
    return { kind: "department", departmentId: task.departmentId };
  }
  if (task.projectId !== null) {
    return {
      kind: "project",
      projectId: task.projectId,
      plazaId: task.plazaId,
    };
  }
  return { kind: "department", departmentId: null };
}

/**
 * The most specific reference for a task: its plaza when it has one, else its
 * project, else its department, else Head Office.
 */
export function scopeRefOf(task: TaskScopeFields): ScopeRef | null {
  if (task.departmentId !== null) {
    return { kind: "department", id: task.departmentId };
  }
  if (task.projectId !== null) {
    return task.plazaId !== null
      ? { kind: "plaza", id: task.plazaId }
      : { kind: "project", id: task.projectId };
  }
  return { kind: "head-office" };
}

/** Stable key for a scope (Head Office level serialises to `"head-office"`). */
export function scopeKeyOf(scope: TaskScope): string {
  if (scope.kind === "department") {
    return scope.departmentId === null
      ? HEAD_OFFICE_KEY
      : `department:${scope.departmentId}`;
  }
  return scope.plazaId === null
    ? `project:${scope.projectId}`
    : `plaza:${scope.plazaId}`;
}

/**
 * Does a task fall inside a scope reference?
 *
 * - `project:<id>` matches the project's project-level tasks *and* all of its
 *   plaza tasks (filter semantics; creation is project-level only).
 * - `plaza:<id>` matches only that plaza.
 * - `department:<id>` matches only that department.
 * - `head-office` matches every Head Office task: any task with a department,
 *   plus any task with no project.
 */
export function taskMatchesScope(
  task: TaskScopeFields,
  ref: ScopeRef
): boolean {
  switch (ref.kind) {
    case "project":
      return task.projectId === ref.id;
    case "plaza":
      return task.plazaId === ref.id;
    case "department":
      return task.departmentId === ref.id;
    case "head-office":
      return task.departmentId !== null || task.projectId === null;
  }
}

/** Two scopes are the same when they serialise to the same key. */
export function sameScope(a: TaskScope | null, b: TaskScope | null): boolean {
  if (a === null || b === null) return a === b;
  return scopeKeyOf(a) === scopeKeyOf(b);
}

/**
 * Prisma `where` fragment equivalent to {@link taskMatchesScope}. Handy for
 * list queries and counts; `null` scopes match nothing.
 */
export function scopeTaskWhere(scope: TaskScope | null): Prisma.TaskWhereInput {
  if (scope === null) return { id: { in: [] } };

  if (scope.kind === "department") {
    if (scope.departmentId === null) {
      return {
        OR: [{ departmentId: { not: null } }, { projectId: null }],
      };
    }
    return { departmentId: scope.departmentId };
  }

  return scope.plazaId === null
    ? { projectId: scope.projectId }
    : { plazaId: scope.plazaId };
}
