# Profile Session Feeds (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the compact-row "SESSIONS" list at the bottom of `FriendDetailView` (both your own profile and a friend's profile, in `app/friends.tsx`) with the same rich, feed-style cards already shipped for the Sessions tab, loading the last 14 days initially and +7 more each time the user scrolls to the bottom — matching the Activity feed's existing pagination exactly.

**Architecture:** Own-profile sessions reuse the already-built `SessionCard` component fed by local storage (`getAllSessions`/`getAllClimbs`), grouped into `DaySession[]` exactly like `app/sessions.tsx` does, filtered by a rolling date cutoff. Friend-profile sessions get a brand new self-contained `ActivityCard` component (mirrors `SessionCard`'s architecture but with a like button and viewer-style comment permissions instead of an edit icon), fed by a new `getFriendSessionSummaries` helper in `utils/friendsApi.ts` that adapts the existing `getFriendRecentClimbs`/`getFriendRecentSessions` functions (already parameterized by day-count) into `session_id`-grouped `SessionSummary` entries. The main Activity feed's own inline card JSX and keyed-map state (`likesMap`, `commentsMap`, `loadFeed`, etc.) are not touched.

**Tech Stack:** React Native / Expo, TypeScript, Supabase.

---

## Context for the implementer

- `app/friends.tsx` is a single large file containing both `FriendDetailView` (the profile screen, lines ~168-607) and the main `FriendsScreen` (the Activity feed, everything after). Both are in the same file; `FriendDetailView` is rendered as a sub-screen when `viewingFriend` is set.
- `FriendDetailView` receives a `friend: FriendProfile` prop. When the user is viewing their **own** profile, `friend.id === user.id`. This is the ONLY branch point needed — same as the already-approved design spec at `docs/superpowers/specs/2026-07-10-personal-feed-cards-design.md`.
- The stats header sections above SESSIONS (Following/Followers, LAST 30 DAYS, HARDEST SENDS, TOTALS) must NOT change. They're driven by `climbs`/`loadClimbs()`, which stays exactly as-is. Only the SESSIONS section (currently `dayGroups`/`DayGroup`/`expandedDate`, lines 122, 289-309, 455-490) gets replaced.
- `components/SessionCard.tsx` already exists (built in Phase 1) and is reused as-is for the own-profile case — no changes to that file.
- `utils/sessionHelpers.ts` already exports `DaySession`, `sessionStats`, `mergeClimbs`, `sessionTimeOfDay`, `formatSessionLabel` — reused as-is.
- `utils/NavigationContext.tsx` already has `navigateToSession(sessionId)` (switches to the Sessions tab and scrolls to that session card) and `viewFriendProfile(profile)` (switches to a different friend's profile) — both reused as-is, no changes needed to that file.

---

### Task 1: Shared `SessionSummary` type + `getFriendSessionSummaries` helper

**Files:**
- Modify: `utils/friendsApi.ts`
- Modify: `app/friends.tsx`

- [ ] **Step 1: Add the `SessionSummary` type and `getFriendSessionSummaries` to `utils/friendsApi.ts`**

Add these imports at the top of `utils/friendsApi.ts` (it currently only imports `supabase`):

```ts
import { supabase } from './supabase';
import { Image } from 'react-native';
import { isDeadMediaUrl } from './cloudSync';
import { getGradeDifficulty } from './theme';
```

(`utils/friendsApi.ts` currently only imports `supabase` — all three of these are new.)

Then add the type and function anywhere after the existing `FriendCounts` interface (around line 30), before `searchByUsername`:

```ts
export type SessionSummary = {
  friend: FriendProfile;
  sessionDate: string;
  sessionId?: string;
  sessionTime?: string;
  climbCount: number;
  sends: number;
  flashes: number;
  hardestGrade: string | null;
  hardestGradeSystem: string | null;
  environment?: string;
  climbType?: string;
  partners?: { id: string; name: string; avatar_url?: string | null }[];
  sessionPhotos?: string[];
  photoWidths?: Record<string, number>;
  notes?: string;
  title?: string;
  location?: string;
};

const SUMMARY_PHOTO_HEIGHT = 220;

// Build one friend's session_id-grouped, paginated activity summaries for the
// last `daysBack` days. Mirrors the per-friend grouping logic in
// app/friends.tsx's loadFeed (the main Activity feed), but as a standalone
// call for a single friend instead of a Promise.all over every friend —
// used by a friend's profile view, which only ever needs this one person's
// sessions. Deliberately duplicated rather than shared with loadFeed to
// avoid any risk of regressing the already-shipped main feed.
export async function getFriendSessionSummaries(friend: FriendProfile, daysBack: number): Promise<SessionSummary[]> {
  const normDate = (d: string) => (d ?? '').slice(0, 10);
  const summaries: SessionSummary[] = [];

  const [climbs, friendSessions] = await Promise.all([
    getFriendRecentClimbs(friend.id, daysBack),
    getFriendRecentSessions(friend.id, daysBack),
  ]);

  const sessionMediaMap = new Map<string, string[]>(
    friendSessions.map((s: any) => [s.id, (s.media_uris ?? []).filter((u: string) => u.startsWith('http'))])
  );
  const sessionFriendsMap = new Map<string, any[]>(
    friendSessions.map((s: any) => [s.id, s.friends ?? []])
  );
  const sessionNotesMap = new Map<string, string>(
    friendSessions.filter((s: any) => s.notes).map((s: any) => [s.id, s.notes])
  );
  const sessionTitleMap = new Map<string, string>(
    friendSessions.filter((s: any) => s.title).map((s: any) => [s.id, s.title])
  );
  const sessionLocationMap = new Map<string, string>(
    friendSessions.filter((s: any) => s.location).map((s: any) => [s.id, s.location])
  );
  const sessionDateMap = new Map<string, string>(
    friendSessions.filter((s: any) => s.date).map((s: any) => [s.id, normDate(s.date)])
  );
  const sessionStartedAtMap = new Map<string, string>(
    friendSessions.filter((s: any) => s.started_at).map((s: any) => [s.id, s.started_at])
  );

  const endedSessionIds = new Set(friendSessions.map((s: any) => s.id));
  const eligibleClimbs = climbs.filter((c: any) => !c.session_id || endedSessionIds.has(c.session_id));
  if (eligibleClimbs.length === 0) return [];

  const sessionIdByDate = new Map<string, string>(
    friendSessions.map((s: any) => [normDate(s.date), s.id])
  );

  const sessionGroups = new Map<string, any[]>();
  for (const c of eligibleClimbs) {
    const key = c.session_id ?? sessionIdByDate.get(normDate(c.date)) ?? normDate(c.date);
    if (!sessionGroups.has(key)) sessionGroups.set(key, []);
    sessionGroups.get(key)!.push(c);
  }

  for (const sessionClimbs of sessionGroups.values()) {
    const sends = sessionClimbs.filter((c: any) => c.outcome === 'send' || c.outcome === 'flash').length;
    const flashes = sessionClimbs.filter((c: any) => c.outcome === 'flash').length;
    let hardestGrade: string | null = null;
    let hardestGradeSystem: string | null = null;
    let hardestClimb: any = sessionClimbs[0];
    const gradedClimbs = sessionClimbs.filter((c: any) => (c.outcome === 'send' || c.outcome === 'flash') && c.grade && c.grade_system);
    if (gradedClimbs.length > 0) {
      gradedClimbs.sort((a: any, b: any) => getGradeDifficulty(b.grade, b.grade_system) - getGradeDifficulty(a.grade, a.grade_system));
      hardestGrade = gradedClimbs[0].grade;
      hardestGradeSystem = gradedClimbs[0].grade_system;
      hardestClimb = gradedClimbs[0];
    }
    const friendSessionId = sessionClimbs[0]?.session_id ?? undefined;
    const sessionDate = (friendSessionId ? sessionDateMap.get(friendSessionId) : undefined) ?? normDate(sessionClimbs[0].date);
    const environment = sessionClimbs[0]?.environment ?? 'indoor';
    const firstClimbTime = (friendSessionId ? sessionStartedAtMap.get(friendSessionId) : undefined) ?? sessionClimbs[0]?.date ?? undefined;
    const climbType = hardestClimb?.type ?? undefined;
    const climbPhotos = sessionClimbs.flatMap((c: any) => c.media_uris ?? (c.media_uri ? [c.media_uri] : [])).filter((u: string) => u.startsWith('http') && !isDeadMediaUrl(u));
    const sessionLevelPhotos = (friendSessionId ? (sessionMediaMap.get(friendSessionId) ?? []) : []).filter((u: string) => !isDeadMediaUrl(u));
    const sessionPhotos = [...sessionLevelPhotos, ...climbPhotos];
    const rawFriends: { id: string; name: string }[] = friendSessionId ? (sessionFriendsMap.get(friendSessionId) ?? []) : [];
    const partnerIds = rawFriends.map((p: any) => p.id).filter((id: string) => id !== friend.id);
    let partners: { id: string; name: string; avatar_url: string | null }[] | undefined;
    if (partnerIds.length > 0) {
      const { data: partnerProfiles } = await supabase.from('profiles').select('id, name, avatar_url').in('id', partnerIds);
      const profileMap = new Map((partnerProfiles ?? []).map((p: any) => [p.id, p]));
      partners = rawFriends.map((p: any) => ({ id: p.id, name: profileMap.get(p.id)?.name ?? p.name, avatar_url: profileMap.get(p.id)?.avatar_url ?? null }));
    }
    const sessionNotes = friendSessionId ? (sessionNotesMap.get(friendSessionId) ?? undefined) : undefined;
    const sessionTitle = friendSessionId ? (sessionTitleMap.get(friendSessionId) ?? undefined) : undefined;
    const sessionLocation = friendSessionId ? (sessionLocationMap.get(friendSessionId) ?? undefined) : undefined;
    summaries.push({ friend, sessionDate, sessionTime: firstClimbTime, climbCount: sessionClimbs.reduce((sum: number, c: any) => { if (c.type === 'hangboard' || c.type === 'lift') return sum; if (c.outcome === 'flash' || c.outcome === 'hang') return sum + 1; return sum + (c.attempts ?? 1); }, 0), sends, flashes, hardestGrade, hardestGradeSystem, environment, climbType, sessionPhotos: sessionPhotos.length > 0 ? sessionPhotos : undefined, sessionId: friendSessionId, partners, notes: sessionNotes, title: sessionTitle, location: sessionLocation });
  }

  summaries.sort((a, b) => new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime());

  // Pre-fetch photo dimensions so NaturalPhoto renders at the correct size immediately
  const allUris = [...new Set(summaries.flatMap(e => e.sessionPhotos ?? []))];
  const widthCache: Record<string, number> = {};
  await Promise.all(
    allUris.map(uri => new Promise<void>(resolve => {
      Image.getSize(uri, (w, h) => { widthCache[uri] = Math.round(SUMMARY_PHOTO_HEIGHT * w / h); resolve(); }, () => resolve());
    }))
  );
  return summaries.map(e => ({
    ...e,
    photoWidths: e.sessionPhotos ? Object.fromEntries(e.sessionPhotos.filter(u => widthCache[u]).map(u => [u, widthCache[u]])) : undefined,
  }));
}
```

`getFriendRecentSessions`/`getFriendRecentClimbs` are defined later in the same file (lines 162-190) — this is not a problem, since they're `export async function` declarations, which are hoisted, and in any case `getFriendSessionSummaries` only calls them at invocation time (long after the module has fully loaded), not at module-evaluation time.

- [ ] **Step 2: Point `app/friends.tsx` at the shared type**

In `app/friends.tsx`, find the local type declaration inside `FriendsScreen` (around line 621):

```ts
  // Activity feed state
  type SessionSummary = {
    friend: FriendProfile;
    sessionDate: string;
    sessionId?: string;  // set for own sessions, use to load climbs by id
    sessionTime?: string; // ISO timestamp used to determine morning/afternoon/evening
    climbCount: number;
    sends: number;
    flashes: number;
    hardestGrade: string | null;
    hardestGradeSystem: string | null;
    environment?: string;
    climbType?: string;
    partners?: { id: string; name: string; avatar_url?: string | null }[];
    sessionPhotos?: string[];
    photoWidths?: Record<string, number>;
    notes?: string;
    title?: string;
    location?: string;
  };
```

Delete this local declaration entirely. Add `SessionSummary` and `getFriendSessionSummaries` to the existing `import { ... } from '../utils/friendsApi';` block near the top of the file (it currently imports `FriendProfile, FriendRequest, FriendCounts, SessionLike, SessionComment, searchByUsername, ...`).

- [ ] **Step 3: Verify no other local `SessionSummary` references broke**

Run `npx tsc --noEmit` from the project root and confirm no new errors were introduced beyond the pre-existing baseline (documented in `app/sessions.tsx` — one `days`-used-before-declaration error and two `sessionIndex` narrowing errors). `SessionSummary` is used extensively throughout `FriendsScreen` (function signatures, state types) — since the shape is character-for-character identical to what was inlined, this should be a no-op type-wise.

- [ ] **Step 4: Commit**

```bash
git add utils/friendsApi.ts app/friends.tsx
git commit -m "Add getFriendSessionSummaries helper and hoist SessionSummary type"
```

---

### Task 2: Build `components/ActivityCard.tsx`

**Files:**
- Create: `components/ActivityCard.tsx`

This is the "Viewer" card variant — used only for a friend's sessions (never your own). It mirrors `components/SessionCard.tsx`'s self-contained architecture (own local likes/comments state and fetch effect, own on-demand climb fetch) but swaps the Owner-only bits (edit icon, always-delete comments, no like button) for Viewer bits (header avatar/name, like button, delete-own/report-others comments, on-demand climb fetch via `getFriendRecentClimbs` instead of an already-loaded `climbs` array).

- [ ] **Step 1: Create the file**

```tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, Keyboard, Modal, Dimensions, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { FONTS, SPACING, Climb, CLIMB_TYPES } from '../utils/theme';
import ClimbCard from './ClimbCard';
import SwipeableComment from './SwipeableComment';
import LikesAvatarRow from './LikesAvatarRow';
import {
  getSessionLikes, getSessionComments, getCommentLikes,
  addSessionComment, deleteSessionComment, likeComment, unlikeComment,
  likeSession, unlikeSession, getFriendRecentClimbs,
  SessionLike, SessionComment, SessionSummary,
} from '../utils/friendsApi';
import { sendLikeNotification, sendCommentNotification, sendCommentLikeNotification } from '../utils/notifications';
import { reportContent } from '../utils/moderationApi';

const PHOTO_HEIGHT = 220;

function NaturalPhoto({ uri, initialWidth, onPress }: { uri: string; initialWidth?: number; onPress: () => void }) {
  const [imgWidth, setImgWidth] = useState<number | null>(initialWidth ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (initialWidth) return;
    Image.getSize(
      uri,
      (w, h) => setImgWidth(Math.round(PHOTO_HEIGHT * w / h)),
      () => setFailed(true),
    );
  }, [uri, initialWidth]);

  if (failed || imgWidth === null) return null;
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <View style={{ width: imgWidth, height: PHOTO_HEIGHT, borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(128,128,128,0.1)' }}>
        <Image
          source={{ uri }}
          style={{ width: imgWidth, height: PHOTO_HEIGHT }}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      </View>
    </TouchableOpacity>
  );
}

function ProfileAvatar({ name, avatarUrl, size, colors }: { name: string; avatarUrl: string | null; size: number; colors: any }) {
  const [imgError, setImgError] = useState(false);
  const initials = (name || '?').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
  const isUrl = avatarUrl && (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://') || avatarUrl.startsWith('file://'));
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accentSoft, borderWidth: 2, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {isUrl && !imgError
        ? <Image source={{ uri: avatarUrl! }} style={{ width: size, height: size }} onError={() => setImgError(true)} />
        : <Text style={{ color: colors.accent, fontSize: size * 0.32, fontFamily: FONTS.family.bold }}>{initials}</Text>
      }
    </View>
  );
}

function sessionTimeOfDay(isoTime?: string): string {
  if (!isoTime) return 'Climbing Session';
  const hour = new Date(isoTime).getHours();
  if (hour < 12) return 'Morning Climb';
  if (hour < 17) return 'Afternoon Climb';
  return 'Evening Climb';
}

function formatRelativeDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
    const dateDay = new Date(y, m - 1, d);
    const today = new Date();
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffDays = Math.round((todayDay.getTime() - dateDay.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays} days ago`;
  } catch {
    return dateStr;
  }
}

