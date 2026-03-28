// =============================================================================
// Auth middleware – Fastify preHandler hooks
// verifyJWT          – validates Bearer token, populates request.user
// requireRole        – role-based access control (admin / adult / child)
// requireMTLS        – enforces client certificate in production
// requireEmailVerify – blocks unverified accounts on sensitive routes
// =============================================================================
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UserRole } from '@hillfamilyhoopla/shared/types';
import { verifyAccessToken } from '../services/auth/jwt.js';

// ---------------------------------------------------------------------------
// verifyJWT
// Extracts Bearer token from Authorization header, verifies it,
// and decorates request.user for downstream handlers.
// ---------------------------------------------------------------------------

export async function verifyJWT(
  request: FastifyRequest,
  reply:   FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({
      statusCode: 401,
      error:      'Unauthorized',
      message:    'Missing or malformed Authorization header',
    });
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyAccessToken(token);

    request.user = {
      id:    payload.sub,
      email: payload.email,
      role:  payload.role,
      color: payload.color,
      jti:   payload.jti,
    };
  } catch (err: any) {
    // Distinguish expired vs invalid for client UX
    const isExpired = err?.code === 'ERR_JWT_EXPIRED';
    return reply.status(401).send({
      statusCode: 401,
      error:      'Unauthorized',
      message:    isExpired ? 'Token expired' : 'Invalid token',
      code:       isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
    });
  }
}

// ---------------------------------------------------------------------------
// requireRole  – factory returning a preHandler for role-based access
// Usage: fastify.get('/admin-route', { preHandler: [verifyJWT, requireRole('admin')] }, handler)
// ---------------------------------------------------------------------------

export function requireRole(...roles: UserRole[]) {
  return async function roleGuard(
    request: FastifyRequest,
    reply:   FastifyReply,
  ): Promise<void> {
    if (!request.user) {
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Not authenticated' });
    }
    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({
        statusCode: 403,
        error:      'Forbidden',
        message:    `This action requires one of the following roles: ${roles.join(', ')}`,
      });
    }
  };
}

// ---------------------------------------------------------------------------
// requireEmailVerified – blocks unverified users on sensitive mutations
// Must run AFTER verifyJWT (needs request.user)
// ---------------------------------------------------------------------------

export async function requireEmailVerified(
  request: FastifyRequest,
  reply:   FastifyReply,
): Promise<void> {
  if (!request.user) {
    return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Not authenticated' });
  }

  // Fetch email_verified from DB (not stored in JWT to avoid stale reads)
  const db = (request.server as any).db;
  const { rows } = await db.query<{ email_verified: boolean }>(
    'SELECT email_verified FROM users WHERE id = $1',
    [request.user.id],
  );

  if (!rows[0]?.email_verified) {
    return reply.status(403).send({
      statusCode: 403,
      error:      'Forbidden',
      message:    'Email address must be verified before performing this action',
      code:       'EMAIL_NOT_VERIFIED',
    });
  }
}

// ---------------------------------------------------------------------------
// requireMTLS – verifies client certificate is present and valid
// Only enforced in production; dev environments skip this.
// Must be added as the FIRST preHandler on all routes in prod.
// ---------------------------------------------------------------------------

export async function requireMTLS(
  request: FastifyRequest,
  reply:   FastifyReply,
): Promise<void> {
  if (process.env.NODE_ENV !== 'production') return;

  // In production Fastify is started with https + requestCert: true.
  // The TLS layer rejects unauthorized certs before reaching this handler,
  // but we add a belt-and-suspenders check here for defence in depth.
  const socket = (request.raw.socket as any);
  const cert   = socket?.getPeerCertificate?.();

  if (!cert || Object.keys(cert).length === 0) {
    request.log.warn({ ip: request.ip }, 'mTLS: missing client certificate');
    return reply.status(401).send({
      statusCode: 401,
      error:      'Unauthorized',
      message:    'Client certificate required',
      code:       'MTLS_REQUIRED',
    });
  }

  if (!socket.authorized) {
    request.log.warn({ ip: request.ip, certSubject: cert.subject }, 'mTLS: untrusted client certificate');
    return reply.status(401).send({
      statusCode: 401,
      error:      'Unauthorized',
      message:    'Client certificate is not trusted',
      code:       'MTLS_UNTRUSTED',
    });
  }
}

// ---------------------------------------------------------------------------
// Convenience: combined guard used on most protected routes
// [requireMTLS, verifyJWT] in one preHandler array
// ---------------------------------------------------------------------------

export const standardGuard = [requireMTLS, verifyJWT] as const;

export const adminGuard = [requireMTLS, verifyJWT, requireRole('admin')] as const;
