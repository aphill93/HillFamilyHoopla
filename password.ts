// =============================================================================
// Password service – bcrypt (cost 12) hash / verify / rotation check
// =============================================================================
import bcrypt from 'bcrypt';
import { AUTH } from '@hillfamilyhoopla/shared/constants';

// ---------------------------------------------------------------------------
// Hash
// ---------------------------------------------------------------------------

/**
 * Hashes a plaintext password with bcrypt at cost factor 12.
 * ~250ms per operation on modern hardware – acceptable for auth flows,
 * painful enough to slow offline dictionary attacks.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, AUTH.BCRYPT_COST);
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

/**
 * Constant-time comparison of a plaintext password against a bcrypt hash.
 * Returns false (never throws) to prevent oracle attacks.
 */
export async function verifyPassword(
  plaintext: string,
  hash:      string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(plaintext, hash);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Password rotation check
// ---------------------------------------------------------------------------

/**
 * Returns true if the password was set more than 6 months ago
 * and the user should be prompted to rotate it.
 */
export function isPasswordRotationDue(passwordSetAt: Date): boolean {
  const ageMs   = Date.now() - passwordSetAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays >= AUTH.PASSWORD_ROTATION_DAYS;
}

/**
 * Returns the number of days until the password should be rotated.
 * Negative value means it's already overdue.
 */
export function daysUntilRotation(passwordSetAt: Date): number {
  const ageMs   = Date.now() - passwordSetAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.ceil(AUTH.PASSWORD_ROTATION_DAYS - ageDays);
}
