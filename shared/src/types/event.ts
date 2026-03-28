// ─── Calendar Event Types ─────────────────────────────────────────────────────

export type EventCategory =
  | "work"
  | "school"
  | "sports"
  | "medical"
  | "social"
  | "family"
  | "holiday"
  | "other";

export type ExternalSource = "google" | "apple" | "ics" | "internal";

export type AttendeeStatus =
  | "invited"
  | "accepted"
  | "declined"
  | "tentative";

export type ReminderType = "push" | "email" | "imessage";

export type RecurrenceFrequency =
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "YEARLY";

export type WeekDay = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

/**
 * RRULE-compatible recurrence rule stored as JSONB in the database.
 * Supports the most common recurrence patterns for a family calendar.
 */
export interface RecurrenceRule {
  /** Recurrence frequency */
  freq: RecurrenceFrequency;
  /** Interval between recurrences (default 1) */
  interval?: number;
  /** Days of the week for WEEKLY recurrence */
  byDay?: WeekDay[];
  /** Day of the month for MONTHLY recurrence (1-31) */
  byMonthDay?: number[];
  /** Months for YEARLY recurrence (1-12) */
  byMonth?: number[];
  /** End date (ISO 8601 string) */
  until?: string;
  /** Maximum number of occurrences */
  count?: number;
  /** Week start day (default MO) */
  wkst?: WeekDay;
}

export interface EventAttendee {
  userId: string;
  name: string;
  profileColor: string;
  status: AttendeeStatus;
}

export interface EventReminder {
  id: string;
  eventId: string;
  userId: string;
  reminderType: ReminderType;
  minutesBefore: number;
  isSent: boolean;
  sentAt: string | null;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  layerId: string;
  createdBy: string;
  title: string;
  description: string | null;
  location: string | null;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  isAllDay: boolean;
  category: EventCategory | null;
  colorOverride: string | null;
  isRecurring: boolean;
  recurrenceRule: RecurrenceRule | null;
  recurrenceParentId: string | null;
  isCancelled: boolean;
  externalId: string | null;
  externalSource: ExternalSource | null;
  attendees?: EventAttendee[];
  reminders?: EventReminder[];
  createdAt: string;
  updatedAt: string;
}

/** A single expanded occurrence from a recurring event. */
export interface CalendarEventOccurrence extends CalendarEvent {
  /** The date this occurrence falls on (ISO 8601 date string) */
  occurrenceDate: string;
  /** Whether this specific occurrence has been modified (exception) */
  isException: boolean;
}

export interface CreateEventPayload {
  layerId: string;
  title: string;
  description?: string;
  location?: string;
  startTime: string;
  endTime: string;
  isAllDay?: boolean;
  category?: EventCategory;
  colorOverride?: string;
  isRecurring?: boolean;
  recurrenceRule?: RecurrenceRule;
  attendeeIds?: string[];
  reminders?: Array<{
    reminderType: ReminderType;
    minutesBefore: number;
  }>;
}

export interface UpdateEventPayload {
  title?: string;
  description?: string | null;
  location?: string | null;
  startTime?: string;
  endTime?: string;
  isAllDay?: boolean;
  category?: EventCategory | null;
  colorOverride?: string | null;
  recurrenceRule?: RecurrenceRule | null;
  attendeeIds?: string[];
  isCancelled?: boolean;
  /** If editing a recurring event, specify whether to update this occurrence only,
   *  this and following, or all occurrences. */
  updateScope?: "this" | "this-and-following" | "all";
}
