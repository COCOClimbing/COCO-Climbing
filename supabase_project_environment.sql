-- Indoor/outdoor saved on a project, so Log Climb lists only matching projects.
-- Nullable; old rows stay NULL (the app falls back to where it was last logged).
-- The app retries without environment if this column is missing.
alter table projects add column if not exists environment text;
