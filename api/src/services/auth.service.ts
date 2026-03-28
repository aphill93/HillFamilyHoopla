import bcrypt from "bcryptjs";
import { sign, verify } from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config.js";
import { query, queryOne, withTransaction } from "../db/client.js";
import { EmailService } from "./email.service.js";
import {
  generateSecureToken,
  hashToken,
} from "../utils/crypto.js";
import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  RefreshTokenResponse,
  AuthToken,
  UserProfile,
  JwtPayload,
} from "@hillfamilyhoopla/shared";

// ─── Token helpers ────────────────────────────────────────────────────────────

export function buildAccessToken(user: {
  id: string;
  email: string;
  role: string;
}): { token: string; expiresAt: number } {
  const jti = uuidv4();
  const nowSecs = Math.floor(Date.now() / 1000);

  // Parse expiry string like "15m", "1h", "30d" into seconds
  const expiresInSecs = parseExpiryToSeconds(config.jwt.accessExpiresIn);
  const expiresAt = nowSecs + expiresInSecs;

  const payload: Omit<JwtPayload, "exp" | "iat"> = {
    sub: user.id,
    email: user.email,
    role: user.role as JwtPayload["role"],
    jti,
  };

  const token = sign(payload, config.jwt.privateKey, {
    algorithm: "RS256",
    expiresIn: config.jwt.accessExpiresIn,
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  });

  return { token, expiresAt };
}

function parseExpiryToSeconds(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match || !match[1] || !match[2]) return 900; // default 15m
  const val = parseInt(match[1], 10);
  switch (match[2]) {
    case "s": return val;
    case "m": return val * 60;
    case "h": return val * 3600;
    case "d": return val * 86400;
    default:  return 900;
  }
}

async function createRefreshToken(userId: string): Promise<string> {
  const rawToken = generateSecureToken(40);
  const tokenHash = hashToken(rawToken);
  const expiresInSecs = parseExpiryToSeconds(config.jwt.refreshExpiresIn);
  const expiresAt = new Date(Date.now() + expiresInSecs * 1000);

  await query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [uuidv4(), userId, tokenHash, expiresAt]
  );

  return rawToken;
}

function buildAuthTokens(
  user: { id: string; email: string; role: string },
  refreshToken: string,
  expiresAt: number
): AuthToken {
  const { token: accessToken } = buildAccessToken(user);
  return {
    accessToken,
    refreshToken,
    expiresAt,
    tokenType: "Bearer",
  };
}

// ─── Row → UserProfile mapper ─────────────────────────────────────────────────

function rowToUserProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: row["id"] as string,
    email: row["email"] as string,
    name: row["name"] as string,
    age: (row["age"] as number | null) ?? null,
    sex: (row["sex"] as UserProfile["sex"]) ?? null,
    phone: (row["phone"] as string | null) ?? null,
    profileColor: row["profile_color"] as UserProfile["profileColor"],
    role: row["role"] as UserProfile["role"],
    emailVerified: row["email_verified"] as boolean,
    lastLoginAt: (row["last_login_at"] as string | null) ?? null,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

// ─── Auth service ─────────────────────────────────────────────────────────────

