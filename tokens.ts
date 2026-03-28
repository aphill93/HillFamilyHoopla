// =============================================================================
// Token service – opaque refresh token lifecycle
// Generate → store hash → validate → rotate → revoke
// =============================================================================
import type { Pool } from 'pg';
import { generateSecureToken, sha256 } from '../../utils/crypto.js';
import { AUTH } from '@hillfamilyhoopla/shared/constants';
import type { RefreshTokenRow } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Generate + store a new refresh token
// ---------------------------------------------------------------------------

export interface CreateRefreshTokenOptions {
  userId:      string;
  deviceName?: string;
  ipAddress?:  string;
  userAgent?:  string;
}

export interface CreatedRefreshToken {
  /** Raw token – send this to the client ONCE, never store it */
  raw:       string;
  /** DB row id – useful for targeted revocation */
  tokenId:   string;
}

export async function createRefreshToken(
  db:   Pool,
  opts: CreateRefreshTokenOptions,
): Promise<CreatedRefreshToken> {
  const raw       = generateSecureToken(64);  // 128 hex chars
  const tokenHash = sha256(raw);
  const expiresAt = new Date(Date.now() + AUTH.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO refresh_tokens
       (user_id, token_hash, device_name, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [opts.userId, tokenHash, opts.deviceName ?? null, opts.ipAddress ?? null, opts.userAgent ?? null, expiresAt],
  );

  return { raw, tokenId: rows[0].id };
}

// ---------------------------------------------------------------------------
// Validate a refresh token (returns the DB row if valid)
// ---------------------------------------------------------------------------

export async function validateRefreshToken(
  db:       Pool,
  rawToken: string,
): Promise<RefreshTokenRow | null> {
  const tokenHash = sha256(rawToken);

  const { rows } = await db.query<RefreshTokenRow>(
    `SELECT * FROM refresh_tokens
     WHERE token_hash = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()`,
    [tokenHash],
  );

  if (rows.length === 0) return null;

  // Touch last_used_at (fire-and-forget, don't await to avoid slowing the response)
  db.query(
    `UPDATE refresh_tokens SET last_used_at = NOW() WHERE id = $1`,
    [rows[0].id],
  ).catch(() => { /* non-critical */ });

  return rows[0];
}

// ---------------------------------------------------------------------------
// Rotate a refresh token (revoke old, issue new) – recommended on every use
// ---------------------------------------------------------------------------

export async function rotateRefreshToken(
  db:         Pool,
  oldTokenId: string,
  opts:       CreateRefreshTokenOptions,
): Promise<CreatedRefreshToken> {
  // Revoke old token
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`,
    [oldTokenId],
  );

  // Issue new token
  return createRefreshToken(db, opts);
}

// ---------------------------------------------------------------------------
// Revoke by specific token ID
// ---------------------------------------------------------------------------

export async function revokeRefreshToken(db: Pool, tokenId: string): Promise<void> {
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`,
    [tokenId],
  );
}

// ---------------------------------------------------------------------------
// Revoke ALL tokens for a user (logout all devices)
// ---------------------------------------------------------------------------

export async function revokeAllUserTokens(db: Pool, userId: string): Promise<void> {
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
}

// ---------------------------------------------------------------------------
// List active sessions (for "manage devices" UI)
// ---------------------------------------------------------------------------

export interface ActiveSession {
  tokenId:     string;
  deviceName:  string | null;
  ipAddress:   string | null;
  createdAt:   Date;
  lastUsedAt:  Date | null;
}

export async function listActiveSessions(
  db:     Pool,
  userId: string,
): Promise<ActiveSession[]> {
  const { rows } = await db.query<ActiveSession>(
    `SELECT id AS "tokenId", device_name AS "deviceName",
            ip_address AS "ipAddress", created_at AS "createdAt",
            last_used_at AS "lastUsedAt"
     FROM refresh_tokens
     WHERE user_id = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()
     ORDER BY last_used_at DESC NULLS LAST`,
    [userId],
  );
  return rows;
}
