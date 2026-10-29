"use client";

import { useMemo } from "react";

import type {
  ComposerPlaza,
  MgmtDepartment,
  MgmtProject,
} from "@/lib/management";

import { Picker, type PickerOption } from "./picker";

const MAX_SCOPES = 50;

/** Group projects by company so the picker's groups stay contiguous. */
function projectsByCompany(projects: MgmtProject[]): [string, MgmtProject[]][] {
  const companies = new Map<string, MgmtProject[]>();
  for (const project of projects) {
    const company = project.company?.name ?? "Other projects";
    const bucket = companies.get(company);
    if (bucket) bucket.push(project);
    else companies.set(company, [project]);
  }

  return Array.from(companies.entries())
    .map(([company, rows]): [string, MgmtProject[]] => [
      company,
      [...rows].sort((a, b) => a.name.localeCompare(b.name)),
    ])
    .sort(([a], [b]) => {
      if (a === "Other projects") return 1;
      if (b === "Other projects") return -1;
      return a.localeCompare(b);
    });
}

function keywordsFor(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * Rows for the scope picker: Head Office and its departments first, then each
 * company's projects with their plazas nested underneath. Every value is a
 * scope key from `lib/task-scope`, so a selection can be sent to the batch
 * create API without translation.
 */
export function buildScopeOptions(
  projects: MgmtProject[],
  plazas: ComposerPlaza[],
  departments: MgmtDepartment[],
  mode: "create" | "filter",
): PickerOption[] {
  const rows: PickerOption[] = [];
  const seen = new Set<string>();
  const push = (option: PickerOption) => {
    if (seen.has(option.value)) return;
    seen.add(option.value);
    rows.push(option);
  };

  push(
    mode === "create"
      ? {
          value: "head-office",
          label: "Head Office level",
          detail: "No department",
          group: "Head Office level",
          keywords: "head office ho level all no department",
        }
      : {
          value: "head-office",
          label: "All Head Office",
          detail: "Departments + level",
          group: "Head Office",
          keywords: "head office ho all departments level",
        },
  );

  for (const department of departments) {
    if (department.active === false) continue;
    push({
      value: `department:${department.id}`,
      label: department.name,
      detail: "Department",
      group: "Departments",
      keywords: keywordsFor(department.code, "department", "head office"),
    });
  }

  for (const [company, companyProjects] of projectsByCompany(projects)) {
    for (const project of companyProjects) {
      push({
        value: `project:${project.id}`,
        label: project.name,
        detail: "Project-level",
        group: company,
        keywords: keywordsFor(
          project.acronym,
          project.state,
          company,
          "project",
        ),
      });

      const children = plazas
        .filter((plaza) => plaza.project?.id === project.id)
        .sort((a, b) => a.name.localeCompare(b.name));

      for (const plaza of children) {
        push({
          value: `plaza:${plaza.id}`,
          label: plaza.name,
          detail: project.acronym || project.name,
          group: company,
          depth: 1,
          keywords: keywordsFor(project.name, project.acronym, "plaza"),
        });
      }
    }
  }

  // Plazas without a project cannot be nested; keep them selectable.
  for (const plaza of plazas) {
    if (plaza.project?.id) continue;
    push({
      value: `plaza:${plaza.id}`,
      label: plaza.name,
      detail: "Plaza",
      group: "Plazas",
      keywords: "plaza",
    });
  }

  return rows;
}

/**
 * Counts for the composer's live summary. In create mode every selected key is
 * one task, so `tasks` is simply the number of scopes.
 */
export function scopeSummary(values: string[]): {
  tasks: number;
  projects: number;
  plazas: number;
  departments: number;
  headOffice: number;
} {
  let projects = 0;
  let plazas = 0;
  let departments = 0;
  let headOffice = 0;

  for (const value of values) {
    if (value === "head-office") headOffice += 1;
    else if (value.startsWith("project:")) projects += 1;
    else if (value.startsWith("plaza:")) plazas += 1;
    else if (value.startsWith("department:")) departments += 1;
  }

  return { tasks: values.length, projects, plazas, departments, headOffice };
}

export type ScopePickerProps = {
  projects: MgmtProject[];
  plazas: ComposerPlaza[];
  departments: MgmtDepartment[];
  value: string[];
  onChange: (value: string[]) => void;
  mode: "create" | "filter";
  disabled?: boolean;
  className?: string;
};

/**
 * Multi-select scope picker. A selection is a list of scope keys; one task is
 * created per key in create mode and the keys are OR-ed together in filter
 * mode.
 */
export function ScopePicker({
  projects,
  plazas,
  departments,
  value,
  onChange,
  mode,
  disabled,
  className,
}: ScopePickerProps) {
  const options = useMemo(
    () => buildScopeOptions(projects, plazas, departments, mode),
    [projects, plazas, departments, mode],
  );

  const projectKeys = useMemo(
    () =>
      options
        .filter((option) => option.value.startsWith("project:"))
        .map((option) => option.value),
    [options],
  );

  const departmentKeys = useMemo(
    () =>
      options
        .filter((option) => option.value.startsWith("department:"))
        .map((option) => option.value),
    [options],
  );

  function addKeys(keys: string[]) {
    const next = [...value];
    for (const key of keys) {
      if (next.length >= MAX_SCOPES) break;
      if (!next.includes(key)) next.push(key);
    }
    onChange(next);
  }

  function renderTrigger(selected: PickerOption[]) {
    if (selected.length === 0) {
      return (
        <span className="picker-placeholder">
          {mode === "create" ? "Where?" : "All work"}
        </span>
      );
    }
    if (selected.length === 1) {
      return <span className="picker-trigger-text">{selected[0].label}</span>;
    }
    const shown = selected.slice(0, 2);
    const extra = selected.length - shown.length;
    return (
      <span className="picker-chips">
        {shown.map((option) => (
          <span key={option.value} className="picker-chip">
            {option.label}
          </span>
        ))}
        {extra > 0 ? (
          <span className="picker-chip picker-chip-more">+{extra}</span>
        ) : null}
      </span>
    );
  }

  return (
    <Picker
      label="Scope"
      placeholder={mode === "create" ? "Where?" : "All work"}
      options={options}
      value={value}
      onChange={onChange}
      multiple
      width="wide"
      maxSelected={MAX_SCOPES}
      disabled={disabled}
      searchPlaceholder="Search projects, plazas, departments and Head Office…"
      emptyText="No matching scope."
      renderTrigger={renderTrigger}
      className={["mgmt-scope-picker", className ?? ""].filter(Boolean).join(" ")}
      footer={
        <>
          <button type="button" onClick={() => addKeys(projectKeys)}>
            Select all projects
          </button>
          <button type="button" onClick={() => addKeys(departmentKeys)}>
            Select all HO departments
          </button>
          {mode === "filter" ? (
            <button type="button" onClick={() => addKeys(["head-office"])}>
              All Head Office
            </button>
          ) : null}
          <button
            type="button"
            data-tone="danger"
            onClick={() => onChange([])}
          >
            Clear
          </button>
          <span className="picker-footer-note">{value.length} selected</span>
        </>
      }
    />
  );
}
