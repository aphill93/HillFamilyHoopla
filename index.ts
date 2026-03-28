// =============================================================================
// Auth routes – all authentication endpoints
//
// POST /auth/login
// POST /auth/refresh
// POST /auth/logout
// GET  /auth/verify-email
// POST /auth/resend-verification
// POST /auth/forgot-password
// POST /auth/reset-password
// POST /auth/change-password        (authenticated)
// GET  /auth/sessions               (authenticated)
// DELETE /auth/sessions/:sessionId  (authenticated)
// GET  /auth/.well-known/jwks.json
// =============================================================================
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { verifyJWT, standardGuard } from '../../middleware/auth.js';

import {
  LoginBodySchema,        type LoginBody,
  RefreshBodySchema,      type RefreshBody,
  LogoutBodySchema,       type LogoutBody,
  VerifyEmailQuerySchema, type VerifyEmailQuery,
  ForgotPasswordBodySchema, type ForgotPasswordBody,
  ResetPasswordBodySchema,  type ResetPasswordBody,
  ChangePasswordBodySchema, type ChangePasswordBody,
  ResendVerificationBodySchema, type ResendVerificationBody,
} from '../../schemas/auth.js';

import { verifyPassword, hashPassword, isPasswordRotationDue, daysUntilRotation } from '../../services/auth/password.js';
import { signAccessToken }  from '../../services/auth/jwt.js';
import { getPublicJWKS }    from '../../services/auth/jwt.js';
import {
  createRefreshToken,
  validateRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  listActiveSessions,
} from '../../services/auth/tokens.js';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordRotationReminder,
  sendAccountLockedEmail,
} from '../../services/email/index.js';
import { generateSecureToken, sha256 } from '../../utils/crypto.js';
import { AUTH } from '@hillfamilyhoopla/shared/constants';
import type { UserRow } from '../../types/index.js';

