"use client";

import { useState, useEffect, useCallback } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from "date-fns";
import type { CalendarEventOccurrence, CalendarView } from "@hillfamilyhoopla/shared";
import { apiClient } from "@/lib/api";
import EventCard from "./EventCard";

interface ApiEventsResponse {
  events: CalendarEventOccurrence[];
  count: number;
}

export default function CalendarGrid() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>("month");
  const [events, setEvents] = useState<CalendarEventOccurrence[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const fetchEvents = useCallback(async (date: Date) => {
    setIsLoading(true);
    try {
      const start = startOfMonth(date).toISOString();
      const end = endOfMonth(date).toISOString();
      const data = await apiClient.get<ApiEventsResponse>(
        `/events?start=${start}&end=${end}&includeRecurring=true`
      );
      setEvents(data.events);
    } catch (err) {
      console.error("Failed to fetch events:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEvents(currentDate);
  }, [currentDate, fetchEvents]);

  // Build the calendar grid (6 weeks × 7 days)
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const getEventsForDay = (day: Date): CalendarEventOccurrence[] =>
    events.filter((e) =>
      isSameDay(new Date(e.startTime), day)
    );

  const dayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            aria-label="Previous month"
          >
            ‹
          </button>
          <h2 className="text-lg font-semibold text-foreground min-w-[180px] text-center">
            {format(currentDate, "MMMM yyyy")}
          </h2>
          <button
            type="button"
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            aria-label="Next month"
          >
            ›
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1.5 text-sm rounded-md border hover:bg-muted transition-colors"
          >
            Today
          </button>

          {/* View switcher */}
          <div className="flex rounded-md border overflow-hidden">
            {(["month", "week", "day"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-sm capitalize transition-colors ${
                  view === v
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="h-1 bg-primary/20">
          <div className="h-full bg-primary animate-pulse" style={{ width: "60%" }} />
        </div>
      )}

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b">
        {dayHeaders.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6 overflow-auto">
        {days.map((day) => {
          const dayEvents = getEventsForDay(day);
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isDaySelected = selectedDay ? isSameDay(day, selectedDay) : false;
          const isDayToday = isToday(day);

          return (
            <div
              key={day.toISOString()}
              className={`min-h-[100px] border-r border-b p-1 cursor-pointer transition-colors
                ${!isCurrentMonth ? "bg-muted/30" : "bg-background hover:bg-accent/5"}
                ${isDaySelected ? "ring-2 ring-inset ring-primary" : ""}
              `}
              onClick={() => setSelectedDay(day)}
            >
              {/* Day number */}
              <div className="flex justify-end mb-1">
                <span
                  className={`text-sm w-7 h-7 flex items-center justify-center rounded-full
                    ${isDayToday ? "bg-primary text-primary-foreground font-bold" : ""}
                    ${!isCurrentMonth ? "text-muted-foreground" : "text-foreground"}
                  `}
                >
                  {format(day, "d")}
                </span>
              </div>

              {/* Events */}
              <div className="space-y-0.5 overflow-hidden">
                {dayEvents.slice(0, 3).map((event) => (
                  <EventCard key={`${event.id}-${event.occurrenceDate}`} event={event} compact />
                ))}
                {dayEvents.length > 3 && (
                  <p className="text-xs text-muted-foreground pl-1">
                    +{dayEvents.length - 3} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
