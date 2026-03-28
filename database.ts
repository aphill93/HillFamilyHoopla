// =============================================================================
// Database plugin – registers a pg.Pool as fastify.db
// =============================================================================
import fp from 'fastify-plugin';
import pg from 'pg';
import type { FastifyPluginAsync } from 'fastify';

const { Pool } = pg;

const databasePlugin: FastifyPluginAsync = async (fastify) => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max:              10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: true }
      : false,
  });

  // Verify connection on startup
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
  fastify.log.info('Database connected');

  fastify.decorate('db', pool);

  fastify.addHook('onClose', async () => {
    await pool.end();
    fastify.log.info('Database pool closed');
  });
};

export default fp(databasePlugin, { name: 'database' });