export const AuthService = {
  // ── Register ───────────────────────────────────────────────────────────────

  async register(payload: RegisterRequest): Promise<RegisterResponse> {
    const { email, password, name, profileColor, inviteCode } = payload;

    // Invite code check
    if (config.app.requireInviteCode) {
      if (!inviteCode || inviteCode !== config.app.inviteCode) {
        throw Object.assign(new Error("Invalid invite code"), {
          statusCode: 403,
        });
      }
    }

    // Check email uniqueness
    const existing = await queryOne<{ id: string }>(
      "SELECT id FROM users WHERE email = $1",
      [email.toLowerCase()]
    );
    if (existing) {
      throw Object.assign(new Error("Email already registered"), {
        statusCode: 409,
      });
    }

    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
    const verificationToken = generateSecureToken(32);
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const userRow = await queryOne<Record<string, unknown>>(
      `INSERT INTO users (
         email, password_hash, name, profile_color,
         email_verification_token, email_verification_expires
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, name, age, sex, phone, profile_color,
                 role, email_verified, last_login_at, created_at, updated_at`,
      [
        email.toLowerCase(),
        passwordHash,
        name,
        profileColor,
        verificationToken,
        verificationExpires,
      ]
    );

    if (!userRow) throw new Error("Failed to create user");

    const user = rowToUserProfile(userRow);
    const refreshToken = await createRefreshToken(user.id);
    const { token: accessToken, expiresAt } = buildAccessToken(user);

    const tokens: AuthToken = {
      accessToken,
      refreshToken,
      expiresAt,
      tokenType: "Bearer",
    };

    // Send verification email (non-blocking — don't fail registration if email fails)
    EmailService.sendVerificationEmail(email.toLowerCase(), name, verificationToken).catch(
      (err) => console.error("[email] Failed to send verification email:", err)
    );

    return {
      user,
      tokens,
      requiresEmailVerification: true,
    };
  },

  // ── Login ──────────────────────────────────────────────────────────────────

  async login(payload: LoginRequest): Promise<LoginResponse> {
    const { email, password } = payload;

    const row = await queryOne<Record<string, unknown>>(
      `SELECT id, email, password_hash, name, age, sex, phone,
              profile_color, role, email_verified, last_login_at,
              failed_login_attempts, locked_until,
              created_at, updated_at
       FROM users
       WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (!row) {
      // Perform a dummy bcrypt compare to prevent user enumeration via timing
      await bcrypt.compare(password, "$2b$12$placeholder.hash.for.timing.safety");
      throw Object.assign(new Error("Invalid email or password"), {
        statusCode: 401,
      });
    }

    // Check account lockout
    if (row["locked_until"] && new Date(row["locked_until"] as string) > new Date()) {
      const unlockAt = new Date(row["locked_until"] as string);
      throw Object.assign(
        new Error(
          `Account locked until ${unlockAt.toISOString()}. Please try again later.`
        ),
        { statusCode: 423 }
      );
    }

    const passwordValid = await bcrypt.compare(
      password,
      row["password_hash"] as string
    );

    if (!passwordValid) {
      const newFailedCount = (row["failed_login_attempts"] as number) + 1;
      let lockUntil: Date | null = null;

      if (newFailedCount >= config.accountLockout.maxFailedAttempts) {
        lockUntil = new Date(
          Date.now() + config.accountLockout.durationMs
        );
      }

      await query(
        `UPDATE users
         SET failed_login_attempts = $1, locked_until = $2
         WHERE id = $3`,
        [newFailedCount, lockUntil, row["id"]]
      );

      throw Object.assign(new Error("Invalid email or password"), {
        statusCode: 401,
      });
    }

    // Successful login — reset counters
    await query(
      `UPDATE users
       SET failed_login_attempts = 0,
           locked_until = NULL,
           last_login_at = NOW()
       WHERE id = $1`,
      [row["id"]]
    );

    const user = rowToUserProfile(row);
    const refreshToken = await createRefreshToken(user.id);
    const { token: accessToken, expiresAt } = buildAccessToken(user);

    return {
      user,
      tokens: {
        accessToken,
        refreshToken,
        expiresAt,
        tokenType: "Bearer",
      },
    };
  },

  // ── Refresh token ─────────────────────────────────────────────────────────

  async refreshTokens(rawRefreshToken: string): Promise<RefreshTokenResponse> {
    const tokenHash = hashToken(rawRefreshToken);

    const tokenRow = await queryOne<{
      id: string;
      user_id: string;
      expires_at: string;
      revoked_at: string | null;
    }>(
      `SELECT id, user_id, expires_at, revoked_at
       FROM refresh_tokens
       WHERE token_hash = $1`,
      [tokenHash]
    );

    if (!tokenRow) {
      throw Object.assign(new Error("Invalid refresh token"), {
        statusCode: 401,
      });
    }

    if (tokenRow.revoked_at) {
      // Token reuse detected — revoke ALL tokens for this user
      await query(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1",
        [tokenRow.user_id]
      );
      throw Object.assign(
        new Error("Refresh token already used — all sessions revoked"),
        { statusCode: 401 }
      );
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      throw Object.assign(new Error("Refresh token expired"), {
        statusCode: 401,
      });
    }

    // Rotate: revoke old token, issue new one
    const userRow = await queryOne<Record<string, unknown>>(
      `SELECT id, email, name, age, sex, phone, profile_color,
              role, email_verified, last_login_at, created_at, updated_at
       FROM users WHERE id = $1`,
      [tokenRow.user_id]
    );

    if (!userRow) {
      throw Object.assign(new Error("User not found"), { statusCode: 401 });
    }

    const user = rowToUserProfile(userRow);

    await withTransaction(async (client) => {
      await client.query(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1",
        [tokenRow.id]
      );
    });

    const newRefreshToken = await createRefreshToken(user.id);
    const { token: accessToken, expiresAt } = buildAccessToken(user);

    return {
      tokens: {
        accessToken,
        refreshToken: newRefreshToken,
        expiresAt,
        tokenType: "Bearer",
      },
    };
  },

  // ── Logout ────────────────────────────────────────────────────────────────

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashToken(rawRefreshToken);
    await query(
      "UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1",
      [tokenHash]
    );
  },

  // ── Forgot password ───────────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<void> {
    const user = await queryOne<{ id: string }>(
      "SELECT id FROM users WHERE email = $1",
      [email.toLowerCase()]
    );

    // Always respond successfully to prevent enumeration
    if (!user) return;

    const resetToken = generateSecureToken(32);
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1h

    const nameRow = await queryOne<{ name: string }>(
      "SELECT name FROM users WHERE id = $1",
      [user.id]
    );

    await query(
      `UPDATE users
       SET password_reset_token = $1, password_reset_expires = $2
       WHERE id = $3`,
      [resetToken, resetExpires, user.id]
    );

    // Non-blocking — don't reveal whether email was sent
    EmailService.sendPasswordResetEmail(
      email.toLowerCase(),
      nameRow?.name ?? "there",
      resetToken
    ).catch((err) => console.error("[email] Failed to send password reset email:", err));
  },

  // ── Reset password ────────────────────────────────────────────────────────

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await queryOne<{
      id: string;
      password_reset_expires: string;
    }>(
      `SELECT id, password_reset_expires
       FROM users
       WHERE password_reset_token = $1`,
      [token]
    );

    if (!user) {
      throw Object.assign(new Error("Invalid or expired reset token"), {
        statusCode: 400,
      });
    }

    if (new Date(user.password_reset_expires) < new Date()) {
      throw Object.assign(new Error("Password reset token has expired"), {
        statusCode: 400,
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE users
         SET password_hash = $1,
             password_reset_token = NULL,
             password_reset_expires = NULL,
             password_changed_at = NOW(),
             failed_login_attempts = 0,
             locked_until = NULL
         WHERE id = $2`,
        [passwordHash, user.id]
      );
      // Revoke all refresh tokens so all sessions are invalidated
      await client.query(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
        [user.id]
      );
    });
  },

  // ── Verify email ──────────────────────────────────────────────────────────

  async verifyEmail(token: string): Promise<UserProfile> {
    const user = await queryOne<Record<string, unknown>>(
      `SELECT id, email, name, age, sex, phone, profile_color,
              role, email_verified, last_login_at,
              email_verification_expires, created_at, updated_at
       FROM users
       WHERE email_verification_token = $1`,
      [token]
    );

    if (!user) {
      throw Object.assign(new Error("Invalid verification token"), {
        statusCode: 400,
      });
    }

    if (
      user["email_verification_expires"] &&
      new Date(user["email_verification_expires"] as string) < new Date()
    ) {
      throw Object.assign(new Error("Verification token has expired"), {
        statusCode: 400,
      });
    }

    await query(
      `UPDATE users
       SET email_verified = true,
           email_verification_token = NULL,
           email_verification_expires = NULL
       WHERE id = $1`,
      [user["id"]]
    );

    return rowToUserProfile({ ...user, email_verified: true });
  },

  // ── Change password ───────────────────────────────────────────────────────

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await queryOne<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [userId]
    );

    if (!user) {
      throw Object.assign(new Error("User not found"), { statusCode: 404 });
    }

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      throw Object.assign(new Error("Current password is incorrect"), {
        statusCode: 400,
      });
    }

    const newHash = await bcrypt.hash(newPassword, config.bcryptRounds);

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE users
         SET password_hash = $1, password_changed_at = NOW()
         WHERE id = $2`,
        [newHash, userId]
      );
      await client.query(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
        [userId]
      );
    });
  },
};
