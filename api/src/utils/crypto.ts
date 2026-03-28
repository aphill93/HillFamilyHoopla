import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import { config } from "../config.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;       // 128-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag
const KEY_LENGTH = 32;      // 256-bit key

// ─── Key derivation ───────────────────────────────────────────────────────────

/**
 * Derive a 32-byte key from the configured ENCRYPTION_KEY.
 * Using SHA-256 ensures we always get exactly 32 bytes regardless of key format.
 */
function getDerivedKey(): Buffer {
  return createHash("sha256")
    .update(config.encryption.key)
    .digest();
}

// ─── Encryption ───────────────────────────────────────────────────────────────

export interface EncryptedPayload {
  /** Base64-encoded IV */
  iv: string;
  /** Base64-encoded auth tag (GCM) */
  tag: string;
  /** Base64-encoded ciphertext */
  data: string;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a structured payload that can be safely stored or transmitted.
 */
export function encrypt(plaintext: string): EncryptedPayload {
  const key = getDerivedKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };
}

/**
 * Encrypt a plaintext string and return a single compact string
 * in the format: `iv:tag:ciphertext` (all base64).
 */
export function encryptToString(plaintext: string): string {
  const { iv, tag, data } = encrypt(plaintext);
  return `${iv}:${tag}:${data}`;
}

// ─── Decryption ───────────────────────────────────────────────────────────────

/**
 * Decrypt an EncryptedPayload produced by `encrypt()`.
 */
export function decrypt(payload: EncryptedPayload): string {
  const key = getDerivedKey();
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const ciphertext = Buffer.from(payload.data, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(tag);

  return (
    decipher.update(ciphertext).toString("utf-8") +
    decipher.final("utf-8")
  );
}

/**
 * Decrypt a compact string in the format `iv:tag:ciphertext`.
 */
export function decryptFromString(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error("Invalid encrypted string format");
  }
  return decrypt({ iv: parts[0], tag: parts[1], data: parts[2] });
}

// ─── Misc helpers ─────────────────────────────────────────────────────────────

/** Generate a cryptographically secure random token (hex string). */
export function generateSecureToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("hex");
}

/** Hash a token for storage (one-way, not reversible). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time string comparison to prevent timing attacks. */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  let diff = 0;
  for (let i = 0; i < aBuf.length; i++) {
    diff |= (aBuf[i] ?? 0) ^ (bBuf[i] ?? 0);
  }
  return diff === 0;
}
