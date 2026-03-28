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
  addWeeks,
  subWeeks,
  addDays,
  subDays,
} from "date-fns";
import type { CalendarEventOccurrence, CalendarView } from "@hillfamilyhoopla/shared";
import { apiClient } from "@/lib/api";
import EventCard from "./EventCard";
import WeekView from "./WeekView";
import DayView from "./DayView";
import EventFormModal from "./EventFormModal";
import LayerFilterSidebar from "./LayerFilterSidebar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiEventsResponse {
  events: CalendarEventOccurrence[];
  count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getViewRange(view: CalendarView, date: Date): { start: Date; end: Date } {
  switch (view) {
    case "month": {
      const monthStart = startOfMonth(date);
      const monthEnd   = endOfMonth(date);
      return {
        start: startOfWeek(monthStart, { weekStartsOn: 0 }),
        end:   endOfWeek(monthEnd,     { weekStartsOn: 0 }),
      };
    }
    case "week": {
      const ws = startOfWeek(date, { weekStartsOn: 0 });
      return { start: ws, end: endOfWeek(date, { weekStartsOn: 0 }) };
    }
    case "day":
      return { start: date, end: date };
    default:
      return { start: date, end: date };
  }
}

function navigateDate(view: CalendarView, date: Date, direction: -1 | 1): Date {
  switch (view) {
    case "month": return direction === 1 ? addMonths(date, 1) : subMonths(date, 1);
    case "week":  return direction === 1 ? addWeeks(date, 1)  : subWeeks(date, 1);
    case "day":   return direction === 1 ? addDays(date, 1)   : subDays(date, 1);
    default:      return date;
  }
}

function viewTitle(view: CalendarView, date: Date): string {
  switch (view) {
    case "month": return format(date, "MMMM yyyy");
    case "week": {
      const ws = startOfWeek(date, { weekStartsOn: 0 });
      const we = endOfWeek(date,   { weekStartsOn: 0 });
      return isSameMonth(ws, we)
        ? `${format(ws, "MMM d")}–${format(we, "d, yyyy")}`
        : `${format(ws, "MMM d")} – ${format(we, "MMM d, yyyy")}`;
    }
    case "day":  return format(date, "EEEE, MMMM d, yyyy");
    default:     return "";
  }
}

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── CalendarGrid ─────────────────────────────────────────────────────────────

