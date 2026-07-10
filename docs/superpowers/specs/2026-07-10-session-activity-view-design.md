# Session Detail: View Mode with Likes & Comments Design

## Problem

Right now, the only place to see who liked or commented on your session is
the Activity feed (`app/friends.tsx`) — and only for as long as that session
stays within the feed's scroll-back window. There's no way to review a
session's social engagement from the Sessions tab, where you actually browse
and manage your own sessions.

Separately, the "Lock editing until Edit" feature shipped earlier today
(commits `36b1971b`..`ba767470`) made a closed session's Notes/Location/
Climbing With/Media boxes non-interactive outside Edit mode by rendering them
always but disabling interaction (`canEditMeta` gating). This works, but it's
more complex than necessary now that we're introducing a proper "view mode."

## Goal

For **closed sessions only** (active/in-progress sessions are completely
unaffected — they keep today's single, always-editable box layout, since a
session can't receive likes/comments until it's closed and appears in the
feed):

- `DetailView` gets two distinct modes:
  - **View mode (default)**: a read-only presentation — plain title, plain
    Notes/Location/Climbing With text (hidden when empty, same visibility
    rules as today: `isActive || editMode || hasX`), a photo grid (view-only),
    the full Climbs list (tap for detail, swipe-to-delete — unchanged), and a
    **new Likes + Comments block** at the bottom.
  - **Edit mode** (tap "Edit", same button as today): the existing fully
    interactive box layout (Notes card with edit link, `LocationPicker`,
    `FriendPicker`, Media with add/remove), unchanged from how it worked
    before today's Lock feature — i.e. **no `editable`/`canEditMeta` gating
    at all**, since this layout now only ever renders in Edit mode, where
    it's always fully interactive. The Likes + Comments block still shows at
    the bottom of Edit mode too — it's independent of metadata editing.

- The new Likes + Comments block, in both modes:
  - Shows who liked the session (stacked avatars + count) — read-only, no
    button to like your own session.
  - Shows the full comment thread (reusing `SwipeableComment`), with a
    comment input to add new comments.
  - Comment moderation follows post ownership, not just authorship (see
    below) — and this permission fix applies to the **existing Activity feed
    too**, not just this new view.

## Non-goals

- No change to active-session behavior at all.
- No change to swipe-to-delete on climb cards, or tapping a climb card /
  photo to view it full-screen — all unaffected regardless of mode.
- No session-level "like your own session" button.
- No nested comment replies — flat comment list, same as today.

## Design

### 1. Comment moderation permission (feed + new view)

Today, swiping a comment only ever offers "Delete" (if you authored it) or
presumably "Report" (if you didn't) — this doesn't yet account for **post
ownership**. New rule, applied in both `app/friends.tsx`'s feed and the new
session-detail Likes + Comments block:

- **On your own post/session**: swiping *any* comment reveals **Delete**
  only, regardless of who wrote it. No "Report" option ever appears on your
  own post.
- **On someone else's post/session**: swiping a comment you authored reveals
  **Delete**; swiping a comment authored by someone else reveals **Report**
  (not Delete).

This requires:
- A DB migration updating the `session_comments` DELETE policy to allow
  removal when `auth.uid()` matches either the comment's `user_id` **or**
  the session's owner (need to determine how session ownership maps from
  the `session_id text` column — likely via whatever join `session_likes`/
  `session_comments`'s existing SELECT policies already use in
  `supabase_privacy_fix.sql`).
- `SwipeableComment` (or its caller) needs to know both "is this comment mine"
  and "is this post mine" to decide which single action to reveal.
- A backfilled migration file for the existing (currently uncommitted)
  `comment_likes` table, while touching this area — same file or a
  companion migration, documenting `comment_id`, `user_id` columns and its
  RLS policies as they currently exist in the live DB.

### 2. Extract `SwipeableComment` into its own file

Currently defined inline in `app/friends.tsx` (~lines 90-149), not exported.
Move to `components/SwipeableComment.tsx` unchanged in behavior, so both
`friends.tsx` and `sessions.tsx` can import it. This is a mechanical move, not
a rewrite — its existing props/behavior (swipe reveals action, tap author
avatar, etc.) stay the same, just gains the post-ownership-aware action
logic from Section 1.

### 3. Extract a small `LikesAvatarRow` component

New `components/LikesAvatarRow.tsx`: given a list of likers (name, avatar,
id), renders stacked avatars (up to 3) + "N likes" text, tapping an avatar
navigates to that profile. Extracted because both the feed card and the new
session view render this identical pattern.

