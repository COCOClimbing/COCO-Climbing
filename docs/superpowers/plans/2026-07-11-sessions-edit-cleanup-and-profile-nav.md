# Sessions Edit Cleanup and Context-Aware Profile Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the redundant likes/comments section from the Sessions tab's Edit modal, make "← Back" from a profile return to whichever screen you actually opened it from (not always the Activity feed), and make session card partner chips tappable to view that person's profile.

**Architecture:** Task 1 deletes dead-after-removal JSX/state/handlers from `SessionEditModalContent` in `app/sessions.tsx`. Task 2 extends the existing `returnTo` navigation-memory mechanism (already used by `navigateToSession`) to `viewFriendProfile`, and updates `FriendDetailView`'s top-level `onBack` in `app/friends.tsx` to consult it. Task 3 makes `components/SessionCard.tsx`'s partner chips tappable via the `onViewProfile` prop the component already receives.

**Tech Stack:** React Native / Expo, TypeScript.

---

### Task 1: Remove the Edit modal's Activity section

**Files:**
- Modify: `app/sessions.tsx`

- [ ] **Step 1: Remove the likes/comments state**

Delete these five lines (currently `app/sessions.tsx:106-110`):

```ts
  const [editSessionLikes, setEditSessionLikes] = useState<SessionLike[]>([]);
  const [editSessionComments, setEditSessionComments] = useState<SessionComment[]>([]);
  const [editCommentLikesMap, setEditCommentLikesMap] = useState<Record<string, string[]>>({});
  const [editCommentText, setEditCommentText] = useState('');
  const [editCommentsExpanded, setEditCommentsExpanded] = useState(false);
```

- [ ] **Step 2: Remove the fetch effect and the three handler functions**

Delete this entire block (currently `app/sessions.tsx:138-182`, immediately following the state declarations removed in Step 1):

```ts
  useEffect(() => {
    if (!selectedDay) return;
    Promise.all([
      getSessionLikes(selectedDay.sessionId),
      getSessionComments(selectedDay.sessionId),
    ]).then(([likes, comments]) => {
      setEditSessionLikes(likes);
      setEditSessionComments(comments);
      if (comments.length > 0) {
        getCommentLikes(comments.map(c => c.id)).then(setEditCommentLikesMap);
      }
    });
  }, [selectedDay?.sessionId]);

  async function handleEditCommentLikeToggle(commentId: string, commentAuthorId: string) {
    if (!user) return;
    const likedBy = editCommentLikesMap[commentId] ?? [];
    const alreadyLiked = likedBy.includes(user.id);
    if (alreadyLiked) {
      await unlikeComment(commentId, user.id);
      setEditCommentLikesMap(prev => ({ ...prev, [commentId]: likedBy.filter(id => id !== user.id) }));
    } else {
      await likeComment(commentId, user.id);
      setEditCommentLikesMap(prev => ({ ...prev, [commentId]: [...likedBy, user.id] }));
      if (commentAuthorId !== user.id && selectedDay) {
        sendCommentLikeNotification(commentAuthorId, user.id, selectedDay.sessionId).catch(() => {});
      }
    }
  }

  async function handleEditDeleteSessionComment(commentId: string) {
    if (!selectedDay) return;
    await deleteSessionComment(commentId);
    const updated = await getSessionComments(selectedDay.sessionId);
    setEditSessionComments(updated);
  }

  async function handleEditSendSessionComment() {
    if (!user || !editCommentText.trim() || !selectedDay) return;
    await addSessionComment(selectedDay.sessionId, user.id, editCommentText.trim());
    setEditCommentText('');
    Keyboard.dismiss();
    const updated = await getSessionComments(selectedDay.sessionId);
    setEditSessionComments(updated);
  }

```

Leave the very next block (`// Sync editing state when a different session is opened`) and everything after it untouched.

- [ ] **Step 3: Remove the now-dead scroll/comment-input refs**

Delete these three lines inside `SessionEditModalContent` (currently `app/sessions.tsx:1001-1003`):

```ts
    const editModalScrollRef = useRef<ScrollView>(null);
    const editModalScrollY = useRef(0);
    const editCommentInputRef = useRef<View>(null);
```

- [ ] **Step 4: Simplify the main `ScrollView`'s props**

Change (currently `app/sessions.tsx:1029-1034`):

