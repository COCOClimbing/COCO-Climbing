# Session Detail: View Mode with Likes & Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For closed sessions, replace the current "always-rendered box layout with disabled interactions" (the Lock feature) with two separate trees — a read-only "View mode" (feed-style: plain text, photos, climbs, and a new Likes+Comments block) and an "Edit mode" (today's fully-interactive Notes/Location/Climbing With/Media boxes, reverted to have no gating). Comment moderation also gets a permission fix (post owners can delete any comment on their own post; "Report" never shows on your own post) — applied to both the existing Activity feed and the new session view.

**Architecture:** `SwipeableComment` (currently inline in `app/friends.tsx`) and a new `LikesAvatarRow` become shared components in `components/`. `app/sessions.tsx`'s `DetailView` gains its own local likes/comments state (plain `useState`, not the feed's keyed maps, since it only ever shows one session), reusing the same `utils/friendsApi.ts` functions the feed already calls. The Lock feature's `editable` props on `LocationPicker`/`FriendPicker` are reverted once `sessions.tsx` no longer needs them.

**Tech Stack:** React Native/Expo, TypeScript, Supabase (Postgres + RLS).

---

### Task 1: Database migration — comment delete permission + comment_likes backfill

**Files:**
- Create: `supabase_comment_permissions_fix.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ─── Allow session owners to delete any comment on their own session ────────
-- Comment authors could already delete their own comments (session_comments'
-- original DELETE policy: auth.uid() = user_id). The Activity feed UI
-- (app/friends.tsx) already lets a session owner attempt to delete ANY
-- comment on their own session — see the `isOwn` check at the SwipeableComment
-- call site, which ORs in `entry.friend.id === user?.id` — but the DB policy
-- never granted that, so owner-deletes on other people's comments were
-- silently rejected by RLS. This aligns the policy with what the UI already
-- assumed worked.

DROP POLICY IF EXISTS "Users can delete own comments" ON public.session_comments;

CREATE POLICY "Users can delete own comments or comments on own session"
  ON public.session_comments FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_comments.session_id AND s.user_id = auth.uid()
    )
  );


-- ─── Backfill: comment_likes table ───────────────────────────────────────────
-- This table already exists in production (created directly via the Supabase
-- dashboard/SQL editor) but was never committed to a migration file. This
-- documents it going forward. Uses IF NOT EXISTS / DROP POLICY IF EXISTS
-- throughout so it's safe to run even though the objects likely already
-- exist — if a live policy has a different name than the one below, this
-- just adds a second (redundant but harmless) permissive policy; RLS
-- policies are OR'd together, so no functional conflict.

CREATE TABLE IF NOT EXISTS public.comment_likes (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id uuid REFERENCES public.session_comments ON DELETE CASCADE NOT NULL,
  user_id    uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_comment_like UNIQUE (comment_id, user_id)
);

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Session owner or friends can view comment likes" ON public.comment_likes;
CREATE POLICY "Session owner or friends can view comment likes"
  ON public.comment_likes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.session_comments c
      JOIN public.sessions s ON s.id = c.session_id
      WHERE c.id = comment_likes.comment_id
        AND (
          s.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.friendships f
            WHERE f.status = 'accepted'
              AND ((f.sender_id = auth.uid() AND f.receiver_id = s.user_id)
                OR (f.receiver_id = auth.uid() AND f.sender_id = s.user_id))
          )
        )
    )
  );

DROP POLICY IF EXISTS "Users can like comments" ON public.comment_likes;
CREATE POLICY "Users can like comments" ON public.comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike comments" ON public.comment_likes;
CREATE POLICY "Users can unlike comments" ON public.comment_likes FOR DELETE USING (auth.uid() = user_id);
```

- [ ] **Step 2: Commit**

```bash
git add supabase_comment_permissions_fix.sql
git commit -m "Add migration for comment-delete-by-post-owner and comment_likes backfill"
```

- [ ] **Step 3: Flag for the user**

This file needs to be **manually run in the Supabase SQL editor** by the user — it is not auto-applied by any pipeline (all the other root-level `supabase_*.sql` files in this repo are reference copies applied the same way). Note this clearly when reporting the task done; do not attempt to run it against production yourself.

---

### Task 2: Fix comment-report permission in the Activity feed

**Files:**
- Modify: `app/friends.tsx`

- [ ] **Step 1: Locate the `onReport` prop**

Find the `SwipeableComment` usage inside the comment-thread rendering (search for `onReport={c.user_id !== user?.id`). Currently:

```tsx
onReport={c.user_id !== user?.id ? () => Alert.alert('Report Comment', 'Are you sure you want to report this comment?', [
  { text: 'Cancel', style: 'cancel' },
  { text: 'Report', style: 'destructive', onPress: () => submitReport(c.user_id, c.id, 'comment', 'Inappropriate comment') },
]) : () => {}}
```

- [ ] **Step 2: Also require it's not your own post**

Change to:

```tsx
onReport={(c.user_id !== user?.id && entry.friend.id !== user?.id) ? () => Alert.alert('Report Comment', 'Are you sure you want to report this comment?', [
  { text: 'Cancel', style: 'cancel' },
  { text: 'Report', style: 'destructive', onPress: () => submitReport(c.user_id, c.id, 'comment', 'Inappropriate comment') },
]) : () => {}}
```

