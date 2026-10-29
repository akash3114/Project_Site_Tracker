import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type LoginInput = z.infer<typeof loginSchema>;

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

export const companySchema = z.object({
  name: z.string().min(2).max(150),
  code: z.string().min(1).max(20).optional(),
  active: z.boolean().optional(),
});

export const updateCompanySchema = companySchema.partial();

export const projectSchema = z.object({
  companyId: z.string().cuid(),
  name: z.string().min(3).max(150),
  acronym: z.preprocess(emptyToUndefined, z.string().max(20).optional()),
  round: z.enum(["ROUND_1", "ROUND_2", "ROUND_3", "ROUND_4"]),
  state: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
  lengthKm: z.preprocess(
    emptyToUndefined,
    z.coerce.number().positive().max(100000).optional(),
  ),
  piu: z.preprocess(emptyToUndefined, z.string().max(150).optional()),
  ro: z.preprocess(emptyToUndefined, z.string().max(150).optional()),
  active: z.boolean().optional(),
});

export const updateProjectSchema = projectSchema.partial();

export const plazaSchema = z.object({
  projectId: z.string().cuid(),
  name: z.string().min(3).max(150),
  state: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
  piu: z.preprocess(emptyToUndefined, z.string().max(150).optional()),
  ro: z.preprocess(emptyToUndefined, z.string().max(150).optional()),
  lengthKm: z.preprocess(
    emptyToUndefined,
    z.coerce.number().positive().max(100000).optional(),
  ),
  active: z.boolean().optional(),
});

export const updatePlazaSchema = plazaSchema
  .omit({ projectId: true })
  .partial();

export const userSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  // Job title used as the assignee label ("Operations Manager", "Toll Manager").
  title: z.string().max(100).optional(),
  password: z.string().min(6),
  isAdmin: z.boolean().default(false),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phone: z.string().max(30).nullable().optional(),
  title: z.string().max(100).nullable().optional(),
  isAdmin: z.boolean().optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

// Department ids can be non-cuid (e.g. `dept_admin` from the migration), so
// these schemas validate presence only.
export const headOfficeMembershipSchema = z.object({
  userId: z.string().min(1),
  departmentId: z.string().min(1),
  isPrimary: z.boolean().default(false),
});

export const headOfficeMembershipUpdateSchema = z.object({
  userId: z.string().min(1),
  departmentId: z.string().min(1),
  isPrimary: z.boolean(),
});

export const projectAssignmentSchema = z.object({
  projectId: z.string().cuid(),
  userId: z.string().cuid(),
  isPrimary: z.boolean().default(false),
});

export const plazaAssignmentSchema = z.object({
  plazaId: z.string().cuid(),
  userId: z.string().cuid(),
  role: z.enum(["TOLL", "MAINTENANCE", "CORRIDOR"]),
  isPrimary: z.boolean().default(false),
});

// A task belongs to exactly one scope: a project (optionally narrowed to a
// plaza) or Head Office (optionally narrowed to a department). An empty scope
// means Head Office level. Department ids can be non-cuid (e.g. `dept_admin`),
// so they validate presence only. A plaza may arrive without its project; the
// route resolves and stores the project before writing.
const taskScopeObject = z.object({
  projectId: z.preprocess(emptyToUndefined, z.string().cuid().optional()),
  plazaId: z.preprocess(emptyToUndefined, z.string().cuid().optional()),
  departmentId: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
});

function taskScopeIssues(
  value: {
    projectId?: string;
    plazaId?: string;
    departmentId?: string;
  },
  ctx: z.RefinementCtx,
): void {
  if (value.projectId && value.departmentId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Choose either a project or a department, not both",
      path: ["departmentId"],
    });
  }

  if (value.plazaId && value.departmentId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Choose either a plaza or a department, not both",
      path: ["departmentId"],
    });
  }
}

export const taskScopeSchema = taskScopeObject.superRefine(taskScopeIssues);

export const createTaskSchema = taskScopeObject
  .extend({
    categoryId: z.preprocess(emptyToUndefined, z.string().cuid().optional()),
    title: z.string().min(3).max(200),
    description: z.preprocess(emptyToUndefined, z.string().max(5000).optional()),
    priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
    assigneeId: z.preprocess(emptyToUndefined, z.string().cuid().optional()),
    dueDate: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
        .optional(),
    ),
  })
  .superRefine(taskScopeIssues);

/** Key used to reject duplicate scopes in a batch create. */
function batchScopeKey(scope: {
  projectId?: string;
  plazaId?: string;
  departmentId?: string;
}): string {
  if (scope.departmentId) return `department:${scope.departmentId}`;
  if (scope.plazaId) return `plaza:${scope.plazaId}`;
  if (scope.projectId) return `project:${scope.projectId}`;
  return "head-office";
}

export const createTasksSchema = z
  .object({
    scopes: z.array(taskScopeSchema).min(1).max(50),
    title: z.string().min(3).max(200),
    description: z.preprocess(emptyToUndefined, z.string().max(5000).optional()),
    priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
    assigneeId: z.preprocess(emptyToUndefined, z.string().cuid().optional()),
    dueDate: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
        .optional(),
    ),
    categoryId: z.preprocess(emptyToUndefined, z.string().cuid().optional()),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.scopes.forEach((scope, index) => {
      const key = batchScopeKey(scope);
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate scope: ${key}`,
          path: ["scopes", index],
        });
      }
      seen.add(key);
    });
  });

export const updateTaskSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.preprocess(
    emptyToUndefined,
    z.string().max(5000).nullable().optional(),
  ),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  categoryId: z.preprocess(emptyToNull, z.string().cuid().nullable().optional()),
  dueDate: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .nullable()
      .optional(),
  ),
});

export const statusSchema = z.object({
  to: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED"]),
  text: z.string().max(2000).optional(),
});

export const assignSchema = z.object({
  assigneeId: z.string().cuid().nullable(),
});

export const commentSchema = z
  .object({
    text: z.string().max(2000).default(""),
    attachmentIds: z.array(z.string().cuid()).max(10).optional(),
  })
  .refine(
    (value) =>
      value.text.trim().length > 0 || (value.attachmentIds?.length ?? 0) > 0,
    {
      message: "A comment needs text or at least one attachment",
      path: ["text"],
    },
  );

export const reopenRequestSchema = z.object({
  reason: z.string().min(10).max(2000),
});

export const reopenDecisionSchema = z.object({
  requestId: z.string().cuid(),
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().max(2000).optional(),
});

export const categorySchema = z.object({
  name: z.string().min(2).max(80),
  active: z.boolean().optional(),
});

export const updateCategorySchema = categorySchema.partial();

export const plazaAssignmentInputSchema = z.object({
  plazaId: z.string().cuid(),
  role: z.enum(["TOLL", "MAINTENANCE", "CORRIDOR"]),
  isPrimary: z.boolean().default(false),
});

export const accessPutSchema = z.object({
  userId: z.string().cuid(),
  assignments: z.array(plazaAssignmentInputSchema).max(500),
});

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
