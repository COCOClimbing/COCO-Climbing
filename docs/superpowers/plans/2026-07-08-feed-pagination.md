# Feed Pagination & Notification-Tap Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The activity feed and in-app notification list both start with a 14-day window and extend by 7 days each time the user scrolls to the bottom (unlimited), and tapping a session-related notification scrolls to that session's card in the feed instead of opening the full detail modal.

**Architecture:** Three existing `utils/friendsApi.ts` fetch functions gain a `daysBack` parameter, replacing their hardcoded 14-day cutoff. `app/friends.tsx` tracks the currently-loaded window (`daysLoaded`) and re-fetches the *entire* window (not an incremental slice) each time it grows, driven either by manual scroll-to-bottom or by a notification tap searching for a session outside the current window. `components/AppHeader.tsx`'s notification list gets the identical pattern independently. The now-unneeded `getSessionForNotification` fallback-fetch function and its supporting staleness-guard ref are deleted.

**Tech Stack:** React Native, Supabase, existing `ScrollView`/`onScroll` patterns already used in this codebase. No test framework exists in this repo (no jest config, no `*.test.tsx` files) — verification is manual.

Spec: `docs/superpowers/specs/2026-07-08-feed-pagination-design.md`

---

### Task 1: Parameterize date cutoffs and remove the notification fallback fetch

**Files:**
- Modify: `utils/friendsApi.ts`

- [ ] **Step 1: Add `daysBack` to `getFriendRecentClimbs`**

Currently (lines 163-177):

```ts
// Get a friend's climbs from the last 14 days
export async function getFriendRecentClimbs(friendId: string): Promise<any[]> {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const cutoff = fourteenDaysAgo.toISOString().split('T')[0];

  const { data } = await supabase
    .from('climbs')
    .select('*')
    .eq('user_id', friendId)
    .gte('date', cutoff)
    .order('date', { ascending: false });

  return data ?? [];
}
```

Change to:

```ts
// Get a friend's climbs from the last `daysBack` days
export async function getFriendRecentClimbs(friendId: string, daysBack: number): Promise<any[]> {
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - daysBack);
  const cutoff = daysAgo.toISOString().split('T')[0];

  const { data } = await supabase
    .from('climbs')
    .select('*')
    .eq('user_id', friendId)
    .gte('date', cutoff)
    .order('date', { ascending: false });

  return data ?? [];
}
```

- [ ] **Step 2: Add `daysBack` to `getFriendRecentSessions`**

Currently (lines 179-192):

```ts
// Get a friend's recent sessions from the last 14 days (for media)
export async function getFriendRecentSessions(friendId: string): Promise<any[]> {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const cutoff = fourteenDaysAgo.toISOString().split('T')[0];

  const { data } = await supabase
    .from('sessions')
    .select('id, date, started_at, media_uris, media_types, friends, notes, title, location')
    .eq('user_id', friendId)
    .gte('date', cutoff)
    .not('ended_at', 'is', null);
  return data ?? [];
}
```

Change to:

```ts
// Get a friend's recent sessions from the last `daysBack` days (for media)
export async function getFriendRecentSessions(friendId: string, daysBack: number): Promise<any[]> {
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - daysBack);
  const cutoff = daysAgo.toISOString().split('T')[0];

  const { data } = await supabase
    .from('sessions')
    .select('id, date, started_at, media_uris, media_types, friends, notes, title, location')
    .eq('user_id', friendId)
    .gte('date', cutoff)
    .not('ended_at', 'is', null);
  return data ?? [];
}
```

- [ ] **Step 3: Add `daysBack` to `getTaggedSessions`**

Currently (lines 194-...):

```ts
// Get ended sessions from the last 14 days where userId was tagged, with the session owner's profile
export async function getTaggedSessions(userId: string): Promise<{ session: any; profile: any }[]> {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const cutoff = fourteenDaysAgo.toISOString().split('T')[0];

  const { data: sessions } = await supabase
    .from('sessions')
    .select('*')
    .gte('date', cutoff)
    .not('ended_at', 'is', null)
    .contains('friends', [{ id: userId }]);
```

Change the signature and cutoff calculation (leave everything else in the function body below the `.contains(...)` call untouched):

```ts
// Get ended sessions from the last `daysBack` days where userId was tagged, with the session owner's profile
export async function getTaggedSessions(userId: string, daysBack: number): Promise<{ session: any; profile: any }[]> {
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - daysBack);
  const cutoff = daysAgo.toISOString().split('T')[0];

  const { data: sessions } = await supabase
    .from('sessions')
    .select('*')
    .gte('date', cutoff)
    .not('ended_at', 'is', null)
    .contains('friends', [{ id: userId }]);
```

