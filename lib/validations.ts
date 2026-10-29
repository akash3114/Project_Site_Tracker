import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type LoginInput = z.infer<typeof loginSchema>;

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

/**
 * Ids are opaque strings. Generated rows use cuid(); reference rows use stable
 * slugs such as `dept_fin`, `office_delhi`, `cat_toll_ops` and `company_neppl`.
 * Validate shape only — never the cuid format.
 */
export const idSchema = z.string().min(1).max(64);

export const companySchema = z.object({
  name: z.string().min(2).max(150),
  // Required by the database and used as the company's stable short code.
  code: z.string().min(1).max(20),
  active: z.boolean().optional(),
});

export const updateCompanySchema = companySchema.partial();

export const projectSchema = z.object({
  companyId: idSchema,
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
  projectId: idSchema,
  name: z.string().min(3).max(150),
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

export const headOfficeMembershipSchema = z.object({
  userId: idSchema,
  departmentId: idSchema,
  isPrimary: z.boolean().default(false),
});

export const headOfficeMembershipUpdateSchema = z.object({
  userId: idSchema,
  departmentId: idSchema,
  isPrimary: z.boolean(),
});

export const projectAssignmentSchema = z.object({
  projectId: idSchema,
  userId: idSchema,
  isPrimary: z.boolean().default(false),
});

export const plazaAssignmentSchema = z.object({
  plazaId: idSchema,
  userId: idSchema,
  role: z.enum(["TOLL", "MAINTENANCE", "CORRIDOR"]),
  isPrimary: z.boolean().default(false),
});

// A task belongs to exactly one scope: a project (optionally narrowed to a
// plaza) or Head Office (optionally narrowed to a department). An empty scope
// means Head Office level. A plaza may arrive without its project; the route
// resolves and stores the project before writing.
const taskScopeObject = z.object({
  projectId: z.preprocess(emptyToUndefined, idSchema.optional()),
  plazaId: z.preprocess(emptyToUndefined, idSchema.optional()),
  departmentId: z.preprocess(emptyToUndefined, idSchema.optional()),
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
    categoryId: z.preprocess(emptyToUndefined, idSchema.optional()),
    title: z.string().min(3).max(200),
    description: z.preprocess(emptyToUndefined, z.string().max(5000).optional()),
    priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
    assigneeId: z.preprocess(emptyToUndefined, idSchema.optional()),
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
    assigneeId: z.preprocess(emptyToUndefined, idSchema.optional()),
    dueDate: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
        .optional(),
    ),
    categoryId: z.preprocess(emptyToUndefined, idSchema.optional()),
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
  categoryId: z.preprocess(emptyToNull, idSchema.nullable().optional()),
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
  assigneeId: idSchema.nullable(),
});

export const commentSchema = z
  .object({
    text: z.string().max(2000).default(""),
    attachmentIds: z.array(idSchema).max(10).optional(),
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
  requestId: idSchema,
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().max(2000).optional(),
});

export const categorySchema = z.object({
  name: z.string().min(2).max(80),
  active: z.boolean().optional(),
});

export const updateCategorySchema = categorySchema.partial();

export const plazaAssignmentInputSchema = z.object({
  plazaId: idSchema,
  role: z.enum(["TOLL", "MAINTENANCE", "CORRIDOR"]),
  isPrimary: z.boolean().default(false),
});

export const accessPutSchema = z.object({
  userId: idSchema,
  assignments: z.array(plazaAssignmentInputSchema).max(500),
});

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
