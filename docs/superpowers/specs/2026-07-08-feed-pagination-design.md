# Feed Pagination & Notification-Tap Scroll Design

## Problem

Two related issues with the activity feed and notification system, both built
in earlier work this session:

1. Tapping a like/comment/tag notification currently opens the full session
   detail modal. It should instead scroll to that session's card within the
   normal activity feed, since that's a lighter-weight, more contextual
   landing spot.
2. Both the activity feed (`app/friends.tsx`) and the in-app notification
   list (`components/AppHeader.tsx`) currently load a hard window (14 days
   for the feed, a flat 50-row limit for notifications) with no way to see
   further back. Older items are simply inaccessible.

These interact: once the feed can be paginated further back, a
notification-tap "scroll to card" needs a way to find a session that isn't
in the initially-loaded window yet.

## Goals

- Activity feed: load 14 days initially; scrolling to the bottom extends the
  window by 7 days at a time, indefinitely (no cap), refetching and
  re-rendering. Pull-to-refresh resets back to 14 days.
- In-app notification list: same pattern — 14 days initially, +7 days per
  scroll-to-bottom, no cap.
- Notification tap (session_tag / like / comment_like / comment): scroll to
  the target session's card in the activity feed instead of opening the
  detail modal. If the session isn't in the currently-loaded window, the tap
  handler auto-extends the window (same mechanism as manual scrolling) until
  found, capped at 90 days back to avoid searching forever for a stale or
  deleted session.
- Both lists show a transient "You're all caught up" footer when a
  load-more attempt returns no new items — transient because each attempt
  covers a genuinely new, further-back window, so a quiet week doesn't mean
  history has truly ended.
- Notification "mark as read" only applies to the currently-loaded window,
  not the whole notification history — so a notification outside the loaded
  window is never silently marked read before the user has actually
  scrolled to see it.

## Non-goals

- No change to what triggers a notification, its payload, or its `type`.
- No change to the activity feed's underlying grouping/summary-building
  logic (grade computation, photos, partners) — only the date window and
  how a card is reached widen.
- No incremental/delta fetching. Both lists refetch their *entire* window
  on every load-more, rather than fetching just the new slice and merging
  it in. Given realistic data volumes for a climbing log, refetching a
  growing-but-still-small window is simpler and far less bug-prone than
  incremental merging (no cross-boundary session splitting, no dedup, no
  manual re-sort) and reuses all existing feed-building logic unchanged.

## Design

### 1. Parameterize the date cutoff

[utils/friendsApi.ts](../../../utils/friendsApi.ts)'s `getFriendRecentClimbs`,
`getFriendRecentSessions`, and `getTaggedSessions` each currently hardcode a
14-day cutoff. Each gains a `daysBack: number` parameter, replacing the
hardcoded `14` in their internal cutoff calculation. Call sites pass through
whatever window is currently loaded.

The "own recent sessions" filter inside `loadFeed()` (`app/friends.tsx`)
needs no network change — `getAllSessions()` already returns everything from
local storage; only the client-side date-cutoff comparison widens using the
same `daysBack` value.

### 2. Activity feed pagination (`app/friends.tsx`)

- New state: `const [daysLoaded, setDaysLoaded] = useState(14);` and
  `const [loadingMore, setLoadingMore] = useState(false);`.
- `loadFeed()` accepts the current `daysLoaded` and passes it into the three
  parameterized fetch functions above, refetching the full 0-to-`daysLoaded`
  window each call (per the Non-goals section — no incremental merge).
- The existing `<ScrollView ref={feedScrollRef} onScroll={...}>` gains a
  bottom-proximity check inside its `onScroll` handler. Reaching the bottom
  (and not already `loadingMore`) sets `loadingMore = true`, bumps
  `daysLoaded += 7`, and calls `loadFeed()`. Its `.then` resets
  `loadingMore = false`.
- **Fetch-storm guard**: a ref (e.g. `canTriggerLoadMoreRef`, initialized
  `true`) gates the trigger. Right after triggering, it's set `false`; it's
  only set back to `true` once `onScroll` reports the user has scrolled
  away from the bottom threshold. This prevents a runaway loop when a
  load-more attempt adds zero new cards (list height unchanged, so the user
  is still sitting at the "bottom" and would otherwise keep re-triggering
  every scroll event at that position).
