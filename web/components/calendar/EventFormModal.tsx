"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO, addHours } from "date-fns";
import type {
  CalendarEventOccurrence,
  CalendarLayer,
  CreateEventPayload,
  UpdateEventPayload,
  EventCategory,
} from "@hillfamilyhoopla/shared";
import { apiClient } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FamilyMember {
  id: string;
  name: string;
  profileColor: string;
}

interface EventFormModalProps {
  /** If provided, the modal is in edit mode */
  event?: CalendarEventOccurrence;
  /** Pre-fill start time (new event from time slot click) */
  initialStart?: Date;
  onClose: () => void;
  onSaved: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: { value: EventCategory; label: string; icon: string }[] = [
  { value: "family",  label: "Family",  icon: "👨‍👩‍👧‍👦" },
  { value: "work",    label: "Work",    icon: "💼" },
  { value: "school",  label: "School",  icon: "📚" },
  { value: "sports",  label: "Sports",  icon: "⚽" },
  { value: "medical", label: "Medical", icon: "🏥" },
  { value: "social",  label: "Social",  icon: "🎉" },
  { value: "holiday", label: "Holiday", icon: "🎄" },
  { value: "other",   label: "Other",   icon: "📌" },
];

const REMINDER_OPTIONS = [
  { label: "5 min before",  value: 5 },
  { label: "15 min before", value: 15 },
  { label: "30 min before", value: 30 },
  { label: "1 hr before",   value: 60 },
  { label: "1 day before",  value: 1440 },
];

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toDateLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ─── EventFormModal ───────────────────────────────────────────────────────────

export default function EventFormModal({
  event,
  initialStart,
  onClose,
  onSaved,
}: EventFormModalProps) {
  const isEditing = !!event;

  // ── Form state ──────────────────────────────────────────────────────────────
  const defaultStart = initialStart ?? new Date();
  const defaultEnd = addHours(defaultStart, 1);

  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [isAllDay, setIsAllDay] = useState(event?.isAllDay ?? false);
  const [startValue, setStartValue] = useState(
    event ? toDatetimeLocal(new Date(event.startTime)) : toDatetimeLocal(defaultStart)
  );
  const [endValue, setEndValue] = useState(
    event ? toDatetimeLocal(new Date(event.endTime)) : toDatetimeLocal(defaultEnd)
  );
  const [allDayStart, setAllDayStart] = useState(
    event?.isAllDay ? toDateLocal(new Date(event.startTime)) : toDateLocal(defaultStart)
  );
  const [allDayEnd, setAllDayEnd] = useState(
    event?.isAllDay ? toDateLocal(new Date(event.endTime)) : toDateLocal(defaultStart)
  );
  const [category, setCategory] = useState<EventCategory | "">(event?.category ?? "");
  const [colorOverride, setColorOverride] = useState(event?.colorOverride ?? "");
  const [selectedLayerId, setSelectedLayerId] = useState(event?.layerId ?? "");
  const [attendeeIds, setAttendeeIds] = useState<string[]>(
    event?.attendees?.map((a) => a.userId) ?? []
  );
  const [reminderMinutes, setReminderMinutes] = useState<number | "">(30);
  const [updateScope, setUpdateScope] = useState<"this" | "this-and-following" | "all">("this");

  // ── Data state ──────────────────────────────────────────────────────────────
  const [layers, setLayers] = useState<CalendarLayer[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Load layers + members ───────────────────────────────────────────────────
  const loadFormData = useCallback(async () => {
    try {
      const [layersData, membersData] = await Promise.all([
        apiClient.get<{ layers: CalendarLayer[] }>("/calendar/layers"),
        apiClient.get<{ users: FamilyMember[] }>("/users"),
      ]);
      setLayers(layersData.layers);
      setMembers(membersData.users);
      if (!selectedLayerId && layersData.layers.length > 0) {
        setSelectedLayerId(layersData.layers[0]!.id);
      }
    } catch {
      // non-critical, form still usable
    }
  }, [selectedLayerId]);

  useEffect(() => {
    void loadFormData();
  }, [loadFormData]);

  // ── Attendee toggle ─────────────────────────────────────────────────────────
  function toggleAttendee(id: string) {
    setAttendeeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) { setError("Title is required."); return; }
    if (!selectedLayerId) { setError("Please select a calendar."); return; }

    const startISO = isAllDay
      ? new Date(allDayStart + "T00:00:00").toISOString()
      : new Date(startValue).toISOString();
    const endISO = isAllDay
      ? new Date(allDayEnd + "T23:59:59").toISOString()
      : new Date(endValue).toISOString();

    if (new Date(endISO) <= new Date(startISO)) {
      setError("End time must be after start time.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing) {
        const payload: UpdateEventPayload = {
          title: title.trim(),
          description: description.trim() || null,
          location: location.trim() || null,
          startTime: startISO,
          endTime: endISO,
          isAllDay,
          category: category || null,
          colorOverride: colorOverride || null,
          attendeeIds,
          ...(event.isRecurring ? { updateScope } : {}),
        };
        await apiClient.patch(`/events/${event.id}`, payload);
      } else {
        const payload: CreateEventPayload = {
          layerId: selectedLayerId,
          title: title.trim(),
          description: description.trim() || undefined,
          location: location.trim() || undefined,
          startTime: startISO,
          endTime: endISO,
          isAllDay,
          category: category || undefined,
          colorOverride: colorOverride || undefined,
          attendeeIds,
          reminders: reminderMinutes !== ""
            ? [{ reminderType: "push", minutesBefore: reminderMinutes }]
            : undefined,
        };
        await apiClient.post("/events", payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save event.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!isEditing) return;
    if (!confirm("Delete this event? This cannot be undone.")) return;
    setIsSubmitting(true);
    try {
      await apiClient.delete(`/events/${event.id}`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete event.");
      setIsSubmitting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-card border shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold">
            {isEditing ? "Edit Event" : "New Event"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Title <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add title"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
          </div>

          {/* All day toggle */}
          <div className="flex items-center gap-2">
            <input
              id="all-day"
              type="checkbox"
              checked={isAllDay}
              onChange={(e) => setIsAllDay(e.target.checked)}
              className="h-4 w-4 rounded border accent-primary"
            />
            <label htmlFor="all-day" className="text-sm font-medium cursor-pointer">
              All day
            </label>
          </div>

          {/* Date / time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Start</label>
              {isAllDay ? (
                <input
                  type="date"
                  value={allDayStart}
                  onChange={(e) => setAllDayStart(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              ) : (
                <input
                  type="datetime-local"
                  value={startValue}
                  onChange={(e) => setStartValue(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">End</label>
              {isAllDay ? (
                <input
                  type="date"
                  value={allDayEnd}
                  onChange={(e) => setAllDayEnd(e.target.value)}
                  min={allDayStart}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              ) : (
                <input
                  type="datetime-local"
                  value={endValue}
                  onChange={(e) => setEndValue(e.target.value)}
                  min={startValue}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              )}
            </div>
          </div>

          {/* Calendar layer */}
          {!isEditing && layers.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">Calendar</label>
              <select
                value={selectedLayerId}
                onChange={(e) => setSelectedLayerId(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {layers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Category */}
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(category === c.value ? "" : c.value)}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                    category === c.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-muted border-border"
                  }`}
                >
                  <span>{c.icon}</span>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium mb-1">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add location"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description"
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Attendees */}
          {members.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">Attendees</label>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => {
                  const selected = attendeeIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleAttendee(m.id)}
                      className={`flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-0.5 text-xs font-medium border transition-colors ${
                        selected
                          ? "border-transparent text-white"
                          : "border-border hover:bg-muted"
                      }`}
                      style={selected ? { backgroundColor: m.profileColor } : {}}
                      title={m.name}
                    >
                      <span
                        className="h-5 w-5 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ backgroundColor: m.profileColor }}
                      >
                        {m.name.charAt(0)}
                      </span>
                      {m.name.split(" ")[0]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reminder (new events only) */}
          {!isEditing && (
            <div>
              <label className="block text-sm font-medium mb-1">Reminder</label>
              <select
                value={reminderMinutes}
                onChange={(e) =>
                  setReminderMinutes(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">No reminder</option>
                {REMINDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Color override */}
          <div>
            <label className="block text-sm font-medium mb-1">Color override</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={colorOverride || "#3B82F6"}
                onChange={(e) => setColorOverride(e.target.value)}
                className="h-8 w-8 rounded border cursor-pointer"
              />
              {colorOverride && (
                <button
                  type="button"
                  onClick={() => setColorOverride("")}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Recurring event update scope */}
          {isEditing && event.isRecurring && (
            <div>
              <label className="block text-sm font-medium mb-1">Edit scope</label>
              <select
                value={updateScope}
                onChange={(e) => setUpdateScope(e.target.value as typeof updateScope)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="this">This occurrence only</option>
                <option value="this-and-following">This and following</option>
                <option value="all">All occurrences</option>
              </select>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            {isEditing ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="text-sm text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
              >
                Delete event
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm rounded-md border hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? "Saving…" : isEditing ? "Save changes" : "Create event"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
