"use client";

import { useState, useEffect, useCallback } from "react";
import type { KidModeTask } from "@hillfamilyhoopla/shared";
import { apiClient } from "@/lib/api";

interface KidModeProps {
  userId: string;
  userName: string;
}

const CELEBRATION_EMOJIS = ["🎉", "⭐", "🌟", "🎊", "🏆", "🎈", "💫", "✨"];

function CelebrationOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-yellow-400/95 animate-bounce-in"
    >
      <div className="text-8xl animate-star-pop mb-6">⭐</div>
      <h2 className="text-5xl font-black text-white drop-shadow-lg mb-2">
        Amazing!
      </h2>
      <p className="text-2xl text-white/90 font-bold">Task complete!</p>

      {/* Confetti dots */}
      {CELEBRATION_EMOJIS.map((emoji, i) => (
        <span
          key={i}
          className="absolute text-4xl animate-confetti-fall"
          style={{
            left: `${10 + i * 11}%`,
            animationDelay: `${i * 0.15}s`,
            animationDuration: `${1.5 + (i % 3) * 0.5}s`,
          }}
          aria-hidden="true"
        >
          {emoji}
        </span>
      ))}

      <button
        type="button"
        onClick={onDone}
        className="mt-8 px-8 py-4 bg-white text-yellow-600 rounded-2xl text-xl font-black shadow-lg hover:scale-105 transition-transform"
      >
        Yay! 🎉
      </button>
    </div>
  );
}

interface KidModeTasksResponse {
  tasks: KidModeTask[];
}

export default function KidMode({ userId, userName }: KidModeProps) {
  const [tasks, setTasks] = useState<KidModeTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get<KidModeTasksResponse>(
        `/tasks/kid-mode/${userId}`
      );
      setTasks(data.tasks);
    } catch (err) {
      console.error("Failed to load kid mode tasks:", err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  async function handleComplete(task: KidModeTask) {
    if (task.isCompleted || completingId) return;
    setCompletingId(task.id);

    try {
      await apiClient.post(`/tasks/${task.id}/complete`, {
        celebrationShown: true,
      });
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, isCompleted: true, celebrationShown: true }
            : t
        )
      );
      setCelebrating(true);
    } catch (err) {
      console.error("Failed to complete task:", err);
    } finally {
      setCompletingId(null);
    }
  }

  const pendingTasks = tasks.filter((t) => !t.isCompleted);
  const completedTasks = tasks.filter((t) => t.isCompleted);

  return (
    <div className="kid-mode min-h-screen bg-gradient-to-b from-blue-100 to-purple-100 p-4">
      {celebrating && (
        <CelebrationOverlay onDone={() => setCelebrating(false)} />
      )}

      {/* Header */}
      <div className="text-center mb-8 pt-4">
        <div className="text-6xl mb-2">👋</div>
        <h1 className="text-4xl font-black text-purple-700">
          Hi, {userName}!
        </h1>
        <p className="text-xl text-purple-500 font-bold mt-1">
          Your tasks for today
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="text-4xl animate-spin">🌀</div>
        </div>
      )}

      {/* Task grid */}
      {!isLoading && (
        <>
          {pendingTasks.length === 0 && completedTasks.length > 0 && (
            <div className="text-center py-8">
              <div className="text-7xl mb-4">🏆</div>
              <p className="text-3xl font-black text-green-600">
                All done! You rock!
              </p>
            </div>
          )}

          {pendingTasks.length === 0 && completedTasks.length === 0 && (
            <div className="text-center py-8">
              <div className="text-7xl mb-4">🌈</div>
              <p className="text-2xl font-black text-purple-600">
                No tasks right now!
              </p>
              <p className="text-lg text-purple-400 mt-2">
                Check back later.
              </p>
            </div>
          )}

          {/* Pending tasks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {pendingTasks.map((task) => (
              <KidTaskCard
                key={task.id}
                task={task}
                onComplete={handleComplete}
                isCompleting={completingId === task.id}
              />
            ))}
          </div>

          {/* Completed tasks (collapsed section) */}
          {completedTasks.length > 0 && (
            <div className="mt-4">
              <p className="text-center text-lg font-bold text-green-600 mb-3">
                ✅ Completed ({completedTasks.length})
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {completedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-2xl bg-green-100 border-2 border-green-300 p-4 text-center opacity-70"
                  >
                    <div className="text-3xl mb-1">{task.emoji}</div>
                    <p className="text-sm font-bold text-green-700 line-through">
                      {task.title}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── KidTaskCard ──────────────────────────────────────────────────────────────

interface KidTaskCardProps {
  task: KidModeTask;
  onComplete: (task: KidModeTask) => Promise<void>;
  isCompleting: boolean;
}

function KidTaskCard({ task, onComplete, isCompleting }: KidTaskCardProps) {
  return (
    <button
      type="button"
      onClick={() => onComplete(task)}
      disabled={isCompleting}
      className={`
        w-full rounded-3xl p-6 text-center shadow-lg transition-all
        focus:outline-none focus:ring-4 focus:ring-purple-400
        disabled:opacity-50 disabled:cursor-wait
        ${
          task.isCompleted
            ? "bg-green-200 border-4 border-green-400 scale-95"
            : "bg-white border-4 border-purple-300 hover:scale-105 hover:shadow-xl active:scale-95"
        }
      `}
      aria-label={`Complete task: ${task.title}`}
    >
      <div className="text-5xl mb-3">{task.emoji}</div>
      <p
        className={`text-xl font-black leading-tight ${
          task.isCompleted
            ? "text-green-700 line-through"
            : "text-purple-700"
        }`}
      >
        {task.title}
      </p>
      {isCompleting && (
        <div className="mt-3 text-3xl animate-spin">⏳</div>
      )}
      {!isCompleting && !task.isCompleted && (
        <div className="mt-3 text-2xl text-purple-400">Tap to finish! 👆</div>
      )}
      {task.isCompleted && (
        <div className="mt-3 text-2xl">✅ Done!</div>
      )}
    </button>
  );
}