This mirrors the existing `isOwn` prop on the same element (`isOwn={c.user_id === user?.id || entry.friend.id === user?.id}`), just negated for the report case — so together: on your own post, `isOwn` is always true (swipe reveals Delete) and `onReport` is always a no-op (long-press does nothing); on someone else's post, `isOwn` and the reportable condition are complementary based on comment authorship, exactly as before.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p . 2>&1 | grep "friends.tsx"`
Expected: no new errors (check against a baseline run first if this file has any pre-existing errors).

- [ ] **Step 4: Commit**

```bash
git add app/friends.tsx
git commit -m "Never show Report on your own post, even for comments you didn't write"
```

---

### Task 3: Extract `SwipeableComment` into its own file

**Files:**
- Create: `components/SwipeableComment.tsx`
- Modify: `app/friends.tsx`

- [ ] **Step 1: Create the new file**

Move the component and its styles verbatim (currently in `app/friends.tsx` around lines 80-150) into a new file. No behavior changes — this is a pure relocation.

```tsx
import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow, parseISO } from 'date-fns';
import SwipeToDelete from './SwipeToDelete';
import { FONTS, SPACING } from '../utils/theme';

export default function SwipeableComment({
  c,
  isOwn,
  onDelete,
  onReport,
  onLike,
  onNamePress,
  colors,
  commentAvatarUrl,
  likedByUserIds,
  currentUserId,
}: {
  c: any;
  isOwn: boolean;
  onDelete: () => void;
  onReport: () => void;
  onLike: () => void;
  onNamePress: () => void;
  colors: any;
  commentAvatarUrl: string | null;
  likedByUserIds: string[];
  currentUserId: string;
}) {
  const liked = likedByUserIds.includes(currentUserId);
  return (
    <SwipeToDelete onDelete={onDelete} disabled={!isOwn} heightOffset={0}>
      <TouchableOpacity
        style={[swipeCommentStyles.row, { backgroundColor: colors.bg }]}
        activeOpacity={0.85}
        onLongPress={onReport}
        delayLongPress={500}
      >
        <TouchableOpacity onPress={onNamePress} activeOpacity={0.7}>
          {commentAvatarUrl
            ? <Image source={{ uri: commentAvatarUrl }} style={swipeCommentStyles.avatar} />
            : <View style={[swipeCommentStyles.avatar, { backgroundColor: colors.border }]} />
          }
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[swipeCommentStyles.name, { color: colors.textPrimary }]}>
            <Text onPress={onNamePress}>{c.profile?.name ?? 'Unknown'}</Text>{' '}
            <Text style={[swipeCommentStyles.text, { color: colors.textSecondary }]}>{c.text}</Text>
          </Text>
          <Text style={[swipeCommentStyles.time, { color: colors.textMuted }]}>
            {formatDistanceToNow(parseISO(c.created_at), { addSuffix: true })}
          </Text>
        </View>
        <TouchableOpacity onPress={onLike} activeOpacity={0.7} style={swipeCommentStyles.likeBtn}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={14} color={liked ? '#e05c4a' : colors.textMuted} />
          {likedByUserIds.length > 0 && (
            <Text style={[swipeCommentStyles.likeCount, { color: liked ? '#e05c4a' : colors.textMuted }]}>
              {likedByUserIds.length}
            </Text>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </SwipeToDelete>
  );
}

const swipeCommentStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start', paddingVertical: 2 },
  avatar: { width: 20, height: 20, borderRadius: 10, marginTop: 2 },
  name: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.semibold },
  text: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular },
  time: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular, marginTop: 2 },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: SPACING.sm, paddingTop: 2 },
  likeCount: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.medium },
});
```

- [ ] **Step 2: Remove it from `app/friends.tsx` and import instead**

Delete the `SwipeableComment` function definition and its `swipeCommentStyles` StyleSheet (lines ~80-150) from `app/friends.tsx`. Add an import near the top (alongside other component imports):

```tsx
import SwipeableComment from '../components/SwipeableComment';
```

Double-check `formatDistanceToNow`/`parseISO` are still imported in `friends.tsx` if used elsewhere in that file independently of this component (they likely are, e.g. for timestamps elsewhere) — don't remove those imports if still needed.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "friends.tsx|SwipeableComment.tsx"`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add components/SwipeableComment.tsx app/friends.tsx
git commit -m "Extract SwipeableComment into its own component"
```

---

### Task 4: Extract `LikesAvatarRow` into its own component

**Files:**
- Create: `components/LikesAvatarRow.tsx`
- Modify: `app/friends.tsx`

- [ ] **Step 1: Create the new component**

This generalizes the existing inline avatar-stack block in `app/friends.tsx` (search for `styles.avatarStack`, around the like-count row) into a reusable component.

```tsx
import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { FONTS, SPACING } from '../utils/theme';

