-- Hold color of the route for indoor climbs (e.g. 'red', 'teal'). Nullable; old rows stay NULL.
-- APPLY THIS IN PRODUCTION BEFORE SHIPPING THE OTA THAT SENDS hold_color.
alter table climbs add column if not exists hold_color text;