### 4. `sessions.tsx`: revert the Lock feature's gating

- `components/LocationPicker.tsx`: remove the `editable?: boolean` prop
  entirely (added in commit `36b1971b`) — revert to its pre-Lock form. It's
  now only ever rendered in Edit mode, where it's always interactive.
- `components/FriendPicker.tsx`: remove the `editable?: boolean` prop
  entirely (added in commits `9d504648`/`805afaa4`) — revert to its pre-Lock
  form, including removing the `focused`-reset effect that existed solely to
  handle the now-removed live `editable` toggling.
- `app/sessions.tsx`: remove `canEditMeta` and all its gated branches (the
  plain-text title fallback, hidden notes-link, `editable={canEditMeta}`
  props, media long-press/add-tile gating) — replaced by the View/Edit mode
  split below. `SessionFriendPicker`'s `editable` passthrough prop is removed
  too.

### 5. `sessions.tsx`: View mode content (new)

Rendered when a session is closed and `editMode` is `false`. Order (top to
bottom), matching today's closed-session section order established by the
"Section Order" feature (commit `e52b0e3e` era) with the new block appended
at the end:

1. Title — plain `Text`, no pencil icon, no touch handler.
2. Notes — plain `Text` (only when non-empty; hidden otherwise, per existing
   `hasNotes` flag).
3. Location — plain `Text` with the location icon (only when non-empty).
4. Climbing With — plain, non-touchable chips (only when there are any).
5. Media — photo thumbnails in a horizontal scroll, tap to view full-screen;
   no "+" tile, no long-press-to-remove (only when there's media).
6. Climbs — full list via `ClimbCard`, tap for detail, swipe-to-delete —
   entirely unchanged from today.
7. **Likes + Comments** (new) — `LikesAvatarRow` (only if there are likes),
   comment thread via `SwipeableComment` (only if there are comments), and a
   comment input box to add a new one. Always rendered (even with zero
   likes/comments) so there's always a way to add the first comment.

### 6. `sessions.tsx`: Edit mode content (mostly unchanged)

Rendered when `editMode` is `true` (tapped "Edit"). Same box layout and
section order the app has today (Notes card w/ edit link, `LocationPicker`,
`FriendPicker`, Media w/ add/remove, then Climbs) — just with all the
Lock-feature gating removed per Section 4, since it's dead code once View
mode exists as a separate render path. The Likes + Comments block (Section 5,
item 7) still renders at the bottom in Edit mode too.

### 7. Likes + Comments data/state (local to `DetailView`)

Unlike the feed (which juggles per-card `Record<string, ...>` maps because it
renders many cards at once), `DetailView` only ever shows one session, so this
is plain local state, fetched once when a closed session's detail opens:

```ts
const [sessionLikes, setSessionLikes] = useState<SessionLike[]>([]);
const [sessionComments, setSessionComments] = useState<SessionComment[]>([]);
const [commentLikesMap, setCommentLikesMap] = useState<Record<string, string[]>>({});
const [commentText, setCommentText] = useState('');
const [commentsExpanded, setCommentsExpanded] = useState(false);
```

Reuses existing `utils/friendsApi.ts` functions unchanged: `getSessionLikes`,
`getSessionComments`, `getCommentLikes`, `addSessionComment`,
`deleteSessionComment`, `likeComment`, `unlikeComment`. No new API functions
needed beyond the permission fix in Section 1.

Comment list shows the first 3 with a "View N more" expander (matching the
feed's existing pattern), controlled by `commentsExpanded`.

## Testing

No test framework in this repo. Manual verification on-device:

- Closed session, no likes/comments: View mode shows just the comment input,
  no likes row.
- Add a comment from the new view → appears there, and identically in the
  Activity feed for that session.
- Like a comment → reflected in both places.
- As session owner: delete a comment authored by someone else, both from the
  feed and from the new session view → succeeds, no "Report" option ever
  shown on your own posts.
- On someone else's session in the feed: only your own comments show
  "Delete"; others show "Report".
- Toggle Edit/Done on a closed session → View mode and Edit mode both render
  correctly, Likes+Comments block stays functional in both.
- Active session: fully unchanged, no View/Edit split, no Likes+Comments
  block.
- Regression-check `LocationPicker`/`FriendPicker` at their other call site
  (`components/LogClimbModal.tsx`) still work correctly after the `editable`
  prop is reverted out.
