import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const projectSchema = z.object({
  name: z.string().min(3).max(150),
  description: z.string().max(2000).optional(),
  status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED"]).optional(),
});

export const plazaSchema = z.object({
  projectId: z.string().cuid(),
  name: z.string().min(3).max(150),
  chainage: z.string().max(50).optional(),
  highway: z.string().max(50).optional(),
  location: z.string().max(150).optional(),
  status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED"]).optional(),
});

export const userSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "PROJECT_LEAD", "SITE_USER"]),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  role: z.enum(["ADMIN", "PROJECT_LEAD", "SITE_USER"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

export const accessSchema = z.object({
  userId: z.string().cuid(),
  plazaIds: z.array(z.string().cuid()),
});

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

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
  description: z.preprocess(emptyToUndefined, z.string().max(5000).nullable().optional()),
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
