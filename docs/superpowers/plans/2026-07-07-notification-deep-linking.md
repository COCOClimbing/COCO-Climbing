# Notification Deep-Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tapping any of COCO's 7 push notification types (new follower, follow request, follow request accepted, tagged in a session, session like, comment like, new comment) opens the right profile or session, whether the app is foregrounded, backgrounded, or was fully closed.

**Architecture:** Extend the existing ad-hoc "pending navigation" pattern in `NavigationContext` (already used for `pendingFriendProfile`) with a parallel `pendingActivitySessionId`. A new notification-tap listener (registered once, in `app/_layout.tsx`) reads the tapped notification's `data` payload and routes profile-shaped types to the existing friend-profile view and session-shaped types to the existing activity-feed session modal in `app/friends.tsx`. Two small new data-fetch helpers in `utils/friendsApi.ts` support this without needing the activity feed to already be loaded.

**Tech Stack:** React Native, `expo-notifications` (`addNotificationResponseReceivedListener`, `getLastNotificationResponseAsync`), Supabase. No test framework exists in this repo (no jest config, no `*.test.tsx` files) — verification is manual, and this particular feature additionally requires a real device (push notifications don't work in the iOS Simulator at all).

Spec: `docs/superpowers/specs/2026-07-07-notification-deep-linking-design.md`

---

### Task 1: Extend `NavigationContext` with a pending activity-session slot

**Files:**
- Modify: `utils/NavigationContext.tsx`

- [ ] **Step 1: Add the new fields to `NavContextType`**

In `utils/NavigationContext.tsx`, the `NavContextType` interface currently reads (lines 14-36):

```ts
interface NavContextType {
  screen: ScreenId;
  drawerOpen: boolean;
  returnTo: ScreenId | null;
  settingsOpen: boolean;
  friendsOpen: boolean;
  navCount: number;
  tabResetCount: Record<string, number>;
  pendingFriendProfile: PendingFriendProfile | null;
  pendingSessionId: string | null;
  navigate: (screen: ScreenId) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  setReturnTo: (screen: ScreenId | null) => void;
  openSettings: () => void;
  closeSettings: () => void;
  openFriends: () => void;
  closeFriends: () => void;
  viewFriendProfile: (profile: PendingFriendProfile) => void;
  clearPendingFriendProfile: () => void;
  navigateToSession: (sessionId: string) => void;
  clearPendingSessionId: () => void;
}
```

Replace it with (two lines added: `pendingActivitySessionId` after `pendingSessionId`, and two new methods at the end):

```ts
interface NavContextType {
  screen: ScreenId;
  drawerOpen: boolean;
  returnTo: ScreenId | null;
  settingsOpen: boolean;
  friendsOpen: boolean;
  navCount: number;
  tabResetCount: Record<string, number>;
  pendingFriendProfile: PendingFriendProfile | null;
  pendingSessionId: string | null;
  pendingActivitySessionId: string | null;
  navigate: (screen: ScreenId) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  setReturnTo: (screen: ScreenId | null) => void;
  openSettings: () => void;
  closeSettings: () => void;
  openFriends: () => void;
  closeFriends: () => void;
  viewFriendProfile: (profile: PendingFriendProfile) => void;
  clearPendingFriendProfile: () => void;
  navigateToSession: (sessionId: string) => void;
  clearPendingSessionId: () => void;
  viewActivitySession: (sessionId: string) => void;
  clearPendingActivitySessionId: () => void;
}
```

- [ ] **Step 2: Add matching defaults to the `createContext` call**

The default context object (lines 38-60) currently ends with:

```ts
  navigateToSession: () => {},
  clearPendingSessionId: () => {},
});
```

And has `pendingSessionId: null,` around line 47. Add `pendingActivitySessionId: null,` right after it, and add the two new no-op function defaults after `clearPendingSessionId: () => {},`:

```ts
  pendingFriendProfile: null,
  pendingSessionId: null,
  pendingActivitySessionId: null,
  navigate: () => {},
  openDrawer: () => {},
  closeDrawer: () => {},
  setReturnTo: () => {},
  openSettings: () => {},
  closeSettings: () => {},
  openFriends: () => {},
  closeFriends: () => {},
  viewFriendProfile: () => {},
  clearPendingFriendProfile: () => {},
  navigateToSession: () => {},
  clearPendingSessionId: () => {},
  viewActivitySession: () => {},
  clearPendingActivitySessionId: () => {},
});
```

- [ ] **Step 3: Add the state and functions inside `NavigationProvider`**

Currently (lines 70-71):

```ts
  const [pendingFriendProfile, setPendingFriendProfile] = useState<PendingFriendProfile | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
```

Add a third piece of state right after:

```ts
  const [pendingFriendProfile, setPendingFriendProfile] = useState<PendingFriendProfile | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [pendingActivitySessionId, setPendingActivitySessionId] = useState<string | null>(null);
```

Currently, `navigateToSession`/`clearPendingSessionId` are defined at lines 102-112:

```ts
  function navigateToSession(sessionId: string) {
    setPendingSessionId(sessionId);
    setReturnTo(screen);
    setScreen('sessions');
    setDrawerOpen(false);
    setNavCount(c => c + 1);
  }

  function clearPendingSessionId() {
    setPendingSessionId(null);
  }
```

Add two new functions right after `clearPendingSessionId`, mirroring `viewFriendProfile`'s shape (it does NOT set `returnTo` or change to a different screen than `'friends'`, since the destination lives inside the always-mounted `FriendsScreen`):

```ts
  function viewActivitySession(sessionId: string) {
    setPendingActivitySessionId(sessionId);
    setScreen('friends');
    setDrawerOpen(false);
    setNavCount(c => c + 1);
  }

  function clearPendingActivitySessionId() {
    setPendingActivitySessionId(null);
  }
```

- [ ] **Step 4: Add the new state/functions to the Provider's value object**

Currently (lines 114-140), the `<NavContext.Provider value={{...}}>` block includes `pendingSessionId,` and ends with `navigateToSession, clearPendingSessionId,`. Add the new state and functions in both places:

```ts
      pendingFriendProfile,
      pendingSessionId,
      pendingActivitySessionId,
      navigate,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      setReturnTo,
      openSettings: () => setScreen('settings'),
      closeSettings: () => setScreen('account'),
      openFriends,
      closeFriends,
      viewFriendProfile,
      clearPendingFriendProfile,
      navigateToSession,
      clearPendingSessionId,
      viewActivitySession,
      clearPendingActivitySessionId,
    }}>
```

- [ ] **Step 5: Sanity-check the file compiles**

Run: `npx tsc --noEmit -p . 2>&1 | grep NavigationContext`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add utils/NavigationContext.tsx
git commit -m "Add pendingActivitySessionId to NavigationContext for notification deep-linking"
```

---

### Task 2: Add profile-by-id and session-by-id fetch helpers

**Files:**
- Modify: `utils/friendsApi.ts`

- [ ] **Step 1: Add the new imports**

At the top of `utils/friendsApi.ts` (currently just `import { supabase } from './supabase';` on line 1), add:

```ts
import { supabase } from './supabase';
import { getGradeDifficulty } from './theme';
import { isDeadMediaUrl } from './cloudSync';
```

- [ ] **Step 2: Add `getProfileById`**

Add this function near the other profile-fetching functions (e.g. right after `searchByUsername`, or anywhere at the top level of the file):

```ts
export async function getProfileById(id: string): Promise<FriendProfile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, name, username, avatar_url, hometown, is_private')
    .eq('id', id)
    .single();
  return data ?? null;
}
```

- [ ] **Step 3: Add `getSessionForNotification`**

Add this function anywhere at the top level of the file. It fetches a single session by id (regardless of the viewer's friendship graph — access is already implied because the notification was only sent to someone who was tagged in it, or because it's their own session that got a like/comment/tag), builds the same `SessionSummary`-shaped object and camelCase climb array the activity feed already uses elsewhere in the app:

```ts
export async function getSessionForNotification(sessionId: string): Promise<{ entry: any; climbs: any[] } | null> {
  const { data: s } = await supabase.from('sessions').select('*').eq('id', sessionId).single();
  if (!s) return null;

  const profile = await getProfileById(s.user_id);
  if (!profile) return null;

  const { data: rawClimbs } = await supabase.from('climbs').select('*').eq('session_id', sessionId);
  const dbClimbs = rawClimbs ?? [];

  const climbs = dbClimbs.map((c: any) => ({
    id: c.id, date: c.date, sessionId: c.session_id,
    type: c.type, outcome: c.outcome, styles: c.styles ?? [],
    environment: c.environment, grade: c.grade, gradeSystem: c.grade_system,
    routeName: c.route_name, location: c.location, notes: c.notes,
    attempts: c.attempts, mediaUri: c.media_uri, mediaType: c.media_type,
    mediaUris: c.media_uris ?? (c.media_uri ? [c.media_uri] : undefined),
    mediaTypes: c.media_types ?? (c.media_type ? [c.media_type] : undefined),
    projectId: c.project_id, projectName: c.project_name,
  }));

  const sends = dbClimbs.filter((c: any) => c.outcome === 'send' || c.outcome === 'flash').length;
  const flashes = dbClimbs.filter((c: any) => c.outcome === 'flash').length;
  const gradedClimbs = dbClimbs.filter((c: any) => (c.outcome === 'send' || c.outcome === 'flash') && c.grade && c.grade_system);
  let hardestGrade: string | null = null;
  let hardestGradeSystem: string | null = null;
  if (gradedClimbs.length > 0) {
    gradedClimbs.sort((a: any, b: any) => getGradeDifficulty(b.grade, b.grade_system) - getGradeDifficulty(a.grade, a.grade_system));
    hardestGrade = gradedClimbs[0].grade;
    hardestGradeSystem = gradedClimbs[0].grade_system;
  }

  const sessionPhotos = [
    ...((s.media_uris ?? []) as string[]).filter((u: string) => u.startsWith('http') && !isDeadMediaUrl(u)),
    ...dbClimbs.flatMap((c: any) => (c.media_uris ?? (c.media_uri ? [c.media_uri] : [])) as string[]).filter((u: string) => u.startsWith('http') && !isDeadMediaUrl(u)),
  ];

  const rawFriends: { id: string; name: string }[] = s.friends ?? [];
  const partnerIds = rawFriends.map((f: any) => f.id).filter((id: string) => id !== s.user_id);
  let partners: { id: string; name: string; avatar_url: string | null }[] | undefined;
  if (partnerIds.length > 0) {
    const { data: partnerProfiles } = await supabase
      .from('profiles')
      .select('id, name, avatar_url')
      .in('id', partnerIds);
    const profileMap = new Map((partnerProfiles ?? []).map((p: any) => [p.id, p]));
    partners = rawFriends.map((f: any) => ({
      id: f.id,
      name: profileMap.get(f.id)?.name ?? f.name,
      avatar_url: profileMap.get(f.id)?.avatar_url ?? null,
    }));
  }

  const entry = {
    friend: profile,
    sessionDate: (s.date ?? '').slice(0, 10),
    sessionTime: s.started_at ?? undefined,
    climbCount: dbClimbs.reduce((sum: number, c: any) => {
      if (c.type === 'hangboard' || c.type === 'lift') return sum;
      if (c.outcome === 'flash' || c.outcome === 'hang') return sum + 1;
      return sum + (c.attempts ?? 1);
    }, 0),
    sends,
    flashes,
    hardestGrade,
    hardestGradeSystem,
    environment: s.environment ?? 'indoor',
    climbType: dbClimbs[0]?.type ?? undefined,
    sessionPhotos: sessionPhotos.length > 0 ? sessionPhotos : undefined,
    sessionId: s.id,
    partners,
    notes: s.notes ?? undefined,
    title: s.title ?? undefined,
    location: s.location ?? undefined,
  };

  return { entry, climbs };
}
```

This mirrors the existing tagged-session-building logic in `app/friends.tsx` (`getTaggedSessions` consumer, and the raw-climb-to-camelCase mapping already used in `handleOpenSession`) — same field names, same grade/photo/partner computation — so the resulting object renders correctly in the existing session modal without any modal-side changes.

- [ ] **Step 4: Sanity-check the file compiles**

Run: `npx tsc --noEmit -p . 2>&1 | grep friendsApi`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add utils/friendsApi.ts
git commit -m "Add getProfileById and getSessionForNotification helpers"
```

