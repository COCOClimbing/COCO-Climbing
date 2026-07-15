# Likes List Modal Design

## Problem

`components/LikesAvatarRow.tsx` — shared by the activity feed
(`components/ActivityCard.tsx`) and the Sessions tab's closed-session cards
(`components/SessionCard.tsx`) — shows up to 3 overlapping avatars (`marginLeft:
-8`, decreasing `zIndex`) plus an "N likes" text. Each avatar has its own
`onPress` that navigates straight to that liker's profile.

Because the avatars overlap with the frontmost one on top, only that one
avatar is actually tappable in practice — the other one or two sit mostly
hidden underneath it. Since `sessionLikes` is rendered in the order the API
returns it (most recent like first), the practical effect is: you can only
ever navigate to the *most recent* person who liked it, with no way to see
or reach anyone else who liked it.

## Goal

Tapping the likes row (any avatar, or the "N likes" text) opens a modal
listing *everyone* who liked it, each row tappable to that person's profile.

## Non-goals

- No new data fetching. Both `ActivityCard` and `SessionCard` already hold
  the full `SessionLike[]` list (with `profile.name`/`profile.avatar_url`)
  in local state and already map it into `LikesAvatarRow`'s `likers` prop —
  we're only changing how that already-available data is displayed.
- No `@username` per row. `LikesAvatarRow`'s `Liker` type doesn't carry a
  username (unlike `FriendProfile`, which does) and fetching one would mean
  a new query. Rows show avatar + name only.
- No changes to how likes are counted, created, or the like/comment logic in
  `ActivityCard`/`SessionCard` beyond removing the per-avatar direct-profile
  shortcut.
- Comments are untouched — this is likes only.

## Design

### Interaction change

Today: individual avatar taps call `onPressLiker(liker)` directly; the "N
likes" text has no `onPress`.

New: every avatar in the stack, and the "N likes" text, open the same
modal. Nothing calls `onPressLiker` directly from the row anymore — that
callback moves to firing from inside the modal instead.

Tapping a row inside the modal closes the modal and calls `onPressLiker`
with that liker — reusing the exact navigation wiring that already exists
in both `ActivityCard.tsx` and `SessionCard.tsx` today. Neither of those
files needs to change how they navigate to a profile, only that the
trigger now comes from the modal instead of the avatar stack.

Tapping your own row does nothing, matching today's behavior (the current
`onPressLiker && l.userId !== currentUserId` guard that currently skips
wiring `onPress` for the current user's own avatar).

### Where the modal lives

Self-contained inside `LikesAvatarRow.tsx`:
- `LikesAvatarRow` gains its own `useState` for modal visibility — no new
  props required from `ActivityCard`/`SessionCard`, and no new state for
  them to manage.
- The modal renders the full `likers` array (not sliced to 3).
- Avatars in the collapsed row stay sliced to 3 (unchanged) — only the tap
  target changes from "navigate" to "open modal."

### Visual style

Matches the existing Following/Followers modal in `app/account.tsx`
(`followListModal`/`followModal*` styles): `Modal` with
`animationType="slide"`, `presentationStyle="pageSheet"`, a header with a
title and a "Done" button, and a `ScrollView` of rows — each row an avatar
(image, or a colored circle with the first letter of the name as a
fallback, matching `followModalAvatar`/`followModalAvatarText`) plus the
name. No tabs (unlike Following/Followers) since there's only one list here
— header title is simply "Likes".

### Empty state

Not reachable — `LikesAvatarRow` already returns `null` when `likers.length
=== 0`, so the modal can only ever open when there's at least one liker.

## Testing

Native RN feature — verified manually in simulator/device, not via browser
preview:
- Activity feed: tap the likes row on a card with 1, 2, and 3+ likes;
  confirm the modal lists everyone, and each tap (except your own row)
  navigates to the right profile.
- Sessions tab (non-condensed closed session card): same checks.
- Confirm the condensed session card view (which hides the likes row
  entirely, per the condensed-view feature) is unaffected.