export interface Liker {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export default function LikesAvatarRow({
  likers,
  onPressLiker,
  colors,
}: {
  likers: Liker[];
  onPressLiker?: (liker: Liker) => void;
  colors: any;
}) {
  if (likers.length === 0) return null;
  return (
    <View style={styles.likeCountRow}>
      <View style={styles.avatarStack}>
        {likers.slice(0, 3).map((l, i) => {
          const onPress = onPressLiker ? () => onPressLiker(l) : undefined;
          return l.avatarUrl
            ? (
              <TouchableOpacity key={l.id} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
                <Image source={{ uri: l.avatarUrl }} style={[styles.likeAvatar, { marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i }]} />
              </TouchableOpacity>
            )
            : (
              <TouchableOpacity key={l.id} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
                <View style={[styles.likeAvatar, styles.likeAvatarFallback, { marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i, backgroundColor: colors.border }]} />
              </TouchableOpacity>
            );
        })}
      </View>
      <Text style={[styles.cardCountTxt, { color: colors.textMuted }]}>
        {likers.length} {likers.length === 1 ? 'like' : 'likes'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  likeCountRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  likeAvatar: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#fff' },
  likeAvatarFallback: {},
  cardCountTxt: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular },
});
```

These exact values (20×20 avatars, `xs` count text) are copied from `app/friends.tsx`'s existing `StyleSheet` (`likeAvatar`, `avatarStack`, `cardCountTxt`, `likeCountRow`, `likeAvatarFallback` — around line 2591-2595) so the visual doesn't shift when `friends.tsx` switches to this component in Step 2.

- [ ] **Step 2: Replace the inline block in `app/friends.tsx`**

Find (inside the like-count row, around where `likes.slice(0, 3).map(...)` is):

```tsx
{likes.length > 0 && (
  <View style={styles.likeCountRow}>
    <View style={styles.avatarStack}>
      {likes.slice(0, 3).map((l, i) => {
        const url = l.user_id === user?.id ? myAvatar : l.profile?.avatar_url;
        const onPress = l.user_id !== user?.id ? () => openFriendProfile({ id: l.user_id, name: l.profile?.name ?? 'Unknown', username: '', avatar_url: l.profile?.avatar_url ?? null }, 'activity') : undefined;
        const likeKey = l.id ?? l.user_id ?? String(i);
        return url
          ? <TouchableOpacity key={likeKey} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}><Image source={{ uri: url }} style={[styles.likeAvatar, { marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i }]} /></TouchableOpacity>
          : <TouchableOpacity key={likeKey} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}><View style={[styles.likeAvatar, styles.likeAvatarFallback, { marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i, backgroundColor: colors.border }]} /></TouchableOpacity>;
      })}
    </View>
    <Text style={[styles.cardCountTxt, { color: colors.textMuted }]}>
      {likes.length} {likes.length === 1 ? 'like' : 'likes'}
    </Text>
  </View>
)}
```

Replace with:

```tsx
<LikesAvatarRow
  likers={likes.map(l => ({ id: l.id ?? l.user_id, name: l.profile?.name ?? 'Unknown', avatarUrl: l.user_id === user?.id ? (myAvatar ?? null) : (l.profile?.avatar_url ?? null) }))}
  onPressLiker={(l) => {
    const likeRow = likes.find(x => (x.id ?? x.user_id) === l.id);
    if (likeRow && likeRow.user_id !== user?.id) {
      openFriendProfile({ id: likeRow.user_id, name: likeRow.profile?.name ?? 'Unknown', username: '', avatar_url: likeRow.profile?.avatar_url ?? null }, 'activity');
    }
  }}
  colors={colors}
/>
```

Add the import: `import LikesAvatarRow from '../components/LikesAvatarRow';`

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "friends.tsx|LikesAvatarRow.tsx"`
Expected: no new errors. Visually re-check (via the app, not tsc) that the like row still looks identical to before — same avatar overlap, same "N likes" text.

- [ ] **Step 4: Commit**

```bash
git add components/LikesAvatarRow.tsx app/friends.tsx
git commit -m "Extract LikesAvatarRow into its own component"
```

---

### Task 5: `sessions.tsx` — View/Edit mode split, Likes+Comments block, revert Lock gating

This is the large, central task. **Files:**
- Modify: `app/sessions.tsx`

- [ ] **Step 1: Add imports**

At the top of `app/sessions.tsx`, add:

```tsx
import { formatDistanceToNow } from 'date-fns'; // add alongside existing `import { format, parseISO } from 'date-fns';`
import SwipeableComment from '../components/SwipeableComment';
import LikesAvatarRow from '../components/LikesAvatarRow';
import {
  getSessionLikes, getSessionComments, getCommentLikes,
  addSessionComment, deleteSessionComment, likeComment, unlikeComment,
  SessionLike, SessionComment,
} from '../utils/friendsApi';
import { sendCommentNotification, sendCommentLikeNotification } from '../utils/notifications';
```

Update the `useAuth()` destructure (currently `const { user } = useAuth();` at line 104) to also pull the avatar, matching the pattern `app/friends.tsx` uses:

```tsx
const { user, avatarUrl, localAvatarUri } = useAuth();
```

Update the `useNav()` destructure (line 105) to also pull `viewFriendProfile`:

```tsx
const { tabResetCount, pendingSessionId: navPendingSessionId, clearPendingSessionId, returnTo, setReturnTo, navigate, viewFriendProfile } = useNav();
```

