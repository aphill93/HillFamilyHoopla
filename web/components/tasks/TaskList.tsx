"use client";

import { useState, useEffect, useCallback } from "react";
import type { Task, TaskStatus, TaskPriority } from "@hillfamilyhoopla/shared";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import MemberAvatar from "@/components/ui/MemberAvatar";
import { format } from "date-fns";

interface TasksResponse {
  tasks: Task[];
  total: number;
}

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  pending: "text-slate-500",
  "in-progress": "text-blue-600",
  completed: "text-green-600 line-through",
  cancelled: "text-slate-400 line-through",
};

export default function TaskList() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "50", sortBy: "dueDate", sortOrder: "asc" });
      if (statusFilter) params.set("status", statusFilter);
      const data = await apiClient.get<TasksResponse>(`/tasks?${params}`);
      setTasks(data.tasks);
      setTotal(data.total);
    } catch (err) {
      setError("Failed to load tasks.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  async function handleComplete(task: Task) {
    try {
      const updated = await apiClient.post<{ task: Task }>(
        `/tasks/${task.id}/complete`,
        { celebrationShown: false }
      );
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? updated.task : t))
      );
    } catch (err) {
      console.error("Failed to complete task:", err);
    }
  }

  const grouped = tasks.reduce<Record<TaskStatus, Task[]>>(
    (acc, t) => {
      const s = t.status;
      if (!acc[s]) acc[s] = [];
      acc[s]!.push(t);
      return acc;
    },
    { pending: [], "in-progress": [], completed: [], cancelled: [] }
  );

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(["", "pending", "in-progress", "completed"] as const).map((s) => (
          <button
            key={s || "all"}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              statusFilter === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : "All"}
          </button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground self-center">
          {total} task{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 text-destructive rounded-md px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 rounded-lg bg-muted animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Task groups */}
      {!isLoading && (
        <div className="space-y-6">
          {(["pending", "in-progress", "completed", "cancelled"] as TaskStatus[]).map(
            (status) => {
              const group = grouped[status];
              if (!group?.length) return null;
              return (
                <section key={status}>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {status === "in-progress" ? "In Progress" : status.charAt(0).toUpperCase() + status.slice(1)}{" "}
                    ({group.length})
                  </h3>
                  <div className="space-y-2">
                    {group.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onComplete={handleComplete}
                        currentUserId={user?.id}
                      />
                    ))}
                  </div>
                </section>
              );
            }
          )}

          {tasks.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg">No tasks yet</p>
              <p className="text-sm">Create a task to get started.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── TaskRow ──────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: Task;
  onComplete: (task: Task) => void;
  currentUserId?: string;
}

function TaskRow({ task, onComplete, currentUserId }: TaskRowProps) {
  const isCompleted = task.status === "completed";
  const isCancelled = task.status === "cancelled";
  const isOverdue =
    !isCompleted &&
    !isCancelled &&
    task.dueDate &&
    new Date(task.dueDate) < new Date();

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow">
      {/* Complete checkbox */}
      <input
        type="checkbox"
        checked={isCompleted}
        disabled={isCompleted || isCancelled}
        onChange={() => onComplete(task)}
        className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-primary"
        aria-label={`Mark "${task.title}" as complete`}
      />

      {/* Task info */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <p
            className={`text-sm font-medium truncate ${STATUS_STYLES[task.status]}`}
          >
            {task.title}
          </p>
          {task.isKidMode && (
            <span title="Kid Mode" className="text-base">⭐</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Priority badge */}
          <span
            className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLES[task.priority]}`}
          >
            {task.priority}
          </span>

          {/* Due date */}
          {task.dueDate && (
            <span
              className={`text-xs ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}
            >
              {isOverdue ? "Overdue · " : "Due "}
              {format(new Date(task.dueDate), "MMM d")}
            </span>
          )}

          {/* Category */}
          {task.category && (
            <span className="text-xs text-muted-foreground">{task.category}</span>
          )}
        </div>
      </div>

      {/* Assignee avatar */}
      {task.assignee && (
        <MemberAvatar
          name={task.assignee.name}
          color={task.assignee.profileColor}
          size="sm"
        />
      )}
    </div>
  );
}
