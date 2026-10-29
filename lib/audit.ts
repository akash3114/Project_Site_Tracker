/**
 * Master-data audit log.
 *
 * Task history is `TaskActivity` — the feed and the task audit trail are the
 * same append-only stream. Everything else that changes master data writes an
 * `AuditLog` row here: one row per mutation, with a before/after snapshot.
 *
 * Callers pass explicit, safe snapshots. Never dump a whole `User` row: it
 * contains `passwordHash`.
 */

import type { Prisma } from "@prisma/client";

export type AuditAction = "CREATE" | "UPDATE" | "ARCHIVE" | "GRANT" | "REVOKE";

export type AuditEntry = {
  actorId: string;
  /** Logical model name, e.g. "Company", "Project", "Plaza", "User". */
  entity: string;
  entityId: string;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
};

type AuditClient = Pick<Prisma.TransactionClient, "auditLog">;

/** Prisma Json accepts plain JSON only; Dates become ISO strings. */
function jsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function auditData(
  entry: AuditEntry,
): Prisma.AuditLogUncheckedCreateInput {
  const data: Prisma.AuditLogUncheckedCreateInput = {
    actorId: entry.actorId,
    entity: entry.entity,
    entityId: entry.entityId,
    action: entry.action,
  };
  const before = jsonValue(entry.before);
  if (before !== undefined) data.before = before;
  const after = jsonValue(entry.after);
  if (after !== undefined) data.after = after;
  return data;
}

export async function logAudit(
  client: AuditClient,
  entry: AuditEntry,
): Promise<void> {
  await client.auditLog.create({ data: auditData(entry) });
}

/** Pick only the given keys from a record, for safe before/after snapshots. */
export function snapshot(
  record: object,
  keys: readonly string[],
): Record<string, unknown> {
  const source = record as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of keys) out[key] = source[key];
  return out;
}
