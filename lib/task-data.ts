import type { TaskActivityType, TaskStatus } from "@prisma/client";

import {
  canApproveReopen,
  canChangeTaskStatus,
  canEditTaskCore,
  canReopenDirectly,
  canRequestReopen,
  type SessionUser,
  type TaskAccess,
  type TaskAccessTask,
} from "@/lib/access";

export const taskInclude = {
  project: {
    select: {
      id: true,
      name: true,
      acronym: true,
      round: true,
      company: { select: { id: true, name: true, code: true } },
    },
  },
  plaza: {
    select: {
      id: true,
      name: true,
      lengthKm: true,
    },
  },
  category: { select: { id: true, name: true } },
  department: {
    select: { id: true, name: true, code: true, sortOrder: true },
  },
  assignees: {
    orderBy: { assignedAt: "asc" as const },
    select: {
      assignedAt: true,
      user: { select: { id: true, name: true } },
    },
  },
  createdBy: { select: { id: true, name: true } },
  completedBy: { select: { id: true, name: true } },
} as const;

/** The API shape for one assignee: flat id/name plus when they were added. */
export type TaskAssigneeSummary = {
  id: string;
  name: string;
  assignedAt: Date;
};

type AssigneeJoinRow = {
  assignedAt: Date;
  user: { id: string; name: string };
};

/**
 * Flatten Prisma's join rows into `assignees: [{ id, name, assignedAt }]` so
 * clients do not need to know about the `TaskAssignee` table.
 */
export function serializeTask<
  T extends { assignees: AssigneeJoinRow[] },
>(task: T): Omit<T, "assignees"> & { assignees: TaskAssigneeSummary[] } {
  const { assignees, ...rest } = task;
  return {
    ...rest,
    assignees: assignees.map(({ assignedAt, user }) => ({
      id: user.id,
      name: user.name,
      assignedAt,
    })),
  };
}

export const taskDetailInclude = {
  ...taskInclude,
  activities: {
    orderBy: { createdAt: "asc" as const },
    include: {
      actor: { select: { id: true, name: true } },
      fromAssignee: { select: { id: true, name: true } },
      toAssignee: { select: { id: true, name: true } },
      attachments: {
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
        },
      },
    },
  },
  attachments: {
    orderBy: { createdAt: "asc" as const },
    include: { uploadedBy: { select: { id: true, name: true } } },
  },
  reopenRequests: {
    orderBy: { createdAt: "desc" as const },
    include: {
      requestedBy: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
  },
} as const;

export type TaskPermissions = {
  canEdit: boolean;
  canChangeStatus: boolean;
  canAssign: boolean;
  canReopenDirect: boolean;
  canRequestReopen: boolean;
  canApproveReopen: boolean;
  canComment: boolean;
  canUpload: boolean;
  /**
   * Admin-only override for the two reversible deletes the UI offers:
   * removing an attachment and cancelling another person's pending reopen
   * request. Tasks themselves are never deleted.
   */
  canAdminDelete: boolean;
};

export function taskPermissions(
  user: SessionUser,
  task: TaskAccessTask,
  access: TaskAccess,
): TaskPermissions {
  const projectScoped = task.scope === "PROJECT" || task.scope === "PLAZA";
  const hasScopeRole = access.scopeRole !== null;
  return {
    canEdit: canEditTaskCore(user, task, access.role),
    canChangeStatus: canChangeTaskStatus(access),
    // Head Office tasks (department or Head Office level) may only be
    // (re)assigned by Admin or HO. Project tasks keep the existing ceiling.
    // A manager-only observer has no scope role, so they cannot reassign.
    canAssign:
      task.status !== "COMPLETED" &&
      hasScopeRole &&
      (projectScoped ||
        access.scopeRole === "ADMIN" ||
        access.scopeRole === "HEAD_OFFICE"),
    canReopenDirect: task.status === "COMPLETED" && canReopenDirectly(access.role),
    canRequestReopen: canRequestReopen(access),
    canApproveReopen: canApproveReopen(access.role),
    canComment: true,
    canUpload: true,
    canAdminDelete: access.role === "ADMIN",
  };
}

export const ACTIVITY_LABELS: Record<TaskActivityType, string> = {
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

export const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
};
