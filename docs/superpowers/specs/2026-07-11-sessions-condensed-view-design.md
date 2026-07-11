# Sessions Tab Condensed View Design

## Problem

The Sessions tab's closed-session cards (`components/SessionCard.tsx`) are rich
feed-style cards — title, location, notes, climbing-with chips, stats, a
photo strip, likes/comments, and a comment thread. That richness is great
for reviewing one session, but it makes scanning a long list of past
sessions slow: every card takes up a lot of vertical space, especially ones
with photos attached.

## Goal

Add a toggle on the Sessions tab that switches every closed session card
between two states:

- **Expanded** (today's behavior, unchanged): full card, as it looks now.
- **Condensed**: only the date/edit header, the title, the stats row
  (Type/Climbs/Hardest), and the "View climbs" button — everything else
  (location, notes, climbing-with, photos, likes/comments, comment
  thread/input) is hidden, regardless of whether that session has that data.

This lets you scan every session's title, type, climb count, and hardest
grade at a glance, then flip back to full detail when you want it.

## Non-goals

- The pinned active/in-progress session card at the top of the Sessions tab
  is unaffected — always full detail, since you're actively editing it.
- The same session cards reused elsewhere (your own profile's SESSIONS list,
  via `FriendDetailView` — shipped earlier tonight) are unaffected. This is
  a Sessions-tab-only toggle.
- "View climbs" per-card expand/collapse keeps working exactly as it does
  today, independent of the condensed/expanded toggle — condensing doesn't
  touch that button or its state.
- No change to the active session card, the Edit modal, or any other part
  of the Sessions tab besides the new toggle button and how `SessionCard`
  renders.

## Design

### Toggle button

A new icon-only button in `app/sessions.tsx`'s top bar (`styles.topBar`),
placed between the existing "+ Session" and "Calendar" buttons. Shows a
"contract" icon when the list is currently expanded (tapping it condenses),
and an "expand" icon when the list is currently condensed (tapping it
expands) — the icon always represents the action a tap will perform.

### `SessionCard` gets a `condensed` prop

`components/SessionCard.tsx`'s `SessionCardProps` gains an optional
`condensed?: boolean` (default `false`, so every other existing caller of
`SessionCard` — i.e. `FriendDetailView`'s own-profile SESSIONS list — is
unaffected without any changes on their end).

When `condensed` is `true`, `SessionCard` skips rendering:
- the location row
- the notes text
- the "climbing with" partners row
- the photo strip
- the likes/comment counts row
- the actions row (comment/share buttons)
- the comment thread
- the comment input row

It always renders:
- the header (date label + edit icon)
- the title
- the stats row (Type/Climbs/Hardest, or "Projecting")
- the "View climbs" expand button, and the expanded climbs list if the user
  has tapped it open (this state and behavior is untouched by `condensed`)

### Persistence

The choice is saved to `AsyncStorage`, mirroring the existing
`getPreferredDisplayGrades`/`savePreferredDisplayGrades` pattern in
`utils/storage.ts` (a single JSON-serialized value under its own key).
`app/sessions.tsx` loads the saved value once on mount and defaults to
`false` (expanded) if nothing has been saved yet.

## Testing

No test framework in this repo. Manual verification:

- Toggle to condensed: every closed session card shrinks to
  header/title/stats/View-climbs only, even for sessions with photos,
  notes, location, or comments.
- Toggle back to expanded: full detail returns exactly as before.
- "View climbs" still expands/collapses a card's climb list correctly in
  both condensed and expanded modes.
- The active/in-progress session card is unaffected by the toggle.
- Close and reopen the app: the last toggle state is remembered.
- Own profile's SESSIONS list (`FriendDetailView`) is visually unchanged —
  confirms the new prop's default doesn't leak into that surface.