export default function CalendarGrid() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView]               = useState<CalendarView>("month");
  const [events, setEvents]           = useState<CalendarEventOccurrence[]>([]);
  const [isLoading, setIsLoading]     = useState(false);
  const [hiddenLayerIds, setHiddenLayerIds] = useState<Set<string>>(new Set());
  const [showSidebar, setShowSidebar] = useState(false);

  // Modal state
  const [formOpen, setFormOpen]           = useState(false);
  const [editingEvent, setEditingEvent]   = useState<CalendarEventOccurrence | undefined>();
  const [formInitialStart, setFormInitialStart] = useState<Date | undefined>();

  // Detail popover
  const [detailEvent, setDetailEvent] = useState<CalendarEventOccurrence | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchEvents = useCallback(
    async (v: CalendarView, date: Date) => {
      setIsLoading(true);
      try {
        const { start, end } = getViewRange(v, date);
        const data = await apiClient.get<ApiEventsResponse>(
          `/events?start=${start.toISOString()}&end=${end.toISOString()}&includeRecurring=true`
        );
        setEvents(data.events);
      } catch (err) {
        console.error("Failed to fetch events:", err);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void fetchEvents(view, currentDate);
  }, [view, currentDate, fetchEvents]);

  // ── Filtered events ────────────────────────────────────────────────────────

  const visibleEvents = hiddenLayerIds.size === 0
    ? events
    : events.filter((e) => !hiddenLayerIds.has(e.layerId));

  // ── Month grid data ────────────────────────────────────────────────────────

  const monthStart = startOfMonth(currentDate);
  const monthEnd   = endOfMonth(currentDate);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd    = endOfWeek(monthEnd,     { weekStartsOn: 0 });
  const days       = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const getEventsForDay = (day: Date) =>
    visibleEvents.filter((e) => isSameDay(new Date(e.startTime), day));

  // ── Event handlers ─────────────────────────────────────────────────────────

  function openCreateForm(initialStart?: Date) {
    setEditingEvent(undefined);
    setFormInitialStart(initialStart);
    setFormOpen(true);
  }

  function openEditForm(event: CalendarEventOccurrence) {
    setDetailEvent(null);
    setEditingEvent(event);
    setFormInitialStart(undefined);
    setFormOpen(true);
  }

  function handleEventClick(event: CalendarEventOccurrence) {
    setDetailEvent(event);
  }

  function handleDayClick(date: Date) {
    setCurrentDate(date);
    setView("day");
  }

  async function handleFormSaved() {
    setFormOpen(false);
    await fetchEvents(view, currentDate);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Layer filter sidebar (desktop always, mobile drawer) ─────────── */}
      <div className={`shrink-0 transition-all ${showSidebar ? "w-52" : "w-0 overflow-hidden"} md:w-52`}>
        <LayerFilterSidebar
          hiddenLayerIds={hiddenLayerIds}
          onChange={setHiddenLayerIds}
          onClose={() => setShowSidebar(false)}
        />
      </div>

      {/* ── Main calendar area ───────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* ── Toolbar ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0 gap-2">
          {/* Left: sidebar toggle + nav */}
          <div className="flex items-center gap-1">
            {/* Sidebar toggle (mobile) */}
            <button
              type="button"
              onClick={() => setShowSidebar((s) => !s)}
              className="md:hidden p-1.5 rounded-md hover:bg-muted transition-colors"
              aria-label="Toggle calendar list"
            >
              ☰
            </button>

            <button
              type="button"
              onClick={() => setCurrentDate(navigateDate(view, currentDate, -1))}
              className="p-1.5 rounded-md hover:bg-muted transition-colors text-lg leading-none"
              aria-label="Previous"
            >
              ‹
            </button>

            <h2 className="text-base font-semibold text-foreground min-w-[180px] text-center select-none">
              {viewTitle(view, currentDate)}
            </h2>

            <button
              type="button"
              onClick={() => setCurrentDate(navigateDate(view, currentDate, 1))}
              className="p-1.5 rounded-md hover:bg-muted transition-colors text-lg leading-none"
              aria-label="Next"
            >
              ›
            </button>
          </div>

          {/* Right: Today + view switcher + new event */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentDate(new Date())}
              className="hidden sm:block px-3 py-1.5 text-sm rounded-md border hover:bg-muted transition-colors"
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
                  className={`px-2.5 py-1.5 text-xs font-medium capitalize transition-colors ${
                    view === v
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>

            {/* New event button */}
            <button
              type="button"
              onClick={() => openCreateForm()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <span className="text-base leading-none">+</span>
              <span className="hidden sm:inline">New</span>
            </button>
          </div>
        </div>

        {/* Loading bar */}
        {isLoading && (
          <div className="h-0.5 bg-primary/20 shrink-0">
            <div className="h-full bg-primary animate-pulse w-3/5" />
          </div>
        )}

        {/* ── View content ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden">
          {view === "week" && (
            <WeekView
              currentDate={currentDate}
              events={visibleEvents}
              onEventClick={handleEventClick}
              onDayClick={handleDayClick}
            />
          )}

          {view === "day" && (
            <DayView
              currentDate={currentDate}
              events={visibleEvents.filter((e) =>
                isSameDay(new Date(e.startTime), currentDate)
              )}
              onEventClick={handleEventClick}
            />
          )}

          {view === "month" && (
            <MonthGrid
              days={days}
              currentDate={currentDate}
              getEventsForDay={getEventsForDay}
              onDayClick={handleDayClick}
              onEventClick={handleEventClick}
              onCreateEvent={openCreateForm}
            />
          )}
        </div>
      </div>

      {/* ── Event detail popover ─────────────────────────────────────────── */}
      {detailEvent && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setDetailEvent(null); }}
        >
          <div className="w-full max-w-sm rounded-xl bg-card border shadow-lg p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <span className="text-base font-semibold">{detailEvent.title}</span>
              <button
                type="button"
                onClick={() => setDetailEvent(null)}
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                ✕
              </button>
            </div>
            <EventCard event={detailEvent} />
            <div className="flex justify-end mt-3">
              <button
                type="button"
                onClick={() => openEditForm(detailEvent)}
                className="text-sm text-primary hover:underline"
              >
                Edit event
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Event form modal ─────────────────────────────────────────────── */}
      {formOpen && (
        <EventFormModal
          event={editingEvent}
          initialStart={formInitialStart}
          onClose={() => setFormOpen(false)}
          onSaved={handleFormSaved}
        />
      )}
    </div>
  );
}

// ─── MonthGrid (extracted for readability) ────────────────────────────────────

interface MonthGridProps {
  days: Date[];
  currentDate: Date;
  getEventsForDay: (day: Date) => CalendarEventOccurrence[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEventOccurrence) => void;
  onCreateEvent: (start: Date) => void;
}

function MonthGrid({
  days,
  currentDate,
  getEventsForDay,
  onDayClick,
  onEventClick,
  onCreateEvent,
}: MonthGridProps) {
  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b shrink-0">
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grid cells */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr">
        {days.map((day) => {
          const dayEvents      = getEventsForDay(day);
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isDayToday     = isToday(day);

          return (
            <div
              key={day.toISOString()}
              className={`min-h-[90px] border-r border-b p-1 cursor-pointer transition-colors group
                ${!isCurrentMonth ? "bg-muted/30" : "bg-background hover:bg-accent/5"}
              `}
              onClick={() => onDayClick(day)}
            >
              {/* Day number + quick add */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-sm w-7 h-7 flex items-center justify-center rounded-full font-medium
                    ${isDayToday ? "bg-primary text-primary-foreground font-bold" : ""}
                    ${!isCurrentMonth ? "text-muted-foreground" : "text-foreground"}
                  `}
                >
                  {format(day, "d")}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateEvent(day);
                  }}
                  className="h-5 w-5 rounded-full text-muted-foreground hover:bg-primary hover:text-primary-foreground opacity-0 group-hover:opacity-100 transition-all text-sm leading-none flex items-center justify-center"
                  aria-label={`Add event on ${format(day, "MMM d")}`}
                >
                  +
                </button>
              </div>

              {/* Events */}
              <div className="space-y-0.5 overflow-hidden">
                {dayEvents.slice(0, 3).map((event) => (
                  <EventCard
                    key={`${event.id}-${event.occurrenceDate}`}
                    event={event}
                    compact
                    onClick={() => onEventClick(event)}
                  />
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
