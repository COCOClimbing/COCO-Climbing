# Hold color on climbs — design

**Goal:** When logging a climb, let the climber record the hold color of the route (e.g. "V6, red holds") so a friend can find the same climb at the gym the next day.

## Decisions

- **Input:** preset color swatches (no free text).
- **Palette (11):** red, orange, yellow, green, teal, blue, purple, pink, white, black, gray.
- **Optional:** a climb can have no hold color.
- **Visibility on the form:** only when Environment is Indoor **and** the climb type is not hangboard/lift. Hidden (and value cleared) otherwise.
- **Display:** climb cards (color dot) and the climb detail modal (labeled row). Not on share cards.
- **Storage:** a new nullable `hold_color text` column on the Supabase `climbs` table; also stored locally on the `Climb` object.

## Data

- `utils/theme.ts`
  - Add `HOLD_COLORS` (id, label, hex) and `HoldColorId`, modeled on `CLIMB_STYLES`.
  - Add `holdColor?: HoldColorId` to `Climb`.
- `utils/cloudSync.ts`
  - `climbToRow`: sends `hold_color` only when a color is set (spread conditionally), so climbs without a color keep syncing even before the column exists.
  - Row → climb mapper (near the existing `routeName: row.route_name ?? undefined`): `holdColor: row.hold_color ?? undefined`.
- Places that hand-map cloud rows to `Climb` each get `holdColor: c.hold_color`:
  - `app/friends.tsx` (two mappers, near lines ~1406 and ~1447)
  - `components/ActivityCard.tsx` (`mapToClimb`)
  - `app/stats.tsx` (~line 157, `r.hold_color ?? undefined`)
- `supabase_add_hold_color.sql`: `alter table climbs add column hold_color text;` (nullable, no default).

## Form (`components/LogClimbModal.tsx`)

- New state `holdColor: HoldColorId | undefined`, pre-filled when editing an existing climb.
- New section `HOLD COLOR (optional)` directly under Style: a row of tappable color circles. Tapping the selected circle clears it. Selected circle shows a ring in the accent color plus a check for white/light colors.
- Rendered only when `environment === 'indoor' && !isTraining`. When it is hidden (environment switched to outdoor, or type switched to hangboard/lift), the value is reset to undefined so it is not saved.
- Value is included in the saved `Climb`.

## Display

- `components/ClimbCard.tsx`: a small color dot beside the grade badge when `climb.holdColor` is set; nothing rendered otherwise. Used for both the Sessions list and a friend's expanded "View climbs".
- `components/ClimbDetailModal.tsx`: a "Hold color" row with the swatch and label when set.
- White and black dots get a visible border so they read on both light and dark themes.

## Deploy order (important)

The migration must be applied to the production Supabase database **before** the OTA update ships. Once the OTA is out, every climb upsert includes `hold_color`; if the column does not exist yet, those upserts fail. The migration is applied by the user in the Supabase SQL editor (not run by Claude).

Old app versions are unaffected: they neither send nor read `hold_color`.

## Testing (simulator)

1. Log a climb with a hold color; reopen it; confirm the dot on the card and the row in the detail modal.
2. Confirm the section is hidden for Outdoor and for hangboard/lift, and that switching to those clears any picked color.
3. Confirm existing climbs (no color) render exactly as before.
4. After the column exists: confirm a friend's expanded climbs show the dot (requires a second account's climb with a color).

## Out of scope

Share cards, filtering/searching by hold color, color on outdoor climbs, free-text colors.