function mapToClimb(c: any): Climb {
  return {
    id: c.id, date: c.date, sessionId: c.session_id,
    type: c.type, outcome: c.outcome, styles: c.styles ?? [],
    environment: c.environment, grade: c.grade, gradeSystem: c.grade_system,
    routeName: c.route_name, location: c.location, notes: c.notes,
    attempts: c.attempts, mediaUri: c.media_uri, mediaType: c.media_type,
    mediaUris: c.media_uris ?? (c.media_uri ? [c.media_uri] : undefined),
    mediaTypes: c.media_types ?? (c.media_type ? [c.media_type] : undefined),
    projectId: c.project_id, projectName: c.project_name,
  };
}

interface ActivityCardProps {
  entry: SessionSummary;
  colors: any;
  currentUserId: string | undefined;
  myAvatar: string | null | undefined;
  daysBack: number;
  displayGrade: (grade: string | null, fromSystem: string | null) => string;
  onShare: () => void;
  onViewProfile: (profile: { id: string; name: string; username: string; avatar_url: string | null }) => void;
}

export default function ActivityCard({
  entry, colors, currentUserId, myAvatar, daysBack, displayGrade, onShare, onViewProfile,
}: ActivityCardProps) {
  const date = parseISO(entry.sessionDate);
  const isOutdoor = entry.environment === 'outdoor';

  const [climbsExpanded, setClimbsExpanded] = useState(false);
  const [expandedClimbs, setExpandedClimbs] = useState<Climb[] | null>(null);
  const [loadingClimbs, setLoadingClimbs] = useState(false);

  const [sessionLikes, setSessionLikes] = useState<SessionLike[]>([]);
  const [sessionComments, setSessionComments] = useState<SessionComment[]>([]);
  const [commentLikesMap, setCommentLikesMap] = useState<Record<string, string[]>>({});
  const [commentText, setCommentText] = useState('');
  const [commentsExpanded, setCommentsExpanded] = useState(false);

  useEffect(() => {
    if (!entry.sessionId) return;
    Promise.all([
      getSessionLikes(entry.sessionId),
      getSessionComments(entry.sessionId),
    ]).then(([likes, comments]) => {
      setSessionLikes(likes);
      setSessionComments(comments);
      if (comments.length > 0) {
        getCommentLikes(comments.map(c => c.id)).then(setCommentLikesMap);
      }
    });
  }, [entry.sessionId]);

  async function handleToggleClimbs() {
    if (climbsExpanded) { setClimbsExpanded(false); return; }
    setClimbsExpanded(true);
    if (expandedClimbs !== null) return;
    setLoadingClimbs(true);
    try {
      const fetched = await getFriendRecentClimbs(entry.friend.id, daysBack);
      const normDate = (d: string) => (d ?? '').slice(0, 10);
      const mapped = fetched
        .filter((c: any) => entry.sessionId ? c.session_id === entry.sessionId : normDate(c.date) === normDate(entry.sessionDate))
        .map(mapToClimb);
      setExpandedClimbs(mapped);
    } catch {
      setExpandedClimbs([]);
    }
    setLoadingClimbs(false);
  }

  const liked = sessionLikes.some(l => l.user_id === currentUserId);

  function handleLikeToggle() {
    if (!currentUserId || !entry.sessionId) return;
    const sessionId = entry.sessionId;
    const alreadyLiked = sessionLikes.some(l => l.user_id === currentUserId);
    if (alreadyLiked) {
      setSessionLikes(prev => prev.filter(l => l.user_id !== currentUserId));
      unlikeSession(sessionId, currentUserId).catch(() => {});
    } else {
      setSessionLikes(prev => [...prev, { user_id: currentUserId, session_id: sessionId, created_at: new Date().toISOString() } as SessionLike]);
      likeSession(sessionId, currentUserId).catch(() => {});
      if (entry.friend.id !== currentUserId) {
        sendLikeNotification(entry.friend.id, currentUserId, sessionId).catch(() => {});
      }
    }
  }

  async function handleCommentLikeToggle(commentId: string, commentAuthorId: string) {
    if (!currentUserId || !entry.sessionId) return;
    const likedBy = commentLikesMap[commentId] ?? [];
    const alreadyLiked = likedBy.includes(currentUserId);
    if (alreadyLiked) {
      await unlikeComment(commentId, currentUserId);
      setCommentLikesMap(prev => ({ ...prev, [commentId]: likedBy.filter(id => id !== currentUserId) }));
    } else {
      await likeComment(commentId, currentUserId);
      setCommentLikesMap(prev => ({ ...prev, [commentId]: [...likedBy, currentUserId] }));
      if (commentAuthorId !== currentUserId) {
        sendCommentLikeNotification(commentAuthorId, currentUserId, entry.sessionId).catch(() => {});
      }
    }
  }

  async function handleDeleteSessionComment(commentId: string) {
    if (!entry.sessionId) return;
    await deleteSessionComment(commentId);
    const updated = await getSessionComments(entry.sessionId);
    setSessionComments(updated);
  }

  function handleReportComment(commentUserId: string, commentId: string) {
    if (!currentUserId) return;
    Alert.alert('Report Comment', 'Are you sure you want to report this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report', style: 'destructive', onPress: async () => {
          try {
            await reportContent(currentUserId, commentUserId, 'comment', commentId, 'Inappropriate comment');
            Alert.alert('Report Submitted', 'Thank you. We review all reports within 24 hours.');
          } catch {
            Alert.alert('Error', 'Could not submit report. Please try again.');
          }
        },
      },
    ]);
  }

  async function handleSendSessionComment() {
    if (!currentUserId || !commentText.trim() || !entry.sessionId) return;
    try {
      await addSessionComment(entry.sessionId, currentUserId, commentText.trim());
    } catch (err: any) {
      Alert.alert('Could not post comment', err?.message ?? 'Unknown error');
      return;
    }
    setCommentText('');
    Keyboard.dismiss();
    const updated = await getSessionComments(entry.sessionId);
    setSessionComments(updated);
    if (entry.friend.id !== currentUserId) {
      sendCommentNotification(entry.friend.id, currentUserId, entry.sessionId).catch(() => {});
    }
  }

  async function submitReportPost(reason: string) {
    if (!currentUserId || !entry.sessionId) return;
    try {
      await reportContent(currentUserId, entry.friend.id, 'session', entry.sessionId, reason);
      Alert.alert('Report Submitted', 'Thank you. We review all reports within 24 hours.');
    } catch {
      Alert.alert('Error', 'Could not submit report. Please try again.');
    }
  }

  function handleMoreMenu() {
    if (!currentUserId || !entry.sessionId) return;
    Alert.alert('Post Options', undefined, [
      {
        text: 'Report Post', style: 'destructive', onPress: () => {
          Alert.alert('Report Post', 'Why are you reporting this post?', [
            { text: 'Spam', onPress: () => submitReportPost('Spam') },
            { text: 'Inappropriate Content', onPress: () => submitReportPost('Inappropriate Content') },
            { text: 'Harassment', onPress: () => submitReportPost('Harassment') },
            { text: 'Cancel', style: 'cancel' },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const [viewerUris, setViewerUris] = useState<string[] | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);

  const visibleComments = commentsExpanded ? sessionComments : sessionComments.slice(0, 3);
  const hiddenCommentCount = sessionComments.length - 3;

  return (
    <View style={[styles.card, { borderBottomColor: colors.border }]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flex: 1 }}
          onPress={() => onViewProfile({ id: entry.friend.id, name: entry.friend.name, username: entry.friend.username, avatar_url: entry.friend.avatar_url })}
          activeOpacity={0.75}
        >
          <ProfileAvatar name={entry.friend.name} avatarUrl={entry.friend.avatar_url ?? null} size={44} colors={colors} />
          <View style={styles.cardHeaderInfo}>
            <Text style={[styles.cardName, { color: colors.textPrimary }]}>{entry.friend.name}</Text>
            <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
              {formatRelativeDate(entry.sessionDate)} · {isOutdoor ? 'Outdoor' : 'Indoor'}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleMoreMenu} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Title */}
      <View style={styles.cardTitleRow}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
          {entry.title?.trim() || sessionTimeOfDay(entry.sessionTime)}
        </Text>
      </View>

      {/* Location */}
      {entry.location?.trim() ? (
        <View style={styles.cardLocationRow}>
          <Ionicons name="location-sharp" size={11} color={colors.textMuted} style={{ marginTop: 1 }} />
          <Text style={[styles.cardLocation, { color: colors.textMuted }]}>{entry.location.trim()}</Text>
        </View>
      ) : null}

      {/* Notes */}
      {entry.notes?.trim() ? (
        <Text style={[styles.cardNotes, { color: colors.textSecondary }]}>{entry.notes.trim()}</Text>
      ) : null}

      {/* Partners */}
      {entry.partners?.length ? (
        <View style={styles.partnersRow}>
          <Text style={[styles.partnersLabel, { color: colors.textMuted }]}>with </Text>
          {entry.partners.map((p, i) => (
            <TouchableOpacity
              key={p.id}
              style={styles.partnerChip}
              activeOpacity={0.7}
              onPress={() => {
                if (p.id === currentUserId) return;
                onViewProfile({ id: p.id, name: p.name, username: '', avatar_url: p.avatar_url ?? null });
              }}
            >
              <ProfileAvatar name={p.name} avatarUrl={p.avatar_url ?? null} size={20} colors={colors} />
              <Text style={[styles.partnerName, { color: colors.accent }]}>
                {p.id === currentUserId ? 'You' : p.name}{i < entry.partners!.length - 1 ? ',' : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {/* Stats */}
      <View style={styles.cardStatsRow}>
        <View style={styles.cardStat}>
          <Text style={[styles.cardStatNum, { color: colors.textPrimary }]}>
            {CLIMB_TYPES.find(t => t.id === entry.climbType)?.label ?? '—'}
          </Text>
          <Text style={[styles.cardStatLbl, { color: colors.textMuted }]}>Type</Text>
        </View>
        <View style={[styles.cardStatDivider, { backgroundColor: colors.border }]} />
        <View style={styles.cardStat}>
          <Text style={[styles.cardStatNum, { color: colors.textPrimary }]}>{entry.climbCount}</Text>
          <Text style={[styles.cardStatLbl, { color: colors.textMuted }]}>Climbs</Text>
        </View>
        {entry.hardestGrade ? (
          <>
            <View style={[styles.cardStatDivider, { backgroundColor: colors.border }]} />
            <View style={styles.cardStat}>
              <Text style={[styles.cardStatNum, { color: colors.accent }]}>{displayGrade(entry.hardestGrade, entry.hardestGradeSystem)}</Text>
              <Text style={[styles.cardStatLbl, { color: colors.textMuted }]}>Hardest</Text>
            </View>
          </>
        ) : null}
      </View>

      {/* Photos */}
      {entry.sessionPhotos && entry.sessionPhotos.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.photoStrip}
          contentContainerStyle={styles.photoStripContent}
        >
          {entry.sessionPhotos.map((uri, i) => (
            <NaturalPhoto
              key={i}
              uri={uri}
              initialWidth={entry.photoWidths?.[uri]}
              onPress={() => { setViewerUris(entry.sessionPhotos!); setViewerIndex(i); }}
            />
          ))}
        </ScrollView>
      )}

      {/* Climbs — collapsed by default, fetched on demand */}
      <TouchableOpacity
        onPress={handleToggleClimbs}
        activeOpacity={0.7}
        style={[styles.cardExpandBtn, { borderColor: colors.border }]}
      >
        <Text style={[styles.cardExpandTxt, { color: colors.textPrimary }]}>
          {climbsExpanded ? 'Hide climbs' : 'View climbs'}
        </Text>
        <Ionicons name={climbsExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      </TouchableOpacity>
      {climbsExpanded && (
        <View style={{ gap: SPACING.sm, marginBottom: SPACING.md }}>
          {loadingClimbs ? (
            <Text style={[styles.cardNoClimbs, { color: colors.textMuted }]}>Loading…</Text>
          ) : !expandedClimbs || expandedClimbs.length === 0 ? (
            <Text style={[styles.cardNoClimbs, { color: colors.textMuted }]}>No climbs found</Text>
          ) : (
            expandedClimbs.map(c => <ClimbCard key={c.id} climb={c} compact />)
          )}
        </View>
      )}

      {/* Likes / comment counts */}
      {(sessionLikes.length > 0 || sessionComments.length > 0) && (
        <View style={styles.cardCounts}>
          <LikesAvatarRow
            likers={sessionLikes.map(l => ({ id: l.id ?? l.user_id, userId: l.user_id, name: l.profile?.name ?? 'Unknown', avatarUrl: l.user_id === currentUserId ? (myAvatar ?? null) : (l.profile?.avatar_url ?? null) }))}
            onPressLiker={(l) => onViewProfile({ id: l.userId, name: l.name, username: '', avatar_url: l.avatarUrl })}
            currentUserId={currentUserId}
            colors={colors}
          />
          {sessionComments.length > 0 && (
            <Text style={[styles.cardCountTxt, { color: colors.textMuted }]}>
              {sessionComments.length} {sessionComments.length === 1 ? 'comment' : 'comments'}
            </Text>
          )}
        </View>
      )}

      {/* Actions */}
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.cardActionBtn} activeOpacity={0.7} onPress={handleLikeToggle}>
          <Ionicons name={liked ? 'thumbs-up' : 'thumbs-up-outline'} size={22} color={liked ? colors.accent : colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.cardActionBtn} activeOpacity={0.7} onPress={() => setCommentsExpanded(true)}>
          <Ionicons name="chatbubble-outline" size={22} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.cardActionBtn} activeOpacity={0.7} onPress={onShare}>
          <Ionicons name="share-outline" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Comment thread */}
      {sessionComments.length > 0 && (
        <View style={[styles.commentSection, { borderTopColor: colors.border }]}>
          {visibleComments.map(c => (
            <SwipeableComment
              key={c.id}
              c={c}
              isOwn={c.user_id === currentUserId}
              onDelete={() => handleDeleteSessionComment(c.id)}
              onReport={c.user_id !== currentUserId ? () => handleReportComment(c.user_id, c.id) : () => {}}
              onLike={() => handleCommentLikeToggle(c.id, c.user_id)}
              onNamePress={() => {
                if (c.user_id === currentUserId) return;
                onViewProfile({ id: c.user_id, name: c.profile?.name ?? 'Unknown', username: c.profile?.username ?? '', avatar_url: c.profile?.avatar_url ?? null });
              }}
              colors={colors}
              commentAvatarUrl={c.user_id === currentUserId ? (myAvatar ?? null) : (c.profile?.avatar_url ?? null)}
              likedByUserIds={commentLikesMap[c.id] ?? []}
              currentUserId={currentUserId ?? ''}
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

      {/* Comment input */}
      <View style={[styles.commentInputRow, { borderColor: colors.border, backgroundColor: colors.bg }]}>
        <TextInput
          style={[styles.commentInputText, { color: colors.textPrimary }]}
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

      {/* Photo viewer for this card's media */}
      {viewerUris && (
        <ActivityCardPhotoViewer
          uris={viewerUris}
          initialIndex={viewerIndex}
          onClose={() => setViewerUris(null)}
        />
      )}
    </View>
  );
}

function ActivityCardPhotoViewer({ uris, initialIndex, onClose }: { uris: string[]; initialIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(initialIndex);
  const scrollRef = useRef<ScrollView>(null);
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: initialIndex * screenWidth, animated: false });
    }, 30);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' }}>
          <TouchableOpacity onPress={onClose} style={{ position: 'absolute', top: 54, right: 20, zIndex: 10, padding: 6 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={26} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          {uris.length > 1 && (
            <View style={{ position: 'absolute', top: 58, left: 0, right: 0, alignItems: 'center', zIndex: 10 }}>
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.medium }}>{index + 1} / {uris.length}</Text>
            </View>
          )}
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={e => setIndex(Math.round(e.nativeEvent.contentOffset.x / screenWidth))}
            style={{ flex: 1 }}
          >
            {uris.map((uri, i) => (
              <View key={i} style={{ width: screenWidth, height: screenHeight, justifyContent: 'center', alignItems: 'center' }}>
                <Image source={{ uri }} style={{ width: screenWidth, height: screenHeight * 0.8 }} resizeMode="contain" />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderBottomWidth: 3,
    paddingVertical: SPACING.xl,
    marginHorizontal: -SPACING.xl,
    paddingHorizontal: SPACING.xl,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingBottom: SPACING.md },
  cardHeaderInfo: { flex: 1 },
  cardName: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.bold, marginBottom: 4 },
  cardMeta: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular },
  cardTitleRow: { paddingTop: SPACING.xs, paddingBottom: SPACING.xs },
  cardTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.family.bold, letterSpacing: -0.2 },
  cardLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingBottom: SPACING.xs },
  cardLocation: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular },
  cardNotes: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular, lineHeight: 20, paddingBottom: SPACING.sm },
  partnersRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingBottom: SPACING.md, gap: SPACING.xs },
  partnersLabel: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular },
  partnerChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  partnerName: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.medium },
  cardStatsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md, gap: 0 },
  cardStat: { flex: 1, alignItems: 'center' },
  cardStatNum: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.bold, letterSpacing: -0.3, marginBottom: 2, textAlign: 'center' },
  cardStatLbl: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardStatDivider: { width: 1, height: 32 },
  photoStrip: { marginTop: SPACING.md, marginHorizontal: -SPACING.xl },
  photoStripContent: { paddingHorizontal: SPACING.xl, gap: SPACING.sm },
  cardExpandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  cardExpandTxt: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.semibold },
  cardNoClimbs: { fontSize: FONTS.sizes.sm, textAlign: 'center', paddingVertical: SPACING.md },
  cardCounts: { flexDirection: 'row', gap: SPACING.md, paddingBottom: SPACING.xs, marginTop: SPACING.md, alignItems: 'center' },
  cardCountTxt: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular },
  cardActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: SPACING.xs },
  cardActionBtn: { flex: 1, alignItems: 'center', paddingVertical: SPACING.md },
  commentSection: { borderTopWidth: 1, marginTop: SPACING.md, paddingTop: SPACING.lg, gap: SPACING.sm },
  commentShowMore: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.medium, paddingVertical: 2 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderWidth: 1, borderRadius: 8, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, marginTop: SPACING.sm },
  commentInputText: { flex: 1, fontSize: FONTS.sizes.sm, maxHeight: 80 },
});
```

`ClimbCard`'s `compact` prop usage here matches how the main Activity feed's own full-screen session detail already renders friend climbs (`app/friends.tsx:1727`, no `onPress`, no swipe-to-delete — a viewer can't edit or delete a friend's climb).

- [ ] **Step 2: Type-check**

Run `npx tsc --noEmit`. This file is new and self-contained; the only expected errors are the pre-existing `app/sessions.tsx` baseline ones. Fix anything else that surfaces (e.g. import path typos) before moving on.

- [ ] **Step 3: Commit**

```bash
git add components/ActivityCard.tsx
git commit -m "Add ActivityCard: self-contained feed-style card for a friend's session"
```

---

### Task 3: Wire both card variants + pagination into `FriendDetailView`

**Files:**
- Modify: `app/friends.tsx`

This is the integration task: replace the compact-row SESSIONS list with the two paginated card feeds, gated on `friend.id === user.id`.

- [ ] **Step 1: Update imports**

At the top of `app/friends.tsx`, the `import { getAllSessions, getAllClimbs, getActiveSessionId, getPreferredDisplayGrades, setFeedRefreshCallback } from '../utils/storage';` line already covers `getAllSessions`/`getAllClimbs`/`getActiveSessionId`/`getPreferredDisplayGrades`. Add `deleteClimb` and `triggerStatsRefresh`:

```ts
import { getAllSessions, getAllClimbs, getActiveSessionId, getPreferredDisplayGrades, setFeedRefreshCallback, deleteClimb, triggerStatsRefresh } from '../utils/storage';
```

Add `Climb` to the existing theme import (`import { FONTS, SPACING, CLIMB_TYPES, getGradeDifficulty, convertGrade } from '../utils/theme';`):

```ts
import { FONTS, SPACING, CLIMB_TYPES, getGradeDifficulty, convertGrade, Climb } from '../utils/theme';
```

Add a new import for `DaySession` and the session helpers (aliasing `sessionTimeOfDay` to avoid shadowing the file's own local `sessionTimeOfDay(isoTime)` function used later in `FriendsScreen`):

```ts
import { DaySession, sessionTimeOfDay as daySessionTimeOfDay } from '../utils/sessionHelpers';
```

Add the two new card components:

```ts
import SessionCard from '../components/SessionCard';
import ActivityCard from '../components/ActivityCard';
```

Add `ClimbDetailModal`:

```ts
import ClimbDetailModal from '../components/ClimbDetailModal';
```

Add `getFriendSessionSummaries` to the existing `friendsApi` import block (it should already have `SessionSummary` added there from Task 1 — add `getFriendSessionSummaries` alongside it).

- [ ] **Step 2: Remove the old `DayGroup` type**

Delete this line (currently at line 122):

```ts
type DayGroup = { date: string; climbs: any[] };
```

- [ ] **Step 3: Replace `FriendDetailView`'s state and data loading**

In `FriendDetailView`, change:

```ts
  const { user } = useAuth();
