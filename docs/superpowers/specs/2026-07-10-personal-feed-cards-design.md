# Personal Feed-Style Session Cards Design

## Problem

The Sessions tab, and the "SESSIONS" list at the bottom of any profile view (your
own or a friend's, both rendered by `FriendDetailView` in `app/friends.tsx`),
currently show sessions as compact rows — date, grade badge, climb/send
counts, and a chevron. Tapping one either opens a separate full-screen detail
view (Sessions tab) or, for profiles, does nothing richer than the row itself
shows. None of these surfaces show photos, notes, location, who you climbed
with, or (for your own sessions) likes and comments — that richness only
exists in the main Activity feed today.

This project replaces those compact-row lists with the same rich, feed-style
card presentation across all three surfaces, while keeping the underlying
data and edit/view permissions correct for who's looking.

## Goal

Three surfaces converge on card-based, feed-style presentation:

1. **Sessions tab** (`app/sessions.tsx`): the list becomes a scrollable feed
   of cards for your own sessions. The current full-screen "tap to view"
   detail navigation is removed entirely for viewing — everything needed to
   view a session lives in its card. Editing moves into a new full-screen
   modal, opened via a small edit icon per card.
2. **Your own profile** (`FriendDetailView`, reached via your own avatar):
   the stats header (Following/Followers, Last 30 Days, Hardest Sends,
   Totals) is unchanged; the "SESSIONS" list below it becomes the same card
   presentation as the Sessions tab — you own this data, so cards behave
   identically (edit icon, no self-like, comment-moderation rights).
3. **A friend's profile** (`FriendDetailView` again, same component,
   different `friend`): same stats-header-unchanged treatment, but the
   session list becomes the Activity feed's existing card style — you're a
   viewer here, not an owner, so it's a like button (not edit), and comment
   permissions follow today's rule (delete your own comments, report
   others').

## Non-goals

- No change to the stats header content/layout on any profile view.
- No change to the main Activity feed's own rendering — it already has the
  richness this project is extending elsewhere; Phase 2 pulls its existing
  card out into a reusable piece rather than rebuilding it.
- No pagination changes — the Sessions tab and profile session lists keep
  loading all of a person's sessions at once (their own local data or a
  friend's fetched data), matching today's behavior. Pagination is an
  Activity-feed-only concept (already shipped) and doesn't apply here.
- No change to `+ Session`/`Calendar` buttons at the top of the Sessions tab.
- No nested comment replies (unchanged from the existing Likes+Comments
  feature).

## Design

### Two card variants

**Owner card** (new — built for this project): used for your own sessions,
wherever they appear (Sessions tab, your own profile's session list).

- Read-only presentation: plain title, notes/location/climbing-with (shown
  only when non-empty), a photo grid (tap to view full-screen).
- Climbs are collapsed by default — a "View climbs" tap expands the full
  list inline (`ClimbCard`, tap for detail, swipe-to-delete — all
  unaffected, no edit mode required for any of this).
- Likes + Comments block, live inline: who liked it (read-only, no
  self-like button), full comment thread, comment input — reusing
  `SwipeableComment`/`LikesAvatarRow` from the earlier Likes & Comments
  feature, and the existing owner-comment-moderation rule (delete any
  comment on your own session, no Report ever shown).
- A compact action row: Comment (focuses the input) and Share (opens the
  existing `ShareModal`).
- A small Edit icon, top-right of the card, opens a full-screen Edit modal
  for that one session.

Built fresh against `DaySession`'s data model (which already has full climb
details locally — no fetch needed), reusing the visual/style patterns
already established in `app/sessions.tsx`'s existing View-mode sections
(`notesViewSection`/`locationViewSection`/etc. from the earlier Likes &
Comments feature) but as a per-item card component instead of a single
selected-day const.

**Viewer card** (existing — extracted, not rebuilt): the Activity feed's
current per-session card, pulled out of its ~250-line inline position in
`FriendsScreen` into a reusable `ActivityCard` component. Unchanged
behavior: like button, comment thread with existing permission rules
(delete-own/report-others'), share, "View climbs" expand (already fetches
on demand today — unchanged). No edit icon (you don't own this session).

### Sessions tab (`app/sessions.tsx`)

- The current `FlatList` of compact rows (`renderDay`) is replaced with a
  `FlatList` of Owner cards, one per `DaySession`.
- Your active (in-progress) session, if any, is a special card pinned at
  the top — rendered with today's always-editable inline content
  (tap-to-rename title, tap Location/Climbing With/Media to edit directly,
  "+ Add Climb", "End Session"), unchanged from how `DetailView`'s
  `isActive` branch already works. No edit icon, no Likes+Comments (a
  session can't be liked/commented on until it's closed).
- The separate full-screen `DetailView` navigation (`selectedDay` state,
  "← Back" screen) is removed for **viewing** purposes — cards show
  everything inline. It's replaced by a new Edit modal (see below) for
  **editing** purposes only.
- Session-level delete moves from the current swipe-to-delete-the-row
  gesture into an explicit "Delete Session" button inside the Edit modal —
  safer given the new cards are taller and have their own internal
  scrolling (horizontal photo scroll, comment thread), where a full-card
  swipe gesture would be more error-prone than on the old compact row.

### Edit modal

A full-screen modal, opened by tapping a closed session's Edit icon,
showing:

- Today's fully-interactive box layout (Notes card with edit link,
  `LocationPicker`, `FriendPicker` via `SessionFriendPicker`, Media with
  add/remove) — this is exactly the content that already exists as
  `app/sessions.tsx`'s current Edit-mode branch, relocated into a modal
  instead of a same-screen toggle.
- The full climbs list, with "+ Add Climb".
- "Edit Date" and "Delete Session" buttons (moved here from the old
  Actions row / swipe gesture).
- A "Done" button dismisses the modal back to the feed list.

### Friend/own profile (`FriendDetailView` in `app/friends.tsx`)

`FriendDetailView` already handles both "viewing yourself" and "viewing a
friend" today — it's invoked with a `FriendProfile`-shaped object, where
your own profile is represented by a synthetic `selfProfile` (`{ id:
user.id, name: 'You', ... }`, see `app/friends.tsx:845`). This means the
choice of card variant is a single conditional inside this one component:

```
friend.id === user.id → Owner card (same component/behavior as Sessions tab)
friend.id !== user.id → Viewer card (ActivityCard, same as main feed)
```

The current "SESSIONS" list (compact rows) inside `FriendDetailView` is
replaced with whichever card variant applies, each populated from that
person's own sessions (already fetched/available to this component today).

## Testing

No test framework in this repo. Manual verification (to be detailed per
implementation plan):

- Sessions tab: active session pinned and fully editable; closed sessions
  show as read-only cards with working comment/like/share/edit-icon;
  climbs expand/collapse correctly with swipe-to-delete and tap-for-detail
  intact; Edit modal opens/closes cleanly and every field it exposes saves
  correctly (Notes/Location/Friends/Media/Date/+Add Climb/Delete Session).
- Own profile: session cards behave identically to the Sessions tab
  (edit icon present, no self-like, delete-any-comment).
- A friend's profile: session cards behave identically to the main
  Activity feed (like button present, no edit icon, standard comment
  permissions).
- Confirm the main Activity feed itself is visually and functionally
  unchanged after `ActivityCard` extraction (pure refactor, not a rewrite).
