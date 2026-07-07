# Notification Deep-Linking Design

## Problem

COCO sends 7 kinds of push notifications (new follower, follow request,
follow request accepted, tagged in a session, session like, comment like,
new comment), but tapping any of them today does nothing beyond opening the
app to whatever screen it was already on. There is no tap-response listener
anywhere in the codebase.

## Goal

Tapping a notification takes the user directly to the relevant place:

- **New follower**, **follow request**, **follow request accepted** → that
  person's profile.
- **Tagged in a session**, **session like**, **comment like**, **new
  comment** → that session, opened the same way it already opens from the
  activity feed (with likes/comments visible).

This must work whether the app is in the foreground, backgrounded, or fully
closed when the notification is tapped.

## Non-goals

- No in-app notification history/inbox screen. This is purely about
  reacting to a tap on the OS-level push notification.
- No new deep-linking URL scheme (`coco://session/...`). The existing
  in-memory "pending" navigation pattern already solves this problem for
  profiles; this design extends that pattern rather than replacing it.
- No changes to what notifications are sent, their payload shape, or when
  they're triggered — only to what happens when the user taps one.

## Design

### 1. Extend `NavigationContext`

[utils/NavigationContext.tsx](../../../utils/NavigationContext.tsx) already
has a `pendingFriendProfile` / `viewFriendProfile()` pair used to jump to a
friend's profile from anywhere in the app, and a `pendingSessionId` /
`navigateToSession()` pair used to jump to the *user's own* session detail
in `app/sessions.tsx`. Neither is quite right for a friend's session (where
likes/comments live in the activity feed modal in `app/friends.tsx`, not in
`app/sessions.tsx` — confirmed `app/sessions.tsx` has no likes/comments UI
at all).

Add a third, parallel pair:

```ts
pendingActivitySessionId: string | null;
viewActivitySession: (sessionId: string) => void;
clearPendingActivitySessionId: () => void;
```

`viewActivitySession` sets the pending id, switches `screen` to `'friends'`,
and bumps `navCount` — identical shape to `viewFriendProfile`.

### 2. New data-fetch helpers in `utils/friendsApi.ts`

- `getProfileById(id: string): Promise<PendingFriendProfile | null>` — a
  single-row fetch by id, shaped to drop straight into `viewFriendProfile()`.
  Returns `null` if the profile doesn't exist (e.g. deleted account).

- `getSessionForNotification(sessionId: string, viewerId: string): Promise<{ entry: SessionSummary; climbs: any[] } | null>` —
  fetches the session row by id (regardless of the current friendship graph
  or the 14-day activity-feed cutoff — access is already implied because
  either the viewer was tagged in it, or it's the viewer's own session that
  received a like/comment), its climbs, and the owner's profile, and shapes
  a `SessionSummary` matching the ones already built in the activity-feed
  loading logic. Returns `null` if the session no longer exists.

### 3. Consume `pendingActivitySessionId` in `app/friends.tsx`

A new effect mirrors the existing `pendingFriendProfile` effect (~line 753):
when `pendingActivitySessionId` is set and the friends screen is active,
call `getSessionForNotification`, then `setViewingSession({ entry, climbs })`
(the same state that already opens the session modal from the feed), call
the existing `loadLikesAndComments` for it, then clear the pending id. If
the fetch returns `null` (session was deleted since the notification was
sent), the effect just clears the pending id silently — no error UI for a
stale notification tap.

### 4. Notification tap listener

A new `useNotificationTapRouting()` hook is added to
[utils/notifications.ts](../../../utils/notifications.ts) (the existing
home for all push-notification client code) and called once from `AppShell`
in [app/_layout.tsx](../../../app/_layout.tsx), where `useNav()` is already
available.

It registers two things:
- `Notifications.addNotificationResponseReceivedListener(...)` — fires when
  the user taps a notification while the app is running (foreground or
  backgrounded).
- `Notifications.getLastNotificationResponseAsync()` — called once on
  mount, to detect the case where the app was fully closed and the tap is
  what launched it (this API call is the only way to catch a cold start;
  the listener above never fires for that case).

Both paths call the same router function, keyed on the notification data's
`type` field:

```ts
type ProfileNotificationType = 'new_follower' | 'follow_request' | 'follow_request_accepted';
type SessionNotificationType = 'session_tag' | 'like' | 'comment_like' | 'comment';
```

- Profile types: read `data.senderId ?? data.followerId` (the `new_follower`
  payload uses the older `followerId` key name; both are handled without
  changing the sender side), fetch the profile via `getProfileById`, then
  call `viewFriendProfile(profile)`. If the profile fetch fails or returns
  `null`, do nothing.
- Session types: read `data.sessionId`, call `viewActivitySession(sessionId)`
  directly (no fetch needed here — the fetch happens in the `friends.tsx`
  effect from step 3).
- Unrecognized/missing `type` → no-op.

Note: the existing profile view (`FriendDetailView`, opened via
`viewFriendProfile`) already renders a "Follow Back" accept action when
`friendStatus === 'pending_received'` ([app/friends.tsx:384](../../../app/friends.tsx)),
so routing `follow_request` notifications to the profile view is sufficient
— no separate request-management screen is needed.

## Testing

No test framework exists in this repo. Verification is manual:

- Push notifications cannot be delivered to the iOS Simulator at all — this
  requires a real device or a TestFlight/EAS build.
- For each of the 7 notification types, trigger it for real (e.g. have a
  second test account follow/tag/like/comment), then tap the resulting push
  notification with the app in each of three states: foreground, backgrounded,
  and fully force-quit. Confirm it opens the correct profile or session in
  all three states.
- Confirm tapping a stale notification (e.g. for a session that was since
  deleted) does not crash — it should just do nothing.