```

to:

```ts
  const { user, avatarUrl, localAvatarUri } = useAuth();
  const myAvatar = localAvatarUri ?? avatarUrl;
  const { navigateToSession, viewFriendProfile } = useNav();
  const isSelf = user?.id === friend.id;
```

Add new state alongside the existing `useState` declarations in `FriendDetailView` (after `const [listSheetProfile, setListSheetProfile] = useState<FriendProfile | null>(null);`):

```ts
  const [ownDays, setOwnDays] = useState<DaySession[]>([]);
  const [friendSessions, setFriendSessions] = useState<SessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sessionsDaysLoaded, setSessionsDaysLoaded] = useState(14);
  const [loadingMoreSessions, setLoadingMoreSessions] = useState(false);
  const [sessionsCaughtUp, setSessionsCaughtUp] = useState(false);
  const canTriggerLoadMoreSessionsRef = useRef(true);
  const loadingMoreSessionsRef = useRef(false);
  const [shareDay, setShareDay] = useState<DaySession | null>(null);
  const [shareFriendEntry, setShareFriendEntry] = useState<SessionSummary | null>(null);
  const [detailClimb, setDetailClimb] = useState<Climb | null>(null);
  const [preferredBoulder, setPreferredBoulder] = useState('v-scale');
  const [preferredRope, setPreferredRope] = useState('yds');
