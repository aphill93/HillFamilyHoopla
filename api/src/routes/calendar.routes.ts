import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CalendarService } from "../services/calendar.service.js";

// ─── Validation schemas ───────────────────────────────────────────────────────

const CreateLayerSchema = z.object({
  name:          z.string().min(1).max(100),
  color:         z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex color"),
  isFamilyLayer: z.boolean().optional(),
  sortOrder:     z.number().int().min(0).optional(),
});

const UpdateLayerSchema = z.object({
  name:      z.string().min(1).max(100).optional(),
  color:     z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex color").optional(),
  isVisible: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// ─── Calendar routes (/calendar) ─────────────────────────────────────────────

export async function calendarRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", fastify.authenticate);

  // GET /calendar/layers — list all layers visible to the current user
  fastify.get("/layers", async (req, reply) => {
    const layers = await CalendarService.listForUser(req.user.id);
    return reply.send({ layers });
  });

  // POST /calendar/layers — create a new layer (admin or personal)
  fastify.post("/layers", async (req, reply) => {
    const body = CreateLayerSchema.parse(req.body);

    // Only admins can create family-wide layers
    if (body.isFamilyLayer && req.user.role !== "admin") {
      return reply.status(403).send({ error: "Only admins can create family layers" });
    }

    const layer = await CalendarService.create(req.user.id, body);
    return reply.status(201).send({ layer });
  });

  // GET /calendar/layers/:id — get a single layer
  fastify.get("/layers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const layer = await CalendarService.getById(id);
    if (!layer) return reply.status(404).send({ error: "Layer not found" });
    return reply.send({ layer });
  });

  // PATCH /calendar/layers/:id — update a layer
  fastify.patch("/layers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    const existing = await CalendarService.getById(id);
    if (!existing) return reply.status(404).send({ error: "Layer not found" });

    // Only the owner or an admin can modify a layer
    if (existing.userId !== req.user.id && req.user.role !== "admin") {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const body = UpdateLayerSchema.parse(req.body);
    const layer = await CalendarService.update(id, body);
    return reply.send({ layer });
  });

  // DELETE /calendar/layers/:id — delete a layer
  fastify.delete("/layers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    const existing = await CalendarService.getById(id);
    if (!existing) return reply.status(404).send({ error: "Layer not found" });

    // Prevent deleting the family layer
    if (existing.isFamilyLayer) {
      return reply.status(400).send({ error: "Cannot delete the family layer" });
    }

    // Only the owner or an admin can delete a layer
    if (existing.userId !== req.user.id && req.user.role !== "admin") {
      return reply.status(403).send({ error: "Forbidden" });
    }

    await CalendarService.delete(id);
    return reply.status(204).send();
  });
}
