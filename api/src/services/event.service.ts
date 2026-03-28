import { query, queryOne, withTransaction } from "../db/client.js";
import type {
  CalendarEvent,
  CalendarEventOccurrence,
  CreateEventPayload,
  UpdateEventPayload,
  EventAttendee,
  EventReminder,
} from "@hillfamilyhoopla/shared";
import { expandRecurrence } from "../utils/recurrence.js";
import type pg from "pg";

// ─── Row mappers ──────────────────────────────────────────────────────────────

// pg returns Date objects for timestamp columns — normalise to ISO strings
function toISO(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return v as string;
}

function rowToEvent(row: Record<string, unknown>): CalendarEvent {
  return {
    id: row["id"] as string,
    layerId: row["layer_id"] as string,
    createdBy: row["created_by"] as string,
    title: row["title"] as string,
    description: (row["description"] as string | null) ?? null,
    location: (row["location"] as string | null) ?? null,
    startTime: toISO(row["start_time"]),
    endTime: toISO(row["end_time"]),
    isAllDay: row["is_all_day"] as boolean,
    category: (row["category"] as CalendarEvent["category"]) ?? null,
    colorOverride: (row["color_override"] as string | null) ?? null,
    isRecurring: row["is_recurring"] as boolean,
    recurrenceRule: (row["recurrence_rule"] as CalendarEvent["recurrenceRule"]) ?? null,
    recurrenceParentId: (row["recurrence_parent_id"] as string | null) ?? null,
    isCancelled: row["is_cancelled"] as boolean,
    externalId: (row["external_id"] as string | null) ?? null,
    externalSource: (row["external_source"] as CalendarEvent["externalSource"]) ?? null,
    createdAt: toISO(row["created_at"]),
    updatedAt: toISO(row["updated_at"]),
  };
}

// ─── EventService ─────────────────────────────────────────────────────────────

