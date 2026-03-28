-- =============================================================================
-- Migration 002 – token cleanup + password rotation jobs
-- Runs expired token pruning and flags rotation-due users
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Function: clean up expired tokens (call via pg_cron or external scheduler)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Soft-delete expired/used email verification tokens (keep 7 days for audit)
  DELETE FROM email_verification_tokens
  WHERE (expires_at < NOW() - INTERVAL '7 days')
     OR (used_at IS NOT NULL AND used_at < NOW() - INTERVAL '7 days');

  -- Same for password reset tokens
  DELETE FROM password_reset_tokens
  WHERE (expires_at < NOW() - INTERVAL '7 days')
     OR (used_at IS NOT NULL AND used_at < NOW() - INTERVAL '7 days');

  -- Hard delete revoked/expired refresh tokens older than 30 days
  DELETE FROM refresh_tokens
  WHERE (expires_at < NOW() - INTERVAL '30 days')
     OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '30 days');

  RAISE NOTICE 'Token cleanup completed at %', NOW();
END;
$$;

-- ---------------------------------------------------------------------------
-- View: users whose password rotation is due and haven't been notified yet
-- Used by the API background job to send rotation reminder emails
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW password_rotation_due AS
  SELECT
    id,
    email,
    display_name,
    password_set_at,
    EXTRACT(DAY FROM (NOW() - password_set_at)) AS days_since_change,
    EXTRACT(DAY FROM (NOW() - password_set_at)) - 183 AS days_overdue
  FROM users
  WHERE
    is_active = TRUE
    AND password_rotation_notified_at IS NULL
    AND (NOW() - password_set_at) >= INTERVAL '183 days';

-- ---------------------------------------------------------------------------
-- Index: help the rotation-due query perform well
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_users_password_set_at
  ON users (password_set_at)
  WHERE is_active = TRUE AND password_rotation_notified_at IS NULL;

-- ---------------------------------------------------------------------------
-- Partial index: active, unrevoked refresh tokens (used in validate query)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_rt_active
  ON refresh_tokens (token_hash)
  WHERE revoked_at IS NULL AND expires_at > NOW();
