import type { RecurrenceRule, WeekDay } from "@hillfamilyhoopla/shared";

// ─── Weekday maps ─────────────────────────────────────────────────────────────

const WEEKDAY_TO_JS: Record<WeekDay, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OccurrenceWindow {
  start: Date;
  end: Date;
}

export interface EventOccurrence {
  occurrenceStart: Date;
  occurrenceEnd: Date;
  /** True if this occurrence has been individually modified (exception) */
  isException: boolean;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const targetMonth = d.getUTCMonth() + months;
  d.setUTCMonth(targetMonth);
  return d;
}

function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

// ─── Core expansion logic ─────────────────────────────────────────────────────

/**
 * Expand a recurring event into individual occurrences within a date window.
 *
 * @param eventStart  The DTSTART of the original event (UTC Date)
 * @param eventEnd    The DTEND of the original event (UTC Date)
 * @param rule        The RecurrenceRule (RRULE-compatible)
 * @param window      The query window {start, end}
 * @param exceptions  Set of ISO date strings (YYYY-MM-DD) that have been
 *                    overridden and should be marked as exceptions
 * @param maxResults  Safety limit (default 500)
 */
export function expandRecurrence(
  eventStart: Date,
  eventEnd: Date,
  rule: RecurrenceRule,
  window: OccurrenceWindow,
  exceptions: Set<string> = new Set(),
  maxResults = 500
): EventOccurrence[] {
  const occurrences: EventOccurrence[] = [];
  const duration = eventEnd.getTime() - eventStart.getTime();
  const interval = rule.interval ?? 1;
  const until = rule.until ? new Date(rule.until) : null;
  const maxCount = rule.count ?? Infinity;

  let current = new Date(eventStart);
  let totalGenerated = 0;

  // Fast-forward to window start if the event started before it
  // (approximate — we'll still check each occurrence individually)
  if (current < window.start) {
    current = fastForward(current, rule, window.start, interval);
  }

  while (totalGenerated < maxResults) {
    // Stop conditions
    if (until && current > until) break;
    if (totalGenerated >= maxCount) break;
    if (current > window.end) break;

    const occurrenceEnd = new Date(current.getTime() + duration);
    const candidates = getCandidatesForDate(current, rule);

    for (const candidate of candidates) {
      if (candidate < window.start) continue;
      if (candidate > window.end) break;
      if (until && candidate > until) break;

      const candidateEnd = new Date(candidate.getTime() + duration);
      const dateKey = candidate.toISOString().slice(0, 10);

      occurrences.push({
        occurrenceStart: candidate,
        occurrenceEnd: candidateEnd,
        isException: exceptions.has(dateKey),
      });

      totalGenerated++;
      if (totalGenerated >= maxResults || totalGenerated >= maxCount) break;
    }

    // Advance to next period
    current = advancePeriod(current, rule, interval);
  }

  return occurrences;
}

/**
 * Get candidate occurrence dates within a period starting at `periodStart`.
 * For WEEKLY rules with byDay, this returns multiple dates per week.
 */
function getCandidatesForDate(periodStart: Date, rule: RecurrenceRule): Date[] {
  if (rule.freq === "WEEKLY" && rule.byDay && rule.byDay.length > 0) {
    const weekStart = getWeekStart(periodStart, rule.wkst ?? "MO");
    const candidates: Date[] = [];
    for (const day of rule.byDay) {
      const jsDay = WEEKDAY_TO_JS[day];
      const date = new Date(weekStart);
      date.setUTCDate(weekStart.getUTCDate() + jsDay);
      candidates.push(date);
    }
    return candidates.sort((a, b) => a.getTime() - b.getTime());
  }

  if (rule.freq === "MONTHLY" && rule.byMonthDay && rule.byMonthDay.length > 0) {
    const candidates: Date[] = [];
    for (const day of rule.byMonthDay) {
      const date = new Date(
        Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), day)
      );
      candidates.push(date);
    }
    return candidates.sort((a, b) => a.getTime() - b.getTime());
  }

  return [new Date(periodStart)];
}

/** Advance `current` by one period based on frequency and interval. */
function advancePeriod(
  current: Date,
  rule: RecurrenceRule,
  interval: number
): Date {
  switch (rule.freq) {
    case "DAILY":
      return addDays(current, interval);
    case "WEEKLY":
      return addWeeks(current, interval);
    case "MONTHLY":
      return addMonths(current, interval);
    case "YEARLY":
      return addYears(current, interval);
  }
}