```tsx
        <ScrollView
          ref={editModalScrollRef}
          scrollEventThrottle={16}
          onScroll={e => { editModalScrollY.current = e.nativeEvent.contentOffset.y; }}
          contentContainerStyle={styles.detailContent}
          keyboardShouldPersistTaps="never"
        >
```

to:

```tsx
        <ScrollView
          contentContainerStyle={styles.detailContent}
          keyboardShouldPersistTaps="never"
        >
```

- [ ] **Step 5: Remove the now-dead `visibleEditComments`/`hiddenEditCommentCount` computation**

Delete these two lines inside `SessionEditModalContent` (currently `app/sessions.tsx:1018-1019`):

```ts
    const visibleEditComments = editCommentsExpanded ? editSessionComments : editSessionComments.slice(0, 3);
    const hiddenEditCommentCount = editSessionComments.length - 3;
```

- [ ] **Step 6: Remove the Activity section JSX**

Delete this entire block (currently `app/sessions.tsx:1213-1278`, between the "+ Add Climb" button and the "Actions" section):

```tsx
          {/* Likes + Comments */}
          <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <Text style={[styles.metaLabel, { color: colors.textMuted }]}>ACTIVITY</Text>
            <LikesAvatarRow
              likers={editSessionLikes.map(l => ({ id: l.id, userId: l.user_id, name: l.profile?.name ?? 'Unknown', avatarUrl: l.user_id === user?.id ? (localAvatarUri ?? avatarUrl ?? null) : (l.profile?.avatar_url ?? null) }))}
              onPressLiker={(l) => viewFriendProfile({ id: l.userId, name: l.name, username: '', avatar_url: l.avatarUrl })}
              currentUserId={user?.id}
              colors={colors}
            />
            {editSessionComments.length > 0 && (
              <View style={{ marginTop: SPACING.sm }}>
                {visibleEditComments.map(c => (
                  <SwipeableComment
                    key={c.id}
                    c={c}
                    isOwn
                    onDelete={() => handleEditDeleteSessionComment(c.id)}
                    onReport={() => {}}
                    onLike={() => handleEditCommentLikeToggle(c.id, c.user_id)}
                    onNamePress={() => {
                      if (c.user_id === user?.id) return;
                      viewFriendProfile({ id: c.user_id, name: c.profile?.name ?? 'Unknown', username: c.profile?.username ?? '', avatar_url: c.profile?.avatar_url ?? null });
                    }}
                    colors={colors}
                    commentAvatarUrl={c.user_id === user?.id ? (localAvatarUri ?? avatarUrl ?? null) : (c.profile?.avatar_url ?? null)}
                    likedByUserIds={editCommentLikesMap[c.id] ?? []}
                    currentUserId={user?.id ?? ''}
                  />
                ))}
                {!editCommentsExpanded && hiddenEditCommentCount > 0 && (
                  <TouchableOpacity onPress={() => setEditCommentsExpanded(true)} activeOpacity={0.7}>
                    <Text style={[styles.commentShowMore, { color: colors.textMuted }]}>View {hiddenEditCommentCount} more comment{hiddenEditCommentCount > 1 ? 's' : ''}</Text>
                  </TouchableOpacity>
                )}
                {editCommentsExpanded && editSessionComments.length > 3 && (
                  <TouchableOpacity onPress={() => setEditCommentsExpanded(false)} activeOpacity={0.7}>
                    <Text style={[styles.commentShowMore, { color: colors.textMuted }]}>Show less</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            <View ref={editCommentInputRef} style={[styles.viewCommentInputRow, { borderColor: colors.border, backgroundColor: colors.bg }]}>
              <TextInput
                style={[styles.viewCommentInputText, { color: colors.textPrimary }]}
                placeholder="Add a comment..."
                placeholderTextColor={colors.textMuted}
                value={editCommentText}
                onChangeText={setEditCommentText}
                onFocus={() => {
                  setTimeout(() => {
                    editCommentInputRef.current?.measure((_fx, _fy, _w, _h, _px, py) => {
                      const targetScreenY = 300;
                      const scrollDelta = py - targetScreenY;
                      const newY = Math.max(0, editModalScrollY.current + scrollDelta);
                      editModalScrollRef.current?.scrollTo({ y: newY, animated: true });
                    });
                  }, 320);
                }}
                multiline
              />
              <TouchableOpacity onPress={handleEditSendSessionComment} activeOpacity={0.7}>
                <Ionicons name="send" size={18} color={editCommentText.trim() ? colors.accent : colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

```

