import { z } from "zod";

// ─── Reusable field schemas ────────────────────────────────────────────────────

export const EventCategorySchema = z.enum([
  "work",
  "school",
  "sports",
  "medical",
  "social",
  "family",
  "holiday",
  "other",
]);

export const ExternalSourceSchema = z.enum([
  "google",
  "apple",
  "ics",
  "internal",
]);

export const AttendeeStatusSchema = z.enum([
  "invited",
  "accepted",
  "declined",
  "tentative",
]);

export const ReminderTypeSchema = z.enum(["push", "email", "imessage"]);

export const RecurrenceFrequencySchema = z.enum([
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY",
]);

export const WeekDaySchema = z.enum([
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
  "SU",
]);

export const HexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color (e.g. #FF5733)");

// ─── Recurrence rule ──────────────────────────────────────────────────────────

export const RecurrenceRuleSchema = z
  .object({
    freq: RecurrenceFrequencySchema,
    interval: z.number().int().min(1).max(365).optional().default(1),
    byDay: z.array(WeekDaySchema).min(1).max(7).optional(),
    byMonthDay: z
      .array(z.number().int().min(1).max(31))
      .min(1)
      .max(31)
      .optional(),
    byMonth: z
      .array(z.number().int().min(1).max(12))
      .min(1)
      .max(12)
      .optional(),
    until: z.string().datetime({ offset: true }).optional(),
    count: z.number().int().min(1).max(1000).optional(),
    wkst: WeekDaySchema.optional().default("MO"),
  })
  .refine(
    (data) => !(data.until && data.count),
    "Cannot specify both 'until' and 'count'"
  );

export type RecurrenceRuleInput = z.infer<typeof RecurrenceRuleSchema>;

// ─── Reminder ────────────────────────────────────────────────────────────────

export const ReminderInputSchema = z.object({
  reminderType: ReminderTypeSchema,
  minutesBefore: z.number().int().min(0).max(43200), // max 30 days
});

// ─── Create / Update event ────────────────────────────────────────────────────

export const CreateEventSchema = z
  .object({
    layerId: z.string().uuid("Invalid layer ID"),
    title: z
      .string()
      .min(1, "Title is required")
      .max(255, "Title must not exceed 255 characters")
      .trim(),
    description: z.string().max(10000).optional(),
    location: z.string().max(500).optional(),
    startTime: z.string().datetime({ offset: true, message: "Invalid start time" }),
    endTime: z.string().datetime({ offset: true, message: "Invalid end time" }),
    isAllDay: z.boolean().optional().default(false),
    category: EventCategorySchema.optional(),
    colorOverride: HexColorSchema.optional(),
    isRecurring: z.boolean().optional().default(false),
    recurrenceRule: RecurrenceRuleSchema.optional(),
    attendeeIds: z.array(z.string().uuid()).max(50).optional(),
    reminders: z.array(ReminderInputSchema).max(10).optional(),
  })
  .refine(
    (data) => new Date(data.endTime) > new Date(data.startTime),
    { message: "End time must be after start time", path: ["endTime"] }
  )
  .refine(
    (data) => !data.isRecurring || data.recurrenceRule !== undefined,
    { message: "Recurrence rule required when isRecurring is true", path: ["recurrenceRule"] }
  );

export type CreateEventInput = z.infer<typeof CreateEventSchema>;

export const UpdateEventSchema = z
  .object({
    title: z.string().min(1).max(255).trim().optional(),
    description: z.string().max(10000).nullable().optional(),
    location: z.string().max(500).nullable().optional(),
    startTime: z.string().datetime({ offset: true }).optional(),
    endTime: z.string().datetime({ offset: true }).optional(),
    isAllDay: z.boolean().optional(),
    category: EventCategorySchema.nullable().optional(),
    colorOverride: HexColorSchema.nullable().optional(),
    recurrenceRule: RecurrenceRuleSchema.nullable().optional(),
    attendeeIds: z.array(z.string().uuid()).max(50).optional(),
    isCancelled: z.boolean().optional(),
    updateScope: z.enum(["this", "this-and-following", "all"]).optional(),
  })
  .refine(
    (data) => {
      if (data.startTime && data.endTime) {
        return new Date(data.endTime) > new Date(data.startTime);
      }
      return true;
    },
    { message: "End time must be after start time", path: ["endTime"] }
  );

export type UpdateEventInput = z.infer<typeof UpdateEventSchema>;

// ─── Calendar range query ─────────────────────────────────────────────────────

export const CalendarRangeQuerySchema = z
  .object({
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    layerIds: z.array(z.string().uuid()).optional(),
    memberIds: z.array(z.string().uuid()).optional(),
    categories: z.array(EventCategorySchema).optional(),
    includeRecurring: z.coerce.boolean().optional().default(true),
  })
  .refine(
    (data) => new Date(data.end) > new Date(data.start),
    { message: "end must be after start", path: ["end"] }
  );

export type CalendarRangeQueryInput = z.infer<typeof CalendarRangeQuerySchema>;

// ─── Update attendee status ───────────────────────────────────────────────────

export const UpdateAttendeeStatusSchema = z.object({
  status: AttendeeStatusSchema,
});

export type UpdateAttendeeStatusInput = z.infer<typeof UpdateAttendeeStatusSchema>;