/**
 * Fast-forward `current` to approximately the window start.
 * This is an optimization to avoid iterating thousands of periods.
 */
function fastForward(
  current: Date,
  rule: RecurrenceRule,
  target: Date,
  interval: number
): Date {
  const diffMs = target.getTime() - current.getTime();
  let periodsToSkip = 0;

  switch (rule.freq) {
    case "DAILY":
      periodsToSkip = Math.floor(diffMs / (86400000 * interval));
      break;
    case "WEEKLY":
      periodsToSkip = Math.floor(diffMs / (604800000 * interval));
      break;
    case "MONTHLY":
      periodsToSkip = Math.max(
        0,
        Math.floor(
          (target.getUTCFullYear() - current.getUTCFullYear()) * 12 +
            (target.getUTCMonth() - current.getUTCMonth()) -
            interval
        ) / interval
      );
      break;
    case "YEARLY":
      periodsToSkip = Math.max(
        0,
        Math.floor(
          (target.getUTCFullYear() - current.getUTCFullYear() - 1) / interval
        )
      );
      break;
  }

  if (periodsToSkip <= 0) return current;
  return advancePeriod(current, rule, interval * periodsToSkip);
}

/** Get the Monday (or configured wkst) of the week containing `date`. */
function getWeekStart(date: Date, wkst: WeekDay): Date {
  const jsWkst = WEEKDAY_TO_JS[wkst];
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = (day - jsWkst + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), 0);
  return d;
}

// ─── RRULE string helpers ─────────────────────────────────────────────────────

/** Convert a RecurrenceRule object to an RRULE string (RFC 5545). */
export function toRRuleString(rule: RecurrenceRule): string {
  const parts: string[] = [`FREQ=${rule.freq}`];

  if (rule.interval && rule.interval !== 1) {
    parts.push(`INTERVAL=${rule.interval}`);
  }
  if (rule.byDay?.length) {
    parts.push(`BYDAY=${rule.byDay.join(",")}`);
  }
  if (rule.byMonthDay?.length) {
    parts.push(`BYMONTHDAY=${rule.byMonthDay.join(",")}`);
  }
  if (rule.byMonth?.length) {
    parts.push(`BYMONTH=${rule.byMonth.join(",")}`);
  }
  if (rule.until) {
    // RFC 5545 format: YYYYMMDDTHHMMSSZ
    const d = new Date(rule.until);
    const dtStr =
      d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    parts.push(`UNTIL=${dtStr}`);
  }
  if (rule.count) {
    parts.push(`COUNT=${rule.count}`);
  }
  if (rule.wkst && rule.wkst !== "MO") {
    parts.push(`WKST=${rule.wkst}`);
  }

  return `RRULE:${parts.join(";")}`;
}

/** Parse an RRULE string (RFC 5545) into a RecurrenceRule object. */
export function fromRRuleString(rrule: string): RecurrenceRule {
  const str = rrule.replace(/^RRULE:/i, "");
  const pairs = str.split(";");
  const map: Record<string, string> = {};
  for (const pair of pairs) {
    const [key, value] = pair.split("=");
    if (key && value) map[key.toUpperCase()] = value;
  }

  if (!map["FREQ"]) throw new Error("RRULE must contain FREQ");

  const rule: RecurrenceRule = {
    freq: map["FREQ"] as RecurrenceRule["freq"],
  };

  if (map["INTERVAL"]) rule.interval = parseInt(map["INTERVAL"]!, 10);
  if (map["BYDAY"]) rule.byDay = map["BYDAY"]!.split(",") as WeekDay[];
  if (map["BYMONTHDAY"]) {
    rule.byMonthDay = map["BYMONTHDAY"]!.split(",").map(Number);
  }
  if (map["BYMONTH"]) {
    rule.byMonth = map["BYMONTH"]!.split(",").map(Number);
  }
  if (map["UNTIL"]) {
    // Parse YYYYMMDDTHHMMSSZ
    const u = map["UNTIL"]!;
    const iso = `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}T${u.slice(9, 11)}:${u.slice(11, 13)}:${u.slice(13, 15)}Z`;
    rule.until = iso;
  }
  if (map["COUNT"]) rule.count = parseInt(map["COUNT"]!, 10);
  if (map["WKST"]) rule.wkst = map["WKST"] as WeekDay;

  return rule;
}