```

Add a `displayGrade` helper (place it near the other render-time helpers in the component, e.g. right after the `normDate`/stats computations around line 262-267):

```ts
  const BOULDER_SYSTEMS = new Set(['v-scale', 'font']);
  function displayGrade(grade: string | null, fromSystem: string | null): string {
    if (!grade || !fromSystem) return grade ?? '—';
    const preferred = BOULDER_SYSTEMS.has(fromSystem) ? preferredBoulder : preferredRope;
    return convertGrade(grade, fromSystem, preferred);
  }
```

Add `loadSessions` and `loadMoreSessions` functions, placed near the existing `loadClimbs`/`loadCounts`/`loadFriendStatus` functions:

```ts
  async function loadSessions(days: number = sessionsDaysLoaded, showLoading: boolean = true): Promise<number> {
    if (!user) return 0;
    if (showLoading) setLoadingSessions(true);
    try {
      if (isSelf) {
        const [sessions, allClimbs] = await Promise.all([getAllSessions(), getAllClimbs()]);
        const activeId = getActiveSessionId();
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - days);
        const cutoff = daysAgo.toISOString().slice(0, 10);
        const sessionIdsWithClimbs = new Set(allClimbs.map(c => c.sessionId));
        const result: DaySession[] = sessions
          .filter(s => s.id !== activeId && sessionIdsWithClimbs.has(s.id) && s.date >= cutoff)
          .map(s => ({
            date: s.date,
            sessionId: s.id,
            climbs: allClimbs.filter(c => c.sessionId === s.id),
            startedAt: s.startedAt ?? '',
            lastClimbAt: s.lastClimbAt,
            title: s.title,
            notes: s.notes,
            friends: s.friends,
            location: s.location,
            mediaUris: s.mediaUris && s.mediaUris.length > 0 ? s.mediaUris : s.mediaUri ? [s.mediaUri] : [],
            mediaTypes: s.mediaUris && s.mediaUris.length > 0 ? (s.mediaTypes ?? []) : s.mediaType ? [s.mediaType] : [],
          }))
          .sort((a, b) => b.date.localeCompare(a.date));
        setOwnDays(result);
        if (showLoading) setLoadingSessions(false);
        return result.length;
      } else {
        const result = await getFriendSessionSummaries(friend, days);
        setFriendSessions(result);
        if (showLoading) setLoadingSessions(false);
        return result.length;
      }
    } catch {
      if (showLoading) setLoadingSessions(false);
      return 0;
    }
  }

  async function loadMoreSessions() {
    if (loadingMoreSessionsRef.current || !canTriggerLoadMoreSessionsRef.current) return;
    loadingMoreSessionsRef.current = true;
    canTriggerLoadMoreSessionsRef.current = false;
    setLoadingMoreSessions(true);
    const prevCount = isSelf ? ownDays.length : friendSessions.length;
    const next = sessionsDaysLoaded + 7;
    setSessionsDaysLoaded(next);
    const newCount = await loadSessions(next, false);
    setSessionsCaughtUp(newCount <= prevCount);
    setLoadingMoreSessions(false);
    loadingMoreSessionsRef.current = false;
  }