---

### Task 3: Open the right view when `pendingActivitySessionId` is set

**Files:**
- Modify: `app/friends.tsx`

- [ ] **Step 1: Add `getSessionForNotification` to the existing `friendsApi` import**

The import block starting at line 34 currently ends with (lines 62-64):

```ts
  likeComment,
  unlikeComment,
} from '../utils/friendsApi';
```

Change to:

```ts
  likeComment,
  unlikeComment,
  getSessionForNotification,
} from '../utils/friendsApi';
```

- [ ] **Step 2: Destructure the new nav fields**

Line 685 currently reads:

```ts
  const { navigate, screen, setReturnTo, friendsOpen, openFriends, closeFriends, navCount, tabResetCount, pendingFriendProfile, clearPendingFriendProfile } = useNav();
```

Change to:

```ts
  const { navigate, screen, setReturnTo, friendsOpen, openFriends, closeFriends, navCount, tabResetCount, pendingFriendProfile, clearPendingFriendProfile, pendingActivitySessionId, clearPendingActivitySessionId } = useNav();
```

- [ ] **Step 3: Add the consuming effect**

Directly after the existing `pendingFriendProfile` effect (currently lines 753-759):

```ts
  // Open a profile requested from another screen (e.g. tapping a follower in account)
  useEffect(() => {
    if (pendingFriendProfile && screen === 'friends') {
      setFriendSource('activity');
      setViewingFriend(pendingFriendProfile as FriendProfile);
      clearPendingFriendProfile();
    }
  }, [pendingFriendProfile, screen]);
```

