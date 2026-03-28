-- ============================================================
-- HillFamilyHoopla — Token cleanup
-- Migration: 004_token_cleanup.sql
--
-- Provides a function to purge stale refresh tokens.
-- Call manually or schedule via pg_cron (Supabase supports this).
--
-- Tokens are safe to delete when they are BOTH expired AND either
-- revoked or more than 1 day past expiry (belt-and-suspenders).
-- ============================================================

-- ─── Cleanup function ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_expired_tokens(
  OUT deleted_count INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM refresh_tokens
  WHERE
    -- Revoked tokens older than 1 day
    (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '1 day')
    OR
    -- Expired tokens (not revoked, just past their expiry window + 1 day grace)
    (revoked_at IS NULL AND expires_at < NOW() - INTERVAL '1 day');

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
END;
$$;

-- ─── Optional: schedule via pg_cron (Supabase) ───────────────────────────────
--
-- Uncomment if your Supabase project has pg_cron enabled:
--
--   SELECT cron.schedule(
--     'cleanup-expired-tokens',    -- job name
--     '0 3 * * *',                 -- 3 AM daily
--     'SELECT cleanup_expired_tokens()'
--   );
--
-- To check if pg_cron is available:
--   SELECT * FROM pg_available_extensions WHERE name = 'pg_cron';
--
-- To unschedule:
--   SELECT cron.unschedule('cleanup-expired-tokens');

-- ─── Cleanup function for stale email verification tokens ────────────────────
--
-- Tokens expire after 24 hours; clear them from user rows after 7 days
-- so the column doesn't hold stale data indefinitely.

CREATE OR REPLACE FUNCTION cleanup_expired_verification_tokens()
RETURNS void
LANGUAGE sql
AS $$
  UPDATE users
  SET
    email_verification_token   = NULL,
    email_verification_expires = NULL
  WHERE
    email_verified = false
    AND email_verification_expires IS NOT NULL
    AND email_verification_expires < NOW() - INTERVAL '7 days';

  UPDATE users
  SET
    password_reset_token   = NULL,
    password_reset_expires = NULL
  WHERE
    password_reset_expires IS NOT NULL
    AND password_reset_expires < NOW() - INTERVAL '1 day';
$$;

-- ─── Convenience: run both cleanups at once ────────────────────────────────────

CREATE OR REPLACE FUNCTION run_all_cleanups()
RETURNS TABLE(cleanup TEXT, deleted INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  token_count INTEGER;
BEGIN
  SELECT deleted_count INTO token_count FROM cleanup_expired_tokens();
  PERFORM cleanup_expired_verification_tokens();

  RETURN QUERY VALUES
    ('refresh_tokens', token_count),
    ('verification_tokens', 0);  -- UPDATE doesn't return row count easily
END;
$$;
