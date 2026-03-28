import type { Metadata } from "next";
import CalendarGrid from "@/components/calendar/CalendarGrid";

export const metadata: Metadata = {
  title: "Calendar",
};

export default function CalendarPage() {
  return (
    <main className="flex flex-col h-full">
      <CalendarGrid />
    </main>
  );
}