add a new effect for sessions, in the same style:

```ts
  // Open a session requested externally (e.g. tapping a notification)
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
      if (result) {
        setViewingSession(result);
        loadLikesAndComments(`sid-${sessionId}`, sessionId);
      }
      clearPendingActivitySessionId();
    })();
  }, [pendingActivitySessionId, screen, activityFeed]);
```

Note: `handleOpenSession` and `loadLikesAndComments` are both already defined as functions inside this same `FriendsScreen` component (further down in the file) — no new import needed, and function declarations in a component body are hoisted/available to earlier-defined effects at call time since they all run after the full component function body has been defined.

- [ ] **Step 4: Sanity-check the file compiles**

Run: `npx tsc --noEmit -p . 2>&1 | grep "friends.tsx"`
Expected: no NEW errors (this file currently has no pre-existing tsc errors of its own, unlike `app/sessions.tsx`).

- [ ] **Step 5: Commit**

```bash
git add app/friends.tsx
git commit -m "Open the right activity-feed session when pendingActivitySessionId is set"
```

---

### Task 4: Add the notification-tap routing hook

**Files:**
- Modify: `utils/notifications.ts`

- [ ] **Step 1: Add the new imports**

At the top of `utils/notifications.ts` (currently lines 1-4):

```ts
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
```

