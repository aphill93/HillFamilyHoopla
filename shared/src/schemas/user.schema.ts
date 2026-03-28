import { z } from "zod";
import { MEMBER_COLORS } from "../types/user.js";

// ─── Reusable field schemas ────────────────────────────────────────────────────

export const MemberColorSchema = z.enum(MEMBER_COLORS);

export const UserRoleSchema = z.enum(["admin", "adult", "child"]);

export const UserSexSchema = z.enum([
  "male",
  "female",
  "non-binary",
  "prefer-not-to-say",
]);

// ─── Password rules ────────────────────────────────────────────────────────────

export const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must not exceed 128 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(
    /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
    "Password must contain at least one special character"
  );

// ─── Request / Payload schemas ─────────────────────────────────────────────────

export const CreateUserSchema = z.object({
  email: z.string().email("Invalid email address").max(255),
  password: PasswordSchema,
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must not exceed 100 characters")
    .trim(),
  age: z
    .number()
    .int()
    .min(0)
    .max(120)
    .optional(),
  sex: UserSexSchema.optional(),
  phone: z
    .string()
    .regex(/^\+?[0-9\s\-().]{7,20}$/, "Invalid phone number")
    .optional(),
  profileColor: MemberColorSchema,
  role: UserRoleSchema.optional().default("adult"),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .trim()
    .optional(),
  age: z.number().int().min(0).max(120).nullable().optional(),
  sex: UserSexSchema.nullable().optional(),
  phone: z
    .string()
    .regex(/^\+?[0-9\s\-().]{7,20}$/, "Invalid phone number")
    .nullable()
    .optional(),
  profileColor: MemberColorSchema.optional(),
});

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export const AdminUpdateUserSchema = UpdateUserSchema.extend({
  role: UserRoleSchema.optional(),
  emailVerified: z.boolean().optional(),
});

export type AdminUpdateUserInput = z.infer<typeof AdminUpdateUserSchema>;

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

// ─── Query / filter schemas ────────────────────────────────────────────────────

export const UserQuerySchema = z.object({
  role: UserRoleSchema.optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type UserQueryInput = z.infer<typeof UserQuerySchema>;
