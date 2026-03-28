// =============================================================================
// JWT service – RS256 sign / verify via jose
// Access tokens: 15 min, RS256, carries role + color for fast authz
// =============================================================================
import fs from 'node:fs';
import { SignJWT, jwtVerify, importPKCS8, importSPKI } from 'jose';
import { randomUUID } from 'node:crypto';
import type { JWTPayload, UserRole, MemberColor } from '@hillfamilyhoopla/shared/types';
import { AUTH } from '@hillfamilyhoopla/shared/constants';

// ---------------------------------------------------------------------------
// Key loading (cached after first load)
// ---------------------------------------------------------------------------

let _privateKey: Awaited<ReturnType<typeof importPKCS8>> | null = null;
let _publicKey:  Awaited<ReturnType<typeof importSPKI>>  | null = null;

async function getPrivateKey() {
  if (!_privateKey) {
    const pem = fs.readFileSync(process.env.JWT_PRIVATE_KEY_PATH!, 'utf8');
    _privateKey = await importPKCS8(pem, 'RS256');
  }
  return _privateKey;
}

async function getPublicKey() {
  if (!_publicKey) {
    const pem = fs.readFileSync(process.env.JWT_PUBLIC_KEY_PATH!, 'utf8');
    _publicKey = await importSPKI(pem, 'RS256');
  }
  return _publicKey;
}

// ---------------------------------------------------------------------------
// Sign – issue a new access token
// ---------------------------------------------------------------------------

export interface AccessTokenPayload {
  userId: string;
  email:  string;
  role:   UserRole;
  color:  MemberColor;
}

/**
 * Signs a 15-minute RS256 access token.
 * The `jti` (JWT ID) is a UUID used for revocation.
 */
export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  const privateKey = await getPrivateKey();

  return new SignJWT({
    sub:   payload.userId,
    email: payload.email,
    role:  payload.role,
    color: payload.color,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setIssuer(process.env.JWT_ISSUER ?? 'hillfamilyhoopla')
    .setAudience(process.env.JWT_AUDIENCE ?? 'hillfamilyhoopla-app')
    .setExpirationTime(`${AUTH.ACCESS_TOKEN_TTL_SECONDS}s`)
    .setJti(randomUUID())
    .sign(privateKey);
}

// ---------------------------------------------------------------------------
// Verify – parse + validate a JWT
// ---------------------------------------------------------------------------

export interface VerifiedToken {
  sub:   string;
  email: string;
  role:  UserRole;
  color: MemberColor;
  jti:   string;
  iat:   number;
  exp:   number;
}

/**
 * Verifies signature, expiry, issuer, and audience.
 * Throws `JWTExpired`, `JWTInvalid`, etc. from jose on failure.
 */
export async function verifyAccessToken(token: string): Promise<VerifiedToken> {
  const publicKey = await getPublicKey();

  const { payload } = await jwtVerify(token, publicKey, {
    algorithms: ['RS256'],
    issuer:     process.env.JWT_ISSUER    ?? 'hillfamilyhoopla',
    audience:   process.env.JWT_AUDIENCE  ?? 'hillfamilyhoopla-app',
  });

  // jose puts claims in payload; cast + validate shape
  if (
    typeof payload.sub !== 'string' ||
    typeof payload.email !== 'string' ||
    typeof payload.role !== 'string' ||
    typeof payload.color !== 'string' ||
    typeof payload.jti !== 'string'
  ) {
    throw new Error('Malformed JWT payload');
  }

  return {
    sub:   payload.sub,
    email: payload.email as string,
    role:  payload.role  as UserRole,
    color: payload.color as MemberColor,
    jti:   payload.jti,
    iat:   payload.iat!,
    exp:   payload.exp!,
  };
}

// ---------------------------------------------------------------------------
// Public JWKS endpoint helper (optional – for client-side verification)
// ---------------------------------------------------------------------------

import { exportJWK } from 'jose';

export async function getPublicJWKS() {
  const key = await getPublicKey();
  const jwk = await exportJWK(key);
  return {
    keys: [{ ...jwk, use: 'sig', alg: 'RS256', kid: 'hillfamilyhoopla-1' }],
  };
}
