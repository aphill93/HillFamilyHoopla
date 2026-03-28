import { z } from "zod";

// ─── Reusable field schemas ────────────────────────────────────────────────────

export const TaskStatusSchema = z.enum([
  "pending",
  "in-progress",
  "completed",
  "cancelled",
]);

export const TaskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

// ─── Create / Update task ─────────────────────────────────────────────────────

export const CreateTaskSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(255, "Title must not exceed 255 characters")
    .trim(),
  description: z.string().max(5000).optional(),
  assignedTo: z.string().uuid("Invalid user ID").optional(),
  dueDate: z
    .string()
    .datetime({ offset: true, message: "Invalid due date" })
    .optional(),
  priority: TaskPrioritySchema.optional().default("medium"),
  isKidMode: z.boolean().optional().default(false),
  category: z.string().max(50).trim().optional(),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(255).trim().optional(),
  description: z.string().max(5000).nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  dueDate: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional(),
  priority: TaskPrioritySchema.optional(),
  status: TaskStatusSchema.optional(),
  isKidMode: z.boolean().optional(),
  category: z.string().max(50).trim().nullable().optional(),
});

export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

// ─── Task comment ─────────────────────────────────────────────────────────────

export const AddTaskCommentSchema = z.object({
  content: z
    .string()
    .min(1, "Comment cannot be empty")
    .max(2000, "Comment must not exceed 2000 characters")
    .trim(),
});

export type AddTaskCommentInput = z.infer<typeof AddTaskCommentSchema>;

// ─── Task query / filter ──────────────────────────────────────────────────────

export const TaskQuerySchema = z.object({
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  assignedTo: z.string().uuid().optional(),
  createdBy: z.string().uuid().optional(),
  isKidMode: z.coerce.boolean().optional(),
  category: z.string().max(50).optional(),
  dueBefore: z.string().datetime({ offset: true }).optional(),
  dueAfter: z.string().datetime({ offset: true }).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z
    .enum(["dueDate", "priority", "createdAt", "updatedAt", "title"])
    .optional()
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type TaskQueryInput = z.infer<typeof TaskQuerySchema>;

// ─── Complete task (with celebration) ────────────────────────────────────────

export const CompleteTaskSchema = z.object({
  celebrationShown: z.boolean().optional().default(false),
});

export type CompleteTaskInput = z.infer<typeof CompleteTaskSchema>;
