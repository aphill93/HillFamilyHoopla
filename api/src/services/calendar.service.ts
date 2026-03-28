import { query, queryOne } from "../db/client.js";
import type {
  CalendarLayer,
  CreateCalendarLayerPayload,
  UpdateCalendarLayerPayload,
} from "@hillfamilyhoopla/shared";

function toISO(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return v as string;
}

// ─── Row mapper ───────────────────────────────────────────────────────────────

function rowToLayer(row: Record<string, unknown>): CalendarLayer {
  return {
    id:            row["id"] as string,
    userId:        (row["user_id"] as string | null) ?? null,
    name:          row["name"] as string,
    color:         row["color"] as string,
    isFamilyLayer: row["is_family_layer"] as boolean,
    isVisible:     row["is_visible"] as boolean,
    sortOrder:     row["sort_order"] as number,
    createdAt:     toISO(row["created_at"]),
  };
}

// ─── CalendarService ──────────────────────────────────────────────────────────

export const CalendarService = {
  // ── List layers visible to a user ────────────────────────────────────────
  //
  // Returns:
  //   - the family-wide layer (is_family_layer = true)
  //   - every user's personal layer (so members can see each other's layers
  //     and choose to toggle them in the filter sidebar)
  //
  // Only layers belonging to users in the same family (i.e. all users in this
  // private app) are returned.  RLS on the DB enforces access at the row level.

  async listForUser(_userId: string): Promise<CalendarLayer[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT cl.*
       FROM calendar_layers cl
       ORDER BY cl.is_family_layer DESC, cl.sort_order ASC, cl.name ASC`
    );
    return result.rows.map(rowToLayer);
  },

  // ── Get a single layer ────────────────────────────────────────────────────

  async getById(id: string): Promise<CalendarLayer | null> {
    const row = await queryOne<Record<string, unknown>>(
      "SELECT * FROM calendar_layers WHERE id = $1",
      [id]
    );
    return row ? rowToLayer(row) : null;
  },

  // ── Create a layer ────────────────────────────────────────────────────────

  async create(
    userId: string,
    payload: CreateCalendarLayerPayload
  ): Promise<CalendarLayer> {
    const { name, color, isFamilyLayer = false, sortOrder = 1 } = payload;
    const row = await queryOne<Record<string, unknown>>(
      `INSERT INTO calendar_layers (user_id, name, color, is_family_layer, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, name, color, isFamilyLayer, sortOrder]
    );
    if (!row) throw new Error("Failed to create calendar layer");
    return rowToLayer(row);
  },

  // ── Update a layer ────────────────────────────────────────────────────────

  async update(
    id: string,
    payload: UpdateCalendarLayerPayload
  ): Promise<CalendarLayer> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (payload.name      !== undefined) { fields.push(`name = $${idx++}`);       values.push(payload.name); }
    if (payload.color     !== undefined) { fields.push(`color = $${idx++}`);      values.push(payload.color); }
    if (payload.isVisible !== undefined) { fields.push(`is_visible = $${idx++}`); values.push(payload.isVisible); }
    if (payload.sortOrder !== undefined) { fields.push(`sort_order = $${idx++}`); values.push(payload.sortOrder); }

    if (fields.length === 0) {
      const existing = await this.getById(id);
      if (!existing) throw Object.assign(new Error("Layer not found"), { statusCode: 404 });
      return existing;
    }

    values.push(id);
    const row = await queryOne<Record<string, unknown>>(
      `UPDATE calendar_layers SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (!row) throw Object.assign(new Error("Layer not found"), { statusCode: 404 });
    return rowToLayer(row);
  },

  // ── Delete a layer ────────────────────────────────────────────────────────

  async delete(id: string): Promise<void> {
    await query("DELETE FROM calendar_layers WHERE id = $1", [id]);
  },
};
