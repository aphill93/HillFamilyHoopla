import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ─── Config helpers ───────────────────────────────────────────────────────────

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function optionalNumber(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (isNaN(n)) throw new Error(`Env var ${name} must be a number, got: ${v}`);
  return n;
}

function optionalBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (!v) return fallback;
  return v === "true" || v === "1";
}

function loadKey(pathEnv: string, base64Env: string): string {
  const b64 = process.env[base64Env];
  if (b64) return Buffer.from(b64, "base64").toString("utf-8");
  const path = process.env[pathEnv];
  if (path) return readFileSync(resolve(path), "utf-8");
  throw new Error(
    `Must set either ${pathEnv} or ${base64Env} environment variable`
  );
}

// ─── Config object ────────────────────────────────────────────────────────────

export const config = {
  env: optional("NODE_ENV", "development") as
    | "development"
    | "production"
    | "test",
  isDev: optional("NODE_ENV", "development") === "development",
  isProd: process.env["NODE_ENV"] === "production",

  server: {
    port: optionalNumber("PORT", 3001),
    host: optional("HOST", "0.0.0.0"),
  },

  db: {
    url: optional(
      "DATABASE_URL",
      "postgresql://hoopla:hoopla_dev_secret@localhost:5432/hillfamilyhoopla"
    ),
    poolMin: optionalNumber("DB_POOL_MIN", 2),
    poolMax: optionalNumber("DB_POOL_MAX", 10),
    idleTimeoutMs: optionalNumber("DB_IDLE_TIMEOUT_MS", 30000),
    connectionTimeoutMs: optionalNumber("DB_CONNECTION_TIMEOUT_MS", 5000),
    ssl: optionalBool("DB_SSL", false),
  },

  redis: {
    url: optional("REDIS_URL", "redis://localhost:6379"),
  },

  jwt: {
    get privateKey() {
      return loadKey("JWT_PRIVATE_KEY_PATH", "JWT_PRIVATE_KEY_BASE64");
    },
    get publicKey() {
      return loadKey("JWT_PUBLIC_KEY_PATH", "JWT_PUBLIC_KEY_BASE64");
    },
    accessExpiresIn: optional("JWT_ACCESS_EXPIRES_IN", "15m"),
    refreshExpiresIn: optional("JWT_REFRESH_EXPIRES_IN", "30d"),
    issuer: optional("JWT_ISSUER", "hillfamilyhoopla"),
    audience: optional("JWT_AUDIENCE", "hillfamilyhoopla-app"),
  },

  mtls: {
    enabled: optionalBool("MTLS_ENABLED", false),
    caCertPath: optional("MTLS_CA_CERT_PATH", "./certs/ca.crt"),
    serverCertPath: optional("MTLS_SERVER_CERT_PATH", "./certs/server.crt"),
    serverKeyPath: optional("MTLS_SERVER_KEY_PATH", "./certs/server.key"),
  },

  bcryptRounds: optionalNumber("BCRYPT_ROUNDS", 12),

  encryption: {
    key: optional("ENCRYPTION_KEY", "dev_encryption_key_must_be_32char!!"),
  },

  cors: {
    origins: optional("CORS_ORIGINS", "http://localhost:3000").split(","),
  },

  rateLimit: {
    max: optionalNumber("RATE_LIMIT_MAX", 100),
    windowMs: optionalNumber("RATE_LIMIT_WINDOW_MS", 60000),
    authMax: optionalNumber("AUTH_RATE_LIMIT_MAX", 10),
    authWindowMs: optionalNumber("AUTH_RATE_LIMIT_WINDOW_MS", 300000),
  },

  accountLockout: {
    maxFailedAttempts: optionalNumber("MAX_FAILED_LOGIN_ATTEMPTS", 5),
    durationMs: optionalNumber("ACCOUNT_LOCKOUT_DURATION_MS", 900000),
  },

  email: {
    resendApiKey: optional("RESEND_API_KEY", "re_placeholder"),
    from: optional("EMAIL_FROM", "noreply@hillfamilyhoopla.com"),
    fromName: optional("EMAIL_FROM_NAME", "HillFamilyHoopla"),
  },

  app: {
    url: optional("APP_URL", "http://localhost:3000"),
    apiUrl: optional("API_URL", "http://localhost:3001"),
    requireInviteCode: optionalBool("REQUIRE_INVITE_CODE", false),
    inviteCode: optional("INVITE_CODE", ""),
  },

  log: {
    level: optional("LOG_LEVEL", "info"),
    pretty: optionalBool("LOG_PRETTY", true),
  },
} as const;

export type Config = typeof config;
