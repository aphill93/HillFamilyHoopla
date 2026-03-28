-- ============================================================
-- HillFamilyHoopla — Performance Indexes
-- Migration: 002_indexes.sql
-- ============================================================

-- ─── users ───────────────────────────────────────────────────────────────────

-- Unique email (already has UNIQUE constraint, but explicit index for clarity)
CREATE INDEX IF NOT EXISTS idx_users_email
  ON users (email);

-- Find users by role
CREATE INDEX IF NOT EXISTS idx_users_role
  ON users (role);

-- Account lockout queries
CREATE INDEX IF NOT EXISTS idx_users_locked_until
  ON users (locked_until)
  WHERE locked_until IS NOT NULL;

-- Email verification token lookup
CREATE INDEX IF NOT EXISTS idx_users_email_verification_token
  ON users (email_verification_token)
  WHERE email_verification_token IS NOT NULL;

-- Password reset token lookup
CREATE INDEX IF NOT EXISTS idx_users_password_reset_token
  ON users (password_reset_token)
  WHERE password_reset_token IS NOT NULL;

-- ─── refresh_tokens ──────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
  ON refresh_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash
  ON refresh_tokens (token_hash);

-- Find active (non-expired, non-revoked) tokens
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active
  ON refresh_tokens (user_id, expires_at)
  WHERE revoked_at IS NULL;

-- ─── calendar_layers ─────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_calendar_layers_user_id
  ON calendar_layers (user_id);

CREATE INDEX IF NOT EXISTS idx_calendar_layers_family
  ON calendar_layers (is_family_layer)
  WHERE is_family_layer = true;

CREATE INDEX IF NOT EXISTS idx_calendar_layers_visible
  ON calendar_layers (user_id, is_visible);

-- ─── events ──────────────────────────────────────────────────────────────────

-- Primary time-range query: fetch events in a date window
CREATE INDEX IF NOT EXISTS idx_events_time_range
  ON events (layer_id, start_time, end_time)
  WHERE is_cancelled = false;

-- All events for a layer (including cancelled)
CREATE INDEX IF NOT EXISTS idx_events_layer_id
  ON events (layer_id);

-- Events by creator
CREATE INDEX IF NOT EXISTS idx_events_created_by
  ON events (created_by);

-- Recurring event parent lookup
CREATE INDEX IF NOT EXISTS idx_events_recurrence_parent
  ON events (recurrence_parent_id)
  WHERE recurrence_parent_id IS NOT NULL;

-- External calendar import deduplication
CREATE INDEX IF NOT EXISTS idx_events_external
  ON events (external_source, external_id)
  WHERE external_id IS NOT NULL;

-- GIN index on recurrence_rule JSONB for future queries on specific rule fields
CREATE INDEX IF NOT EXISTS idx_events_recurrence_rule
  ON events USING GIN (recurrence_rule)
  WHERE is_recurring = true;

-- Time-range on start_time alone for cross-layer queries
CREATE INDEX IF NOT EXISTS idx_events_start_time
  ON events (start_time);

-- ─── event_attendees ─────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_event_attendees_user_id
  ON event_attendees (user_id);

CREATE INDEX IF NOT EXISTS idx_event_attendees_status
  ON event_attendees (user_id, status);

-- ─── reminders ───────────────────────────────────────────────────────────────

-- Reminder dispatch: find all unsent reminders that are due
CREATE INDEX IF NOT EXISTS idx_reminders_pending
  ON reminders (is_sent, event_id)
  WHERE is_sent = false;

CREATE INDEX IF NOT EXISTS idx_reminders_event_id
  ON reminders (event_id);

CREATE INDEX IF NOT EXISTS idx_reminders_user_id
  ON reminders (user_id);

-- ─── tasks ───────────────────────────────────────────────────────────────────

-- Tasks assigned to a specific user
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to
  ON tasks (assigned_to, status);

-- Tasks created by a user
CREATE INDEX IF NOT EXISTS idx_tasks_created_by
  ON tasks (created_by);

-- Task status + priority for list views
CREATE INDEX IF NOT EXISTS idx_tasks_status_priority
  ON tasks (status, priority);

-- Kid Mode tasks
CREATE INDEX IF NOT EXISTS idx_tasks_kid_mode
  ON tasks (assigned_to, is_kid_mode, status)
  WHERE is_kid_mode = true;

-- Due date index for upcoming tasks
CREATE INDEX IF NOT EXISTS idx_tasks_due_date
  ON tasks (due_date)
  WHERE due_date IS NOT NULL AND status NOT IN ('completed', 'cancelled');

-- ─── task_comments ───────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id
  ON task_comments (task_id, created_at);

CREATE INDEX IF NOT EXISTS idx_task_comments_user_id
  ON task_comments (user_id);
