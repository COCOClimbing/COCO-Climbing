-- Board climbs: which board (e.g. 'Kilter') and its angle in degrees. The
-- problem's own name goes in route_name like any other climb. Nullable; old
-- rows stay NULL.
-- APPLY THIS IN PRODUCTION BEFORE SHIPPING THE OTA THAT SENDS board_name /
-- board_angle. The app only sends them when set, so other climbs keep syncing
-- without it, but Board climbs with a board name would fail to sync.
alter table public.climbs add column if not exists board_name text;
alter table public.climbs add column if not exists board_angle integer;
