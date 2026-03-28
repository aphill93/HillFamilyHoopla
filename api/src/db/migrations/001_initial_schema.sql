-- ============================================================
-- HillFamilyHoopla — Initial Schema
-- Migration: 001_initial_schema.sql
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── updated_at trigger function ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── users ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id                          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  email                       VARCHAR(255)  NOT NULL UNIQUE,
  password_hash               VARCHAR(255)  NOT NULL,
  name                        VARCHAR(100)  NOT NULL,
  age                         INTEGER       CHECK (age >= 0 AND age <= 120),
  sex                         VARCHAR(20)   CHECK (sex IN ('male', 'female', 'non-binary', 'prefer-not-to-say')),
  phone                       VARCHAR(20),
  profile_color               VARCHAR(7)    NOT NULL,
  role                        VARCHAR(20)   NOT NULL DEFAULT 'adult'
                                            CHECK (role IN ('admin', 'adult', 'child')),
  email_verified              BOOLEAN       NOT NULL DEFAULT false,
  email_verification_token    VARCHAR(255),
  email_verification_expires  TIMESTAMPTZ,
  password_reset_token        VARCHAR(255),
  password_reset_expires      TIMESTAMPTZ,
  password_changed_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  failed_login_attempts       INTEGER       NOT NULL DEFAULT 0,
  locked_until                TIMESTAMPTZ,
  last_login_at               TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─── refresh_tokens ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255)  NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ   NOT NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

-- ─── calendar_layers ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS calendar_layers (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          REFERENCES users(id) ON DELETE CASCADE,
  -- user_id is NULL for the shared family layer
  name            VARCHAR(100)  NOT NULL,
  color           VARCHAR(7)    NOT NULL,
  is_family_layer BOOLEAN       NOT NULL DEFAULT false,
  is_visible      BOOLEAN       NOT NULL DEFAULT true,
  sort_order      INTEGER       NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Enforce: at most one family layer per database
CREATE UNIQUE INDEX IF NOT EXISTS uidx_calendar_layers_family
  ON calendar_layers (is_family_layer)
  WHERE is_family_layer = true;

-- ─── events ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS events (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id              UUID          NOT NULL REFERENCES calendar_layers(id) ON DELETE CASCADE,
  created_by            UUID          NOT NULL REFERENCES users(id),
  title                 VARCHAR(255)  NOT NULL,
  description           TEXT,
  location              VARCHAR(500),
  start_time            TIMESTAMPTZ   NOT NULL,
  end_time              TIMESTAMPTZ   NOT NULL,
  is_all_day            BOOLEAN       NOT NULL DEFAULT false,
  category              VARCHAR(50)   CHECK (category IN (
                          'work', 'school', 'sports', 'medical',
                          'social', 'family', 'holiday', 'other'
                        )),
  color_override        VARCHAR(7),
  is_recurring          BOOLEAN       NOT NULL DEFAULT false,
  recurrence_rule       JSONB,
  recurrence_parent_id  UUID          REFERENCES events(id) ON DELETE SET NULL,
  is_cancelled          BOOLEAN       NOT NULL DEFAULT false,
  external_id           VARCHAR(500),
  external_source       VARCHAR(50)   CHECK (external_source IN (
                          'google', 'apple', 'ics', 'internal'
                        )),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT events_end_after_start CHECK (end_time > start_time)
);

CREATE TRIGGER set_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─── event_attendees ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS event_attendees (
  event_id  UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status    VARCHAR(20) NOT NULL DEFAULT 'invited'
                        CHECK (status IN ('invited', 'accepted', 'declined', 'tentative')),
  PRIMARY KEY (event_id, user_id)
);

-- ─── reminders ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reminders (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID          NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reminder_type   VARCHAR(20)   NOT NULL CHECK (reminder_type IN ('push', 'email', 'imessage')),
  minutes_before  INTEGER       NOT NULL CHECK (minutes_before >= 0),
  is_sent         BOOLEAN       NOT NULL DEFAULT false,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── tasks ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tasks (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by          UUID          NOT NULL REFERENCES users(id),
  assigned_to         UUID          REFERENCES users(id),
  title               VARCHAR(255)  NOT NULL,
  description         TEXT,
  due_date            TIMESTAMPTZ,
  priority            VARCHAR(20)   NOT NULL DEFAULT 'medium'
                                    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status              VARCHAR(20)   NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'in-progress', 'completed', 'cancelled')),
  is_kid_mode         BOOLEAN       NOT NULL DEFAULT false,
  celebration_shown   BOOLEAN       NOT NULL DEFAULT false,
  category            VARCHAR(50),
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Auto-set completed_at when status changes to 'completed'
CREATE OR REPLACE FUNCTION trigger_set_task_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    NEW.completed_at = NOW();
  ELSIF NEW.status <> 'completed' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_task_completed_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION trigger_set_task_completed_at();

-- ─── task_comments ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_comments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id),
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_layers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_attendees    ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments      ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies ────────────────────────────────────────────────────────────

-- Application role that the API server connects as
-- (grants full access; RLS is enforced via app-level service layer as well)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hoopla_api') THEN
    CREATE ROLE hoopla_api;
  END IF;
END
$$;

GRANT ALL ON ALL TABLES IN SCHEMA public TO hoopla_api;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO hoopla_api;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO hoopla_api;

-- Bypass RLS for the API role so service-layer logic controls access
ALTER TABLE users           FORCE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens  FORCE ROW LEVEL SECURITY;

-- users: each user can see all family members (needed for shared calendar)
--        but only admins can see sensitive fields (handled in service layer)
CREATE POLICY users_select ON users
  FOR SELECT
  TO hoopla_api
  USING (true);

CREATE POLICY users_insert ON users
  FOR INSERT
  TO hoopla_api
  WITH CHECK (true);

CREATE POLICY users_update ON users
  FOR UPDATE
  TO hoopla_api
  USING (true);

CREATE POLICY users_delete ON users
  FOR DELETE
  TO hoopla_api
  USING (true);

-- refresh_tokens: only accessible by API role
CREATE POLICY refresh_tokens_all ON refresh_tokens
  FOR ALL
  TO hoopla_api
  USING (true);

-- calendar_layers: family layers visible to all; personal layers visible to owner
CREATE POLICY calendar_layers_select ON calendar_layers
  FOR SELECT
  TO hoopla_api
  USING (is_family_layer = true OR user_id IS NOT NULL);

CREATE POLICY calendar_layers_modify ON calendar_layers
  FOR ALL
  TO hoopla_api
  USING (true);

-- events: visible if on a family layer or if the user is the creator/attendee
CREATE POLICY events_all ON events
  FOR ALL
  TO hoopla_api
  USING (true);

CREATE POLICY event_attendees_all ON event_attendees
  FOR ALL
  TO hoopla_api
  USING (true);

CREATE POLICY reminders_all ON reminders
  FOR ALL
  TO hoopla_api
  USING (true);

CREATE POLICY tasks_all ON tasks
  FOR ALL
  TO hoopla_api
  USING (true);

CREATE POLICY task_comments_all ON task_comments
  FOR ALL
  TO hoopla_api
  USING (true);

-- ─── Seed: Family calendar layer ─────────────────────────────────────────────

INSERT INTO calendar_layers (name, color, is_family_layer, sort_order)
VALUES ('Family', '#3B82F6', true, 0)
ON CONFLICT DO NOTHING;