- [ ] **Step 4: Delete `getSessionForNotification` and its now-unused imports**

Delete the entire `getSessionForNotification` function, including its preceding `// ─── Notifications ───` section comment. It's the block starting at:

```ts
// ─── Notifications ────────────────────────────────────────────────────────────

// Fetch a single session by id (regardless of the viewer's friendship graph —
```

and ending at the function's closing `}` (currently spans lines 376-460 — delete that entire range).

Then remove these two now-unused imports from the top of the file (currently lines 1-3):

```ts
import { supabase } from './supabase';
import { getGradeDifficulty } from './theme';
import { isDeadMediaUrl } from './cloudSync';
```

Change to just:

```ts
import { supabase } from './supabase';
```

`getProfileById` (defined separately, right after `searchByUsername`) is NOT part of this deletion — it's still used by `utils/notifications.ts`'s `routeNotificationTap` for profile-type notifications. Only `getSessionForNotification` and its two exclusive imports go.

- [ ] **Step 5: Sanity-check the file compiles**

Run: `npx tsc --noEmit -p . 2>&1 | grep friendsApi`

Expected: errors referencing every call site that still calls these three functions with the old (now-wrong) argument count — that's expected and will be fixed in Task 2. Confirm the errors are specifically about missing the `daysBack` argument, not something unrelated.

- [ ] **Step 6: Commit**

```bash
git add utils/friendsApi.ts
git commit -m "Parameterize activity feed date cutoffs, remove unused notification fallback fetch"
```

---

### Task 2: Wire `daysLoaded` state through `loadFeed` and its climb-fetching call sites

**Files:**
- Modify: `app/friends.tsx`

- [ ] **Step 1: Remove the now-deleted import**

The import block from `'../utils/friendsApi'` currently includes (among others):

```ts
  getSessionForNotification,
} from '../utils/friendsApi';
```

Remove the `getSessionForNotification,` line — it no longer exists in that module (deleted in Task 1).

- [ ] **Step 2: Add `daysLoaded` state**

Near the other activity-feed state declarations (currently `const [activityFeed, setActivityFeed] = useState<SessionSummary[]>([]);` at line 712), add:

```ts
  const [activityFeed, setActivityFeed] = useState<SessionSummary[]>([]);
  const [daysLoaded, setDaysLoaded] = useState(14);
```

- [ ] **Step 3: Add a ref tracking whether the feed has ever completed a load**

Near the other refs used by the activity feed (e.g. alongside `feedScrollRef`/`feedScrollY`, currently declared at lines 819-820), add:

```ts
  const feedScrollRef = useRef<ScrollView>(null);
  const feedScrollY = useRef(0);
  const everLoadedFeedRef = useRef(false);
```

- [ ] **Step 4: Make `loadFeed` accept an explicit `days` parameter and return how many entries it found**

`loadFeed` currently starts (line 869):

```ts
  async function loadFeed() {
    if (!user) return;
    setLoadingFeed(true);
```

Change the signature to accept an optional override (defaulting to the current `daysLoaded` state) and to return a number:

```ts
  async function loadFeed(days: number = daysLoaded): Promise<number> {
    if (!user) return 0;
    setLoadingFeed(true);
```

- [ ] **Step 5: Use `days` instead of a hardcoded 14 for the user's own sessions**

Currently (lines 890-893):

```ts
      // Add user's own recent sessions (last 14 days)
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const cutoff = fourteenDaysAgo.toISOString().slice(0, 10);
```

Change to:

```ts
      // Add user's own recent sessions (last `days` days)
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);
      const cutoff = daysAgo.toISOString().slice(0, 10);
```

- [ ] **Step 6: Pass `days` into `getTaggedSessions`**

Currently (around line 956):

```ts
      const taggedSessions = await getTaggedSessions(user.id);
```

Change to:

```ts
      const taggedSessions = await getTaggedSessions(user.id, days);
```

- [ ] **Step 7: Pass `days` into the friends'-sessions fetch**

Currently (lines 1018-1021):

```ts
            const [climbs, friendSessions] = await Promise.all([
              getFriendRecentClimbs(f.id),
              getFriendRecentSessions(f.id),
            ]);
```

Change to:

```ts
            const [climbs, friendSessions] = await Promise.all([
              getFriendRecentClimbs(f.id, days),
              getFriendRecentSessions(f.id, days),
            ]);
```

