"use client";

import { fmtDateTimeIST } from "@/lib/format";

import { formatBytes } from "./attachment-list";

type PersonRef = { id?: string; name?: string | null } | string | null;

export type FeedAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type FeedEvent = {
  id: string;
  type: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  /** Prisma returns `{ id, name }`; tolerate plain strings from older payloads. */
  fromAssignee?: PersonRef;
  toAssignee?: PersonRef;
  text?: string | null;
  actor?: { id?: string; name?: string | null } | null;
  createdAt?: string | null;
  attachments?: FeedAttachment[];
};

/** Mirrors ACTIVITY_LABELS in lib/task-data (kept local so no server import). */
const EVENT_LABELS: Record<string, string> = {
  CREATED: "Created",
  COMMENT: "Comment",
  ASSIGNED: "Assignment changed",
  STATUS_CHANGED: "Status changed",
  REOPEN_REQUESTED: "Reopen requested",
  REOPEN_APPROVED: "Reopen approved",
  REOPEN_REJECTED: "Reopen rejected",
  REOPEN_CANCELLED: "Reopen request cancelled",
  REOPENED: "Reopened",
  ATTACHMENT: "Attachment",
  UPDATED: "Details updated",
};

const STATUS_LABELS: Record<string, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
};

function personName(value: PersonRef | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.name ?? null;
}

function statusLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return STATUS_LABELS[value] ?? value;
}

function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type.replaceAll("_", " ").toLowerCase();
}

function systemDetail(event: FeedEvent): string {
  switch (event.type) {
    case "CREATED":
      return "Task created";
    case "STATUS_CHANGED": {
      const from = statusLabel(event.fromStatus);
      const to = statusLabel(event.toStatus);
      return from && to ? `${from} → ${to}` : "Status changed";
    }
    case "ASSIGNED": {
      const from = personName(event.fromAssignee) ?? "Unassigned";
      const to = personName(event.toAssignee) ?? "Unassigned";
      return `${from} → ${to}`;
    }
    case "UPDATED":
      return event.text?.trim() || "Details updated";
    case "ATTACHMENT":
      return event.text ? `Attached ${event.text}` : "Attachment added";
    case "REOPEN_APPROVED": {
      const from = statusLabel(event.fromStatus);
      const to = statusLabel(event.toStatus);
      return from && to ? `Reopen approved · ${from} → ${to}` : "Reopen approved";
    }
    case "REOPEN_REJECTED":
      return "Task stays completed";
    case "REOPENED": {
      const from = statusLabel(event.fromStatus);
      const to = statusLabel(event.toStatus);
      return from && to ? `Reopened · ${from} → ${to}` : "Task reopened";
    }
    case "REOPEN_REQUESTED":
      return "Awaiting Admin / Head Office approval";
    case "REOPEN_CANCELLED":
      return "Request withdrawn";
    default:
      return event.text?.trim() || eventLabel(event.type);
  }
}

function AttachmentLinks({ attachments }: { attachments: FeedAttachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-col gap-1">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          <a
            href={`/api/attachments/${encodeURIComponent(attachment.id)}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] text-[#173B33] underline underline-offset-2 hover:no-underline"
          >
            {attachment.fileName}
          </a>{" "}
          <span className="font-mono text-[11px] text-[#66756D]">
            ({formatBytes(attachment.sizeBytes)})
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Immutable activity feed (no edit/delete controls by design — events are
 * append-only on the server). COMMENT rows render as bubbles; every other
 * type renders as a muted system row with actor + IST timestamp.
 */
export function ActivityFeed({ events }: { events: FeedEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="rounded-[6px] bg-[#FAFBFC] p-4 text-center font-body text-sm text-[#586760]">
        No activity yet.
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-2" aria-label="Activity feed">
      {events.map((event) => {
        const actor = event.actor?.name ?? "System";
        const when = fmtDateTimeIST(event.createdAt);
        const attachments = event.attachments ?? [];

        if (event.type === "COMMENT") {
          return (
            <li
              key={event.id}
              className="rounded-[6px] border border-[#173B33]/30 bg-[#173B33]/5 p-3"
            >
              <p className="whitespace-pre-wrap font-body text-sm text-[#1C2824]">
                {event.text}
              </p>
              <AttachmentLinks attachments={attachments} />
              <p className="mt-1 font-mono text-xs text-[#66756D]">
                {actor} · {when}
              </p>
            </li>
          );
        }

        const label = eventLabel(event.type);
        const detail = systemDetail(event);
        // Show free-text notes (status notes, reopen reasons, review notes)
        // unless the summary already carries the same text.
        const text = event.text?.trim() ?? "";
        const note =
          text && text !== detail && event.type !== "ATTACHMENT" ? text : null;

        return (
          <li
            key={event.id}
            className="rounded-[6px] bg-[#FAFBFC] px-3 py-2 font-body text-sm text-[#586760]"
          >
            <span className="font-mono text-xs uppercase text-[#66756D]">
              {label}
            </span>{" "}
            {detail}
            {note && note !== detail ? (
              <span className="mt-1 block whitespace-pre-wrap border-l-2 border-[#CDD6CE] pl-2 font-body text-xs italic text-[#586760]">
                {note}
              </span>
            ) : null}
            <AttachmentLinks attachments={attachments} />
            <span className="mt-1 block font-mono text-xs text-[#66756D]">
              {actor} · {when}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
