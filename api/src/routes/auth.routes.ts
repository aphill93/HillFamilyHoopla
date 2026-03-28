import type { FastifyInstance } from "fastify";
import { AuthService } from "../services/auth.service.js";
import {
  authRateLimit,
  passwordResetRateLimit,
} from "../middleware/rateLimit.js";
import {
  CreateUserSchema,
  PasswordSchema,
} from "@hillfamilyhoopla/shared";
import { z } from "zod";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: PasswordSchema,
});

const VerifyEmailSchema = z.object({
  token: z.string().min(1),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: PasswordSchema,
});

// ─── Auth routes ──────────────────────────────────────────────────────────────

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /auth/register
  fastify.post(
    "/register",
    { preHandler: [authRateLimit] },
    async (req, reply) => {
      const body = CreateUserSchema.parse(req.body);
      const result = await AuthService.register({
        email: body.email,
        password: body.password,
        name: body.name,
        profileColor: body.profileColor,
      });
      return reply.status(201).send(result);
    }
  );

  // POST /auth/login
  fastify.post(
    "/login",
    { preHandler: [authRateLimit] },
    async (req, reply) => {
      const body = LoginSchema.parse(req.body);
      const result = await AuthService.login(body);
      return reply.send(result);
    }
  );

  // POST /auth/refresh
  fastify.post("/refresh", async (req, reply) => {
    const { refreshToken } = RefreshSchema.parse(req.body);
    const result = await AuthService.refreshTokens(refreshToken);
    return reply.send(result);
  });

  // POST /auth/logout
  fastify.post("/logout", async (req, reply) => {
    const { refreshToken } = RefreshSchema.parse(req.body);
    await AuthService.logout(refreshToken);
    return reply.status(204).send();
  });

  // POST /auth/forgot-password
  fastify.post(
    "/forgot-password",
    { preHandler: [passwordResetRateLimit] },
    async (req, reply) => {
      const { email } = ForgotPasswordSchema.parse(req.body);
      await AuthService.forgotPassword(email);
      // Always 200 to prevent enumeration
      return reply.send({
        message: "If that email address is registered, you will receive a reset link shortly.",
      });
    }
  );

  // POST /auth/reset-password
  fastify.post(
    "/reset-password",
    { preHandler: [authRateLimit] },
    async (req, reply) => {
      const { token, newPassword } = ResetPasswordSchema.parse(req.body);
      await AuthService.resetPassword(token, newPassword);
      return reply.send({ message: "Password reset successfully." });
    }
  );

  // POST /auth/verify-email
  fastify.post("/verify-email", async (req, reply) => {
    const { token } = VerifyEmailSchema.parse(req.body);
    const user = await AuthService.verifyEmail(token);
    return reply.send({ message: "Email verified successfully.", user });
  });

  // POST /auth/change-password (protected)
  fastify.post(
    "/change-password",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const { currentPassword, newPassword } = ChangePasswordSchema.parse(
        req.body
      );
      await AuthService.changePassword(req.user.id, currentPassword, newPassword);
      return reply.status(204).send();
    }
  );

  // GET /auth/me (protected)
  fastify.get(
    "/me",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const { UserService } = await import("../services/user.service.js");
      const user = await UserService.getFullById(req.user.id);
      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }
      return reply.send({ user });
    }
  );
}