Leave the very next line (`{/* Actions */}` and everything after it) untouched.

- [ ] **Step 7: Check for now-unused imports**

After the above deletions, check whether any of these imports (used only by the removed code) are now fully unused elsewhere in `app/sessions.tsx`, and remove any that are: `SessionLike`, `SessionComment` (from `../utils/friendsApi`), `getSessionLikes`, `getSessionComments`, `getCommentLikes`, `addSessionComment`, `deleteSessionComment`, `likeComment`, `unlikeComment` (also from `../utils/friendsApi`), `sendCommentLikeNotification` (from `../utils/notifications`), `LikesAvatarRow`, `SwipeableComment` (component imports). Use `grep -c` for each symbol name against the file before removing any import — some of these may still be used elsewhere in the file (e.g. by `ActiveSessionCard`, which has its own separate likes/comments-adjacent code, or may not — verify each individually rather than assuming). Only remove an import if its symbol has zero remaining references after Steps 1-6.

- [ ] **Step 8: Type-check**

Run `npx tsc --noEmit`. Confirm no new errors versus the current baseline (25 total `error TS` lines across the repo as of this plan).

- [ ] **Step 9: Commit**

```bash
git add app/sessions.tsx
git commit -m "Remove redundant likes/comments section from the Sessions tab Edit modal"
```

---

### Task 2: Context-aware profile back-navigation

**Files:**
- Modify: `utils/NavigationContext.tsx`
- Modify: `app/friends.tsx`

- [ ] **Step 1: Capture the origin screen in `viewFriendProfile`**

In `utils/NavigationContext.tsx`, change:

```ts
  function viewFriendProfile(profile: PendingFriendProfile) {
    setPendingFriendProfile(profile);
    setScreen('friends');
    setDrawerOpen(false);
    setNavCount(c => c + 1);
  }
```

to:

```ts
  function viewFriendProfile(profile: PendingFriendProfile) {
    if (screen !== 'friends') setReturnTo(screen);
    setPendingFriendProfile(profile);
    setScreen('friends');
    setDrawerOpen(false);
    setNavCount(c => c + 1);
  }
```

This only records `returnTo` when the jump is a genuine cross-screen navigation (Sessions tab, Account screen, etc.) — if you're already on the Activity screen and tap from one profile straight into another, it leaves whatever `returnTo` was already there untouched (see Task 2 Step 2 for why that matters).

- [ ] **Step 2: Clear `returnTo` on same-screen profile navigation**

