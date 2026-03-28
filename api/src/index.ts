import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { config } from "./config.js";
import { checkConnection } from "./db/client.js";
import authPlugin from "./plugins/auth.plugin.js";
import mtlsPlugin from "./plugins/mtls.plugin.js";
import { authRoutes } from "./routes/auth.routes.js";
import { usersRoutes } from "./routes/users.routes.js";
import { eventsRoutes } from "./routes/events.routes.js";
import { tasksRoutes } from "./routes/tasks.routes.js";
import { calendarRoutes } from "./routes/calendar.routes.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ─── Build server ─────────────────────────────────────────────────────────────

async function buildServer() {
  // When mTLS is enabled the server must listen over HTTPS
  let httpsOptions: object | undefined;
  if (config.mtls.enabled) {
    httpsOptions = {
      key: readFileSync(resolve(config.mtls.serverKeyPath)),
      cert: readFileSync(resolve(config.mtls.serverCertPath)),
      ca: readFileSync(resolve(config.mtls.caCertPath)),
      requestCert: true,
      rejectUnauthorized: false, // We verify in the plugin hook
    };
  }

  const fastify = Fastify({
    logger: {
      level: config.log.level,
      ...(config.log.pretty
        ? {
            transport: {
              target: "pino-pretty",
              options: { translateTime: "HH:MM:ss Z", ignore: "pid,hostname" },
            },
          }
        : {}),
    },
    https: httpsOptions,
    trustProxy: config.isProd,
    // Increase payload size limit for event imports
    bodyLimit: 2 * 1024 * 1024, // 2 MB
  });

  // ── Security headers ─────────────────────────────────────────────────────

  await fastify.register(helmet, {
    contentSecurityPolicy: false, // handled by web frontend
  });

  // ── CORS ─────────────────────────────────────────────────────────────────

  await fastify.register(cors, {
    origin: config.isProd ? config.cors.origins : true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: [
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
    ],
    credentials: true,
    maxAge: 600,
  });

  // ── Plugins ───────────────────────────────────────────────────────────────

  await fastify.register(mtlsPlugin);
  await fastify.register(authPlugin);

  // ── Routes ────────────────────────────────────────────────────────────────

  fastify.get("/health", async (_req, reply) => {
    try {
      await checkConnection();
      return reply.send({ status: "ok", timestamp: new Date().toISOString() });
    } catch (err) {
      return reply.status(503).send({
        status: "error",
        message: "Database connection failed",
      });
    }
  });

  fastify.get("/", async (_req, reply) => {
    return reply.send({
      name: "HillFamilyHoopla API",
      version: "1.0.0",
      docs: "/docs",
    });
  });

  await fastify.register(authRoutes, { prefix: "/auth" });
  await fastify.register(usersRoutes, { prefix: "/users" });
  await fastify.register(eventsRoutes, { prefix: "/events" });
  await fastify.register(tasksRoutes, { prefix: "/tasks" });
  await fastify.register(calendarRoutes, { prefix: "/calendar" });

  // ── Global error handler ──────────────────────────────────────────────────

  fastify.setErrorHandler(async (error, _req, reply) => {
    fastify.log.error(error);

    // Zod validation errors
    if (error.name === "ZodError") {
      return reply.status(400).send({
        statusCode: 400,
        error: "Validation Error",
        message: "Invalid request data",
        details: (error as unknown as { issues: unknown[] }).issues,
      });
    }

    // Application errors with statusCode
    const statusCode =
      (error as unknown as { statusCode?: number }).statusCode ?? 500;

    return reply.status(statusCode).send({
      statusCode,
      error: statusCode === 500 ? "Internal Server Error" : error.message,
      message:
        statusCode === 500
          ? "An unexpected error occurred"
          : error.message,
    });
  });

  // ── Not found handler ────────────────────────────────────────────────────

  fastify.setNotFoundHandler(async (_req, reply) => {
    return reply.status(404).send({
      statusCode: 404,
      error: "Not Found",
      message: "The requested route does not exist",
    });
  });

  return fastify;
}

// ─── Start server ─────────────────────────────────────────────────────────────

async function start() {
  const server = await buildServer();

  try {
    // Verify DB connection before accepting traffic
    await checkConnection();
    server.log.info("[db] Connected to PostgreSQL");

    await server.listen({
      port: config.server.port,
      host: config.server.host,
    });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    server.log.info(`[server] Received ${signal} — shutting down gracefully`);
    await server.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start();