- [ ] **Step 8: Mark the feed as "has loaded at least once" and return the entry count**

Currently, `loadFeed` ends with (around lines 1125-1138):

```ts
      setActivityFeed(dedupedWithWidths);

      // Load likes & comments for sessions that have an ID
      deduped.forEach(e => {
        if (e.sessionId) {
          const key = `sid-${e.sessionId}`;
          loadLikesAndComments(key, e.sessionId);
        }
      });
    } catch {
      setActivityFeed([]);
    }
    setLoadingFeed(false);
  }
```

Change to:

```ts
      setActivityFeed(dedupedWithWidths);

      // Load likes & comments for sessions that have an ID
      deduped.forEach(e => {
        if (e.sessionId) {
          const key = `sid-${e.sessionId}`;
          loadLikesAndComments(key, e.sessionId);
        }
      });
      everLoadedFeedRef.current = true;
      setLoadingFeed(false);
      return dedupedWithWidths.length;
    } catch {
      setActivityFeed([]);
      everLoadedFeedRef.current = true;
      setLoadingFeed(false);
      return 0;
    }
  }
```

(Moving `setLoadingFeed(false)` into both branches, since the function no longer falls through to a single trailing statement once it returns a value from each branch.)

- [ ] **Step 9: Pass `daysLoaded` into the two other `getFriendRecentClimbs` call sites**

`handleToggleSession` (currently around line 1281) calls:

```ts
          const climbs = await getFriendRecentClimbs(entry.friend.id);
```

Change to:

```ts
          const climbs = await getFriendRecentClimbs(entry.friend.id, daysLoaded);
```

`handleOpenSession` (currently around line 1331) calls:

```ts
          const fetched = await getFriendRecentClimbs(entry.friend.id);
```

Change to:

```ts
          const fetched = await getFriendRecentClimbs(entry.friend.id, daysLoaded);
```

Both of these fetch climbs for a session that's already present in `activityFeed` (the user tapped/expanded an already-visible card), so they should use whatever window is currently loaded, not a fixed value.

- [ ] **Step 10: Sanity-check the file compiles**

Run: `npx tsc --noEmit -p . 2>&1 | grep "friends.tsx"`