```

Update the initial-load `useEffect` (currently `useEffect(() => { Promise.all([loadClimbs(), loadCounts(), loadFriendStatus()]).catch(() => {}); }, []);`) to also kick off `loadSessions()`:

```ts
  useEffect(() => {
    Promise.all([loadClimbs(), loadCounts(), loadFriendStatus(), loadSessions()]).catch(() => {});
  }, []);

  useEffect(() => {
    getPreferredDisplayGrades().then(({ boulder, rope }) => {
      setPreferredBoulder(boulder);
      setPreferredRope(rope);
    });
  }, []);
```

- [ ] **Step 4: Remove the old `dayMap`/`dayGroups`/`mapToClimb` computation**

Delete this block (currently around lines 289-309):

```ts
  // Sessions
  const dayMap: Record<string, any[]> = {};
  climbs.forEach(c => {
    const d = normDate(c.date);
    if (!dayMap[d]) dayMap[d] = [];
    dayMap[d].push(c);
  });
  const dayGroups: DayGroup[] = Object.entries(dayMap)
    .map(([date, climbList]) => ({ date, climbs: climbList }))
    .sort((a, b) => b.date.localeCompare(a.date));

  function mapToClimb(c: any) {
    return {
      id: c.id, date: c.date, sessionId: c.session_id,
      type: c.type, outcome: c.outcome, styles: c.styles ?? [],
      environment: c.environment, grade: c.grade, gradeSystem: c.grade_system,
      routeName: c.route_name, location: c.location, notes: c.notes,
      attempts: c.attempts, mediaUri: c.media_uri, mediaType: c.media_type,
      projectId: c.project_id, projectName: c.project_name,
    };
  }
