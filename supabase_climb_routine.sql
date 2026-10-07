-- Hangboard/lift routines get their own column instead of being saved into
-- notes. Run this BEFORE shipping the app update that syncs `routine`;
-- the app sends routine on every climb upsert, so syncing fails without it.
--
-- Existing rows are left alone: past routines stay in notes.

alter table public.climbs add column if not exists routine text;
