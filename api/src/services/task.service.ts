import { query, queryOne, withTransaction } from "../db/client.js";
import type {
  Task,
  TaskComment,
  KidModeTask,
  CreateTaskPayload,
  UpdateTaskPayload,
  AddTaskCommentPayload,
  TaskStatus,
  TaskPriority,
} from "@hillfamilyhoopla/shared";

// ─── Row mappers ──────────────────────────────────────────────────────────────

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row["id"] as string,
    createdBy: row["created_by"] as string,
    assignedTo: (row["assigned_to"] as string | null) ?? null,
    title: row["title"] as string,
    description: (row["description"] as string | null) ?? null,
    dueDate: (row["due_date"] as string | null) ?? null,
    priority: row["priority"] as TaskPriority,
    status: row["status"] as TaskStatus,
    isKidMode: row["is_kid_mode"] as boolean,
    celebrationShown: row["celebration_shown"] as boolean,
    category: (row["category"] as string | null) ?? null,
    completedAt: (row["completed_at"] as string | null) ?? null,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
    assignee: row["assignee_id"]
      ? {
          id: row["assignee_id"] as string,
          name: row["assignee_name"] as string,
          profileColor: row["assignee_color"] as string,
        }
      : null,
  };
}

function rowToComment(row: Record<string, unknown>): TaskComment {
  return {
    id: row["id"] as string,
    taskId: row["task_id"] as string,
    userId: row["user_id"] as string,
    content: row["content"] as string,
    createdAt: row["created_at"] as string,
    author: row["author_id"]
      ? {
          id: row["author_id"] as string,
          name: row["author_name"] as string,
          profileColor: row["author_color"] as string,
        }
      : undefined,
  };
}

// ─── Base SELECT with assignee JOIN ──────────────────────────────────────────

const TASK_SELECT = `
  t.*,
  u.id   AS assignee_id,
  u.name AS assignee_name,
  u.profile_color AS assignee_color
FROM tasks t
LEFT JOIN users u ON u.id = t.assigned_to
`;

// ─── TaskService ──────────────────────────────────────────────────────────────

