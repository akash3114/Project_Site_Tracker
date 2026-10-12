"use client";

import { useEffect, useState } from "react";

type AuditEvent = {
  id: string;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  text: string | null;
  createdAt: string;
  actor: { name: string };
  task: { id: string; title: string };
};

const TYPE_TONE: Record<string, string> = {
  CREATED: "bg-[#E8EDF2] text-[#0E3A5D]",
  STATUS: "bg-[#E3E8FF] text-[#3730A3]",
  ASSIGN: "bg-[#E8EDF2] text-[#0E3A5D]",
  COMMENT: "bg-[#DCFCE7] text-[#15803D]",
  REOPEN: "bg-[#FEF3C7] text-[#92400E]",
  META: "bg-[#F4F5F7] text-[#5C6F7E]",
};

/** Read-only audit trail (T-040). No edit/delete controls by design. */
export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/events?take=100", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "Lead/Admin only" : `HTTP ${r.status}`);
        const data = await r.json();
        setEvents(Array.isArray(data) ? data : data.items ?? []);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-[#0E121B]">
          Audit trail
        </h1>
        <p className="font-body text-sm text-[#5C6F7E]">
          Latest 100 task events. Append-only — tasks and events can never be edited or deleted
          here.
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded-md border border-[#F3C2C2] bg-[#FEF2F2] p-4 text-sm text-[#DC2626]">
          {error}
        </p>
      ) : events === null ? (
        <p className="text-sm text-[#5C6F7E]">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-[#5C6F7E]">No events yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {events.map((e) => (
            <li
              key={e.id}
              className="flex min-h-[44px] flex-wrap items-center gap-2 rounded-md border border-[rgba(23,34,44,0.08)] bg-white px-3 py-2 text-sm"
            >
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-medium ${TYPE_TONE[e.type] ?? "bg-[#F4F5F7] text-[#5C6F7E]"}`}
              >
                {e.type}
              </span>
              <span className="font-body text-[#17222C]">{e.task.title}</span>
              {e.fromStatus && e.toStatus ? (
                <span className="font-mono text-xs text-[#5C6F7E]">
                  {e.fromStatus} → {e.toStatus}
                </span>
              ) : null}
              {e.text ? (
                <span className="w-full font-body text-[13px] text-[#5C6F7E]">{e.text}</span>
              ) : null}
              <span className="ml-auto font-mono text-[11px] text-[#8A97A3]">
                {e.actor.name} · {new Date(e.createdAt).toLocaleString("en-GB")}
              </span>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
