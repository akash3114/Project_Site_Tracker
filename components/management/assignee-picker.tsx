"use client";

import { useMemo } from "react";

import {
  candidateSubtitle,
  groupAssignees,
  type AssigneeCandidate,
} from "@/lib/assignee-groups";

import { Picker, type PickerOption } from "./picker";

export type AssigneePickerProps = {
  candidates: AssigneeCandidate[];
  /** Single-select value (filter controls, legacy callers). */
  value?: string | null;
  onChange?: (id: string | null) => void;
  /** Multi-select value. When `multiple` is true this is the source of truth. */
  values?: string[];
  onValuesChange?: (ids: string[]) => void;
  multiple?: boolean;
  loading?: boolean;
  disabled?: boolean;
  scopeKind?: "project" | "department" | null;
  viewerId?: string | null;
  placeholder?: string;
  compact?: boolean;
  className?: string;
};

/**
 * Search-first assignee picker.
 *
 * Grouping, role labels and search text all come from `lib/assignee-groups`, so
 * the composer and the task drawer present the same people in the same order.
 * The viewer is pinned to the top when they are eligible for the scope.
 * Each row leads with the designation and context (`Role | Context`) and shows
 * the person's name as the quieter second line; the trigger mirrors that order.
 *
 * Single-select is kept for filter controls. Multi-select is used when a task
 * can carry a team; the "Unassigned" row is omitted there because clearing the
 * set is expressed by deselecting everyone.
 */
export function AssigneePicker({
  candidates,
  value = null,
  onChange,
  values = [],
  onValuesChange,
  multiple = false,
  loading = false,
  disabled = false,
  scopeKind = null,
  viewerId = null,
  placeholder = "Unassigned",
  compact = false,
  className,
}: AssigneePickerProps) {
  const options = useMemo<PickerOption[]>(() => {
    const rows: PickerOption[] = multiple
      ? []
      : [
          {
            value: "",
            label: "Unassigned",
            detail: "No owner",
            group: "None",
            keywords: "unassigned no owner none",
          },
        ];

    const viewer = viewerId
      ? candidates.find((candidate) => candidate.id === viewerId) ?? null
      : null;

    if (viewer) {
      rows.push({
        value: viewer.id,
        label: candidateSubtitle(viewer),
        detail: viewer.name,
        keywords: viewer.search ?? "",
        group: "Assign to me",
      });
    }

    const rest = viewer
      ? candidates.filter((candidate) => candidate.id !== viewer.id)
      : candidates;

    for (const group of groupAssignees(rest, { scopeKind, viewerId })) {
      for (const row of group.rows) {
        rows.push({
          value: row.id,
          label: candidateSubtitle(row),
          detail: row.name,
          keywords: row.search ?? "",
          group: group.label,
        });
      }
    }

    return rows;
  }, [candidates, multiple, scopeKind, viewerId]);

  const unavailable = disabled || loading;

  function renderTrigger(selected: PickerOption[]) {
    if (loading) {
      return <span className="picker-placeholder">Loading assignees…</span>;
    }
    if (disabled) {
      return <span className="picker-placeholder">{placeholder}</span>;
    }
    const row = selected[0];
    if (!value || !row) {
      return <span className="picker-placeholder">{placeholder}</span>;
    }
    return (
      <span className="picker-trigger-lines">
        <span className="picker-trigger-primary">{row.label}</span>
        {row.detail ? (
          <span className="picker-trigger-secondary">{row.detail}</span>
        ) : null}
      </span>
    );
  }

  return (
    <Picker
      label="Assignee"
      placeholder={placeholder}
      options={options}
      multiple={multiple}
      maxSelected={multiple ? 20 : undefined}
      value={multiple ? values : value ? [value] : []}
      onChange={(next) => {
        if (multiple) {
          onValuesChange?.(next);
          return;
        }
        onChange?.(next[0] ?? null);
      }}
      disabled={unavailable}
      searchPlaceholder="Search by name, role, project or plaza…"
      emptyText="No eligible assignees."
      renderTrigger={multiple ? undefined : renderTrigger}
      className={[
        "assignee-picker",
        compact ? "assignee-picker-compact" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
