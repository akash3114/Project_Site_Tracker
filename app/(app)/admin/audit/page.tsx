"use client";

import { useEffect, useState } from "react";

import { fmtDateTimeIST } from "@/lib/format";
import { PageHeader } from "@/components/page-header";

type TaskActivityType =
  | "CREATED"
  | "COMMENT"
  | "ASSIGNED"
  | "STATUS_CHANGED"
  | "REOPEN_REQUESTED"
  | "REOPEN_APPROVED"
  | "REOPEN_REJECTED"
  | "REOPEN_CANCELLED"
  | "REOPENED"
  | "ATTACHMENT"
  | "UPDATED";

type AuditEvent = {
  id: string;
  type: TaskActivityType;
  fromStatus: string | null;
  toStatus: string | null;
  text: string | null;
  createdAt: string;
  actor: { id: string; name: string };
  fromAssignee: { id: string; name: string } | null;
  toAssignee: { id: string; name: string } | null;
  task: {
    id: string;
    title: string;
    project: { id: string; name: string } | null;
    plaza: { id: string; name: string } | null;
  };
};

const TYPE_LABELS: Record<TaskActivityType, string> = {
  CREATED: "Created",
  COMMENT: "Comment",
  ASSIGNED: "Assigned",
  STATUS_CHANGED: "Status",
  REOPEN_REQUESTED: "Reopen requested",
  REOPEN_APPROVED: "Reopen approved",
  REOPEN_REJECTED: "Reopen rejected",
  REOPEN_CANCELLED: "Reopen cancelled",
  REOPENED: "Reopened",
  ATTACHMENT: "Attachment",
  UPDATED: "Updated",
};

const TYPE_TONE: Record<TaskActivityType, string> = {
  CREATED: "bg-[#E8EDF2] text-[#0E3A5D]",
  COMMENT: "bg-[#E8F0DD] text-[#15803D]",
  ASSIGNED: "bg-[#E3E8FF] text-[#3730A3]",
  STATUS_CHANGED: "bg-[#E3E8FF] text-[#3730A3]",
  REOPEN_REQUESTED: "bg-[#FFF1CC] text-[#704900]",
  REOPEN_APPROVED: "bg-[#E8F0DD] text-[#385A2B]",
  REOPEN_REJECTED: "bg-[#FBE8E4] text-[#8F2824]",
  REOPEN_CANCELLED: "bg-[#F5F5EF] text-[#586760]",
  REOPENED: "bg-[#FFF1CC] text-[#704900]",
  ATTACHMENT: "bg-[#F5F5EF] text-[#586760]",
  UPDATED: "bg-[#F5F5EF] text-[#586760]",
};

const FALLBACK_TONE = "bg-[#F5F5EF] text-[#586760]";

const STATUS_LABELS: Record<string, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ").toLowerCase();
}

/** Only surface a status transition when it actually moved. */
function statusChange(event: AuditEvent): string | null {
  if (event.type === "CREATED") return null;
  if (!event.fromStatus || !event.toStatus) return null;
  if (event.fromStatus === event.toStatus) return null;
  return `${statusLabel(event.fromStatus)} → ${statusLabel(event.toStatus)}`;
}

/** Assignment delta; CREATED already shows the assignee through its text. */
function assigneeChange(event: AuditEvent): string | null {
  if (event.type === "CREATED") return null;
  const from = event.fromAssignee?.name ?? null;
  const to = event.toAssignee?.name ?? null;
  if (!from && !to) return null;
  if (from && to && from !== to) return `${from} → ${to}`;
  if (!from && to) return `→ ${to}`;
  if (from && !to) return `${from} → Unassigned`;
  return null;
}

/** Read-only audit trail (T-040). No edit/delete controls by design. */
export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/events?take=100", { credentials: "same-origin" })
      .then(async (r) => {
        if (r.status === 401) throw new Error("Please log in.");
        if (r.status === 403) throw new Error("Admin or Head Office only");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        setEvents(Array.isArray(data) ? data : (data.items ?? []));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-6">
      <PageHeader
        overline="Administration"
        title="Audit trail"
        subtitle="Latest 100 task activities. Append-only — tasks and events can never be edited or deleted here."
      />
      {error ? (
        <p role="alert" className="rounded-md border border-[#F3C2C2] bg-[#FEF2F2] p-4 text-sm text-[#8F2824]">
          {error}
        </p>
      ) : events === null ? (
        <p className="text-sm text-[#586760]">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-[#586760]">No events yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {events.map((e) => {
            const status = statusChange(e);
            const assignment = assigneeChange(e);
            return (
              <li
                key={e.id}
                className="flex min-h-[44px] flex-col gap-2 rounded-[12px] border border-[#CDD6CE] bg-white px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-medium ${TYPE_TONE[e.type] ?? FALLBACK_TONE}`}
                  >
                    {TYPE_LABELS[e.type] ?? e.type}
                  </span>
                  <span className="font-body font-medium text-[#1C2824]">
                    {e.task.title}
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-[#66756D]">
                    {e.actor.name} · {fmtDateTimeIST(e.createdAt)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-[#586760]">
                  <span>
                    {e.task.project?.name ?? "—"}
                    <span aria-hidden className="px-1 text-[#9AA7A0]">›</span>
                    {e.task.plaza ? (
                      e.task.plaza.name
                    ) : (
                      <span className="rounded border border-[#CDD6CE] bg-[#F5F5EF] px-1 py-0.5 text-[#586760]">
                        Project-level
                      </span>
                    )}
                  </span>
                  {status ? (
                    <span className="rounded bg-[#E3E8FF] px-1.5 py-0.5 text-[#3730A3]">
                      {status}
                    </span>
                  ) : null}
                  {assignment ? <span>Assignee {assignment}</span> : null}
                </div>

                {e.text ? (
                  <p className="font-body text-[13px] text-[#586760]">{e.text}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