Change to:

```ts
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { useNav } from './NavigationContext';
import { getProfileById } from './friendsApi';
```

- [ ] **Step 2: Add the routing hook**

Add this at the end of the file (after `sendCommentLikeNotification`):

```ts
const PROFILE_NOTIFICATION_TYPES = new Set(['new_follower', 'follow_request', 'follow_request_accepted']);
const SESSION_NOTIFICATION_TYPES = new Set(['session_tag', 'like', 'comment_like', 'comment']);

export function useNotificationTapRouting(): void {
  const nav = useNav();

  useEffect(() => {
    function routeTap(data: any) {
      if (!data || typeof data.type !== 'string') return;

      if (PROFILE_NOTIFICATION_TYPES.has(data.type)) {
        const id = data.senderId ?? data.followerId;
        if (!id) return;
        getProfileById(id).then(profile => {
          if (profile) nav.viewFriendProfile(profile);
        }).catch(() => {});
        return;
      }

      if (SESSION_NOTIFICATION_TYPES.has(data.type) && data.sessionId) {
        nav.viewActivitySession(data.sessionId);
      }
    }

    // Cold start: the app was launched by tapping a notification while fully closed.
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) routeTap(response.notification.request.content.data);
    });

    // Tap while the app is already running (foreground or backgrounded).
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      routeTap(response.notification.request.content.data);
    });
    return () => sub.remove();
  }, [nav]);
}
```

