import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
const { verify } = jwt;
import type { RequestUser } from "@hillfamilyhoopla/shared";
import { config } from "../config.js";
import { queryOne } from "../db/client.js";

// ─── Module augmentation ──────────────────────────────────────────────────────

declare module "fastify" {
  interface FastifyRequest {
    user: RequestUser;
  }
}

// ─── JWT verification helper ─────────────────────────────────────────────────

interface DecodedJwt {
  sub: string;
  email: string;
  role: string;
  jti: string;
  iat: number;
  exp: number;
}

async function verifyAccessToken(token: string): Promise<DecodedJwt> {
  return new Promise((resolve, reject) => {
    verify(
      token,
      config.jwt.publicKey,
      {
        algorithms: ["RS256"],
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
      },
      (err, decoded) => {
        if (err || !decoded || typeof decoded === "string") {
          reject(err ?? new Error("Invalid token"));
        } else {
          resolve(decoded as DecodedJwt);
        }
      }
    );
  });
}

// ─── Auth plugin ──────────────────────────────────────────────────────────────

async function authPlugin(fastify: FastifyInstance): Promise<void> {
  /**
   * Decorator: authenticate — verifies the Bearer JWT and attaches `req.user`.
   * Use as a preHandler on protected routes.
   */
  fastify.decorate(
    "authenticate",
    async function authenticate(
      req: FastifyRequest,
      reply: FastifyReply
    ): Promise<void> {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        await reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Missing or invalid Authorization header",
        });
        return;
      }

      const token = authHeader.slice(7);
      let decoded: DecodedJwt;

      try {
        decoded = await verifyAccessToken(token);
      } catch {
        await reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid or expired access token",
        });
        return;
      }

      // Verify user still exists and is not locked
      const user = await queryOne<{
        id: string;
        email: string;
        role: string;
        locked_until: string | null;
        password_changed_at: string;
      }>(
        `SELECT id, email, role, locked_until, password_changed_at
         FROM users
         WHERE id = $1`,
        [decoded.sub]
      );

      if (!user) {
        await reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "User not found",
        });
        return;
      }

      // Check account lockout
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        await reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "Account is temporarily locked due to failed login attempts",
        });
        return;
      }

      // Check if password was changed after this token was issued
      if (user.password_changed_at) {
        const changedAt = Math.floor(
          new Date(user.password_changed_at).getTime() / 1000
        );
        if (changedAt > decoded.iat) {
          await reply.status(401).send({
            statusCode: 401,
            error: "Unauthorized",
            message: "Password has been changed. Please log in again.",
          });
          return;
        }
      }

      req.user = {
        id: user.id,
        email: user.email,
        role: user.role as RequestUser["role"],
        jti: decoded.jti,
      };
    }
  );

  /**
   * Decorator: requireAdmin — must be used after `authenticate`.
   */
  fastify.decorate(
    "requireAdmin",
    async function requireAdmin(
      req: FastifyRequest,
      reply: FastifyReply
    ): Promise<void> {
      if (req.user?.role !== "admin") {
        await reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "Administrator access required",
        });
      }
    }
  );
}

// ─── TypeScript type augmentation for decorators ─────────────────────────────

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(authPlugin, { name: "auth-plugin" });