export const TaskService = {
  // ── Create ────────────────────────────────────────────────────────────────

  async create(createdBy: string, payload: CreateTaskPayload): Promise<Task> {
    const {
      title, description, assignedTo, dueDate,
      priority = "medium", isKidMode = false, category,
    } = payload;

    const row = await queryOne<Record<string, unknown>>(
      `WITH inserted AS (
         INSERT INTO tasks (
           created_by, assigned_to, title, description,
           due_date, priority, is_kid_mode, category
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *
       )
       SELECT i.*, u.id AS assignee_id, u.name AS assignee_name,
              u.profile_color AS assignee_color
       FROM inserted i
       LEFT JOIN users u ON u.id = i.assigned_to`,
      [
        createdBy, assignedTo ?? null, title,
        description ?? null, dueDate ?? null,
        priority, isKidMode, category ?? null,
      ]
    );

    if (!row) throw new Error("Failed to create task");
    return rowToTask(row);
  },

  // ── Get by ID ─────────────────────────────────────────────────────────────

  async getById(id: string): Promise<Task | null> {
    const row = await queryOne<Record<string, unknown>>(
      `SELECT ${TASK_SELECT} WHERE t.id = $1`,
      [id]
    );
    return row ? rowToTask(row) : null;
  },

  async getByIdWithComments(id: string): Promise<Task | null> {
    const task = await this.getById(id);
    if (!task) return null;

    const commentsResult = await query<Record<string, unknown>>(
      `SELECT tc.*, u.id AS author_id, u.name AS author_name,
              u.profile_color AS author_color
       FROM task_comments tc
       JOIN users u ON u.id = tc.user_id
       WHERE tc.task_id = $1
       ORDER BY tc.created_at ASC`,
      [id]
    );
    task.comments = commentsResult.rows.map(rowToComment);

    return task;
  },

  // ── List ──────────────────────────────────────────────────────────────────

  async list(options: {
    status?: TaskStatus;
    priority?: TaskPriority;
    assignedTo?: string;
    createdBy?: string;
    isKidMode?: boolean;
    category?: string;
    dueBefore?: string;
    dueAfter?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }): Promise<{ tasks: Task[]; total: number }> {
    const {
      status, priority, assignedTo, createdBy, isKidMode,
      category, dueBefore, dueAfter, search,
      page = 1, limit = 20,
      sortBy = "created_at", sortOrder = "desc",
    } = options;

    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: unknown[] = [];

    const add = (cond: string, val: unknown) => {
      params.push(val);
      conditions.push(cond.replace("?", `$${params.length}`));
    };

    if (status) add("t.status = ?", status);
    if (priority) add("t.priority = ?", priority);
    if (assignedTo) add("t.assigned_to = ?", assignedTo);
    if (createdBy) add("t.created_by = ?", createdBy);
    if (isKidMode !== undefined) add("t.is_kid_mode = ?", isKidMode);
    if (category) add("t.category = ?", category);
    if (dueBefore) add("t.due_date <= ?", dueBefore);
    if (dueAfter) add("t.due_date >= ?", dueAfter);
    if (search) add("t.title ILIKE ?", `%${search}%`);

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Sanitise sort column to prevent injection
    const allowedSortColumns: Record<string, string> = {
      dueDate: "t.due_date",
      priority: "t.priority",
      createdAt: "t.created_at",
      updatedAt: "t.updated_at",
      title: "t.title",
    };
    const sortCol = allowedSortColumns[sortBy] ?? "t.created_at";
    const order = sortOrder === "asc" ? "ASC" : "DESC";

    const [tasksResult, countResult] = await Promise.all([
      query<Record<string, unknown>>(
        `SELECT ${TASK_SELECT} ${where}
         ORDER BY ${sortCol} ${order} NULLS LAST
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM tasks t ${where}`,
        params
      ),
    ]);

    return {
      tasks: tasksResult.rows.map(rowToTask),
      total: parseInt(countResult.rows[0]?.count ?? "0", 10),
    };
  },

  // ── Update ────────────────────────────────────────────────────────────────

  async update(id: string, payload: UpdateTaskPayload): Promise<Task> {
    const sets: string[] = [];
    const params: unknown[] = [];

    const addField = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };

    if (payload.title !== undefined) addField("title", payload.title);
    if (payload.description !== undefined) addField("description", payload.description);
    if (payload.assignedTo !== undefined) addField("assigned_to", payload.assignedTo);
    if (payload.dueDate !== undefined) addField("due_date", payload.dueDate);
    if (payload.priority !== undefined) addField("priority", payload.priority);
    if (payload.status !== undefined) addField("status", payload.status);
    if (payload.isKidMode !== undefined) addField("is_kid_mode", payload.isKidMode);
    if (payload.category !== undefined) addField("category", payload.category);

    if (sets.length === 0) {
      const current = await this.getById(id);
      if (!current) throw Object.assign(new Error("Task not found"), { statusCode: 404 });
      return current;
    }

    params.push(id);
    const row = await queryOne<Record<string, unknown>>(
      `WITH updated AS (
         UPDATE tasks SET ${sets.join(", ")}
         WHERE id = $${params.length}
         RETURNING *
       )
       SELECT u.*, assignee.id AS assignee_id, assignee.name AS assignee_name,
              assignee.profile_color AS assignee_color
       FROM updated u
       LEFT JOIN users assignee ON assignee.id = u.assigned_to`,
      params
    );

    if (!row) throw Object.assign(new Error("Task not found"), { statusCode: 404 });
    return rowToTask(row);
  },

  // ── Complete with celebration ─────────────────────────────────────────────

  async complete(
    id: string,
    celebrationShown = false
  ): Promise<Task> {
    const row = await queryOne<Record<string, unknown>>(
      `WITH updated AS (
         UPDATE tasks
         SET status = 'completed',
             celebration_shown = $1,
             completed_at = NOW()
         WHERE id = $2
         RETURNING *
       )
       SELECT u.*, assignee.id AS assignee_id, assignee.name AS assignee_name,
              assignee.profile_color AS assignee_color
       FROM updated u
       LEFT JOIN users assignee ON assignee.id = u.assigned_to`,
      [celebrationShown, id]
    );

    if (!row) throw Object.assign(new Error("Task not found"), { statusCode: 404 });
    return rowToTask(row);
  },

  // ── Delete ────────────────────────────────────────────────────────────────

  async delete(id: string): Promise<void> {
    const result = await query("DELETE FROM tasks WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      throw Object.assign(new Error("Task not found"), { statusCode: 404 });
    }
  },

  // ── Comments ──────────────────────────────────────────────────────────────

  async addComment(
    taskId: string,
    userId: string,
    payload: AddTaskCommentPayload
  ): Promise<TaskComment> {
    const row = await queryOne<Record<string, unknown>>(
      `WITH inserted AS (
         INSERT INTO task_comments (task_id, user_id, content)
         VALUES ($1, $2, $3)
         RETURNING *
       )
       SELECT i.*, u.id AS author_id, u.name AS author_name,
              u.profile_color AS author_color
       FROM inserted i
       JOIN users u ON u.id = i.user_id`,
      [taskId, userId, payload.content]
    );

    if (!row) throw new Error("Failed to add comment");
    return rowToComment(row);
  },

  async deleteComment(commentId: string, userId: string): Promise<void> {
    const result = await query(
      "DELETE FROM task_comments WHERE id = $1 AND user_id = $2",
      [commentId, userId]
    );
    if (result.rowCount === 0) {
      throw Object.assign(
        new Error("Comment not found or not authorized"),
        { statusCode: 404 }
      );
    }
  },

  // ── Kid Mode ──────────────────────────────────────────────────────────────

  async getKidModeTasks(assignedTo: string): Promise<KidModeTask[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT t.id, t.title, t.status, t.celebration_shown,
              u.name AS assignee_name, u.profile_color AS assignee_color
       FROM tasks t
       JOIN users u ON u.id = t.assigned_to
       WHERE t.assigned_to = $1
         AND t.is_kid_mode = true
         AND t.status NOT IN ('cancelled')
       ORDER BY
         CASE t.status WHEN 'completed' THEN 1 ELSE 0 END ASC,
         t.due_date ASC NULLS LAST,
         t.created_at ASC`,
      [assignedTo]
    );

    return result.rows.map((row) => ({
      id: row["id"] as string,
      title: row["title"] as string,
      emoji: "✅", // Could be extended with a per-category emoji map
      isCompleted: row["status"] === "completed",
      celebrationShown: row["celebration_shown"] as boolean,
      assigneeName: row["assignee_name"] as string,
      assigneeColor: row["assignee_color"] as string,
    }));
  },
};