`data.senderId ?? data.followerId` handles the one payload-naming inconsistency in the existing edge function: `new_follower` notifications set `data.followerId` while every other type uses `data.senderId` (see `supabase/functions/send-notification/index.ts`, the `switch (type)` block) — this reads both without changing the sender-side payload shape.

- [ ] **Step 3: Sanity-check the file compiles**

Run: `npx tsc --noEmit -p . 2>&1 | grep notifications.ts`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add utils/notifications.ts
git commit -m "Add useNotificationTapRouting hook for notification tap deep-linking"
```

---

### Task 5: Wire the routing hook into the app shell

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Add `useNotificationTapRouting` to the existing import**

Line 40 currently reads:

```ts
import { registerForPushNotifications } from '../utils/notifications';
```

Change to:

```ts
import { registerForPushNotifications, useNotificationTapRouting } from '../utils/notifications';
```

- [ ] **Step 2: Call the hook inside `AppShell`**

`AppShell` (starting at line 57) already calls `useNav()` and `useAuth()` near the top (lines 59-60):

```ts
  const { screen, navigate } = useNav();
  const { user, loading, isPasswordRecovery } = useAuth();
```

Add the hook call directly after those two lines:

```ts
  const { screen, navigate } = useNav();
  const { user, loading, isPasswordRecovery } = useAuth();
  useNotificationTapRouting();
```

- [ ] **Step 3: Sanity-check the file compiles**

Run: `npx tsc --noEmit -p . 2>&1 | grep "_layout.tsx"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add app/_layout.tsx
git commit -m "Wire useNotificationTapRouting into the app shell"
```

---

### Task 6: Manual verification on a real device

**Files:** none (verification only)

Push notifications cannot be delivered to the iOS Simulator at all — this task requires a real device (a development build, or TestFlight/EAS build once this ships via OTA).

- [ ] **Step 1: Set up a second test account**

Use a second account (or ask another person) who can follow you, tag you in a session, and like/comment on one of your sessions.

- [ ] **Step 2: Test each of the 7 notification types, foreground**

With the app open and in the foreground, trigger each notification type from the second account and tap the resulting banner:
- New follower → opens their profile
- Follow request (make the receiving account private first) → opens their profile, showing a "Follow Back" button
- Follow request accepted → opens their profile
- Tagged in a session → opens that session (in the activity-feed modal, with likes/comments visible)
- Session like → opens that session
- Comment like → opens that session
- New comment → opens that session

- [ ] **Step 3: Test with the app backgrounded**

Background the app (don't force-quit), trigger a couple of the notification types, tap them from the notification center, confirm the app foregrounds directly into the right view.

- [ ] **Step 4: Test with the app fully closed**

Force-quit the app, trigger a notification, tap it from the notification center, confirm the app cold-starts and, once ready, opens directly into the right view (this exercises the `getLastNotificationResponseAsync` cold-start path specifically — it's the one path that can't be tested any other way).

- [ ] **Step 5: Test a stale notification**

Trigger a session-like notification, then delete that session before tapping the notification. Confirm tapping it does nothing (no crash, no error dialog) rather than opening a broken view.
