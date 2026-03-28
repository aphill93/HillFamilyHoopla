import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

// ─── Postgres Pool ────────────────────────────────────────────────────────────

export const pool = new Pool({
  connectionString: config.db.url,
  min: config.db.poolMin,
  max: config.db.poolMax,
  idleTimeoutMillis: config.db.idleTimeoutMs,
  connectionTimeoutMillis: config.db.connectionTimeoutMs,
  ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  console.error("[pg] Unexpected error on idle client:", err);
});

pool.on("connect", () => {
  if (config.isDev) {
    console.debug("[pg] New client connected to pool");
  }
});

// ─── Query helpers ────────────────────────────────────────────────────────────

/** Execute a parameterised query and return all rows. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  if (config.isDev) {
    console.debug("[pg] Query executed", { duration: `${duration}ms`, rows: result.rowCount });
  }
  return result;
}

/** Execute a query and return the first row or null. */
export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] ?? null;
}

/** Execute a query within a transaction. */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Verify the connection to the database. */
export async function checkConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}
