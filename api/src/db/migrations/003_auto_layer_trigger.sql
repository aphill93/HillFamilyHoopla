-- ============================================================
-- HillFamilyHoopla — Auto-create personal calendar layer
-- Migration: 003_auto_layer_trigger.sql
--
-- When a user is inserted, automatically create their personal
-- calendar layer using their profile_color.
-- This ensures every user always has a layer to attach events to.
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_create_user_calendar_layer()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO calendar_layers (user_id, name, color, is_family_layer, sort_order)
  VALUES (
    NEW.id,
    NEW.name,          -- layer name defaults to the user's name
    NEW.profile_color, -- layer color matches their profile color
    false,
    1                  -- personal layers sort after the family layer (sort_order = 0)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_user_calendar_layer
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION trigger_create_user_calendar_layer();

-- ─── Back-fill: create layers for any existing users that don't have one ─────

INSERT INTO calendar_layers (user_id, name, color, is_family_layer, sort_order)
SELECT
  u.id,
  u.name,
  u.profile_color,
  false,
  1
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM calendar_layers cl
  WHERE cl.user_id = u.id
    AND cl.is_family_layer = false
);