- [ ] **Step 2: Revert `SessionFriendPicker`'s `editable` passthrough**

Find (near the top of the file, the module-scope `SessionFriendPicker` component):

```tsx
function SessionFriendPicker({
  initialFriends,
  onSave,
  scrollToSelf,
  editable,
}: {
  initialFriends: { id: string; name: string }[];
  onSave: (friends: { id: string; name: string }[]) => void;
  scrollToSelf?: (keyboardHeight: number) => void;
  editable?: boolean;
}) {
```
...
```tsx
  return (
    <FriendPicker
      selected={friends}
      onChange={(names) => { setFriends(names); onSave(names); }}
      onFocus={() => { isFocused.current = true; }}
      editable={editable}
    />
  );
}
```

Change back to (drop the `editable` prop entirely):

```tsx
function SessionFriendPicker({
  initialFriends,
  onSave,
  scrollToSelf,
}: {
  initialFriends: { id: string; name: string }[];
  onSave: (friends: { id: string; name: string }[]) => void;
  scrollToSelf?: (keyboardHeight: number) => void;
}) {
```
...
```tsx
  return (
    <FriendPicker
      selected={friends}
      onChange={(names) => { setFriends(names); onSave(names); }}
      onFocus={() => { isFocused.current = true; }}
    />
  );
}
```

(Leave the rest of `SessionFriendPicker` — the keyboard-listener effect, refs — untouched.)

- [ ] **Step 3: Add Likes+Comments local state inside `DetailView`**

Find where `const canEditMeta = isActive || editMode;` is declared (right after `const [editMode, setEditMode] = useState(false);`). Directly below it, add:

```tsx
const [sessionLikes, setSessionLikes] = useState<SessionLike[]>([]);
const [sessionComments, setSessionComments] = useState<SessionComment[]>([]);
const [commentLikesMap, setCommentLikesMap] = useState<Record<string, string[]>>({});
const [commentText, setCommentText] = useState('');
const [commentsExpanded, setCommentsExpanded] = useState(false);

useEffect(() => {
  if (isActive) return;
  Promise.all([
    getSessionLikes(day.sessionId),
    getSessionComments(day.sessionId),
  ]).then(([likes, comments]) => {
    setSessionLikes(likes);
    setSessionComments(comments);
    if (comments.length > 0) {
      getCommentLikes(comments.map(c => c.id)).then(setCommentLikesMap);
    }
  });
}, [day.sessionId, isActive]);
```

- [ ] **Step 4: Add Likes+Comments handlers inside `DetailView`**

Right after the state/effect from Step 3, add:

```tsx
const myAvatar = localAvatarUri ?? avatarUrl;

async function handleCommentLikeToggle(commentId: string, commentAuthorId: string) {
  if (!user) return;
  const likedBy = commentLikesMap[commentId] ?? [];
  const alreadyLiked = likedBy.includes(user.id);
  if (alreadyLiked) {
    await unlikeComment(commentId, user.id);
    setCommentLikesMap(prev => ({ ...prev, [commentId]: likedBy.filter(id => id !== user.id) }));
  } else {
    await likeComment(commentId, user.id);
    setCommentLikesMap(prev => ({ ...prev, [commentId]: [...likedBy, user.id] }));
    if (commentAuthorId !== user.id) {
      sendCommentLikeNotification(commentAuthorId, user.id, user.id).catch(() => {});
    }
  }
}

async function handleDeleteSessionComment(commentId: string) {
  await deleteSessionComment(commentId);
  const updated = await getSessionComments(day.sessionId);
  setSessionComments(updated);
}

async function handleSendSessionComment() {
  if (!user || !commentText.trim()) return;
  try {
    await addSessionComment(day.sessionId, user.id, commentText.trim());
  } catch (err: any) {
    Alert.alert('Could not post comment', err?.message ?? 'Unknown error');
    return;
  }
  setCommentText('');
  Keyboard.dismiss();
  const updated = await getSessionComments(day.sessionId);
  setSessionComments(updated);
  // No notification needed — you're commenting on your own session.
}
```

(`handleCommentLikeToggle`'s third arg to `sendCommentLikeNotification` is `user.id` because in this screen the viewer is always the session owner — matches the feed's `sessionOwnerId` parameter.)

- [ ] **Step 5: Revert the title ternary's dead branch — keep `canEditMeta`, just for title**

