-- Run after supabase-schema.sql if your rooms table already exists

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS host_username TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS guest_username TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_rooms_last_active ON rooms(last_active_at);

CREATE OR REPLACE FUNCTION cleanup_stale_rooms()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM rooms
  WHERE last_active_at < NOW() - INTERVAL '2 hours'
     OR (status = 'waiting' AND created_at < NOW() - INTERVAL '45 minutes')
     OR status = 'finished';
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_stale_rooms() TO anon;
GRANT EXECUTE ON FUNCTION cleanup_stale_rooms() TO authenticated;
