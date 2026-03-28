import { query, queryOne } from "../db/client.js";
import type {
  UserProfile,
  User,
  UpdateUserPayload,
  AdminUpdateUserPayload,
  UserRole,
} from "@hillfamilyhoopla/shared";
import bcrypt from "bcryptjs";
import { config } from "../config.js";

function toISO(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return v as string;
}

// ─── Row → profile mapper ─────────────────────────────────────────────────────

function rowToProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: row["id"] as string,
    email: row["email"] as string,
    name: row["name"] as string,
    age: (row["age"] as number | null) ?? null,
    sex: (row["sex"] as UserProfile["sex"]) ?? null,
    phone: (row["phone"] as string | null) ?? null,
    profileColor: row["profile_color"] as UserProfile["profileColor"],
    role: row["role"] as UserRole,
    emailVerified: row["email_verified"] as boolean,
    lastLoginAt: toISO(row["last_login_at"] as Date | null) ?? null,
    createdAt: toISO(row["created_at"]),
    updatedAt: toISO(row["updated_at"]),
  };
}

function rowToUser(row: Record<string, unknown>): User {
  return {
    ...rowToProfile(row),
    failedLoginAttempts: row["failed_login_attempts"] as number,
    lockedUntil: toISO(row["locked_until"] as Date | null) ?? null,
  };
}

// ─── Select clauses ───────────────────────────────────────────────────────────

const PROFILE_COLS = `
  id, email, name, age, sex, phone, profile_color,
  role, email_verified, last_login_at, created_at, updated_at
`;

const FULL_COLS = `
  ${PROFILE_COLS}, failed_login_attempts, locked_until
`;

// ─── UserService ──────────────────────────────────────────────────────────────

export const UserService = {
  // ── List ──────────────────────────────────────────────────────────────────

  async list(options: {
    role?: UserRole;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ users: UserProfile[]; total: number }> {
    const { role, search, page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (role) {
      params.push(role);
      conditions.push(`role = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(name ILIKE $${params.length} OR email ILIKE $${params.length})`
      );
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [usersResult, countResult] = await Promise.all([
      query<Record<string, unknown>>(
        `SELECT ${PROFILE_COLS} FROM users ${where}
         ORDER BY name ASC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM users ${where}`,
        params
      ),
    ]);

    return {
      users: usersResult.rows.map(rowToProfile),
      total: parseInt(countResult.rows[0]?.count ?? "0", 10),
    };
  },

  // ── Get by ID ─────────────────────────────────────────────────────────────

  async getById(id: string): Promise<UserProfile | null> {
    const row = await queryOne<Record<string, unknown>>(
      `SELECT ${PROFILE_COLS} FROM users WHERE id = $1`,
      [id]
    );
    return row ? rowToProfile(row) : null;
  },

  async getFullById(id: string): Promise<User | null> {
    const row = await queryOne<Record<string, unknown>>(
      `SELECT ${FULL_COLS} FROM users WHERE id = $1`,
      [id]
    );
    return row ? rowToUser(row) : null;
  },

  // ── Get by email ──────────────────────────────────────────────────────────

  async getByEmail(email: string): Promise<UserProfile | null> {
    const row = await queryOne<Record<string, unknown>>(
      `SELECT ${PROFILE_COLS} FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );
    return row ? rowToProfile(row) : null;
  },

  // ── Update profile ────────────────────────────────────────────────────────

  async updateProfile(
    id: string,
    payload: UpdateUserPayload
  ): Promise<UserProfile> {
    const sets: string[] = [];
    const params: unknown[] = [];

    const addField = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };

    if (payload.name !== undefined) addField("name", payload.name);
    if (payload.age !== undefined) addField("age", payload.age);
    if (payload.sex !== undefined) addField("sex", payload.sex);
    if (payload.phone !== undefined) addField("phone", payload.phone);
    if (payload.profileColor !== undefined)
      addField("profile_color", payload.profileColor);

    if (sets.length === 0) {
      const current = await this.getById(id);
      if (!current) throw Object.assign(new Error("User not found"), { statusCode: 404 });
      return current;
    }

    params.push(id);
    const row = await queryOne<Record<string, unknown>>(
      `UPDATE users SET ${sets.join(", ")}
       WHERE id = $${params.length}
       RETURNING ${PROFILE_COLS}`,
      params
    );

    if (!row) throw Object.assign(new Error("User not found"), { statusCode: 404 });
    return rowToProfile(row);
  },

  // ── Admin update ──────────────────────────────────────────────────────────

  async adminUpdate(
    id: string,
    payload: AdminUpdateUserPayload
  ): Promise<UserProfile> {
    const sets: string[] = [];
    const params: unknown[] = [];

    const addField = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };

    if (payload.name !== undefined) addField("name", payload.name);
    if (payload.age !== undefined) addField("age", payload.age);
    if (payload.sex !== undefined) addField("sex", payload.sex);
    if (payload.phone !== undefined) addField("phone", payload.phone);
    if (payload.profileColor !== undefined)
      addField("profile_color", payload.profileColor);
    if (payload.role !== undefined) addField("role", payload.role);
    if (payload.emailVerified !== undefined)
      addField("email_verified", payload.emailVerified);

    if (sets.length === 0) {
      const current = await this.getById(id);
      if (!current) throw Object.assign(new Error("User not found"), { statusCode: 404 });
      return current;
    }

    params.push(id);
    const row = await queryOne<Record<string, unknown>>(
      `UPDATE users SET ${sets.join(", ")}
       WHERE id = $${params.length}
       RETURNING ${PROFILE_COLS}`,
      params
    );

    if (!row) throw Object.assign(new Error("User not found"), { statusCode: 404 });
    return rowToProfile(row);
  },

  // ── Delete ────────────────────────────────────────────────────────────────

  async delete(id: string): Promise<void> {
    const result = await query("DELETE FROM users WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      throw Object.assign(new Error("User not found"), { statusCode: 404 });
    }
  },

  // ── Family members (all users) ────────────────────────────────────────────

  async getFamilyMembers(): Promise<UserProfile[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT ${PROFILE_COLS} FROM users ORDER BY name ASC`
    );
    return result.rows.map(rowToProfile);
  },
};
