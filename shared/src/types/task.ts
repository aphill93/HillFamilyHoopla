// ─── Task Types ───────────────────────────────────────────────────────────────

export type TaskStatus =
  | "pending"
  | "in-progress"
  | "completed"
  | "cancelled";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface Task {
  id: string;
  createdBy: string;
  assignedTo: string | null;
  title: string;
  description: string | null;
  dueDate: string | null; // ISO 8601
  priority: TaskPriority;
  status: TaskStatus;
  isKidMode: boolean;
  celebrationShown: boolean;
  category: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Populated via JOIN in list endpoints */
  comments?: TaskComment[];
  assignee?: {
    id: string;
    name: string;
    profileColor: string;
  } | null;
}

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  content: string;
  createdAt: string;
  author?: {
    id: string;
    name: string;
    profileColor: string;
  };
}

/**
 * Kid Mode task – a simplified view of a task for the child-friendly UI.
 * Shows a large-target interface with emoji, animations, and celebration.
 */
export interface KidModeTask {
  id: string;
  title: string;
  emoji: string;
  isCompleted: boolean;
  celebrationShown: boolean;
  assigneeName: string;
  assigneeColor: string;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  assignedTo?: string;
  dueDate?: string;
  priority?: TaskPriority;
  isKidMode?: boolean;
  category?: string;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string | null;
  assignedTo?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  isKidMode?: boolean;
  category?: string | null;
}

export interface AddTaskCommentPayload {
  content: string;
}