```

`climbs`/`normDate`/`monthClimbs`/`monthSends`/`hardestByType`/`allSends` all stay — they still drive the unchanged stats header.

Also remove the now-unused `const [expandedDate, setExpandedDate] = useState<string | null>(null);` state declaration.

- [ ] **Step 5: Add `onScroll` pagination trigger to the outer `ScrollView`**

Change:

```tsx
      <ScrollView style={{ flex: 1 }} contentContainerStyle={detailStyles.scrollContent} showsVerticalScrollIndicator={false}>
```

to:

```tsx
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={detailStyles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={e => {
          const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
          const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
          if (distanceFromBottom < 200) {
            loadMoreSessions();
          } else {
            canTriggerLoadMoreSessionsRef.current = true;
          }
        }}
      >
```

- [ ] **Step 6: Replace the SESSIONS section JSX**

Replace this whole block (currently lines 455-490):

```tsx
            {/* ── Sessions ── */}
            <Text style={[detailStyles.sectionLabel, { color: colors.textPrimary }]}>SESSIONS</Text>
            {dayGroups.length === 0 ? (
              <Text style={[detailStyles.emptyText, { color: colors.textMuted }]}>No sessions logged yet.</Text>
            ) : (
              dayGroups.map(day => {
                const isExpanded = expandedDate === day.date;
                const daySends = day.climbs.filter(c => c.outcome === 'send' || c.outcome === 'flash').length;
                const dayClimbCount = day.climbs.reduce((s: number, c: any) => {
                  if (c.type === 'hangboard' || c.type === 'lift') return s;
                  if (c.outcome === 'flash' || c.outcome === 'hang') return s + 1;
                  return s + (c.attempts ?? 1);
                }, 0);
                const date = parseISO(day.date);
                return (
                  <View key={day.date} style={[detailStyles.sessionBlock, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                    <TouchableOpacity style={detailStyles.sessionHeader} onPress={() => setExpandedDate(isExpanded ? null : day.date)} activeOpacity={0.75}>
                      <View>
                        <Text style={[detailStyles.sessionDate, { color: colors.textPrimary }]}>{format(date, 'EEE, MMM d, yyyy')}</Text>
                        <Text style={[detailStyles.sessionSub, { color: colors.textMuted }]}>
                          {dayClimbCount} climb{dayClimbCount !== 1 ? 's' : ''} · {daySends} send{daySends !== 1 ? 's' : ''}
                        </Text>
                      </View>
                      <Text style={[detailStyles.chevron, isExpanded && detailStyles.chevronOpen, { color: colors.textMuted }]}>›</Text>
                    </TouchableOpacity>
                    {isExpanded && (
                      <View style={[detailStyles.sessionContent, { borderTopColor: colors.border }]}>
                        {day.climbs.map((c, i) => (
                          <ClimbCard key={c.id ?? i} climb={mapToClimb(c)} compact />
                        ))}
                      </View>
                    )}
                  </View>
                );
              })
            )}
```

with:

```tsx
            {/* ── Sessions ── */}
            <Text style={[detailStyles.sectionLabel, { color: colors.textPrimary }]}>SESSIONS</Text>
            {loadingSessions ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: SPACING.lg }} />
            ) : isSelf ? (
              ownDays.length === 0 ? (
                <Text style={[detailStyles.emptyText, { color: colors.textMuted }]}>No sessions logged yet.</Text>
              ) : (
                <>
                  {ownDays.map(day => (
                    <SessionCard
                      key={day.sessionId}
                      day={day}
                      colors={colors}
                      currentUserId={user?.id}
                      myAvatar={myAvatar}
                      onEdit={() => navigateToSession(day.sessionId)}
                      onShare={() => setShareDay(day)}
                      onOpenClimb={(climb) => setDetailClimb(climb)}
                      onDeleteClimb={async (climbId) => {
                        await deleteClimb(climbId);
                        triggerStatsRefresh();
                        loadClimbs();
                        loadSessions(sessionsDaysLoaded, false);
                      }}
                      onViewProfile={viewFriendProfile}
                    />
                  ))}
                  {loadingMoreSessions && <ActivityIndicator color={colors.accent} style={{ marginVertical: SPACING.lg }} />}
                  {!loadingMoreSessions && sessionsCaughtUp && (
                    <Text style={[detailStyles.emptyText, { color: colors.textMuted, textAlign: 'center', marginTop: SPACING.md }]}>You're all caught up</Text>
                  )}
                </>
              )
            ) : (
              friendSessions.length === 0 ? (
                <Text style={[detailStyles.emptyText, { color: colors.textMuted }]}>No sessions logged yet.</Text>
              ) : (
                <>
                  {friendSessions.map(entry => (
                    <ActivityCard
                      key={entry.sessionId ?? entry.sessionDate}
                      entry={entry}
                      colors={colors}
                      currentUserId={user?.id}
                      myAvatar={myAvatar}
                      daysBack={sessionsDaysLoaded}
                      displayGrade={displayGrade}
                      onShare={() => setShareFriendEntry(entry)}
                      onViewProfile={viewFriendProfile}
                    />
                  ))}
                  {loadingMoreSessions && <ActivityIndicator color={colors.accent} style={{ marginVertical: SPACING.lg }} />}
                  {!loadingMoreSessions && sessionsCaughtUp && (
                    <Text style={[detailStyles.emptyText, { color: colors.textMuted, textAlign: 'center', marginTop: SPACING.md }]}>You're all caught up</Text>
                  )}
                </>
              )
            )}
