"use client";

import { useRef, useEffect } from "react";
import {
  format,
  startOfWeek,
  addDays,
  isToday,
  isSameDay,
  differenceInMinutes,
  startOfDay,
} from "date-fns";
import type { CalendarEventOccurrence } from "@hillfamilyhoopla/shared";

// ─── Constants ────────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 64;           // px per hour
const TIME_COL_WIDTH = 52;        // px for time gutter
const TOTAL_HEIGHT = HOUR_HEIGHT * 24;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// ─── Overlap layout ───────────────────────────────────────────────────────────

interface PositionedEvent {
  event: CalendarEventOccurrence;
  column: number;
  totalColumns: number;
}

function layoutEventsForDay(events: CalendarEventOccurrence[]): PositionedEvent[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  const result: PositionedEvent[] = [];
  // Simple greedy column assignment
  const columns: Date[] = []; // tracks end time of last event in each column

  for (const event of sorted) {
    const start = new Date(event.startTime);
    const end = new Date(event.endTime);

    let col = columns.findIndex((colEnd) => colEnd <= start);
    if (col === -1) {
      col = columns.length;
      columns.push(end);
    } else {
      columns[col] = end;
    }
    result.push({ event, column: col, totalColumns: 0 });
  }

  // Resolve totalColumns: events that overlap share the same max column count
  const totalCols = columns.length;
  for (const r of result) {
    r.totalColumns = totalCols;
  }
  return result;
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

function minutesFromDayStart(date: Date): number {
  const dayStart = startOfDay(date);
  return differenceInMinutes(date, dayStart);
}

function hourLabel(h: number): string {
  if (h === 0)  return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

// ─── Week View ────────────────────────────────────────────────────────────────

interface WeekViewProps {
  currentDate: Date;
  events: CalendarEventOccurrence[];
  onEventClick: (event: CalendarEventOccurrence) => void;
  onDayClick: (date: Date) => void;
}

export default function WeekView({ currentDate, events, onEventClick, onDayClick }: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to current hour on mount
  useEffect(() => {
    if (scrollRef.current) {
      const hour = new Date().getHours();
      const target = Math.max(0, hour - 1) * HOUR_HEIGHT;
      scrollRef.current.scrollTop = target;
    }
  }, []);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const allDayEvents = events.filter((e) => e.isAllDay);
  const timedEvents  = events.filter((e) => !e.isAllDay);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── All-day row ───────────────────────────────────────────────────── */}
      <div className="flex border-b shrink-0 bg-card">
        <div style={{ width: TIME_COL_WIDTH }} className="shrink-0" />
        {days.map((day) => {
          const dayAllDay = allDayEvents.filter((e) => isSameDay(new Date(e.startTime), day));
          return (
            <div
              key={day.toISOString()}
              className="flex-1 border-l min-h-[32px] px-1 py-0.5 space-y-0.5 cursor-pointer hover:bg-accent/5"
              onClick={() => onDayClick(day)}
            >
              {/* Day header */}
              <div className="flex flex-col items-center mb-0.5">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                  {format(day, "EEE")}
                </span>
                <span
                  className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full ${
                    isToday(day)
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground"
                  }`}
                >
                  {format(day, "d")}
                </span>
              </div>
              {/* All-day chips */}
              {dayAllDay.map((e) => (
                <button
                  key={e.id}
                  onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }}
                  className="w-full text-left text-xs rounded px-1 py-0.5 truncate font-medium"
                  style={{ backgroundColor: `${e.colorOverride ?? "#3B82F6"}22`, borderLeft: `3px solid ${e.colorOverride ?? "#3B82F6"}`, color: e.colorOverride ?? "#3B82F6" }}
                >
                  {e.title}
                </button>
              ))}
            </div>
          );
        })}
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

          {/* Day columns */}
          {days.map((day) => {
            const dayTimed = timedEvents.filter((e) =>
              isSameDay(new Date(e.startTime), day)
            );
            const positioned = layoutEventsForDay(dayTimed);

            return (
              <div
                key={day.toISOString()}
                className="flex-1 border-l relative"
                onClick={() => onDayClick(day)}
              >
                {/* Hour lines */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute w-full border-t border-muted/50"
                    style={{ top: h * HOUR_HEIGHT }}
                  />
                ))}

                {/* Current time indicator */}
                {isToday(day) && <CurrentTimeIndicator />}

                {/* Event blocks */}
                {positioned.map(({ event, column, totalColumns }) => (
                  <WeekEventBlock
                    key={`${event.id}-${event.occurrenceDate}`}
                    event={event}
                    column={column}
                    totalColumns={totalColumns}
                    onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Current time indicator ───────────────────────────────────────────────────

function CurrentTimeIndicator() {
  const now = new Date();
  const top = minutesFromDayStart(now) / 60 * HOUR_HEIGHT;
  return (
    <div className="absolute left-0 right-0 z-10 flex items-center" style={{ top }}>
      <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
      <div className="flex-1 h-px bg-red-500" />
    </div>
  );
}

// ─── Event block ──────────────────────────────────────────────────────────────

interface WeekEventBlockProps {
  event: CalendarEventOccurrence;
  column: number;
  totalColumns: number;
  onClick: (e: React.MouseEvent) => void;
}

function WeekEventBlock({ event, column, totalColumns, onClick }: WeekEventBlockProps) {
  const start   = new Date(event.startTime);
  const end     = new Date(event.endTime);
  const top     = minutesFromDayStart(start) / 60 * HOUR_HEIGHT;
  const height  = Math.max(differenceInMinutes(end, start) / 60 * HOUR_HEIGHT, 20);
  const width   = `calc((100% - 2px) / ${totalColumns})`;
  const left    = `calc((100% - 2px) / ${totalColumns} * ${column})`;
  const color   = event.colorOverride ?? "#3B82F6";

  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute rounded text-left text-white text-xs font-medium overflow-hidden hover:brightness-95 transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
      style={{ top, height, width, left, backgroundColor: color, padding: "2px 4px", zIndex: 5 }}
      title={event.title}
    >
      <span className="block truncate font-semibold">{event.title}</span>
      {height > 32 && (
        <span className="block truncate opacity-90">
          {format(start, "h:mm")}–{format(end, "h:mm a")}
        </span>
      )}
    </button>
  );
}
