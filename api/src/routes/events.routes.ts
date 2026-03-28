import type { FastifyInstance } from "fastify";
import { EventService } from "../services/event.service.js";
import {
  CreateEventSchema,
  UpdateEventSchema,
  CalendarRangeQuerySchema,
  UpdateAttendeeStatusSchema,
} from "@hillfamilyhoopla/shared";

// ─── Events routes ────────────────────────────────────────────────────────────

export async function eventsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", fastify.authenticate);

  // GET /events — list events in a date range
  fastify.get("/", async (req, reply) => {
    const queryParams = CalendarRangeQuerySchema.parse(req.query);
    const occurrences = await EventService.listInRange(queryParams);
    return reply.send({ events: occurrences, count: occurrences.length });
  });

  // POST /events — create event
  fastify.post("/", async (req, reply) => {
    const body = CreateEventSchema.parse(req.body);
    const event = await EventService.create(req.user.id, body);
    return reply.status(201).send({ event });
  });

  // GET /events/:id — get single event with details
  fastify.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const event = await EventService.getByIdWithDetails(id);
    if (!event) return reply.status(404).send({ error: "Event not found" });
    return reply.send({ event });
  });

  // PATCH /events/:id — update event
  fastify.patch("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    const existing = await EventService.getById(id);
    if (!existing) return reply.status(404).send({ error: "Event not found" });

    // Only creator or admin can update
    if (existing.createdBy !== req.user.id && req.user.role !== "admin") {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const body = UpdateEventSchema.parse(req.body);
    const event = await EventService.update(id, body, req.user.id);
    return reply.send({ event });
  });

  // DELETE /events/:id — delete event
  fastify.delete("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    const existing = await EventService.getById(id);
    if (!existing) return reply.status(404).send({ error: "Event not found" });

    if (existing.createdBy !== req.user.id && req.user.role !== "admin") {
      return reply.status(403).send({ error: "Forbidden" });
    }

    await EventService.delete(id);
    return reply.status(204).send();
  });

  // PATCH /events/:id/attendee-status — update own RSVP status
  fastify.patch("/:id/attendee-status", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { status } = UpdateAttendeeStatusSchema.parse(req.body);
    await EventService.updateAttendeeStatus(id, req.user.id, status);
    return reply.status(204).send();
  });
}