- A small footer (spinner while `loadingMore`, or a "You're all caught up"
  text when the most recent load-more call added zero new entries to
  `activityFeed`) renders below the list, inside the `ScrollView`'s content.
  This footer state is transient — cleared the next time a load-more call
  successfully adds new entries, or the next time the user pulls to refresh.
- Pull-to-refresh (`onRefresh={loadFeed}` on the existing `RefreshControl`)
  resets `daysLoaded` to `14` before calling `loadFeed()`, so refreshing
  always returns to the normal 14-day view.

### 3. Notification-tap scroll-to-card (`app/friends.tsx`)

Replaces the current `pendingActivitySessionId` effect's behavior of
opening the full session detail modal (`setViewingSession`/
`handleOpenSession`) with:

- If the target session is found in `activityFeed`: locate its rendered
  position via a per-card Y-offset map (populated by adding
  `onLayout={e => { cardOffsets.current[sessionKey] = e.nativeEvent.layout.y; }}`
  to each activity card's outer `View`), then
  `feedScrollRef.current?.scrollTo({ y, animated: true })` after a short
  delay (matching the existing `setTimeout(..., 50)` pattern already used
  elsewhere in this file for scroll-to-position, to let the newly-rendered
  card's native layout settle first).
- If not found yet: check whether the feed has ever completed a load
  (tracked via a new `everLoadedFeedRef`, set `true` at the end of every
  `loadFeed()` call). If it has completed at least once and the session
  still isn't found, extend the window automatically using the same
  mechanism as manual scroll-triggered pagination (`daysLoaded += 7`,
  `loadFeed()`), up to a hard cap of 90 days back. If found within that cap,
  scroll to it as above. If the cap is reached with no match, give up
  silently (clears the pending id, no error UI) — same behavior as today's
  already-established "stale notification" case.
- This removes the need for `getSessionForNotification` (added in the prior
  notification-deep-linking work specifically as a same-tick fallback fetch
  for a session outside the feed's fixed window) and the
  `pendingActivitySessionIdRef` staleness guard that existed only to protect
  that fetch's async gap. Both are deleted, along with
  `getSessionForNotification`'s two now-unused imports in
  `utils/friendsApi.ts` (`getGradeDifficulty`, `isDeadMediaUrl` — confirmed
  unused elsewhere in that file).
- This scroll-to-card behavior now applies to all 4 session-related
  notification types (`session_tag`, `like`, `comment_like`, `comment`) —
  including "tagged in a session," which previously opened the detail
  modal.

### 4. Notification list pagination (`components/AppHeader.tsx`)

Mirrors section 2, applied to the in-app notification bell dropdown:

- New state: `daysLoaded` (starts `14`), `loadingMore`.
- `openNotifications()`'s fetch changes from `.limit(50)` to
  `.gte('created_at', cutoff)` where `cutoff` is derived from `daysLoaded`
  (same date-math pattern as the feed).
- The notification modal's `ScrollView` (currently has no ref or scroll
  tracking at all) gains a ref, an `onScroll` handler with the same
  bottom-proximity + re-arm-guard pattern as section 2, and the same
  spinner/"You're all caught up" footer.
- **Mark-as-read scope change**: the existing "mark all as read" update
  (`.eq('read', false)`, no date bound) changes to only mark the
  currently-fetched batch: `.in('id', <ids from this fetch>).eq('read', false)`.
  This runs after every fetch (initial load and each load-more), not just
  the initial one — so newly-paginated-into-view notifications get marked
  read too, but anything still outside the loaded window never does.

## Testing

No test framework exists in this repo. Manual verification:

- Activity feed: scroll to the bottom repeatedly, confirm each scroll adds
  7 more days of history (or shows "You're all caught up" if a window was
  quiet, and further scrolling still reaches further back). Confirm
  pull-to-refresh resets the window. Confirm no runaway fetch loop when
  sitting at the bottom with no new content (watch network requests).
- Notification-tap scroll-to-card: tap a like/comment/tag notification for
  a session already in the loaded feed — confirm it scrolls to the card,
  not the detail modal. Tag/like a very old session (>14 days) and tap that
  notification — confirm the feed auto-paginates back until it's found and
  scrolls to it.
- Notification list: open the bell with more than 14 days of notification
  history, confirm only the recent window loads initially, scroll to load
  more, confirm mark-as-read only affects what's been loaded/seen.