```

- [ ] **Step 7: Add `ShareModal` and `ClimbDetailModal` to `FriendDetailView`'s JSX**

Immediately before the closing `</View>` of `FriendDetailView`'s returned JSX (after the followers/following list-sheet `<Modal>`, currently ending at line 553), add:

```tsx
      <ShareModal
        visible={!!shareDay || !!shareFriendEntry}
        data={
          shareDay
            ? { date: shareDay.date, climbs: shareDay.climbs, location: shareDay.location, title: shareDay.title, climbingWith: shareDay.friends?.map(f => f.name) }
            : shareFriendEntry
            ? {
                date: shareFriendEntry.sessionDate,
                climbCount: shareFriendEntry.climbCount,
                sendCount: shareFriendEntry.sends,
                flashCount: shareFriendEntry.flashes,
                hardestGrade: shareFriendEntry.hardestGrade,
                climbType: shareFriendEntry.climbType,
                friendName: shareFriendEntry.friend.name,
                location: shareFriendEntry.location,
                title: shareFriendEntry.title,
                climbingWith: shareFriendEntry.partners?.map(p => p.name),
              }
            : null
        }
        accentColor={colors.accent}
        onDismiss={() => { setShareDay(null); setShareFriendEntry(null); }}
      />
      <ClimbDetailModal
        visible={!!detailClimb}
        climb={detailClimb}
        onClose={() => setDetailClimb(null)}
        onEdit={() => {
          const sid = detailClimb?.sessionId;
          setDetailClimb(null);
          if (sid) navigateToSession(sid);
        }}
      />
