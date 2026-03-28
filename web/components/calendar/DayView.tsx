"use client";

import { useRef, useEffect } from "react";
import {
  format,
  isToday,
  differenceInMinutes,
  startOfDay,
} from "date-fns";
import type { CalendarEventOccurrence } from "@hillfamilyhoopla/shared";

const HOUR_HEIGHT = 64;
const TIME_COL_WIDTH = 52;
const TOTAL_HEIGHT = HOUR_HEIGHT * 24;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function minutesFromDayStart(date: Date): number {
  return differenceInMinutes(date, startOfDay(date));
}

function hourLabel(h: number): string {
  if (h === 0)  return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

// Simple overlap layout (same algorithm as WeekView)
interface PositionedEvent {
  event: CalendarEventOccurrence;
  column: number;
  totalColumns: number;
}

function layoutEvents(events: CalendarEventOccurrence[]): PositionedEvent[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
  const columns: Date[] = [];
  const result: PositionedEvent[] = [];

  for (const event of sorted) {
    const start = new Date(event.startTime);
    const end   = new Date(event.endTime);
    let col = columns.findIndex((colEnd) => colEnd <= start);
    if (col === -1) { col = columns.length; columns.push(end); }
    else columns[col] = end;
    result.push({ event, column: col, totalColumns: 0 });
  }
  const total = columns.length || 1;
  result.forEach((r) => { r.totalColumns = total; });
  return result;
}

// ─── Day View ─────────────────────────────────────────────────────────────────

interface DayViewProps {
  currentDate: Date;
  events: CalendarEventOccurrence[];
  onEventClick: (event: CalendarEventOccurrence) => void;
}

export default function DayView({ currentDate, events, onEventClick }: DayViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const hour = new Date().getHours();
      scrollRef.current.scrollTop = Math.max(0, hour - 1) * HOUR_HEIGHT;
    }
  }, []);

  const allDay = events.filter((e) => e.isAllDay);
  const timed  = events.filter((e) => !e.isAllDay);
  const positioned = layoutEvents(timed);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Date heading + all-day events ─────────────────────────────────── */}
      <div className="shrink-0 border-b bg-card px-4 py-2">
        <h3 className="text-sm font-semibold text-foreground">
          {format(currentDate, "EEEE, MMMM d, yyyy")}
          {isToday(currentDate) && (
            <span className="ml-2 text-xs font-normal text-primary">Today</span>
          )}
        </h3>
        {allDay.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {allDay.map((e) => (
              <button
                key={e.id}
                onClick={() => onEventClick(e)}
                className="w-full text-left text-xs rounded px-2 py-0.5 truncate font-medium"
                style={{
                  backgroundColor: `${e.colorOverride ?? "#3B82F6"}22`,
                  borderLeft: `3px solid ${e.colorOverride ?? "#3B82F6"}`,
                  color: e.colorOverride ?? "#3B82F6",
                }}
              >
                {e.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Scrollable time grid ──────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex" style={{ height: TOTAL_HEIGHT }}>
          {/* Time gutter */}
          <div className="shrink-0 relative" style={{ width: TIME_COL_WIDTH }}>
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute w-full flex justify-end pr-2"
                style={{ top: h * HOUR_HEIGHT - 8 }}
              >
                <span className="text-xs text-muted-foreground">{hourLabel(h)}</span>
              </div>
            ))}
          </div>

          {/* Single day column */}
          <div className="flex-1 border-l relative">
            {/* Hour lines */}
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute w-full border-t border-muted/50"
                style={{ top: h * HOUR_HEIGHT }}
              />
            ))}

            {/* 15-min lines (lighter) */}
            {HOURS.flatMap((h) =>
              [15, 30, 45].map((m) => (
                <div
                  key={`${h}-${m}`}
                  className="absolute w-full border-t border-muted/20"
                  style={{ top: (h + m / 60) * HOUR_HEIGHT }}
                />
              ))
            )}

            {/* Current time indicator */}
            {isToday(currentDate) && (
              <div
                className="absolute left-0 right-0 z-10 flex items-center"
                style={{ top: minutesFromDayStart(new Date()) / 60 * HOUR_HEIGHT }}
              >
                <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
                <div className="flex-1 h-px bg-red-500" />
              </div>
            )}

            {/* Event blocks */}
            {positioned.map(({ event, column, totalColumns }) => {
              const start  = new Date(event.startTime);
              const end    = new Date(event.endTime);
              const top    = minutesFromDayStart(start) / 60 * HOUR_HEIGHT;
              const height = Math.max(differenceInMinutes(end, start) / 60 * HOUR_HEIGHT, 24);
              const color  = event.colorOverride ?? "#3B82F6";
              const gutter = 4;
              const w = `calc((100% - ${gutter * 2}px) / ${totalColumns})`;
              const l = `calc(${gutter}px + (100% - ${gutter * 2}px) / ${totalColumns} * ${column})`;

              return (
                <button
                  key={`${event.id}-${event.occurrenceDate}`}
                  type="button"
                  onClick={() => onEventClick(event)}
                  className="absolute rounded text-left text-white text-xs font-medium overflow-hidden hover:brightness-95 transition-all focus:outline-none focus:ring-2 focus:ring-ring"
                  style={{ top, height, width: w, left: l, backgroundColor: color, padding: "2px 6px", zIndex: 5 }}
                  title={event.title}
                >
                  <span className="block truncate font-semibold">{event.title}</span>
                  {height > 36 && (
                    <span className="block opacity-90">
                      {format(start, "h:mm")}–{format(end, "h:mm a")}
                    </span>
                  )}
                  {height > 52 && event.location && (
                    <span className="block opacity-80 truncate">📍 {event.location}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
