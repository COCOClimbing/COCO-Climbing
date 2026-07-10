# Session Detail Section Order Design

## Problem

`app/sessions.tsx`'s session detail view (`DetailView`) renders the same
section order regardless of whether the session is still active or already
closed: header, then the climbs list, then Notes, Location, Climbing With,
and Media, then the action buttons.

For a closed session, a climber reviewing it typically wants the context
(where, with whom, notes, photos) before the individual climb-by-climb
detail. For an active session, the opposite is true — the climbs list is
what's being actively edited and should stay immediately after the header.

## Goal

- **Active session**: unchanged. Header → Climbs → Notes → Location →
  Climbing With → Media → Actions.
- **Closed session**: Header → Notes → Location → Climbing With → Media →
  Climbs → Actions (the four metadata sections keep their existing relative
  order to each other, just moved as a block above the climbs list).

## Non-goals

- No change to any section's internal content, editing behavior, or logic —
  Notes editing, the Location picker, the "Climbing With" friend picker
  (including its scroll-into-view-above-keyboard behavior), and the Media
  picker/viewer all keep working exactly as they do today.
- No change to the header, stats row, or the action buttons (End
  Session/Add Climb, Share, etc.) at the bottom.
- No change for active sessions — this only affects how a *closed* session
  renders.

## Design

In `DetailView` (`app/sessions.tsx`), the five reorderable blocks —
Climbs, Notes, Location, Climbing With (Friends), and Media — are extracted
into local JSX variables computed once per render, in the same place they're
currently defined inline. Each block's internal JSX is copied as-is (no
logic changes) from its current inline position into a `const` binding, for
example:

```tsx
const climbsSection = (
  displayClimbs.length === 0
    ? <Text style={[styles.noClimbs, { color: colors.textMuted }]}>No climbs logged yet</Text>
    : displayClimbs.map(c => ( /* ...existing SwipeToDelete/ClimbCard JSX... */ ))
);

const notesSection = ( /* ...existing Notes card JSX... */ );
const locationSection = ( /* ...existing Location card JSX... */ );
const friendsSection = ( /* ...existing Climbing With card JSX, including onLayout... */ );
const mediaSection = ( /* ...existing Media card IIFE result... */ );
```

The render then picks the order based on `isActive` (already computed at
the top of `DetailView`):

```tsx
{isActive ? (
  <>
    {climbsSection}
    {notesSection}
    {locationSection}
    {friendsSection}
    {mediaSection}
  </>
) : (
  <>
    {notesSection}
    {locationSection}
    {friendsSection}
    {mediaSection}
    {climbsSection}
  </>
)}
```

This replaces the current fixed sequence of five inline blocks between the
header and the Actions row.

**Why this is safe:** every piece of position-dependent logic in these
sections already derives its position from a live layout measurement rather
than an assumed fixed order:
- `friendsCardY.current` is set via `onLayout` on the Climbing With card,
  used only to compute a scroll offset when the friend picker's dropdown
  opens — it naturally reflects wherever the card actually renders.
- `notesCardRef.current?.measure(...)` (used to scroll the Notes card into
  view when editing starts) similarly measures actual on-screen position.
- The swipe-back-to-list gesture only activates based on the touch's
  absolute screen Y position (top 320px), unrelated to scroll content order.

So no follow-on logic changes are needed beyond the reordering itself.

## Testing

No test framework exists in this repo. Manual verification:
- Open an active (in-progress) session — confirm climbs still appear
  immediately after the header, with Notes/Location/Climbing With/Media
  below, in their current order.
- Close a session (or open an already-ended one) — confirm Notes, Location,
  Climbing With, and Media now appear above the climbs list, in that order.
- Confirm editing notes, changing location, adding/removing session
  friends, and adding/viewing media all still work correctly in both
  section-order arrangements.
- Confirm the "Climbing With" picker's scroll-above-keyboard behavior still
  works correctly in a closed session (where the card is now higher up the
  page).
