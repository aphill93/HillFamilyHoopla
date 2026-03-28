import type { FastifyInstance } from "fastify";
import { UserService } from "../services/user.service.js";
import {
  UpdateUserSchema,
  AdminUpdateUserSchema,
  UserQuerySchema,
  ChangePasswordSchema,
} from "@hillfamilyhoopla/shared";
import { z } from "zod";

// ─── Users routes ─────────────────────────────────────────────────────────────

export async function usersRoutes(fastify: FastifyInstance): Promise<void> {
  // All user routes require authentication
  fastify.addHook("preHandler", fastify.authenticate);

  // GET /users — list all family members
  fastify.get("/", async (req, reply) => {
    const query = UserQuerySchema.parse(req.query);
    const result = await UserService.list(query);
    return reply.send(result);
  });

  // GET /users/family — shorthand for the family member list (no pagination)
  fastify.get("/family", async (_req, reply) => {
    const members = await UserService.getFamilyMembers();
    return reply.send({ members });
  });

  // GET /users/:id
  fastify.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    // Full (admin) view or self, otherwise public profile
    const isAdmin = req.user.role === "admin";
    const isSelf = req.user.id === id;

    if (isAdmin || isSelf) {
      const user = await UserService.getFullById(id);
      if (!user) return reply.status(404).send({ error: "User not found" });
      return reply.send({ user });
    }

    const user = await UserService.getById(id);
    if (!user) return reply.status(404).send({ error: "User not found" });
    return reply.send({ user });
  });

  // PATCH /users/:id — update own profile
  fastify.patch("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    // Users can only update themselves; admins can update anyone
    if (req.user.id !== id && req.user.role !== "admin") {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const isAdmin = req.user.role === "admin";

    if (isAdmin) {
      const body = AdminUpdateUserSchema.parse(req.body);
      const user = await UserService.adminUpdate(id, body);
      return reply.send({ user });
    }

    const body = UpdateUserSchema.parse(req.body);
    const user = await UserService.updateProfile(id, body);
    return reply.send({ user });
  });

  // DELETE /users/:id — admin only
  fastify.delete(
    "/:id",
    { preHandler: [fastify.requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };

      // Prevent self-deletion by admin
      if (req.user.id === id) {
        return reply.status(400).send({
          error: "Cannot delete your own account",
        });
      }

      await UserService.delete(id);
      return reply.status(204).send();
    }
  );
}
