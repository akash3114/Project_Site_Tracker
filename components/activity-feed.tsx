"use client";

import { fmtDateTimeIST } from "@/lib/format";

export type FeedEvent = {
  id: string;
  type: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  text?: string | null;
  actor?: { id?: string; name?: string | null } | null;
  createdAt?: string | null;
};

/**
 * Immutable activity feed (no edit/delete controls by design — events are
 * append-only on the server). COMMENT rows render as bubbles, everything
 * else as muted system rows with actor + timestamp.
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
      {events.map((ev) => {
        const actor = ev.actor?.name ?? "System";
        const when = fmtDateTimeIST(ev.createdAt);
        if (ev.type === "COMMENT") {
          return (
            <li
              key={ev.id}
              className="rounded-[6px] border border-[#173B33]/30 bg-[#173B33]/5 p-3"
            >
              <p className="font-body text-sm text-[#1C2824]">{ev.text}</p>
              <p className="mt-1 font-mono text-xs text-[#66756D]">
                {actor} · {when}
              </p>
            </li>
          );
        }
        const detail =
          ev.type === "STATUS" || ev.type === "REOPEN"
            ? `${ev.fromStatus ?? "?"} → ${ev.toStatus ?? "?"}`
            : ev.type === "ASSIGN"
              ? "assignment changed"
              : ev.type === "META"
                ? (ev.text ?? "details updated")
                : (ev.text ?? ev.type);
        return (
          <li
            key={ev.id}
            className="rounded-[6px] bg-[#FAFBFC] px-3 py-2 font-body text-sm text-[#586760]"
          >
            <span className="font-mono text-xs uppercase text-[#66756D]">
              {ev.type}
            </span>{" "}
            {detail}
            {ev.text && ev.type !== "META" ? ` — ${ev.text}` : null}
            <span className="block font-mono text-xs text-[#66756D]">
              {actor} · {when}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