Expected: only the single pre-existing `TS1117` duplicate-property error in a `StyleSheet.create` block (unrelated to this change, already present before this task — confirmed in prior sessions' work on this file). No errors about missing arguments to the three parameterized functions.

- [ ] **Step 11: Commit**

```bash
git add app/friends.tsx
git commit -m "Wire daysLoaded state through loadFeed and its climb-fetching call sites"
```

---

### Task 3: Scroll-to-bottom pagination trigger, footer state, and refresh reset

**Files:**
- Modify: `app/friends.tsx`

- [ ] **Step 1: Add pagination UI state and guard refs**

Alongside the `daysLoaded` state added in Task 2, add:

```ts
  const [daysLoaded, setDaysLoaded] = useState(14);
  const [loadingMore, setLoadingMore] = useState(false);
  const [caughtUp, setCaughtUp] = useState(false);
```

Alongside `everLoadedFeedRef` (added in Task 2), add:

```ts
  const everLoadedFeedRef = useRef(false);
  const canTriggerLoadMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);
```

- [ ] **Step 2: Add a `loadMoreFeed` function**

Add this new function near `loadFeed` (right after it is a reasonable spot):

```ts
  async function loadMoreFeed() {
    if (loadingMoreRef.current || !canTriggerLoadMoreRef.current) return;
    loadingMoreRef.current = true;
    canTriggerLoadMoreRef.current = false;
    setLoadingMore(true);
    const prevCount = activityFeed.length;
    const next = daysLoaded + 7;
    setDaysLoaded(next);
    const newCount = await loadFeed(next);
    setCaughtUp(newCount <= prevCount);
    setLoadingMore(false);
    loadingMoreRef.current = false;
  }
```

- [ ] **Step 3: Detect scroll-to-bottom on the activity feed's `ScrollView`**

Currently (line 1793):

```tsx
        <ScrollView ref={feedScrollRef} style={styles.scrollArea} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={loadingFeed} onRefresh={loadFeed} />} scrollEventThrottle={16} onScroll={e => { feedScrollY.current = e.nativeEvent.contentOffset.y; }}>
```

Change to:

```tsx
        <ScrollView
          ref={feedScrollRef}
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={loadingFeed} onRefresh={() => { setDaysLoaded(14); setCaughtUp(false); loadFeed(14); }} />}
          scrollEventThrottle={16}
          onScroll={e => {
            feedScrollY.current = e.nativeEvent.contentOffset.y;
            const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
            const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
            if (distanceFromBottom < 200) {
              loadMoreFeed();
            } else {
              canTriggerLoadMoreRef.current = true;
            }
          }}
        >
```

Note: `refreshControl`'s `onRefresh` now resets `daysLoaded` to 14 and calls `loadFeed(14)` explicitly (rather than passing `loadFeed` directly), so pulling to refresh always returns to the normal 14-day view rather than replaying whatever extended window was currently loaded.

- [ ] **Step 4: Add the footer (spinner / "You're all caught up") inside the `ScrollView`**

The activity feed's `.map()` currently closes right before the `ScrollView` closes (currently lines 2046-2047):

```tsx
          })}
        </ScrollView>
```

Change to:

```tsx
          })}
          {loadingMore && (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: SPACING.lg }} />
          )}
          {!loadingMore && caughtUp && (
            <Text style={[styles.emptyStateText, { color: colors.textMuted, marginVertical: SPACING.lg }]}>
              You're all caught up
            </Text>
          )}
        </ScrollView>
```

`styles.emptyStateText` already exists in this file (used by the "No recent activity" empty state) — reused here for visual consistency rather than adding a new style.

- [ ] **Step 5: Sanity-check the file compiles**

Run: `npx tsc --noEmit -p . 2>&1 | grep "friends.tsx"`

Expected: only the same single pre-existing `TS1117` error as Task 2, nothing new.

- [ ] **Step 6: Commit**

```bash
git add app/friends.tsx
git commit -m "Add scroll-to-bottom pagination for the activity feed"
```

---

### Task 4: Notification tap scrolls to the feed card instead of opening the detail modal

**Files:**
- Modify: `app/friends.tsx`

- [ ] **Step 1: Replace the `pendingActivitySessionId` effect**

Currently (lines 762-789):

```ts
  // Open a session requested externally (e.g. tapping a notification)
  const pendingActivitySessionIdRef = useRef(pendingActivitySessionId);
  pendingActivitySessionIdRef.current = pendingActivitySessionId;
  useEffect(() => {
    if (!pendingActivitySessionId || screen !== 'friends') return;
    const sessionId = pendingActivitySessionId;
    const existing = activityFeed.find(e => e.sessionId === sessionId);
    if (existing) {
      handleOpenSession(existing);
      clearPendingActivitySessionId();
      return;
    }
    // Not in the currently loaded feed (e.g. app was cold-started by the
    // notification tap before loadFeed() finished, or the session is older
    // than the feed's 14-day window) — fetch it directly instead.
    (async () => {
      const result = await getSessionForNotification(sessionId);
      // Bail if a newer request has since superseded this one (e.g. the
      // feed loaded in the meantime and took the fast path instead, or
      // another notification tap arrived while this fetch was in flight).
      if (pendingActivitySessionIdRef.current !== sessionId) return;
      if (result) {
        setViewingSession(result);
        loadLikesAndComments(`sid-${sessionId}`, sessionId);
      }
      clearPendingActivitySessionId();
    })();
  }, [pendingActivitySessionId, screen, activityFeed]);
```

Replace the entire block with:

```ts
  // Open a session requested externally (e.g. tapping a notification) by
  // scrolling to its card in the feed, auto-extending the loaded window if
  // it isn't there yet (capped so a stale/deleted session doesn't search
  // forever).
  const cardOffsets = useRef<Record<string, number>>({});
  const MAX_AUTO_EXTEND_DAYS = 90;
  useEffect(() => {
    if (!pendingActivitySessionId || screen !== 'friends') return;
    const sessionId = pendingActivitySessionId;
    const sessionKey = `sid-${sessionId}`;
    const existing = activityFeed.find(e => e.sessionId === sessionId);
    if (existing) {
      setTimeout(() => {
        const y = cardOffsets.current[sessionKey];
        if (y !== undefined) {
          feedScrollRef.current?.scrollTo({ y: Math.max(0, y - SPACING.lg), animated: true });
        }
      }, 50);
      clearPendingActivitySessionId();
      return;
    }
    // Not found yet.
    if (!everLoadedFeedRef.current) return; // wait for the first load to finish
    if (daysLoaded >= MAX_AUTO_EXTEND_DAYS) {
      clearPendingActivitySessionId(); // searched far enough back — give up silently
      return;
    }
    const next = daysLoaded + 7;
    setDaysLoaded(next);
    loadFeed(next);
  }, [pendingActivitySessionId, screen, activityFeed]);
```

This removes `pendingActivitySessionIdRef` entirely — it existed only to guard against a detached async fetch (`getSessionForNotification`) resolving out of order. That fetch no longer exists; the search now happens entirely through the same `loadFeed`/`activityFeed` re-render cycle that drives manual scroll pagination, so there's no separate async gap to race against.

- [ ] **Step 2: Track each activity card's on-screen Y offset**

The activity card's outer `View` (currently line 1801):

```tsx
              <View key={sessionKey} style={[styles.activityCard, { borderBottomColor: colors.border }]}>
```

Change to:

```tsx
              <View
                key={sessionKey}
                style={[styles.activityCard, { borderBottomColor: colors.border }]}
                onLayout={e => { cardOffsets.current[sessionKey] = e.nativeEvent.layout.y; }}
              >
```

- [ ] **Step 3: Sanity-check the file compiles**

Run: `npx tsc --noEmit -p . 2>&1 | grep "friends.tsx"`

Expected: only the same single pre-existing `TS1117` error, nothing new. Specifically confirm no error about `pendingActivitySessionIdRef` being referenced anywhere else (it shouldn't be — it was only used within the effect just replaced).

- [ ] **Step 4: Commit**

```bash
git add app/friends.tsx
git commit -m "Scroll notification taps to the feed card, auto-extending the window if needed"
```

---

### Task 5: Paginate the in-app notification list, scope mark-as-read to the loaded window

**Files:**
- Modify: `components/AppHeader.tsx`

- [ ] **Step 1: Add pagination state and guard refs**

Currently (lines 42-45):

```ts
  const [notifVisible, setNotifVisible] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
```

Change to:

```ts
  const [notifVisible, setNotifVisible] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifDaysLoaded, setNotifDaysLoaded] = useState(14);
  const [loadingMoreNotifs, setLoadingMoreNotifs] = useState(false);
  const [notifsCaughtUp, setNotifsCaughtUp] = useState(false);
  const canTriggerLoadMoreNotifsRef = useRef(true);
  const loadingMoreNotifsRef = useRef(false);
```

This requires adding `useRef` to the existing `react` import (currently line 1):

```ts
import React, { useState, useEffect, useCallback } from 'react';
```

Change to:

```ts
import React, { useState, useEffect, useCallback, useRef } from 'react';
```

- [ ] **Step 2: Replace `openNotifications` with a parameterized fetch + a thin opener**

Currently (lines 64-83):

```ts
  async function openNotifications() {
    setNotifVisible(true);
    setNotifLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setNotifications((data ?? []) as AppNotification[]);
    setNotifLoading(false);

    // Mark all as read
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('recipient_id', user!.id)
      .eq('read', false);
    setUnreadCount(0);
  }
```

Replace with:

```ts
  async function fetchNotifications(days: number): Promise<number> {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);
    const cutoff = daysAgo.toISOString();

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', user!.id)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false });
    const rows = (data ?? []) as AppNotification[];
    setNotifications(rows);

    // Mark only this loaded batch as read — a notification outside the
    // currently-loaded window shouldn't be marked read before it's ever seen.
    const unreadIds = rows.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length > 0) {
      await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
    }
    setUnreadCount(0);
    return rows.length;
  }

  async function openNotifications() {
    setNotifVisible(true);
    setNotifLoading(true);
    setNotifDaysLoaded(14);
    setNotifsCaughtUp(false);
    await fetchNotifications(14);
    setNotifLoading(false);
  }

  async function loadMoreNotifications() {
    if (loadingMoreNotifsRef.current || !canTriggerLoadMoreNotifsRef.current) return;
    loadingMoreNotifsRef.current = true;
    canTriggerLoadMoreNotifsRef.current = false;
    setLoadingMoreNotifs(true);
    const prevCount = notifications.length;
    const next = notifDaysLoaded + 7;
    setNotifDaysLoaded(next);
    const newCount = await fetchNotifications(next);
    setNotifsCaughtUp(newCount <= prevCount);
    setLoadingMoreNotifs(false);
    loadingMoreNotifsRef.current = false;
  }
```

- [ ] **Step 3: Detect scroll-to-bottom and render the footer in the notifications modal**

Currently (lines 166-187):

```tsx
            <ScrollView contentContainerStyle={{ paddingVertical: SPACING.sm }}>
              {notifications.map(n => (
                <TouchableOpacity
                  key={n.id}
                  onPress={() => handleNotificationTap(n)}
                  activeOpacity={0.7}
                  style={[styles.notifRow, { borderBottomColor: colors.border, backgroundColor: n.read ? 'transparent' : colors.accentSoft }]}
                >
                  <View style={[styles.notifIcon, { backgroundColor: colors.accentSoft }]}>
                    <Ionicons name={iconForType(n.type) as any} size={18} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.notifTitle, { color: colors.textPrimary }]}>{n.title}</Text>
                    <Text style={[styles.notifBody, { color: colors.textSecondary }]}>{n.body}</Text>
                    <Text style={[styles.notifTime, { color: colors.textMuted }]}>
                      {formatDistanceToNow(parseISO(n.created_at), { addSuffix: true })}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
```

Change to:

```tsx
            <ScrollView
              contentContainerStyle={{ paddingVertical: SPACING.sm }}
              scrollEventThrottle={16}
              onScroll={e => {
                const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
                const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
                if (distanceFromBottom < 200) {
                  loadMoreNotifications();
                } else {
                  canTriggerLoadMoreNotifsRef.current = true;
                }
              }}
            >
              {notifications.map(n => (
                <TouchableOpacity
                  key={n.id}
                  onPress={() => handleNotificationTap(n)}
                  activeOpacity={0.7}
                  style={[styles.notifRow, { borderBottomColor: colors.border, backgroundColor: n.read ? 'transparent' : colors.accentSoft }]}
                >
                  <View style={[styles.notifIcon, { backgroundColor: colors.accentSoft }]}>
                    <Ionicons name={iconForType(n.type) as any} size={18} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.notifTitle, { color: colors.textPrimary }]}>{n.title}</Text>
                    <Text style={[styles.notifBody, { color: colors.textSecondary }]}>{n.body}</Text>
                    <Text style={[styles.notifTime, { color: colors.textMuted }]}>
                      {formatDistanceToNow(parseISO(n.created_at), { addSuffix: true })}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
              {loadingMoreNotifs && (
                <ActivityIndicator color={colors.accent} style={{ marginVertical: SPACING.lg }} />
              )}
              {!loadingMoreNotifs && notifsCaughtUp && (
                <Text style={[styles.emptyText, { marginTop: 0, marginVertical: SPACING.lg }]}>You're all caught up</Text>
              )}
            </ScrollView>
```

- [ ] **Step 4: Sanity-check the file compiles**

Run: `npx tsc --noEmit -p . 2>&1 | grep "AppHeader.tsx"`

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add components/AppHeader.tsx
git commit -m "Paginate the in-app notification list, scope mark-as-read to the loaded window"
```

---

### Task 6: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Activity feed pagination**

Open the Activity tab. Scroll to the bottom repeatedly. Confirm each scroll-to-bottom adds roughly 7 more days of history (more cards appear, or "You're all caught up" shows if that window was quiet — and scrolling to the bottom again still tries the next window further back). Confirm a brief spinner shows at the bottom while a load-more fetch is in flight, without the existing list disappearing or flickering. Confirm pull-to-refresh brings the window back to 14 days (e.g. paginate out to 30+ days, then pull to refresh, then scroll to the bottom again and confirm it takes multiple scrolls to get back to where you were, since the window reset).

- [ ] **Step 2: No fetch storm**

While at the very bottom of the feed with `caughtUp` showing, watch network activity (or add a temporary `console.log` in `loadMoreFeed` if needed, then remove it) — confirm it does NOT keep re-fetching repeatedly while sitting still at the bottom. Scroll up slightly then back down — confirm exactly one more fetch attempt happens.

- [ ] **Step 3: Notification tap scrolls to card**

Tag yourself in a session or like/comment on a session that's already visible in your feed. Tap the resulting notification (or the in-app bell dropdown). Confirm it scrolls to that card in the Activity tab feed rather than opening the full session detail modal.

- [ ] **Step 4: Notification tap auto-extends the window**

Arrange for a like/comment/tag on a session older than 14 days (e.g. edit a test session's date, or use one from a while back). Tap that notification with the app freshly opened (so the feed starts at the default 14-day window). Confirm the app automatically paginates back (you may briefly see the list grow) until it finds and scrolls to that card.

- [ ] **Step 5: In-app notification list pagination**

Open the bell dropdown with more than 14 days of notification history available. Confirm only the recent 14 days show initially. Scroll to the bottom, confirm it loads 7 more days. Confirm notifications outside the currently-loaded window keep their unread state (don't get silently marked read) until you actually scroll to load them.