export const EventService = {
  // ── Create ────────────────────────────────────────────────────────────────

  async create(
    createdBy: string,
    payload: CreateEventPayload
  ): Promise<CalendarEvent> {
    return withTransaction(async (client) => {
      const {
        layerId, title, description, location,
        startTime, endTime, isAllDay = false,
        category, colorOverride, isRecurring = false,
        recurrenceRule, attendeeIds, reminders,
      } = payload;

      const eventRow = await client.query<Record<string, unknown>>(
        `INSERT INTO events (
           layer_id, created_by, title, description, location,
           start_time, end_time, is_all_day, category, color_override,
           is_recurring, recurrence_rule
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          layerId, createdBy, title,
          description ?? null, location ?? null,
          startTime, endTime, isAllDay,
          category ?? null, colorOverride ?? null,
          isRecurring,
          recurrenceRule ? JSON.stringify(recurrenceRule) : null,
        ]
      );

      const event = rowToEvent(eventRow.rows[0]!);

      // Add attendees
      if (attendeeIds?.length) {
        const attendeeValues = attendeeIds
          .map((uid, i) => `($1, $${i + 2})`)
          .join(", ");
        await client.query(
          `INSERT INTO event_attendees (event_id, user_id) VALUES ${attendeeValues}
           ON CONFLICT DO NOTHING`,
          [event.id, ...attendeeIds]
        );
      }

      // Add creator as attendee (accepted)
      await client.query(
        `INSERT INTO event_attendees (event_id, user_id, status)
         VALUES ($1, $2, 'accepted')
         ON CONFLICT (event_id, user_id) DO UPDATE SET status = 'accepted'`,
        [event.id, createdBy]
      );

      // Add reminders
      if (reminders?.length) {
        for (const r of reminders) {
          await client.query(
            `INSERT INTO reminders (event_id, user_id, reminder_type, minutes_before)
             VALUES ($1, $2, $3, $4)`,
            [event.id, createdBy, r.reminderType, r.minutesBefore]
          );
        }
      }

      return event;
    });
  },

  // ── Get by ID ─────────────────────────────────────────────────────────────

  async getById(id: string): Promise<CalendarEvent | null> {
    const row = await queryOne<Record<string, unknown>>(
      "SELECT * FROM events WHERE id = $1",
      [id]
    );
    return row ? rowToEvent(row) : null;
  },

  async getByIdWithDetails(id: string): Promise<CalendarEvent | null> {
    const row = await queryOne<Record<string, unknown>>(
      "SELECT * FROM events WHERE id = $1",
      [id]
    );
    if (!row) return null;

    const event = rowToEvent(row);

    // Fetch attendees
    const attendeesResult = await query<{
      user_id: string;
      name: string;
      profile_color: string;
      status: string;
    }>(
      `SELECT ea.user_id, u.name, u.profile_color, ea.status
       FROM event_attendees ea
       JOIN users u ON u.id = ea.user_id
       WHERE ea.event_id = $1`,
      [id]
    );
    event.attendees = attendeesResult.rows.map((r) => ({
      userId: r.user_id,
      name: r.name,
      profileColor: r.profile_color,
      status: r.status as EventAttendee["status"],
    }));

    // Fetch reminders
    const remindersResult = await query<Record<string, unknown>>(
      "SELECT * FROM reminders WHERE event_id = $1",
      [id]
    );
    event.reminders = remindersResult.rows.map((r) => ({
      id: r["id"] as string,
      eventId: r["event_id"] as string,
      userId: r["user_id"] as string,
      reminderType: r["reminder_type"] as EventReminder["reminderType"],
      minutesBefore: r["minutes_before"] as number,
      isSent: r["is_sent"] as boolean,
      sentAt: (r["sent_at"] as string | null) ?? null,
      createdAt: r["created_at"] as string,
    }));

    return event;
  },

  // ── List in date range ────────────────────────────────────────────────────

  async listInRange(options: {
    start: string;
    end: string;
    layerIds?: string[];
    memberIds?: string[];
    categories?: string[];
    includeRecurring?: boolean;
  }): Promise<CalendarEventOccurrence[]> {
    const { start, end, layerIds, memberIds, categories, includeRecurring = true } = options;

    const conditions: string[] = [
      "e.is_cancelled = false",
      "(e.start_time < $2 AND e.end_time > $1)",
    ];
    const params: unknown[] = [start, end];

    if (layerIds?.length) {
      params.push(layerIds);
      conditions.push(`e.layer_id = ANY($${params.length})`);
    }
    if (memberIds?.length) {
      params.push(memberIds);
      conditions.push(
        `e.created_by = ANY($${params.length}) OR EXISTS (
           SELECT 1 FROM event_attendees ea
           WHERE ea.event_id = e.id AND ea.user_id = ANY($${params.length})
         )`
      );
    }
    if (categories?.length) {
      params.push(categories);
      conditions.push(`e.category = ANY($${params.length})`);
    }
    if (!includeRecurring) {
      conditions.push("e.is_recurring = false");
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const result = await query<Record<string, unknown>>(
      `SELECT e.* FROM events e ${where} ORDER BY e.start_time ASC`,
      params
    );

    const occurrences: CalendarEventOccurrence[] = [];
    const windowStart = new Date(start);
    const windowEnd = new Date(end);

    for (const row of result.rows) {
      const event = rowToEvent(row);

      if (event.isRecurring && event.recurrenceRule) {
        // Find exception dates (child events with this as parent)
        const exceptionsResult = await query<{ start_time: string }>(
          `SELECT start_time FROM events
           WHERE recurrence_parent_id = $1 AND is_cancelled = true`,
          [event.id]
        );
        const exceptions = new Set(
          exceptionsResult.rows.map((r) =>
            new Date(r.start_time).toISOString().slice(0, 10)
          )
        );

        const expanded = expandRecurrence(
          new Date(event.startTime),
          new Date(event.endTime),
          event.recurrenceRule,
          { start: windowStart, end: windowEnd },
          exceptions
        );

        for (const occ of expanded) {
          occurrences.push({
            ...event,
            startTime: occ.occurrenceStart.toISOString(),
            endTime: occ.occurrenceEnd.toISOString(),
            occurrenceDate: occ.occurrenceStart.toISOString().slice(0, 10),
            isException: occ.isException,
          });
        }
      } else {
        occurrences.push({
          ...event,
          occurrenceDate: new Date(event.startTime).toISOString().slice(0, 10),
          isException: false,
        });
      }
    }

    // Sort all occurrences by start time
    occurrences.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return occurrences;
  },

  // ── Update ────────────────────────────────────────────────────────────────

  async update(
    id: string,
    payload: UpdateEventPayload,
    requesterId: string
  ): Promise<CalendarEvent> {
    const event = await this.getById(id);
    if (!event) throw Object.assign(new Error("Event not found"), { statusCode: 404 });

    const {
      title, description, location, startTime, endTime,
      isAllDay, category, colorOverride, recurrenceRule,
      attendeeIds, isCancelled,
    } = payload;

    const sets: string[] = [];
    const params: unknown[] = [];

    const addField = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };

    if (title !== undefined) addField("title", title);
    if (description !== undefined) addField("description", description);
    if (location !== undefined) addField("location", location);
    if (startTime !== undefined) addField("start_time", startTime);
    if (endTime !== undefined) addField("end_time", endTime);
    if (isAllDay !== undefined) addField("is_all_day", isAllDay);
    if (category !== undefined) addField("category", category);
    if (colorOverride !== undefined) addField("color_override", colorOverride);
    if (recurrenceRule !== undefined) {
      addField("recurrence_rule", recurrenceRule ? JSON.stringify(recurrenceRule) : null);
      addField("is_recurring", recurrenceRule !== null);
    }
    if (isCancelled !== undefined) addField("is_cancelled", isCancelled);

    let updatedEvent = event;

    if (sets.length > 0) {
      params.push(id);
      const row = await queryOne<Record<string, unknown>>(
        `UPDATE events SET ${sets.join(", ")}
         WHERE id = $${params.length}
         RETURNING *`,
        params
      );
      if (!row) throw Object.assign(new Error("Event not found"), { statusCode: 404 });
      updatedEvent = rowToEvent(row);
    }

    // Update attendees if provided
    if (attendeeIds !== undefined) {
      await withTransaction(async (client) => {
        await client.query(
          "DELETE FROM event_attendees WHERE event_id = $1",
          [id]
        );
        if (attendeeIds.length > 0) {
          for (const uid of attendeeIds) {
            const isCreator = uid === event.createdBy;
            await client.query(
              `INSERT INTO event_attendees (event_id, user_id, status)
               VALUES ($1, $2, $3)
               ON CONFLICT DO NOTHING`,
              [id, uid, isCreator ? "accepted" : "invited"]
            );
          }
        }
      });
    }

    return updatedEvent;
  },

  // ── Delete ────────────────────────────────────────────────────────────────

  async delete(id: string): Promise<void> {
    const result = await query("DELETE FROM events WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      throw Object.assign(new Error("Event not found"), { statusCode: 404 });
    }
  },

  // ── Update attendee status ────────────────────────────────────────────────

  async updateAttendeeStatus(
    eventId: string,
    userId: string,
    status: EventAttendee["status"]
  ): Promise<void> {
    const result = await query(
      `UPDATE event_attendees SET status = $1
       WHERE event_id = $2 AND user_id = $3`,
      [status, eventId, userId]
    );
    if (result.rowCount === 0) {
      throw Object.assign(
        new Error("Attendee not found for this event"),
        { statusCode: 404 }
      );
    }
  },
};