```

- [ ] **Step 8: Remove now-dead styles**

The old compact-row rendering used `detailStyles.sessionBlock`, `sessionHeader`, `sessionDate`, `sessionSub`, `chevron`, `chevronOpen`, and `sessionContent` (in the `detailStyles` `StyleSheet.create` block, currently lines 600-606). None of these are referenced anywhere else after Step 6's replacement. Confirm with `grep -n "detailStyles\.sessionBlock\|detailStyles\.sessionHeader\|detailStyles\.sessionDate\|detailStyles\.sessionSub\|detailStyles\.chevron\b\|detailStyles\.chevronOpen\|detailStyles\.sessionContent" app/friends.tsx` that each returns zero matches once the style-object's own definitions are excluded, then delete those seven lines from `detailStyles`.

- [ ] **Step 9: Type-check**

Run `npx tsc --noEmit`. Fix anything beyond the documented pre-existing baseline errors in `app/sessions.tsx`. Common things to double check:
- `useNav` is already imported at the top of `app/friends.tsx` (it's used elsewhere in `FriendsScreen`) — confirm it's imported once at module scope, not re-imported.
- `parseISO`/`format` from `date-fns` are still used elsewhere in `FriendDetailView` (the removed block was the only place using `parseISO(day.date)` for the old row headers, but `format`/`parseISO` are also used in `FriendsScreen` later in the file, and possibly by `openListSheet` — don't remove the import).
- `ClimbCard` import — after removing the old `mapToClimb`-based inline rendering, confirm `ClimbCard` is still used elsewhere in `FriendDetailView`'s remaining code (it is not, in the new SESSIONS section, since `SessionCard`/`ActivityCard` render their own `ClimbCard`s internally) — but `ClimbCard` is still imported and used by `FriendsScreen`'s own detail-view block (`viewingSession`), so do not remove the import.

- [ ] **Step 10: Commit**

```bash
git add app/friends.tsx
git commit -m "Replace profile SESSIONS compact rows with paginated feed-style cards"
```

---

### Task 4: Manual verification

**Files:** none (verification only)

This is a native Expo app — verification must happen in a simulator or on a physical device, not a browser preview. Hand this task's results back with a plain description of what was checked.

- [ ] **Step 1: Start the app** (`npx expo start`, or however this project is normally run locally) and sign in.

- [ ] **Step 2: Own profile** — tap your own avatar/name to open your profile (`FriendDetailView` with `friend.id === user.id`). Confirm:
  - Stats header (Following/Followers, Last 30 Days, Hardest Sends, Totals) looks unchanged.
  - SESSIONS list shows rich cards identical in style to the Sessions tab — title, location, notes, climbing-with chips, stats row, photos, "View climbs" expand, likes/comments, edit icon.
  - Only the last 14 days of sessions are loaded initially.
  - Scrolling to the bottom loads 7 more days at a time, with a spinner while loading and "You're all caught up" once no more sessions exist.
  - Tapping the edit (pencil) icon on a card switches to the Sessions tab and scrolls to that session (existing `navigateToSession` behavior).
  - Tapping Share opens the share sheet with the correct session data.
  - Tapping a climb opens `ClimbDetailModal`; tapping "Edit" there jumps to the Sessions tab on that session.
  - Deleting a climb from an expanded card removes it and the SESSIONS list + stats header both update.

- [ ] **Step 3: A friend's profile** — open a friend's profile who has recent sessions. Confirm:
  - Stats header still looks unchanged.
  - SESSIONS list shows `ActivityCard`s matching the main Activity feed's look — avatar+name header, title, location, notes, partner chips, stats, photos, "View climbs" expand (inline, fetched on demand), like button, comment thread with delete-own/report-others permissions, share.
  - Liking a session and commenting both work and (if testable with a second account) trigger notifications to the friend.
  - Pagination behaves the same as the own-profile case (14 initial, +7 on scroll, "You're all caught up" at the end).
  - Tapping a partner chip or the header avatar navigates to that person's profile.
  - The "⋯" menu offers Report Post.

- [ ] **Step 4: Regression check on the main Activity feed** — open the Activity tab itself (not a profile) and confirm it looks and behaves exactly as before (this task didn't touch its inline card JSX or state, but worth a quick pass since `SessionSummary` moved location).

- [ ] **Step 5: Report results.** Do not check this task off as complete until actually exercised in a simulator/device — if that isn't possible in this environment, say so explicitly rather than assuming success from `tsc` passing alone.
