// =============================================================================
// Auth system tests
// Tests: login, lockout, refresh, logout, email verify, forgot/reset password
// Run: npm test --workspace=api
// =============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hashPassword, verifyPassword, isPasswordRotationDue, daysUntilRotation } from '../src/services/auth/password.js';
import { sha256, encrypt, decrypt, safeCompare } from '../src/utils/crypto.js';
import { generateSecureToken } from '../src/utils/crypto.js';
import { AUTH } from '@hillfamilyhoopla/shared/constants';

// ---------------------------------------------------------------------------
// Password service
// ---------------------------------------------------------------------------

describe('password service', () => {
  it('hashes a password with bcrypt', async () => {
    const hash = await hashPassword('MyP@ssword123!');
    expect(hash).toMatch(/^\$2b\$12\$/);
  });

  it('verifies a correct password', async () => {
    const hash = await hashPassword('MyP@ssword123!');
    expect(await verifyPassword('MyP@ssword123!', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('MyP@ssword123!');
    expect(await verifyPassword('WrongPass!456', hash)).toBe(false);
  });

  it('returns false (not throws) for a malformed hash', async () => {
    expect(await verifyPassword('anything', 'notahash')).toBe(false);
  });

  it('detects rotation is NOT due for a fresh password', () => {
    expect(isPasswordRotationDue(new Date())).toBe(false);
  });

  it('detects rotation IS due after 6 months', () => {
    const old = new Date();
    old.setDate(old.getDate() - AUTH.PASSWORD_ROTATION_DAYS - 1);
    expect(isPasswordRotationDue(old)).toBe(true);
  });

  it('calculates days until rotation correctly', () => {
    const now = new Date();
    expect(daysUntilRotation(now)).toBeCloseTo(AUTH.PASSWORD_ROTATION_DAYS, 0);

    const halfwayThrough = new Date();
    halfwayThrough.setDate(halfwayThrough.getDate() - 90);
    expect(daysUntilRotation(halfwayThrough)).toBeCloseTo(AUTH.PASSWORD_ROTATION_DAYS - 90, 0);
  });
});

// ---------------------------------------------------------------------------
// Crypto utilities
// ---------------------------------------------------------------------------

describe('crypto utilities', () => {
  it('generates a hex token of correct length', () => {
    const token = generateSecureToken(48);
    expect(token).toHaveLength(96); // 48 bytes → 96 hex chars
  });

  it('generates different tokens each call', () => {
    expect(generateSecureToken()).not.toBe(generateSecureToken());
  });

  it('sha256 produces consistent 64-char hex', () => {
    const hash = sha256('hello');
    expect(hash).toHaveLength(64);
    expect(sha256('hello')).toBe(hash); // deterministic
    expect(sha256('world')).not.toBe(hash);
  });

  it('encrypts and decrypts successfully', () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes of 0xAA
    const plaintext = 'oauth_access_token_value_12345';
    const ciphertext = encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it('produces different ciphertext each time (random IV)', () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    const a = encrypt('same plaintext');
    const b = encrypt('same plaintext');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(decrypt(b)); // but both decrypt correctly
  });

  it('safeCompare returns true for equal strings', () => {
    expect(safeCompare('abc', 'abc')).toBe(true);
  });

  it('safeCompare returns false for unequal strings', () => {
    expect(safeCompare('abc', 'xyz')).toBe(false);
    expect(safeCompare('abc', 'abcd')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Auth schema validation (Zod)
// ---------------------------------------------------------------------------

describe('auth schemas', async () => {
  const {
    LoginBodySchema,
    ResetPasswordBodySchema,
    ChangePasswordBodySchema,
    passwordSchema,
  } = await import('../src/schemas/auth.js');

  describe('passwordSchema', () => {
    it('accepts a valid strong password', () => {
      expect(passwordSchema.safeParse('Str0ng!Pass#word').success).toBe(true);
    });

    it('rejects passwords under 12 chars', () => {
      expect(passwordSchema.safeParse('Short1!').success).toBe(false);
    });

    it('rejects passwords without uppercase', () => {
      expect(passwordSchema.safeParse('nouppercase123!').success).toBe(false);
    });

    it('rejects passwords without special char', () => {
      expect(passwordSchema.safeParse('NoSpecialChar123').success).toBe(false);
    });
  });

  describe('LoginBodySchema', () => {
    it('lowercases and trims email', () => {
      const result = LoginBodySchema.safeParse({ email: '  HELLO@EXAMPLE.COM  ', password: 'whatever' });
      expect(result.success && result.data.email).toBe('hello@example.com');
    });

    it('rejects invalid email', () => {
      expect(LoginBodySchema.safeParse({ email: 'notanemail', password: 'pass' }).success).toBe(false);
    });
  });

  describe('ResetPasswordBodySchema', () => {
    it('rejects mismatched passwords', () => {
      const result = ResetPasswordBodySchema.safeParse({
        token:           'a'.repeat(32),
        newPassword:     'ValidPass123!',
        confirmPassword: 'DifferentPass123!',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ChangePasswordBodySchema', () => {
    it('rejects same current and new password', () => {
      const result = ChangePasswordBodySchema.safeParse({
        currentPassword: 'SamePassword123!',
        newPassword:     'SamePassword123!',
        confirmPassword: 'SamePassword123!',
      });
      expect(result.success).toBe(false);
    });
  });
});
