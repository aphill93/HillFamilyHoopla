// ─── Calendar Layer / Filter Types ───────────────────────────────────────────

import type { MemberColor } from "./user.js";

export interface CalendarLayer {
  id: string;
  /** null means this is a family-wide layer */
  userId: string | null;
  name: string;
  color: string;
  isFamilyLayer: boolean;
  isVisible: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface CreateCalendarLayerPayload {
  name: string;
  color: string;
  isFamilyLayer?: boolean;
  sortOrder?: number;
}

export interface UpdateCalendarLayerPayload {
  name?: string;
  color?: string;
  isVisible?: boolean;
  sortOrder?: number;
}

/**
 * Filter state for the calendar view.
 * Persisted in localStorage and/or user preferences.
 */
export interface CalendarFilter {
  /** Visible layer IDs (empty = show all) */
  visibleLayerIds: string[];
  /** Visible member IDs (empty = show all) */
  visibleMemberIds: string[];
  /** Category filter (empty = show all) */
  categories: string[];
  /** Show cancelled events */
  showCancelled: boolean;
  /** Show all-day events */
  showAllDay: boolean;
}

export const DEFAULT_CALENDAR_FILTER: CalendarFilter = {
  visibleLayerIds: [],
  visibleMemberIds: [],
  categories: [],
  showCancelled: false,
  showAllDay: true,
};

export type CalendarView = "month" | "week" | "day" | "agenda";

export interface CalendarViewState {
  view: CalendarView;
  /** ISO 8601 date string for the currently displayed date */
  currentDate: string;
  filter: CalendarFilter;
}

/** Range query for fetching events */
export interface CalendarRangeQuery {
  start: string; // ISO 8601
  end: string;   // ISO 8601
  layerIds?: string[];
  memberIds?: string[];
  categories?: string[];
  includeRecurring?: boolean;
}

/** A member's color assignment for the UI */
export interface MemberColorAssignment {
  userId: string;
  name: string;
  color: MemberColor;
}
