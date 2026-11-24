-- Hold color saved on a project, so each new attempt starts with it (e.g. 'red', 'teal').
-- Nullable; old rows stay NULL. The app retries without hold_color if this column
-- is missing, so projects keep syncing before it's applied.
alter table projects add column if not exists hold_color text;