const authRoutes: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db;

  // ── POST /auth/login ──────────────────────────────────────────────────────
  fastify.post('/login', async (
    request: FastifyRequest<{ Body: LoginBody }>,
    reply:   FastifyReply,
  ) => {
    const body = LoginBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        statusCode: 400,
        error:   'Bad Request',
        message: 'Validation failed',
        details: body.error.flatten().fieldErrors,
      });
    }

    const { email, password, deviceName } = body.data;

    // 1. Look up user
    const { rows } = await db.query<UserRow>(
      `SELECT * FROM users WHERE email = $1 AND is_active = TRUE LIMIT 1`,
      [email],
    );

    // 2. User not found – return generic error to prevent email enumeration
    if (rows.length === 0) {
      // Perform a dummy bcrypt compare to maintain consistent response time
      await verifyPassword('__dummy__', '$2b$12$invalidhashtopreventtimingattacks00000000000000000000000');
      return reply.status(401).send({
        statusCode: 401,
        error:   'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    const user = rows[0];

    // 3. Account lockout check
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const secondsLeft = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 1000);
      return reply.status(429).send({
        statusCode: 429,
        error:   'Too Many Requests',
        message: 'Account temporarily locked due to too many failed login attempts',
        retryAfter: secondsLeft,
      });
    }

    // 4. Verify password
    const passwordValid = await verifyPassword(password, user.password_hash);

    if (!passwordValid) {
      const newAttempts = user.failed_login_attempts + 1;
      const shouldLock  = newAttempts >= AUTH.MAX_LOGIN_ATTEMPTS;
      const lockedUntil = shouldLock
        ? new Date(Date.now() + AUTH.LOCKOUT_DURATION_MINUTES * 60 * 1000)
        : null;

      await db.query(
        `UPDATE users
         SET failed_login_attempts = $1,
             locked_until = $2
         WHERE id = $3`,
        [newAttempts, lockedUntil, user.id],
      );

      // Send lockout email on the lockout event
      if (shouldLock && lockedUntil) {
        sendAccountLockedEmail({
          to:          user.email,
          displayName: user.display_name,
          ipAddress:   request.ip,
          lockedUntil,
        }).catch(err => fastify.log.error(err, 'Failed to send lockout email'));
      }

      // Audit log
      await db.query(
        `INSERT INTO audit_log (user_id, action, metadata, ip_address, user_agent)
         VALUES ($1, 'login_failed', $2, $3, $4)`,
        [user.id, JSON.stringify({ attempts: newAttempts, locked: shouldLock }), request.ip, request.headers['user-agent'] ?? null],
      );

      return reply.status(401).send({
        statusCode: 401,
        error:   'Unauthorized',
        message: shouldLock
          ? `Account locked for ${AUTH.LOCKOUT_DURATION_MINUTES} minutes`
          : 'Invalid email or password',
        attemptsRemaining: Math.max(0, AUTH.MAX_LOGIN_ATTEMPTS - newAttempts),
      });
    }

    // 5. Successful login – reset lockout counters
    await db.query(
      `UPDATE users
       SET failed_login_attempts = 0,
           locked_until = NULL,
           last_login_at = NOW(),
           last_login_ip = $1
       WHERE id = $2`,
      [request.ip, user.id],
    );

    // 6. Issue tokens
    const accessToken = await signAccessToken({
      userId: user.id,
      email:  user.email,
      role:   user.role,
      color:  user.color,
    });

    const { raw: refreshToken } = await createRefreshToken(db, {
      userId:     user.id,
      deviceName: deviceName ?? request.headers['user-agent'],
      ipAddress:  request.ip,
      userAgent:  request.headers['user-agent'] ?? undefined,
    });

    // 7. Audit log
    await db.query(
      `INSERT INTO audit_log (user_id, action, metadata, ip_address, user_agent)
       VALUES ($1, 'login_success', $2, $3, $4)`,
      [user.id, JSON.stringify({ deviceName }), request.ip, request.headers['user-agent'] ?? null],
    );

    // 8. Check password rotation
    const rotationDue = isPasswordRotationDue(new Date(user.password_set_at));
    if (rotationDue && !user.password_rotation_notified_at) {
      const daysOverdue = Math.abs(daysUntilRotation(new Date(user.password_set_at)));
      sendPasswordRotationReminder({
        to:          user.email,
        displayName: user.display_name,
        daysOverdue,
      }).catch(err => fastify.log.error(err, 'Failed to send rotation reminder'));

      await db.query(
        `UPDATE users SET password_rotation_notified_at = NOW() WHERE id = $1`,
        [user.id],
      );
    }

    // 9. Build public user shape (never return password_hash or sensitive fields)
    const publicUser = {
      id:              user.id,
      email:           user.email,
      emailVerified:   user.email_verified,
      displayName:     user.display_name,
      role:            user.role,
      color:           user.color,
      avatarUrl:       user.avatar_url,
      kidModeEnabled:  user.kid_mode_enabled,
      passwordSetAt:   user.password_set_at,
      passwordRotationDue: rotationDue,
    };

    return reply.status(200).send({ accessToken, refreshToken, user: publicUser });
  });

  // ── POST /auth/refresh ────────────────────────────────────────────────────
  fastify.post('/refresh', async (
    request: FastifyRequest<{ Body: RefreshBody }>,
    reply:   FastifyReply,
  ) => {
    const body = RefreshBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid body' });
    }

    const tokenRow = await validateRefreshToken(db, body.data.refreshToken);
    if (!tokenRow) {
      return reply.status(401).send({
        statusCode: 401,
        error:   'Unauthorized',
        message: 'Refresh token is invalid or expired',
        code:    'REFRESH_TOKEN_INVALID',
      });
    }

    // Fetch user to get current role/color (may have changed since token was issued)
    const { rows } = await db.query<UserRow>(
      `SELECT * FROM users WHERE id = $1 AND is_active = TRUE`,
      [tokenRow.user_id],
    );
    if (rows.length === 0) {
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'User not found' });
    }

    const user = rows[0];

    // Rotate refresh token (invalidate old, issue new)
    const { raw: newRefreshToken } = await rotateRefreshToken(db, tokenRow.id, {
      userId:     user.id,
      deviceName: tokenRow.device_name ?? undefined,
      ipAddress:  request.ip,
      userAgent:  request.headers['user-agent'] ?? undefined,
    });

    const accessToken = await signAccessToken({
      userId: user.id,
      email:  user.email,
      role:   user.role,
      color:  user.color,
    });

    return reply.status(200).send({ accessToken, refreshToken: newRefreshToken });
  });

  // ── POST /auth/logout ─────────────────────────────────────────────────────
  fastify.post('/logout', {
    preHandler: [verifyJWT],
  }, async (
    request: FastifyRequest<{ Body: LogoutBody }>,
    reply:   FastifyReply,
  ) => {
    const body = LogoutBodySchema.safeParse(request.body ?? {});
    const allDevices = body.success ? body.data.allDevices : false;

    if (allDevices) {
      await revokeAllUserTokens(db, request.user!.id);
    } else {
      // The client should send its current refresh token for targeted revocation
      const rawToken = (request.body as any)?.refreshToken as string | undefined;
      if (rawToken) {
        const tokenRow = await validateRefreshToken(db, rawToken);
        if (tokenRow) await revokeRefreshToken(db, tokenRow.id);
      }
    }

    await db.query(
      `INSERT INTO audit_log (user_id, action, metadata, ip_address)
       VALUES ($1, 'logout', $2, $3)`,
      [request.user!.id, JSON.stringify({ allDevices }), request.ip],
    );

    return reply.status(200).send({ success: true });
  });

  // ── GET /auth/verify-email ────────────────────────────────────────────────
  fastify.get('/verify-email', async (
    request: FastifyRequest<{ Querystring: VerifyEmailQuery }>,
    reply:   FastifyReply,
  ) => {
    const query = VerifyEmailQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Missing token' });
    }

    const tokenHash = sha256(query.data.token);

    const { rows } = await db.query<{ id: string; user_id: string; expires_at: Date; used_at: Date | null }>(
      `SELECT * FROM email_verification_tokens
       WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [tokenHash],
    );

    if (rows.length === 0) {
      return reply.status(400).send({
        statusCode: 400,
        error:   'Bad Request',
        message: 'Verification link is invalid or has expired',
        code:    'INVALID_VERIFICATION_TOKEN',
      });
    }

    const evtRow = rows[0];

    // Mark token as used + verify user's email in a transaction
    await db.query('BEGIN');
    try {
      await db.query(
        `UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1`,
        [evtRow.id],
      );
      await db.query(
        `UPDATE users SET email_verified = TRUE WHERE id = $1`,
        [evtRow.user_id],
      );
      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }

    await db.query(
      `INSERT INTO audit_log (user_id, action, ip_address)
       VALUES ($1, 'email_verified', $2)`,
      [evtRow.user_id, request.ip],
    );

    return reply.status(200).send({ success: true, message: 'Email verified successfully' });
  });

  // ── POST /auth/resend-verification ────────────────────────────────────────
  fastify.post('/resend-verification', async (
    request: FastifyRequest<{ Body: ResendVerificationBody }>,
    reply:   FastifyReply,
  ) => {
    const body = ResendVerificationBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid email' });
    }

    // Always respond 200 to prevent email enumeration
    const { rows } = await db.query<UserRow>(
      `SELECT * FROM users WHERE email = $1 AND is_active = TRUE AND email_verified = FALSE`,
      [body.data.email],
    );

    if (rows.length > 0) {
      const user = rows[0];
      await issueAndSendVerificationToken(db, user.id, user.email, user.display_name, fastify.log);
    }

    return reply.status(200).send({
      success: true,
      message: 'If that email exists and is unverified, a new link has been sent',
    });
  });

  // ── POST /auth/forgot-password ────────────────────────────────────────────
  fastify.post('/forgot-password', async (
    request: FastifyRequest<{ Body: ForgotPasswordBody }>,
    reply:   FastifyReply,
  ) => {
    const body = ForgotPasswordBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid email' });
    }

    // Always respond 200 to prevent email enumeration
    const { rows } = await db.query<UserRow>(
      `SELECT * FROM users WHERE email = $1 AND is_active = TRUE`,
      [body.data.email],
    );

    if (rows.length > 0) {
      const user = rows[0];
      const rawToken = generateSecureToken(48);
      const tokenHash = sha256(rawToken);

      // Invalidate any existing unused tokens for this user
      await db.query(
        `UPDATE password_reset_tokens SET used_at = NOW()
         WHERE user_id = $1 AND used_at IS NULL`,
        [user.id],
      );

      await db.query(
        `INSERT INTO password_reset_tokens (user_id, token, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
        [user.id, tokenHash],
      );

      sendPasswordResetEmail({
        to:          user.email,
        displayName: user.display_name,
        rawToken,
        ipAddress:   request.ip,
      }).catch(err => fastify.log.error(err, 'Failed to send password reset email'));

      await db.query(
        `INSERT INTO audit_log (user_id, action, ip_address)
         VALUES ($1, 'password_reset_requested', $2)`,
        [user.id, request.ip],
      );
    }

    return reply.status(200).send({
      success: true,
      message: 'If that email exists, a reset link has been sent',
    });
  });

  // ── POST /auth/reset-password ─────────────────────────────────────────────
  fastify.post('/reset-password', async (
    request: FastifyRequest<{ Body: ResetPasswordBody }>,
    reply:   FastifyReply,
  ) => {
    const body = ResetPasswordBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        statusCode: 400,
        error:   'Bad Request',
        message: 'Validation failed',
        details: body.error.flatten().fieldErrors,
      });
    }

    const tokenHash = sha256(body.data.token);
    const { rows } = await db.query<{ id: string; user_id: string }>(
      `SELECT * FROM password_reset_tokens
       WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [tokenHash],
    );

    if (rows.length === 0) {
      return reply.status(400).send({
        statusCode: 400,
        error:   'Bad Request',
        message: 'Reset link is invalid or has expired',
        code:    'INVALID_RESET_TOKEN',
      });
    }

    const resetRow = rows[0];
    const newHash  = await hashPassword(body.data.newPassword);

    await db.query('BEGIN');
    try {
      await db.query(
        `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`,
        [resetRow.id],
      );
      await db.query(
        `UPDATE users
         SET password_hash = $1,
             password_set_at = NOW(),
             password_rotation_notified_at = NULL,
             failed_login_attempts = 0,
             locked_until = NULL
         WHERE id = $2`,
        [newHash, resetRow.user_id],
      );
      // Revoke all refresh tokens – force re-login on all devices
      await revokeAllUserTokens(db, resetRow.user_id);
      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }

    await db.query(
      `INSERT INTO audit_log (user_id, action, ip_address)
       VALUES ($1, 'password_reset_completed', $2)`,
      [resetRow.user_id, request.ip],
    );

    return reply.status(200).send({ success: true, message: 'Password reset successfully. Please log in.' });
  });

  // ── POST /auth/change-password  (authenticated) ───────────────────────────
  fastify.post('/change-password', {
    preHandler: [verifyJWT],
  }, async (
    request: FastifyRequest<{ Body: ChangePasswordBody }>,
    reply:   FastifyReply,
  ) => {
    const body = ChangePasswordBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        statusCode: 400,
        error:   'Bad Request',
        message: 'Validation failed',
        details: body.error.flatten().fieldErrors,
      });
    }

    const userId = request.user!.id;
    const { rows } = await db.query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = $1`,
      [userId],
    );

    const currentValid = await verifyPassword(body.data.currentPassword, rows[0].password_hash);
    if (!currentValid) {
      return reply.status(401).send({
        statusCode: 401,
        error:   'Unauthorized',
        message: 'Current password is incorrect',
      });
    }

    const newHash = await hashPassword(body.data.newPassword);

    await db.query(
      `UPDATE users
       SET password_hash = $1,
           password_set_at = NOW(),
           password_rotation_notified_at = NULL
       WHERE id = $2`,
      [newHash, userId],
    );

    await db.query(
      `INSERT INTO audit_log (user_id, action, ip_address)
       VALUES ($1, 'password_changed', $2)`,
      [userId, request.ip],
    );

    return reply.status(200).send({ success: true, message: 'Password changed successfully' });
  });

  // ── GET /auth/sessions  (authenticated) ───────────────────────────────────
  fastify.get('/sessions', {
    preHandler: [verifyJWT],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const sessions = await listActiveSessions(db, request.user!.id);
    return reply.status(200).send({ sessions });
  });

  // ── DELETE /auth/sessions/:sessionId  (authenticated) ─────────────────────
  fastify.delete('/sessions/:sessionId', {
    preHandler: [verifyJWT],
  }, async (
    request: FastifyRequest<{ Params: { sessionId: string } }>,
    reply:   FastifyReply,
  ) => {
    // Verify the session belongs to the requesting user before revoking
    const { rows } = await db.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM refresh_tokens WHERE id = $1`,
      [request.params.sessionId],
    );

    if (rows.length === 0 || rows[0].user_id !== request.user!.id) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Session not found' });
    }

    await revokeRefreshToken(db, rows[0].id);
    return reply.status(200).send({ success: true });
  });

  // ── GET /auth/.well-known/jwks.json ───────────────────────────────────────
  fastify.get('/.well-known/jwks.json', async (_request, reply) => {
    const jwks = await getPublicJWKS();
    return reply.status(200)
      .header('Cache-Control', 'public, max-age=3600')
      .send(jwks);
  });
};

// ---------------------------------------------------------------------------
// Helper: issue + send a verification token
// ---------------------------------------------------------------------------

async function issueAndSendVerificationToken(
  db:          import('pg').Pool,
  userId:      string,
  email:       string,
  displayName: string,
  log:         any,
): Promise<void> {
  const rawToken  = generateSecureToken(48);
  const tokenHash = sha256(rawToken);

  // Invalidate any existing unused verification tokens
  await db.query(
    `UPDATE email_verification_tokens SET used_at = NOW()
     WHERE user_id = $1 AND used_at IS NULL`,
    [userId],
  );

  await db.query(
    `INSERT INTO email_verification_tokens (user_id, token, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
    [userId, tokenHash],
  );

  sendVerificationEmail({ to: email, displayName, rawToken })
    .catch(err => log.error(err, 'Failed to send verification email'));
}

export default authRoutes;
