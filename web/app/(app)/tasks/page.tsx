import type { Metadata } from "next";
import TaskList from "@/components/tasks/TaskList";

export const metadata: Metadata = {
  title: "Tasks",
};

export default function TasksPage() {
  return (
    <main className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Tasks</h1>
      </div>
      <TaskList />
    </main>
  );
}
