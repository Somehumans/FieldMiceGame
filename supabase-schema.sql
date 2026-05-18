-- 21 Card Game - Supabase Schema
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(6) UNIQUE NOT NULL,
  host_id UUID NOT NULL,
  guest_id UUID,
  host_username TEXT,
  guest_username TEXT,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  is_private BOOLEAN DEFAULT false,
  settings JSONB DEFAULT '{}'::jsonb,
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_last_active ON rooms(last_active_at);

-- Remove stale rooms (usernames are deleted with the room row)
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

-- Row Level Security
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read waiting rooms" ON rooms;
CREATE POLICY "Anyone can read rooms"
  ON rooms FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can create rooms" ON rooms;
CREATE POLICY "Anyone can create rooms"
  ON rooms FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Players can update their rooms" ON rooms;
CREATE POLICY "Anyone can update rooms"
  ON rooms FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS "Host can delete their rooms" ON rooms;
CREATE POLICY "Anyone can delete rooms"
  ON rooms FOR DELETE
  USING (true);

-- Realtime: enable in Dashboard → Project Settings → Realtime (Broadcast + Postgres changes ON)
-- Then run (skip if rooms already in publication):
-- ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