Find (in the header, the title's three-way ternary):

```tsx
            ) : canEditMeta ? (
              <TouchableOpacity
                style={styles.detailTitleRow}
                onPress={() => { titleInputValue.current = sessionTitle; setEditingTitle(true); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.detailTitle, { color: colors.textPrimary, flex: 1 }]}>
                  {sessionTitle.trim() || sessionTimeOfDay(day)}
                </Text>
                <Ionicons name="pencil-outline" size={16} color={colors.textMuted} style={{ marginLeft: 6, marginTop: 3 }} />
              </TouchableOpacity>
            ) : (
              <View style={styles.detailTitleRow}>
                <Text style={[styles.detailTitle, { color: colors.textPrimary, flex: 1 }]}>
                  {sessionTitle.trim() || sessionTimeOfDay(day)}
                </Text>
              </View>
            )}
```

**No change needed here** — this is the one place `canEditMeta` legitimately survives. The title lives in the shared header (rendered for both active and closed sessions, both modes), and `isActive || editMode` is still exactly the right condition for whether it should be renameable. Leave it exactly as-is.

- [ ] **Step 6: Revert the Notes edit-link ternary**

Find:

```tsx
          {editingNotes ? (
            <TouchableOpacity onPress={() => handleSaveNotes(notesInputValue.current)} activeOpacity={0.7}>
              <Text style={[styles.metaAction, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>Done</Text>
            </TouchableOpacity>
          ) : canEditMeta ? (
            <TouchableOpacity onPress={() => { notesInputValue.current = sessionNotes; setEditingNotes(true); }} activeOpacity={0.7}>
              <Text style={[styles.metaAction, { color: colors.accent }]}>
                {sessionNotes.trim() ? 'Edit Activity Note' : 'Add Activity Note'}
              </Text>
            </TouchableOpacity>
          ) : null}
```

Change to (this whole `notesSection` will now only ever render inside the Edit-mode tree, so the link is unconditional again):

```tsx
          {editingNotes ? (
            <TouchableOpacity onPress={() => handleSaveNotes(notesInputValue.current)} activeOpacity={0.7}>
              <Text style={[styles.metaAction, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>Done</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => { notesInputValue.current = sessionNotes; setEditingNotes(true); }} activeOpacity={0.7}>
              <Text style={[styles.metaAction, { color: colors.accent }]}>
                {sessionNotes.trim() ? 'Edit Activity Note' : 'Add Activity Note'}
              </Text>
            </TouchableOpacity>
          )}
```

- [ ] **Step 7: Revert `locationSection`'s `editable` prop**

Find:

```tsx
    const locationSection = (
      <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Text style={[styles.metaLabel, { color: colors.textMuted }]}>LOCATION</Text>
        <View style={{ marginBottom: -SPACING.md }}>
          <LocationPicker
            value={sessionLocation}
            onChange={(loc) => {
              setSessionLocation(loc);
              handleSaveSessionMeta(sessionNotes, sessionFriends, loc, sessionMediaItems);
            }}
            editable={canEditMeta}
          />
        </View>
      </View>
    );
```

Change to (drop `editable={canEditMeta}`):

```tsx
    const locationSection = (
      <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Text style={[styles.metaLabel, { color: colors.textMuted }]}>LOCATION</Text>
        <View style={{ marginBottom: -SPACING.md }}>
          <LocationPicker
            value={sessionLocation}
            onChange={(loc) => {
              setSessionLocation(loc);
              handleSaveSessionMeta(sessionNotes, sessionFriends, loc, sessionMediaItems);
            }}
          />
        </View>
      </View>
    );
```

- [ ] **Step 8: Revert `friendsSection`'s `editable` prop**

Find the `editable={canEditMeta}` line inside `friendsSection`'s `<SessionFriendPicker ... />` and remove it (the prop no longer exists on `SessionFriendPicker` after Step 2 anyway, so this must land in the same commit as Step 2).

- [ ] **Step 9: Revert media long-press/add-tile gating**

Find:

```tsx
    const mediaSection = (
      <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Text style={[styles.metaLabel, { color: colors.textMuted }]}>MEDIA</Text>
        {allMedia.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.sm }}>
            {allMedia.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => { setViewerUris(allMedia.map(m => m.uri)); setViewerIndex(idx); setViewerVisible(true); }}
                onLongPress={canEditMeta ? () => item.fromClimb ? handleRemoveClimbMediaItem(item.climbId, item.uri) : handleRemoveSessionMediaItem(item.sessionIndex) : undefined}
                activeOpacity={0.9}
                delayLongPress={400}
                style={{ marginRight: SPACING.sm }}
              >
                <Image source={{ uri: item.uri }} style={styles.mediaThumbnail} resizeMode="cover" />
              </TouchableOpacity>
            ))}
            {canEditMeta && (
              <TouchableOpacity
                style={[styles.mediaThumbnail, styles.mediaAddTile, { borderColor: colors.border, backgroundColor: colors.bg }]}
                onPress={handlePickSessionMedia}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 30, color: colors.textMuted }}>+</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        ) : (
          canEditMeta && (
            <TouchableOpacity
              style={[styles.mediaBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}
              onPress={handlePickSessionMedia}
              activeOpacity={0.7}
            >
              <Text style={[styles.mediaBtnText, { color: colors.textSecondary }]}>+ Add Photo</Text>
            </TouchableOpacity>
          )
        )}
      </View>
    );
```

Change to (unconditional again — this whole `mediaSection` will now only ever render inside the Edit-mode tree):

```tsx
    const mediaSection = (
      <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Text style={[styles.metaLabel, { color: colors.textMuted }]}>MEDIA</Text>
        {allMedia.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.sm }}>
            {allMedia.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => { setViewerUris(allMedia.map(m => m.uri)); setViewerIndex(idx); setViewerVisible(true); }}
                onLongPress={() => item.fromClimb ? handleRemoveClimbMediaItem(item.climbId, item.uri) : handleRemoveSessionMediaItem(item.sessionIndex)}
                activeOpacity={0.9}
                delayLongPress={400}
                style={{ marginRight: SPACING.sm }}
              >
                <Image source={{ uri: item.uri }} style={styles.mediaThumbnail} resizeMode="cover" />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.mediaThumbnail, styles.mediaAddTile, { borderColor: colors.border, backgroundColor: colors.bg }]}
              onPress={handlePickSessionMedia}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 30, color: colors.textMuted }}>+</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <TouchableOpacity
            style={[styles.mediaBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}
            onPress={handlePickSessionMedia}
            activeOpacity={0.7}
          >
            <Text style={[styles.mediaBtnText, { color: colors.textSecondary }]}>+ Add Photo</Text>
          </TouchableOpacity>
        )}
      </View>
    );
```

- [ ] **Step 10: Build the new View-mode content consts**

Directly below the existing `mediaSection` const (before the `return (` that starts the JSX), add the new read-only versions plus the Likes+Comments block:

```tsx
    const notesViewSection = hasNotes ? (
      <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Text style={[styles.metaLabel, { color: colors.textMuted }]}>NOTES</Text>
        <Text style={[styles.notesText, { color: colors.textSecondary }]}>{sessionNotes}</Text>
      </View>
    ) : null;

    const locationViewSection = hasLocation ? (
      <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Text style={[styles.metaLabel, { color: colors.textMuted }]}>LOCATION</Text>
        <View style={styles.viewLocationRow}>
          <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.viewLocationText, { color: colors.textPrimary }]} numberOfLines={1}>{sessionLocation}</Text>
        </View>
      </View>
    ) : null;

    const friendsViewSection = hasFriends ? (
      <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Text style={[styles.metaLabel, { color: colors.textMuted }]}>CLIMBING WITH</Text>
        <View style={styles.viewChips}>
          {sessionFriends.map(f => (
            <View key={f.id} style={[styles.viewChip, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
              <Text style={[styles.viewChipText, { color: colors.accent }]}>{f.name}</Text>
            </View>
          ))}
        </View>
      </View>
    ) : null;

    const mediaViewSection = hasMedia ? (
      <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Text style={[styles.metaLabel, { color: colors.textMuted }]}>MEDIA</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.sm }}>
          {allMedia.map((item, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => { setViewerUris(allMedia.map(m => m.uri)); setViewerIndex(idx); setViewerVisible(true); }}
              activeOpacity={0.9}
              style={{ marginRight: SPACING.sm }}
            >
              <Image source={{ uri: item.uri }} style={styles.mediaThumbnail} resizeMode="cover" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    ) : null;

    const visibleComments = commentsExpanded ? sessionComments : sessionComments.slice(0, 3);
    const hiddenCommentCount = sessionComments.length - 3;

    const likesCommentsSection = (
      <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Text style={[styles.metaLabel, { color: colors.textMuted }]}>ACTIVITY</Text>
        <LikesAvatarRow
          likers={sessionLikes.map(l => ({ id: l.id, userId: l.user_id, name: l.profile?.name ?? 'Unknown', avatarUrl: l.user_id === user?.id ? (myAvatar ?? null) : (l.profile?.avatar_url ?? null) }))}
          onPressLiker={(l) => viewFriendProfile({ id: l.userId, name: l.name, username: '', avatar_url: l.avatarUrl })}
          currentUserId={user?.id}
          colors={colors}
        />
        {sessionComments.length > 0 && (
          <View style={{ marginTop: SPACING.sm }}>
            {visibleComments.map(c => (
              <SwipeableComment
                key={c.id}
                c={c}
                isOwn // this screen only ever shows your own session, so you can always delete
                onDelete={() => handleDeleteSessionComment(c.id)}
                onReport={() => {}} // never reportable on your own post
                onLike={() => handleCommentLikeToggle(c.id, c.user_id)}
                onNamePress={() => {
                  if (c.user_id === user?.id) return;
                  viewFriendProfile({ id: c.user_id, name: c.profile?.name ?? 'Unknown', username: c.profile?.username ?? '', avatar_url: c.profile?.avatar_url ?? null });
                }}
                colors={colors}
                commentAvatarUrl={c.user_id === user?.id ? (myAvatar ?? null) : (c.profile?.avatar_url ?? null)}
                likedByUserIds={commentLikesMap[c.id] ?? []}
                currentUserId={user?.id ?? ''}
              />
            ))}
            {!commentsExpanded && hiddenCommentCount > 0 && (
              <TouchableOpacity onPress={() => setCommentsExpanded(true)} activeOpacity={0.7}>
                <Text style={[styles.commentShowMore, { color: colors.textMuted }]}>View {hiddenCommentCount} more comment{hiddenCommentCount > 1 ? 's' : ''}</Text>
              </TouchableOpacity>
            )}
            {commentsExpanded && sessionComments.length > 3 && (
              <TouchableOpacity onPress={() => setCommentsExpanded(false)} activeOpacity={0.7}>
                <Text style={[styles.commentShowMore, { color: colors.textMuted }]}>Show less</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        <View style={[styles.viewCommentInputRow, { borderColor: colors.border, backgroundColor: colors.bg }]}>
          <TextInput
            style={[styles.viewCommentInputText, { color: colors.textPrimary }]}
            placeholder="Add a comment..."
            placeholderTextColor={colors.textMuted}
            value={commentText}
            onChangeText={setCommentText}
            multiline
          />
          <TouchableOpacity onPress={handleSendSessionComment} activeOpacity={0.7}>
            <Ionicons name="send" size={18} color={commentText.trim() ? colors.accent : colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    );
```

`SwipeableComment`'s `c` prop is typed `any` in the component itself, so passing a `SessionComment` is fine as-is.

- [ ] **Step 11: Add the new styles**

Find the `StyleSheet.create({...})` block at the bottom of the file (search for `mediaThumbnail:`) and add nearby:

```tsx
  viewLocationRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  viewLocationText: { flex: 1, fontSize: FONTS.sizes.md },
  viewChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  viewChip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs },
  viewChipText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.medium },
  commentShowMore: { fontSize: FONTS.sizes.sm, marginTop: SPACING.xs },
  viewCommentInputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderWidth: 1, borderRadius: 8, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, marginTop: SPACING.sm },
  viewCommentInputText: { flex: 1, fontSize: FONTS.sizes.sm, maxHeight: 80 },
```

- [ ] **Step 12: Restructure the top-level content assembly into a three-way split**

Find:

```tsx
          {isActive ? (
            <>
              {climbsSection}
              {showNotes && notesSection}
              {showLocation && locationSection}
              {showFriends && friendsSection}
              {showMedia && mediaSection}
            </>
          ) : (
            <>
              {showNotes && notesSection}
              {showLocation && locationSection}
              {showFriends && friendsSection}
              {showMedia && mediaSection}
              {climbsSection}
            </>
          )}
```

Change to:

```tsx
          {isActive ? (
            <>
              {climbsSection}
              {showNotes && notesSection}
              {showLocation && locationSection}
              {showFriends && friendsSection}
              {showMedia && mediaSection}
            </>
          ) : editMode ? (
            <>
              {showNotes && notesSection}
              {showLocation && locationSection}
              {showFriends && friendsSection}
              {showMedia && mediaSection}
              {climbsSection}
              {likesCommentsSection}
            </>
          ) : (
            <>
              {notesViewSection}
              {locationViewSection}
              {friendsViewSection}
              {mediaViewSection}
              {climbsSection}
              {likesCommentsSection}
            </>
          )}
```

Since `isActive` is never true at the same time as the `editMode`/View-mode branches (active sessions never enter `editMode` — the Edit button only renders `{!isActive && ...}`), this is safe: for active sessions the first branch always matches; for closed sessions, `editMode` decides between the second (today's interactive layout) and third (new read-only layout, this task's main deliverable) branches.

- [ ] **Step 13: Remove now-unused `showNotes`/`hasNotes` complexity? No — keep them**

`hasNotes`/`hasLocation`/`hasFriends`/`hasMedia` and `showNotes`/`showLocation`/`showFriends`/`showMedia` are all still used (by the Edit-mode branch, and `hasNotes`/`hasLocation`/`hasFriends`/`hasMedia` directly by the new View-mode branch above). Do not remove them.

- [ ] **Step 14: Verify**

Run: `npx tsc --noEmit -p . 2>&1 | grep "sessions.tsx"`
Expected: the same two pre-existing baseline errors this file already has (a `days`-used-before-declaration error around line 122-125, and a `sessionIndex` property error inside the media union type) — no new errors. Note: since `canEditMeta` is now only used once (for the title), double check tsc doesn't flag it as declared-but-only-read-once in some odd way (it won't — that's not a TS error class, just confirming no `noUnusedLocals` issue since it IS used).

- [ ] **Step 15: Commit**

```bash
git add app/sessions.tsx
git commit -m "Split closed-session detail into View mode and Edit mode, add Likes+Comments"
```

---

### Task 6: Revert `components/LocationPicker.tsx`

**Files:**
- Modify: `components/LocationPicker.tsx`

- [ ] **Step 1: Remove the `editable` prop**

Find:

```tsx
interface Props {
  value: string;
  onChange: (value: string) => void;
  editable?: boolean;
}

export default function LocationPicker({ value, onChange, editable = true }: Props) {
```

Change to:

```tsx
interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function LocationPicker({ value, onChange }: Props) {
```

- [ ] **Step 2: Revert the field `TouchableOpacity`**

Find:

```tsx
      <TouchableOpacity
        style={[styles.field, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
        onPress={() => editable && setModalVisible(true)}
        activeOpacity={editable ? 0.7 : 1}
        disabled={!editable}
      >
        <Ionicons name="location-outline" size={16} color={value ? colors.textSecondary : colors.textMuted} />
        <Text style={[styles.fieldText, { color: value ? colors.textPrimary : colors.textMuted, fontFamily: FONTS.family.regular }]} numberOfLines={1}>
          {value || 'Location / gym / crag'}
        </Text>
        {editable ? (
          value ? (
            <TouchableOpacity onPress={(e) => { e.stopPropagation(); onChange(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : (
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          )
        ) : null}
      </TouchableOpacity>
```

Change to:

```tsx
      <TouchableOpacity
        style={[styles.field, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="location-outline" size={16} color={value ? colors.textSecondary : colors.textMuted} />
        <Text style={[styles.fieldText, { color: value ? colors.textPrimary : colors.textMuted, fontFamily: FONTS.family.regular }]} numberOfLines={1}>
          {value || 'Location / gym / crag'}
        </Text>
        {value ? (
          <TouchableOpacity onPress={(e) => { e.stopPropagation(); onChange(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        )}
      </TouchableOpacity>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p . 2>&1 | grep "LocationPicker.tsx"`
Expected: no output. This also confirms Task 5 already stopped passing `editable` (otherwise this would now be a type error at the `sessions.tsx` call site).

- [ ] **Step 4: Commit**

```bash
git add components/LocationPicker.tsx
git commit -m "Revert LocationPicker's editable prop (now unused after view/edit mode split)"
```

---

### Task 7: Revert `components/FriendPicker.tsx`

**Files:**
- Modify: `components/FriendPicker.tsx`

- [ ] **Step 1: Remove the `editable` prop and the focused-reset effect**

Find:

```tsx
interface Props {
  selected: SelectedFriend[];
  onChange: (friends: SelectedFriend[]) => void;
  onFocus?: () => void;
  onDropdownChange?: (open: boolean) => void;
  dropup?: boolean;
  editable?: boolean;
}

export default function FriendPicker({ selected, onChange, onFocus, onDropdownChange, dropup, editable = true }: Props) {
```

Change to:

```tsx
interface Props {
  selected: SelectedFriend[];
  onChange: (friends: SelectedFriend[]) => void;
  onFocus?: () => void;
  onDropdownChange?: (open: boolean) => void;
  dropup?: boolean;
}

export default function FriendPicker({ selected, onChange, onFocus, onDropdownChange, dropup }: Props) {
```

Find and remove the effect added specifically to handle live `editable` toggling:

```tsx
useEffect(() => {
  if (!editable) setFocused(false);
}, [editable]);
```

- [ ] **Step 2: Revert the chips render and search/dropdown gating**

Find:

```tsx
      {selected.length > 0 && (
        <View style={styles.chips}>
          {selected.map(s => (
            editable ? (
              <TouchableOpacity
                key={s.id}
                onPress={() => handleRemove(s.id)}
                style={[styles.chip, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, { color: colors.accent }]}>{s.name}</Text>
                <Text style={[styles.chipX, { color: colors.accent }]}>×</Text>
              </TouchableOpacity>
            ) : (
              <View
                key={s.id}
                style={[styles.chip, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
              >
                <Text style={[styles.chipText, { color: colors.accent }]}>{s.name}</Text>
              </View>
            )
          ))}
        </View>
      )}

      {editable && (
        <>
          {/* Search input */}
          <View style={[styles.inputRow, { backgroundColor: colors.bgElevated, borderColor: focused ? colors.accent : colors.border }]}>
```

...(and the matching closing `</>` /`)}` around the dropdown block further down)...

Change to (drop the ternary and the `editable &&` wrapper, back to always-editable):

```tsx
      {selected.length > 0 && (
        <View style={styles.chips}>
          {selected.map(s => (
            <TouchableOpacity
              key={s.id}
              onPress={() => handleRemove(s.id)}
              style={[styles.chip, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, { color: colors.accent }]}>{s.name}</Text>
              <Text style={[styles.chipX, { color: colors.accent }]}>×</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Search input */}
      <View style={[styles.inputRow, { backgroundColor: colors.bgElevated, borderColor: focused ? colors.accent : colors.border }]}>
```

...with the dropdown block below un-wrapped from its `<>...</>` fragment (remove the `{editable && (` opening and its matching `)}` closing, keep everything between them as direct children of the outer `View`, same as before Lock feature's Task 2 ever touched this file).

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p . 2>&1 | grep "FriendPicker.tsx"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add components/FriendPicker.tsx
git commit -m "Revert FriendPicker's editable prop (now unused after view/edit mode split)"
```

---

### Task 8: Manual verification

No test framework in this repo. This is a native RN/Expo app — hand off to the user for on-device testing:

- Closed session, no likes/comments: View mode shows just the comment input under a new "ACTIVITY" card, no likes row.
- Add a comment from the session's View mode → appears there, and identically in the Activity feed for that same session.
- Like a comment from the session view → reflected when viewing the same session's card in the Activity feed, and vice versa.
- As session owner: delete a comment authored by someone else (in the feed, and in the new session view) → succeeds (requires Task 1's migration to have been run in Supabase), and confirm no "Report" option ever appears when swiping/long-pressing a comment on your own post.
- On someone else's session in the feed: only your own comments show swipe-to-delete; others show report-on-long-press instead.
- Toggle Edit/Done on a closed session → View mode and Edit mode both render correctly (Notes/Location/Climbing With/Media fully interactive in Edit; plain and non-touchable in View), and the Likes+Comments block stays functional at the bottom of both.
- Active session: fully unchanged — no View/Edit split, no Likes+Comments block, title/notes/location/friends/media all directly editable as before.
- Regression-check `LocationPicker`/`FriendPicker` at their other call site (`components/LogClimbModal.tsx`) — confirm logging a climb still lets you set location and tag friends normally.
- Tapping a liker's or commenter's avatar (someone other than yourself) navigates to their profile.
