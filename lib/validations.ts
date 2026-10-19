import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const projectSchema = z.object({
  name: z.string().min(3).max(150),
  acronym: z.string().max(20).optional(),
  round: z.enum(["ROUND_1", "ROUND_2", "ROUND_3", "ROUND_4"]),
  status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED"]).optional(),
});

export const updateProjectSchema = projectSchema.partial();

const emptyToUndefinedNumber = (v: unknown) =>
  v === "" || v === null || v === undefined ? undefined : v;

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

export const plazaSchema = z.object({
  projectId: z.string().cuid(),
  name: z.string().min(3).max(150),
  state: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
  piu: z.preprocess(emptyToUndefined, z.string().max(150).optional()),
  ro: z.preprocess(emptyToUndefined, z.string().max(150).optional()),
  lengthKm: z.preprocess(
    emptyToUndefinedNumber,
    z.coerce.number().positive().max(100000).optional(),
  ),
  status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED"]).optional(),
});

export const updatePlazaSchema = plazaSchema
  .omit({ projectId: true })
  .partial();

export const userSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "MANAGEMENT", "MANAGER"]),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phone: z.string().max(30).nullable().optional(),
  role: z.enum(["ADMIN", "MANAGEMENT", "MANAGER"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
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

export const createTaskSchema = z.object({
  plazaId: z.string().cuid(),
  title: z.string().min(3).max(200),
  description: z.preprocess(emptyToUndefined, z.string().max(5000).optional()),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  assigneeId: z.preprocess(emptyToUndefined, z.string().cuid().optional()),
  dueDate: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .optional(),
  ),
});

export const updateTaskSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.preprocess(
    emptyToUndefined,
    z.string().max(5000).nullable().optional(),
  ),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
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
  assigneeId: z.string().cuid(),
});

export const commentSchema = z.object({
  text: z.string().min(1).max(2000),
});

export const reopenSchema = z.object({
  text: z.string().max(2000).optional(),
});

export const plazaAssignmentInputSchema = z.object({
  plazaId: z.string().cuid(),
  role: z.enum(["TOLL", "MAINTENANCE", "CORRIDOR"]),
  isPrimary: z.boolean().default(false),
});

export const accessPutSchema = z.object({
  userId: z.string().cuid(),
  assignments: z.array(plazaAssignmentInputSchema).max(500),
});
