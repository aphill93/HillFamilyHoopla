import type { FastifyInstance } from "fastify";
import { TaskService } from "../services/task.service.js";
import {
  CreateTaskSchema,
  UpdateTaskSchema,
  AddTaskCommentSchema,
  TaskQuerySchema,
  CompleteTaskSchema,
} from "@hillfamilyhoopla/shared";

// ─── Tasks routes ─────────────────────────────────────────────────────────────

export async function tasksRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", fastify.authenticate);

  // GET /tasks — list tasks with filtering
  fastify.get("/", async (req, reply) => {
    const queryParams = TaskQuerySchema.parse(req.query);
    const result = await TaskService.list(queryParams);
    return reply.send(result);
  });

  // GET /tasks/kid-mode/:userId — kid mode task list
  fastify.get("/kid-mode/:userId", async (req, reply) => {
    const { userId } = req.params as { userId: string };

    // Children can only see their own tasks; adults/admins can see any
    if (req.user.id !== userId && req.user.role === "child") {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const tasks = await TaskService.getKidModeTasks(userId);
    return reply.send({ tasks });
  });

  // POST /tasks — create task
  fastify.post("/", async (req, reply) => {
    const body = CreateTaskSchema.parse(req.body);
    const task = await TaskService.create(req.user.id, body);
    return reply.status(201).send({ task });
  });

  // GET /tasks/:id — get task with comments
  fastify.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = await TaskService.getByIdWithComments(id);
    if (!task) return reply.status(404).send({ error: "Task not found" });
    return reply.send({ task });
  });

  // PATCH /tasks/:id — update task
  fastify.patch("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    const existing = await TaskService.getById(id);
    if (!existing) return reply.status(404).send({ error: "Task not found" });

    // Assignee can update status; creator/admin can update everything
    const isCreator = existing.createdBy === req.user.id;
    const isAssignee = existing.assignedTo === req.user.id;
    const isAdmin = req.user.role === "admin";

    if (!isCreator && !isAssignee && !isAdmin) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const body = UpdateTaskSchema.parse(req.body);

    // Assignees (non-creators) can only update status
    if (isAssignee && !isCreator && !isAdmin) {
      const restrictedBody = { status: body.status };
      const task = await TaskService.update(id, restrictedBody);
      return reply.send({ task });
    }

    const task = await TaskService.update(id, body);
    return reply.send({ task });
  });

  // POST /tasks/:id/complete — mark as complete with optional celebration
  fastify.post("/:id/complete", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { celebrationShown } = CompleteTaskSchema.parse(req.body ?? {});

    const existing = await TaskService.getById(id);
    if (!existing) return reply.status(404).send({ error: "Task not found" });

    const isCreator = existing.createdBy === req.user.id;
    const isAssignee = existing.assignedTo === req.user.id;
    const isAdmin = req.user.role === "admin";

    if (!isCreator && !isAssignee && !isAdmin) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const task = await TaskService.complete(id, celebrationShown);
    return reply.send({ task });
  });

  // DELETE /tasks/:id — delete task (creator/admin only)
  fastify.delete("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    const existing = await TaskService.getById(id);
    if (!existing) return reply.status(404).send({ error: "Task not found" });

    if (existing.createdBy !== req.user.id && req.user.role !== "admin") {
      return reply.status(403).send({ error: "Forbidden" });
    }

    await TaskService.delete(id);
    return reply.status(204).send();
  });

  // POST /tasks/:id/comments — add comment
  fastify.post("/:id/comments", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = AddTaskCommentSchema.parse(req.body);

    const task = await TaskService.getById(id);
    if (!task) return reply.status(404).send({ error: "Task not found" });

    const comment = await TaskService.addComment(id, req.user.id, body);
    return reply.status(201).send({ comment });
  });

  // DELETE /tasks/:id/comments/:commentId
  fastify.delete("/:id/comments/:commentId", async (req, reply) => {
    const { commentId } = req.params as { id: string; commentId: string };
    await TaskService.deleteComment(commentId, req.user.id);
    return reply.status(204).send();
  });
}
