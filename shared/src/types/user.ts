// ─── User Types ──────────────────────────────────────────────────────────────

export type UserRole = "admin" | "adult" | "child";

export type UserSex =
  | "male"
  | "female"
  | "non-binary"
  | "prefer-not-to-say";

/**
 * The 8 member profile colors (hex).
 * Each family member is assigned exactly one color.
 */
export const MEMBER_COLORS = [
  "#EF4444", // red
  "#F97316", // orange
  "#EAB308", // yellow
  "#22C55E", // green
  "#3B82F6", // blue
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#14B8A6", // teal
] as const;

export type MemberColor = (typeof MEMBER_COLORS)[number];

/** Public-safe user representation (no sensitive fields). */
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  age: number | null;
  sex: UserSex | null;
  phone: string | null;
  profileColor: MemberColor;
  role: UserRole;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Full user record (returned only to self or admin). */
export interface User extends UserProfile {
  failedLoginAttempts: number;
  lockedUntil: string | null;
}

/** Payload for creating a new user. */
export interface CreateUserPayload {
  email: string;
  password: string;
  name: string;
  age?: number;
  sex?: UserSex;
  phone?: string;
  profileColor: MemberColor;
  role?: UserRole;
}

/** Payload for updating an existing user profile. */
export interface UpdateUserPayload {
  name?: string;
  age?: number | null;
  sex?: UserSex | null;
  phone?: string | null;
  profileColor?: MemberColor;
}

/** Admin-only update payload. */
export interface AdminUpdateUserPayload extends UpdateUserPayload {
  role?: UserRole;
  emailVerified?: boolean;
}
