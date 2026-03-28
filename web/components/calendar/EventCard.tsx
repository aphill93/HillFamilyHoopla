"use client";

import { format } from "date-fns";
import type { CalendarEventOccurrence } from "@hillfamilyhoopla/shared";

interface EventCardProps {
  event: CalendarEventOccurrence;
  /** Compact mode: used in month-grid cells */
  compact?: boolean;
  onClick?: () => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  work: "💼",
  school: "📚",
  sports: "⚽",
  medical: "🏥",
  social: "🎉",
  family: "👨‍👩‍👧‍👦",
  holiday: "🎄",
  other: "📌",
};

export default function EventCard({ event, compact = false, onClick }: EventCardProps) {
  const color = event.colorOverride ?? "#3B82F6"; // fallback to blue
  const icon = event.category ? (CATEGORY_ICONS[event.category] ?? "📌") : "📌";

  if (compact) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        className="w-full text-left rounded px-1 py-0.5 text-xs font-medium truncate transition-opacity hover:opacity-80"
        style={{
          backgroundColor: `${color}22`,
          borderLeft: `3px solid ${color}`,
          color,
        }}
        title={event.title}
      >
        {event.isAllDay ? null : (
          <span className="mr-1 opacity-75">
            {format(new Date(event.startTime), "h:mm")}
          </span>
        )}
        {event.title}
      </button>
    );
  }

  return (
    <div
      className="rounded-lg border p-4 space-y-2 cursor-pointer hover:shadow-md transition-shadow"
      style={{ borderLeftWidth: "4px", borderLeftColor: color }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base" role="img" aria-label={event.category ?? "event"}>
            {icon}
          </span>
          <h3 className="font-semibold text-foreground truncate">{event.title}</h3>
        </div>
        {event.isRecurring && (
          <span
            className="shrink-0 text-xs text-muted-foreground"
            title="Recurring event"
          >
            ↻
          </span>
        )}
      </div>

      {/* Time */}
      <div className="text-sm text-muted-foreground">
        {event.isAllDay ? (
          <span>All day · {format(new Date(event.startTime), "MMM d, yyyy")}</span>
        ) : (
          <span>
            {format(new Date(event.startTime), "MMM d, h:mm a")} –{" "}
            {format(new Date(event.endTime), "h:mm a")}
          </span>
        )}
      </div>

      {/* Location */}
      {event.location && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <span aria-hidden="true">📍</span>
          <span className="truncate">{event.location}</span>
        </div>
      )}

      {/* Description */}
      {event.description && (
        <p className="text-sm text-muted-foreground line-clamp-2">
          {event.description}
        </p>
      )}

      {/* Attendees */}
      {event.attendees && event.attendees.length > 0 && (
        <div className="flex items-center gap-1">
          {event.attendees.slice(0, 5).map((a) => (
            <span
              key={a.userId}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-white font-medium"
              style={{ backgroundColor: a.profileColor }}
              title={`${a.name} — ${a.status}`}
            >
              {a.name.charAt(0).toUpperCase()}
            </span>
          ))}
          {event.attendees.length > 5 && (
            <span className="text-xs text-muted-foreground">
              +{event.attendees.length - 5}
            </span>
          )}
        </div>
      )}

      {/* Exception badge */}
      {event.isException && (
        <span className="inline-block text-xs bg-orange-100 text-orange-700 rounded px-1.5 py-0.5">
          Modified occurrence
        </span>
      )}
    </div>
  );
}
