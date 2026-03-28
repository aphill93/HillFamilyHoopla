// =============================================================================
// Crypto utilities
// – Secure token generation (CSPRNG)
// – SHA-256 hashing for stored tokens
// – AES-256-GCM encryption/decryption for OAuth tokens at rest
// =============================================================================
import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';

// ---------------------------------------------------------------------------
// Random token generation
// ---------------------------------------------------------------------------

/**
 * Generates a cryptographically secure random token.
 * @param byteLength  Number of random bytes (default 48 → 64 char hex string)
 * @returns           Hex-encoded string, URL-safe
 */
export function generateSecureToken(byteLength = 48): string {
  return randomBytes(byteLength).toString('hex');
}

// ---------------------------------------------------------------------------
// SHA-256 hashing  (for storing email verify / password reset tokens)
// We store ONLY the hash – the raw token is sent to the user via email.
// ---------------------------------------------------------------------------

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// AES-256-GCM  (for OAuth access/refresh tokens stored in calendar_imports)
// ---------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm' as const;
const IV_LENGTH  = 12;  // 96-bit IV recommended for GCM
const TAG_LENGTH = 16;  // 128-bit auth tag

/**
 * Loads the AES-256 encryption key from the environment.
 * Key must be 64 hex characters (= 32 bytes).
 */
function getEncryptionKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY env var must be 64 hex characters (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypts a plaintext string.
 * @returns  Base64-encoded string: iv(12) + tag(16) + ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv  = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Pack: iv | tag | ciphertext
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypts a value produced by `encrypt()`.
 * Throws if the auth tag doesn't match (tamper detection).
 */
export function decrypt(ciphertext: string): string {
  const key  = getEncryptionKey();
  const data = Buffer.from(ciphertext, 'base64');

  const iv         = data.subarray(0, IV_LENGTH);
  const tag        = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted  = data.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString('utf8');
}

// ---------------------------------------------------------------------------
// Timing-safe string comparison  (prevents timing attacks on token compare)
// ---------------------------------------------------------------------------

import { timingSafeEqual } from 'node:crypto';

export function safeCompare(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, 'utf8');
    const bBuf = Buffer.from(b, 'utf8');
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}
