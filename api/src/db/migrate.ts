/**
 * migrate.ts — Database migration runner
 *
 * Usage:
 *   npm run db:migrate               # apply all pending migrations
 *   npm run db:migrate -- --dry-run  # show pending migrations without running them
 *   npm run db:migrate -- --reset    # ⚠ DROP and recreate schema (dev only)
 *
 * How it works:
 *   1. Creates a `schema_migrations` table if it doesn't exist.
 *   2. Reads all *.sql files from the migrations/ directory, sorted by filename.
 *   3. Skips any files already recorded in schema_migrations.
 *   4. Runs each pending migration inside its own transaction.
 *   5. Records the filename + checksum on success.
 */

import { readdir, readFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import pg from "pg";

// ─── Config ───────────────────────────────────────────────────────────────────

const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://hoopla:hoopla_dev_secret@localhost:5432/hillfamilyhoopla";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "migrations");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function log(msg: string) {
  console.log(`[migrate] ${msg}`);
}

function err(msg: string) {
  console.error(`[migrate] ✗ ${msg}`);
}

// ─── Schema migrations table ──────────────────────────────────────────────────

const CREATE_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id          SERIAL       PRIMARY KEY,
    filename    VARCHAR(255) NOT NULL UNIQUE,
    checksum    VARCHAR(64)  NOT NULL,
    applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  );
`;

// ─── Core ─────────────────────────────────────────────────────────────────────

interface Migration {
  filename: string;
  path: string;
  sql: string;
  checksum: string;
}

async function loadMigrations(): Promise<Migration[]> {
  const files = await readdir(MIGRATIONS_DIR);
  const sqlFiles = files
    .filter((f) => f.endsWith(".sql"))
    .sort(); // alphabetical = numeric order (001_, 002_, …)

  const migrations: Migration[] = [];
  for (const filename of sqlFiles) {
    const filePath = join(MIGRATIONS_DIR, filename);
    const sql = await readFile(filePath, "utf-8");
    migrations.push({
      filename,
      path: filePath,
      sql,
      checksum: sha256(sql),
    });
  }
  return migrations;
}

async function getApplied(
  client: pg.PoolClient
): Promise<Map<string, string>> {
  const result = await client.query<{ filename: string; checksum: string }>(
    "SELECT filename, checksum FROM schema_migrations ORDER BY id"
  );
  return new Map(result.rows.map((r) => [r.filename, r.checksum]));
}

async function applyMigration(
  client: pg.PoolClient,
  migration: Migration
): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(migration.sql);
    await client.query(
      "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
      [migration.filename, migration.checksum]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const reset = args.includes("--reset");

  if (reset && process.env["NODE_ENV"] === "production") {
    err("--reset is not allowed in production");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    const client = await pool.connect();

    try {
      // ── Reset mode: drop and recreate public schema ────────────────────────
      if (reset) {
        log("⚠  RESET mode — dropping public schema…");
        await client.query("DROP SCHEMA public CASCADE");
        await client.query("CREATE SCHEMA public");
        log("Schema dropped and recreated");
      }

      // ── Ensure migrations table exists ────────────────────────────────────
      await client.query(CREATE_MIGRATIONS_TABLE);

      // ── Load migration files ───────────────────────────────────────────────
      const migrations = await loadMigrations();
      if (migrations.length === 0) {
        log("No migration files found in " + MIGRATIONS_DIR);
        return;
      }

      // ── Determine pending migrations ──────────────────────────────────────
      const applied = reset ? new Map() : await getApplied(client);

      // Verify checksums of already-applied migrations
      for (const m of migrations) {
        const appliedChecksum = applied.get(m.filename);
        if (appliedChecksum && appliedChecksum !== m.checksum) {
          err(
            `Checksum mismatch for ${m.filename}!\n` +
            `  Applied:  ${appliedChecksum}\n` +
            `  On disk:  ${m.checksum}\n` +
            `  Never modify a migration after it has been applied.`
          );
          process.exit(1);
        }
      }

      const pending = migrations.filter((m) => !applied.has(m.filename));

      if (pending.length === 0) {
        log("All migrations are up to date.");
        return;
      }

      log(`${applied.size} applied, ${pending.length} pending:`);
      for (const m of pending) {
        log(`  → ${m.filename}`);
      }

      if (dryRun) {
        log("Dry run — no changes made.");
        return;
      }

      // ── Apply pending migrations ──────────────────────────────────────────
      for (const m of pending) {
        process.stdout.write(`[migrate] Applying ${m.filename}…`);
        const start = Date.now();
        await applyMigration(client, m);
        const ms = Date.now() - start;
        process.stdout.write(` ✓ (${ms}ms)\n`);
      }

      log(`\n✓ Applied ${pending.length} migration(s) successfully.`);
    } finally {
      client.release();
    }
  } catch (error) {
    err(String(error));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