In `app/friends.tsx`, change the local `openFriendProfile` function (currently at `app/friends.tsx:1342-1345`, called when a name is tapped on a card that's already part of the Activity screen — the main feed, the followers/following list, etc.):

```ts
  function openFriendProfile(friend: FriendProfile, source: 'activity' | 'friends' = 'activity') {
    setFriendSource(source);
    setViewingFriend(friend);
  }
```

to:

```ts
  function openFriendProfile(friend: FriendProfile, source: 'activity' | 'friends' = 'activity') {
    setReturnTo(null);
    setFriendSource(source);
    setViewingFriend(friend);
  }
```

This prevents a stale cross-screen `returnTo` (e.g. left over from an earlier Sessions-tab visit that the user didn't dismiss via "← Back") from incorrectly redirecting a same-screen profile view's back button.

- [ ] **Step 3: Add `returnTo` to the `useNav()` destructure in `FriendsScreen`**

Change (currently `app/friends.tsx:749`):

```ts
  const { navigate, screen, setReturnTo, friendsOpen, openFriends, closeFriends, navCount, tabResetCount, pendingFriendProfile, clearPendingFriendProfile, pendingActivitySessionId, clearPendingActivitySessionId } = useNav();
```

to:

```ts
  const { navigate, screen, returnTo, setReturnTo, friendsOpen, openFriends, closeFriends, navCount, tabResetCount, pendingFriendProfile, clearPendingFriendProfile, pendingActivitySessionId, clearPendingActivitySessionId } = useNav();
```

- [ ] **Step 4: Consult `returnTo` in the top-level `FriendDetailView`'s `onBack`**

Change (currently `app/friends.tsx:1679-1686`):

```tsx
          onBack={() => {
            setViewingFriend(null);
            if (friendSource === 'friends') openFriends();
            else {
              const y = feedScrollY.current;
              if (y > 0) setTimeout(() => feedScrollRef.current?.scrollTo({ y, animated: false }), 50);
            }
          }}
```

to:

```tsx
          onBack={() => {
            setViewingFriend(null);
            if (returnTo && returnTo !== 'friends') {
              const dest = returnTo;
              setReturnTo(null);
              navigate(dest);
            } else if (friendSource === 'friends') {
              openFriends();
            } else {
              const y = feedScrollY.current;
              if (y > 0) setTimeout(() => feedScrollRef.current?.scrollTo({ y, animated: false }), 50);
            }
          }}
```

Do not touch the nested `FriendDetailView` inside the followers/following list-sheet Modal (the one using `listSheetProfile`/`onBack={() => setListSheetProfile(null)}`) — that's a separate, local-only navigation and is out of scope per the design spec.

- [ ] **Step 5: Type-check**

Run `npx tsc --noEmit`. Confirm no new errors versus the current baseline.

- [ ] **Step 6: Commit**

```bash
git add utils/NavigationContext.tsx app/friends.tsx
git commit -m "Make back-navigation from a profile return to wherever it was opened from"
```

---

### Task 3: Tappable partner chips on `SessionCard`

**Files:**
- Modify: `components/SessionCard.tsx`

- [ ] **Step 1: Make each partner chip tappable**

Change (currently `components/SessionCard.tsx:184-196`):

```tsx
      {/* Climbing with */}
      {!condensed && hasFriends && (
        <View style={styles.partnersRow}>
          <Text style={[styles.partnersLabel, { color: colors.textMuted }]}>with </Text>
          {day.friends!.map((f, i) => (
            <View key={f.id} style={styles.partnerChip}>
              <InitialsAvatar name={f.name} colors={colors} />
              <Text style={[styles.partnerName, { color: colors.accent }]}>
                {f.name}{i < day.friends!.length - 1 ? ',' : ''}
              </Text>
            </View>
          ))}
        </View>
      )}
```

to:

```tsx
      {/* Climbing with */}
      {!condensed && hasFriends && (
        <View style={styles.partnersRow}>
          <Text style={[styles.partnersLabel, { color: colors.textMuted }]}>with </Text>
          {day.friends!.map((f, i) => (
            <TouchableOpacity
              key={f.id}
              style={styles.partnerChip}
              activeOpacity={0.7}
              onPress={() => {
                if (f.id === currentUserId) return;
                onViewProfile({ id: f.id, name: f.name, username: '', avatar_url: null });
              }}
            >
              <InitialsAvatar name={f.name} colors={colors} />
              <Text style={[styles.partnerName, { color: colors.accent }]}>
                {f.name}{i < day.friends!.length - 1 ? ',' : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
```

`TouchableOpacity` is already imported in this file (used extensively elsewhere), so no new import is needed.

- [ ] **Step 2: Type-check**

Run `npx tsc --noEmit`. Confirm no new errors versus the current baseline.

- [ ] **Step 3: Commit**

```bash
git add components/SessionCard.tsx
git commit -m "Make session card partner chips tappable to view their profile"
```

---

### Task 4: Manual verification

**Files:** none (verification only)

This is a native Expo app — verification must happen in a simulator or on a physical device, not a browser preview.

- [ ] **Step 1: Open a closed session's Edit modal.** Confirm there is no likes/comments/"ACTIVITY" section anywhere in it, and every other section (Notes, Location, Climbing With, Media, climbs list, "+ Add Climb", Edit Date, Delete Session) still works exactly as before.

- [ ] **Step 2: From the Sessions tab, tap a "climbing with" partner chip** on a session card. Confirm it opens that person's profile. Tap "← Back". Confirm you land back on the Sessions tab, not the Activity feed.

- [ ] **Step 3: From the Sessions tab, tap a liker's avatar or a commenter's name** on a session card (view mode, not the edit modal). Confirm the same back-to-Sessions behavior.

- [ ] **Step 4: From the Activity feed, tap a name on a card.** Confirm "← Back" still returns to the Activity feed at the same scroll position, exactly as before this change.

- [ ] **Step 5: From the Account screen, tap into a follower or following profile.** Confirm "← Back" returns to the Account screen.

- [ ] **Step 6: From your own profile's SESSIONS list** (reached via `FriendDetailView`), tap a partner chip on one of your own session cards. Confirm it opens that person's profile and behaves reasonably on "← Back" (falls back to today's existing behavior, since you were already on the Activity screen).

- [ ] **Step 7: Report results.** Do not check this task off as complete until actually exercised in a simulator/device.
