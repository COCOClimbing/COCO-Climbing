# Sessions Tab: Feed-Style Cards Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Sessions tab's compact-row list + full-screen detail
navigation with a scrollable feed of rich, read-only session cards (reusing
the Likes+Comments feature already built), a pinned always-editable active
session card, and a full-screen Edit modal for changing a closed session's
metadata. This is Phase 1 of a two-phase project — Phase 2 (reusing this
work for friend/own profile views) is a separate, later plan.

**Architecture:** `app/sessions.tsx`'s `DetailView` function currently does
three jobs in one place: render the active session (always editable inline),
render a closed session read-only ("View mode"), and render a closed
session's editable boxes ("Edit mode"), gated behind full-screen navigation
(`selectedDay` + a "← Back" button). This plan redistributes those three
jobs: the read-only job becomes a new reusable `components/SessionCard.tsx`
(rendered once per closed session directly in the list), the active-session
job moves into the existing `ActiveSessionCard` (already pinned at the top
of the list, currently just a compact preview), and the editable-boxes job
moves into a new full-screen `<Modal>` inside `SessionsScreen`, opened by an
edit icon on each card instead of by navigation. `DetailView` itself is then
deleted.

Several small pure helper functions (`climbCount`, `sessionStats`,
`mergeClimbs`, `sessionTimeOfDay`) currently live inside the `SessionsScreen`
component body, which only `SessionsScreen`'s own closures can reach. Since
`SessionCard` is a separate component (and will be imported by
`app/friends.tsx` in Phase 2), these move to a new `utils/sessionHelpers.ts`
first.

**Tech Stack:** React Native/Expo, TypeScript.

---

### Task 1: Extract shared session helpers into `utils/sessionHelpers.ts`

**Files:**
- Create: `utils/sessionHelpers.ts`
- Modify: `app/sessions.tsx`

- [ ] **Step 1: Create the new file**

```tsx
import { Climb } from './theme';
import { gradeToNum } from './gradeUtils';
import { getTodayISO } from './storage';
import { format, parseISO } from 'date-fns';

export interface DaySession {
  date: string;
  sessionId: string;
  climbs: Climb[];
  startedAt: string;
  lastClimbAt?: string;
  title?: string;
  notes?: string;
  friends?: { id: string; name: string }[];
  location?: string;
  mediaUris?: string[];
  mediaTypes?: ('photo' | 'video')[];
}

export function climbCount(c: Climb): number {
  if (c.type === 'hangboard' || c.type === 'lift') return 0;
  if (c.outcome === 'flash' || c.outcome === 'hang') return 1;
  return c.attempts ?? 1;
}

export function sessionStats(day: DaySession) {
  const gradedClimbs = day.climbs.filter(c => c.type !== 'hangboard' && c.type !== 'lift');
  const sends = gradedClimbs.filter(c => c.outcome === 'send' || c.outcome === 'flash').length;
  const hardest = [...gradedClimbs]
    .filter(c => c.outcome === 'send' || c.outcome === 'flash')
    .sort((a, b) => gradeToNum(b.grade, b.gradeSystem) - gradeToNum(a.grade, a.gradeSystem))[0];
  const projecting = sends === 0 && gradedClimbs.length > 0 && gradedClimbs.every(c => c.projectId);
  const gradedCount = day.climbs.reduce((sum, c) => sum + climbCount(c), 0);
  return { sends, hardest, projecting, gradedCount };
}

export function mergeClimbs(climbs: Climb[]): Climb[] {
  const groups: Record<string, { total: number; notes: string[]; rep: Climb }> = {};
  const result: Climb[] = [];
  climbs.forEach(c => {
    const key = c.projectId && c.outcome === 'attempt' ? c.projectId : null;
    if (key) {
      if (!groups[key]) { groups[key] = { total: 0, notes: [], rep: c }; result.push(c); }
      groups[key].total += c.attempts ?? 0;
      if (c.notes?.trim()) groups[key].notes.push(c.notes.trim());
    } else {
      result.push(c);
    }
  });
  return result.map(c => {
    const key = c.projectId && c.outcome === 'attempt' ? c.projectId : null;
    if (key && groups[key]) {
      const g = groups[key];
      return { ...g.rep, attempts: g.total, notes: g.notes.length > 1 ? g.notes.map(n => `• ${n}`).join('\n') : g.notes[0] };
    }
    return c;
  });
}

export function sessionTimeOfDay(day: DaySession): string {
  const isoTime = day.startedAt || day.lastClimbAt || day.climbs[0]?.date;
  if (!isoTime) return 'Climbing Session';
  const d = new Date(isoTime);
  if (isNaN(d.getTime())) return 'Climbing Session';
  const hour = d.getHours();
  if (hour < 12) return 'Morning Climb';
  if (hour < 17) return 'Afternoon Climb';
  return 'Evening Climb';
}

export function formatSessionLabel(s: DaySession): { top: string; bottom: string } {
  const todayISO = getTodayISO();
  const hasRealTime = !!s.startedAt && s.startedAt.length > 0 && !s.startedAt.endsWith('T00:00:00.000Z');

  if (s.date === todayISO) {
    const timeStr = hasRealTime ? format(new Date(s.startedAt), 'h:mm a') : null;
    return { top: 'TODAY', bottom: timeStr ?? format(new Date(), 'MMM d, yyyy') };
  }
  const date = parseISO(s.date);
  return {
    top: format(date, 'EEE').toUpperCase(),
    bottom: format(date, 'MMM d, yyyy'),
  };
}
```

- [ ] **Step 2: Update `app/sessions.tsx` to import instead of define locally**

Remove the local `interface DaySession { ... }` (near the top of the file,
right after the imports) and the module-scope `function formatSessionLabel`
(search for `function formatSessionLabel`), and the `SessionsScreen`-body
functions `climbCount`, `sessionStats`, `mergeClimbs`, `sessionTimeOfDay`
(search for each `function climbCount`, `function sessionStats`, `function
mergeClimbs`, `function sessionTimeOfDay` — these are currently defined
inside `SessionsScreen`, not at module scope).

Add an import near the top of the file:

```tsx
import { DaySession, climbCount, sessionStats, mergeClimbs, sessionTimeOfDay, formatSessionLabel } from '../utils/sessionHelpers';
```

Every other usage of these (e.g. `sessionStats(day)`, `climbCount(c)`,
`mergeClimbs(day.climbs)`, `sessionTimeOfDay(day)`, `formatSessionLabel(s)`)
stays exactly as it is — only the definitions move, not the call sites.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "sessions.tsx|sessionHelpers.ts"`
Expected: the same two pre-existing baseline errors in `sessions.tsx` (a
`days`-used-before-declaration error, and a `sessionIndex` property error in
the media section) — no new errors, nothing in `sessionHelpers.ts`.

- [ ] **Step 4: Commit**

```bash
git add utils/sessionHelpers.ts app/sessions.tsx
git commit -m "Extract session helper functions into utils/sessionHelpers.ts"
```

---

### Task 2: Create `components/SessionCard.tsx`

**Files:**
- Create: `components/SessionCard.tsx`

This is the new read-only, feed-style card for a closed session. It's a
"dumb" component: no data fetching for the session itself (its `day` prop
already has everything — climbs, notes, location, friends, media), but it
DOES fetch and manage its own Likes+Comments state locally (mirroring what
`DetailView` already does in `app/sessions.tsx`, just scoped per-card now
instead of per-selected-day).

- [ ] **Step 1: Write the component**

```tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, SPACING, Climb, CLIMB_TYPES } from '../utils/theme';
import { DaySession, sessionStats, mergeClimbs, formatSessionLabel, sessionTimeOfDay, climbCount } from '../utils/sessionHelpers';
import ClimbCard from './ClimbCard';
import SwipeToDelete from './SwipeToDelete';
import SwipeableComment from './SwipeableComment';
import LikesAvatarRow from './LikesAvatarRow';
import {
  getSessionLikes, getSessionComments, getCommentLikes,
  addSessionComment, deleteSessionComment, likeComment, unlikeComment,
  SessionLike, SessionComment,
} from '../utils/friendsApi';
import { sendCommentLikeNotification } from '../utils/notifications';

interface SessionCardProps {
  day: DaySession;
  colors: any;
  currentUserId: string | undefined;
  myAvatar: string | null | undefined;
  onEdit: () => void;
  onShare: () => void;
  onOpenClimb: (climb: Climb) => void;
  onDeleteClimb: (climbId: string) => void | Promise<void>;
  onViewProfile: (profile: { id: string; name: string; username: string; avatar_url: string | null }) => void;
}

export default function SessionCard({
  day, colors, currentUserId, myAvatar, onEdit, onShare, onOpenClimb, onDeleteClimb, onViewProfile,
}: SessionCardProps) {
  const { sends, hardest, projecting, gradedCount } = sessionStats(day);
  const label = formatSessionLabel(day);
  const hardestTypeColor = CLIMB_TYPES.find(t => t.id === hardest?.type)?.color ?? colors.accent;
  const displayClimbs = mergeClimbs(day.climbs);

  const [climbsExpanded, setClimbsExpanded] = useState(false);

  const [sessionLikes, setSessionLikes] = useState<SessionLike[]>([]);
  const [sessionComments, setSessionComments] = useState<SessionComment[]>([]);
  const [commentLikesMap, setCommentLikesMap] = useState<Record<string, string[]>>({});
  const [commentText, setCommentText] = useState('');
  const [commentsExpanded, setCommentsExpanded] = useState(false);

  useEffect(() => {
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
  }, [day.sessionId]);

  async function handleCommentLikeToggle(commentId: string, commentAuthorId: string) {
    if (!currentUserId) return;
    const likedBy = commentLikesMap[commentId] ?? [];
    const alreadyLiked = likedBy.includes(currentUserId);
    if (alreadyLiked) {
      await unlikeComment(commentId, currentUserId);
      setCommentLikesMap(prev => ({ ...prev, [commentId]: likedBy.filter(id => id !== currentUserId) }));
    } else {
      await likeComment(commentId, currentUserId);
      setCommentLikesMap(prev => ({ ...prev, [commentId]: [...likedBy, currentUserId] }));
      if (commentAuthorId !== currentUserId) {
        sendCommentLikeNotification(commentAuthorId, currentUserId, day.sessionId).catch(() => {});
      }
    }
  }

  async function handleDeleteSessionComment(commentId: string) {
    await deleteSessionComment(commentId);
    const updated = await getSessionComments(day.sessionId);
    setSessionComments(updated);
  }

  async function handleSendSessionComment() {
    if (!currentUserId || !commentText.trim()) return;
    await addSessionComment(day.sessionId, currentUserId, commentText.trim());
    setCommentText('');
    Keyboard.dismiss();
    const updated = await getSessionComments(day.sessionId);
    setSessionComments(updated);
  }

  const climbMedia: { uri: string; type: 'photo' | 'video'; fromClimb: true; climbId: string }[] = [];
  for (const c of day.climbs) {
    if (c.mediaUris && c.mediaUris.length > 0) {
      c.mediaUris.forEach((uri, i) => climbMedia.push({ uri, type: c.mediaTypes?.[i] ?? 'photo', fromClimb: true, climbId: c.id }));
    } else if (c.mediaUri) {
      climbMedia.push({ uri: c.mediaUri, type: c.mediaType ?? 'photo', fromClimb: true, climbId: c.id });
    }
  }
  const sessionMediaItems = (day.mediaUris ?? []).map((uri, i) => ({ uri, type: day.mediaTypes?.[i] ?? 'photo' as const }));
  const allMedia = [...sessionMediaItems, ...climbMedia];

  const hasNotes = (day.notes ?? '').trim().length > 0;
  const hasLocation = (day.location ?? '').trim().length > 0;
  const hasFriends = (day.friends?.length ?? 0) > 0;
  const hasMedia = allMedia.length > 0;

  const [viewerUris, setViewerUris] = useState<string[] | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);

  const visibleComments = commentsExpanded ? sessionComments : sessionComments.slice(0, 3);
  const hiddenCommentCount = sessionComments.length - 3;

  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.dayLabel, { color: colors.textMuted }]}>{label.top} · {label.bottom}</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {day.title?.trim() || sessionTimeOfDay(day)}
          </Text>
          {hasFriends && (
            <Text style={[styles.friendsLine, { color: colors.textMuted }]}>
              with {day.friends!.map(f => f?.name ?? f).join(', ')}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={onEdit} style={styles.editBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="pencil-outline" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Stats row */}
      <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
        {projecting ? (
          <Text style={[styles.statLbl, { color: colors.accent, fontFamily: FONTS.family.semibold, fontSize: FONTS.sizes.md }]}>Projecting</Text>
        ) : (
          <>
            <View style={styles.stat}>
              <Text style={[styles.statVal, { color: colors.textPrimary }]}>{day.climbs.reduce((s, c) => s + climbCount(c), 0)}</Text>
              <Text style={[styles.statLbl, { color: colors.textMuted }]}>climbs</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statVal, { color: colors.textPrimary }]}>{sends}</Text>
              <Text style={[styles.statLbl, { color: colors.textMuted }]}>sends</Text>
            </View>
          </>
        )}
        {hardest && (
          <View style={[styles.hardestBadge, { backgroundColor: hardestTypeColor + '25', borderColor: hardestTypeColor }]}>
            <Text style={[styles.hardestText, { color: hardestTypeColor }]}>{hardest.grade}</Text>
          </View>
        )}
      </View>

      {/* Notes */}
      {hasNotes && (
        <Text style={[styles.notesText, { color: colors.textSecondary }]}>{day.notes}</Text>
      )}

      {/* Location */}
      {hasLocation && (
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.locationText, { color: colors.textPrimary }]} numberOfLines={1}>{day.location}</Text>
        </View>
      )}

      {/* Media */}
      {hasMedia && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaScroll}>
          {allMedia.map((item, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => { setViewerUris(allMedia.map(m => m.uri)); setViewerIndex(idx); }}
              activeOpacity={0.9}
              style={{ marginRight: SPACING.sm }}
            >
              <Image source={{ uri: item.uri }} style={styles.mediaThumbnail} resizeMode="cover" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Climbs — collapsed by default */}
      <TouchableOpacity onPress={() => setClimbsExpanded(v => !v)} style={styles.climbsToggle} activeOpacity={0.7}>
        <Text style={[styles.climbsToggleText, { color: colors.textPrimary }]}>
          {climbsExpanded ? 'Hide climbs' : 'View climbs'}
        </Text>
        <Ionicons name={climbsExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      </TouchableOpacity>
      {climbsExpanded && (
        <View style={{ gap: SPACING.sm }}>
          {displayClimbs.length === 0 ? (
            <Text style={[styles.noClimbs, { color: colors.textMuted }]}>No climbs logged yet</Text>
          ) : (
            displayClimbs.map(c => (
              <SwipeToDelete key={c.id} heightOffset={0} onDelete={() => onDeleteClimb(c.id)}>
                <ClimbCard climb={c} compact onPress={() => onOpenClimb(c)} />
              </SwipeToDelete>
            ))
          )}
        </View>
      )}

      {/* Activity: likes + comments */}
      <View style={[styles.activitySection, { borderTopColor: colors.border }]}>
        <LikesAvatarRow
          likers={sessionLikes.map(l => ({ id: l.id, userId: l.user_id, name: l.profile?.name ?? 'Unknown', avatarUrl: l.user_id === currentUserId ? (myAvatar ?? null) : (l.profile?.avatar_url ?? null) }))}
          onPressLiker={(l) => onViewProfile({ id: l.userId, name: l.name, username: '', avatar_url: l.avatarUrl })}
          currentUserId={currentUserId}
          colors={colors}
        />
        {sessionComments.length > 0 && (
          <View style={{ marginTop: SPACING.sm }}>
            {visibleComments.map(c => (
              <SwipeableComment
                key={c.id}
                c={c}
                isOwn // this card only ever shows your own session, so you can always delete
                onDelete={() => handleDeleteSessionComment(c.id)}
                onReport={() => {}} // never reportable on your own post
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
      </View>

      {/* Action row */}
      <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
        <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={() => setCommentsExpanded(true)}>
          <Ionicons name="chatbubble-outline" size={20} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={onShare}>
          <Ionicons name="share-outline" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Photo viewer for this card's media (own lightweight modal — see Task 2 Step 2) */}
      {viewerUris && (
        <SessionCardPhotoViewer
          uris={viewerUris}
          initialIndex={viewerIndex}
          onClose={() => setViewerUris(null)}
        />
      )}
    </View>
  );
}
```

- [ ] **Step 2: Add a minimal photo viewer sub-component to the same file**

Append below the `SessionCard` function (still in `components/SessionCard.tsx`):

```tsx
function SessionCardPhotoViewer({ uris, initialIndex, onClose }: { uris: string[]; initialIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(initialIndex);
  const scrollRef = useRef<ScrollView>(null);
  const screenWidth = require('react-native').Dimensions.get('window').width;
  const screenHeight = require('react-native').Dimensions.get('window').height;

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
```

Add `Modal` to the `react-native` import at the top of the file (`import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, Keyboard, Modal } from 'react-native';`).

This duplicates the existing photo-viewer modal already in `app/sessions.tsx`
(`photoViewerModal` const, used for the Edit modal's media) rather than
threading a shared-viewer callback across the new component boundary —
acceptable duplication for a small, self-contained, purely-presentational
piece; do not try to unify it with `sessions.tsx`'s viewer in this task.

- [ ] **Step 3: Add styles**

Append at the bottom of `components/SessionCard.tsx`:

```tsx
const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: SPACING.lg, gap: SPACING.md },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  dayLabel: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.bold, letterSpacing: 1 },
  title: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.family.bold, lineHeight: 28, marginTop: SPACING.xs },
  friendsLine: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular, marginTop: 2 },
  editBtn: { padding: 4 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg, paddingTop: SPACING.sm, borderTopWidth: 1 },
  stat: { alignItems: 'center' },
  statVal: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.family.bold, textAlign: 'center' },
  statLbl: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular, textAlign: 'center' },
  hardestBadge: { borderRadius: 6, paddingHorizontal: SPACING.sm, paddingVertical: 3, borderWidth: 1 },
  hardestText: { fontSize: FONTS.sizes.sm },
  notesText: { fontSize: FONTS.sizes.sm, lineHeight: 20 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  locationText: { flex: 1, fontSize: FONTS.sizes.md },
  mediaScroll: { flexGrow: 0 },
  mediaThumbnail: { width: 120, height: 120, borderRadius: 8, backgroundColor: '#222' },
  climbsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: SPACING.xs },
  climbsToggleText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.medium },
  noClimbs: { fontSize: FONTS.sizes.sm, textAlign: 'center', paddingVertical: SPACING.md },
  activitySection: { borderTopWidth: 1, paddingTop: SPACING.md },
  commentShowMore: { fontSize: FONTS.sizes.sm, marginTop: SPACING.xs },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderWidth: 1, borderRadius: 8, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, marginTop: SPACING.sm },
  commentInputText: { flex: 1, fontSize: FONTS.sizes.sm, maxHeight: 80 },
  actionsRow: { flexDirection: 'row', gap: SPACING.lg, borderTopWidth: 1, paddingTop: SPACING.sm },
  actionBtn: { padding: 4 },
});
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p . 2>&1 | grep "SessionCard.tsx"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add components/SessionCard.tsx
git commit -m "Add SessionCard: read-only feed-style card for a closed session"
```

---

### Task 3: Wire `SessionCard` into the Sessions tab list, remove old compact rows

**Files:**
- Modify: `app/sessions.tsx`

- [ ] **Step 1: Import `SessionCard`**

```tsx
import SessionCard from '../components/SessionCard';
```

- [ ] **Step 2: Delete the old `renderDay` function**

Search for `function renderDay({ item }: { item: DaySession })` and delete
the entire function (from its declaration through its closing `}`, the block
that wraps a `SwipeToDelete` around a `TouchableOpacity` showing the compact
row with `sessionBlock`/`sessionHeader`/`sessionLeft`/`sessionMeta` styles,
ending with the chevron `Text` and closing tags). This entire compact-row
renderer is superseded by `SessionCard`.

- [ ] **Step 3: Replace the `FlatList` with a `ScrollView` + `.map()`**

Find (in the `return` statement, inside the `{/* List view ... */}` block):

```tsx
        <FlatList
          ref={listRef}
          data={listDays}
          keyExtractor={item => item.sessionId}
          renderItem={renderDay}
          contentContainerStyle={styles.list}
          scrollEnabled={listScrollEnabled}
          onScrollToIndexFailed={() => {}}
          ListHeaderComponent={<ActiveSessionCard />}
          ListEmptyComponent={
            !activeSession
              ? <EmptyState icon="" title="No sessions yet" subtitle="Press + to log your first climb" />
              : null
          }
        />
```

Change to:

```tsx
        <ScrollView contentContainerStyle={styles.list}>
          <ActiveSessionCard />
          {listDays.length === 0 && !activeSession && (
            <EmptyState icon="" title="No sessions yet" subtitle="Press + to log your first climb" />
          )}
          {listDays.map(day => (
            <SessionCard
              key={day.sessionId}
              day={day}
              colors={colors}
              currentUserId={user?.id}
              myAvatar={localAvatarUri ?? avatarUrl}
              onEdit={() => { setSelectedDay(day); setEditModalVisible(true); }}
              onShare={() => setShareDay(day)}
              onOpenClimb={(climb) => setDetailClimb(climb)}
              onDeleteClimb={async (climbId) => { await deleteClimb(climbId); triggerStatsRefresh(); load(); }}
              onViewProfile={viewFriendProfile}
            />
          ))}
        </ScrollView>
```

(`editModalVisible` is new state added in Task 5 — this task references it
now so the wiring is complete once Task 5 lands; if implementing tasks
strictly in order, this line will cause a `tsc` error until Task 5 adds that
state. That's expected and fine for this plan's task ordering — see the
note in Task 5.)

`FlatList`, `EmptyState`'s existing import, `keyExtractor` — no longer
needed for this list; `FlatList` may still be imported/used elsewhere in
this file (it is not, based on this plan's own review, but double-check
before removing the import in a later cleanup task, not this one).

- [ ] **Step 4: Verify**

This step's own `tsc` check will show an error referencing `editModalVisible`
(not yet defined) — that's expected. Confirm the ONLY new error is exactly
that (`Cannot find name 'editModalVisible'` or similar), with no other new
errors, by running:

`npx tsc --noEmit -p . 2>&1 | grep "sessions.tsx"`

- [ ] **Step 5: Commit**

```bash
git add app/sessions.tsx
git commit -m "Replace Sessions tab's compact-row list with SessionCard feed"
```

---

### Task 4: Rebuild `ActiveSessionCard` with full inline-editable content

**Files:**
- Modify: `app/sessions.tsx`

Currently `ActiveSessionCard` (search for `function ActiveSessionCard()`) is
a compact preview — tapping it opens the (soon to be deleted) `DetailView`
for full editing. This task moves that full editing experience directly
into `ActiveSessionCard` itself, since the active session should always be
fully inline-editable with no navigation.

- [ ] **Step 1: Replace `ActiveSessionCard`'s body**

Find the current `function ActiveSessionCard() { ... }` (the whole function,
from `if (!activeSession) return null;` through its closing `}`, including
the `<SwipeToDelete>`-free `sessionBlock` wrapper, tappable header row, and
"End Session" footer button).

Replace it with a version that renders the same content `DetailView`
currently renders for `isActive === true` sessions — i.e., an editable
title, always-interactive Notes/Location/Climbing With/Media sections, the
full climbs list (with swipe-to-send and increment-attempts, both
`isActive`-only behaviors today), and the "End Session"/"+ Add Climb"
actions row. Since this content already exists working correctly inside
`DetailView`, the source of truth for the exact JSX/logic to move is
`DetailView`'s current `isActive` branch — an implementer must read the
CURRENT `app/sessions.tsx` (this file has had several rounds of changes
today; line numbers below are approximate) and transplant:

1. The editable-title JSX (`editingTitle ? <TextInput ...> : canEditMeta ?
   <TouchableOpacity ...pencil...> : <plain Text>` — for `ActiveSessionCard`,
   only the `editingTitle` and the `canEditMeta`-true branches are ever
   reachable since `isActive` is always true here, so simplify to just those
   two, dropping the plain-`Text`-only fallback branch).
2. The `notesSection`, `locationSection`, `friendsSection`, `mediaSection`
   consts (currently defined inside `DetailView`, fully interactive,
   unconditional now — see Task 5, which ALSO needs these same consts for
   the Edit modal; both `ActiveSessionCard` and the new Edit modal need
   independent copies of this logic, since they're two different mounted
   component instances with their own local `editingNotes`/`editingTitle`
   state).
3. The full climbs list rendering (mirrors `SessionCard`'s expanded-climbs
   JSX from Task 2, but ALWAYS expanded for the active session — no
   collapse/expand toggle — and with the active-only `rightAction`
   swipe-to-send and `onIncrementAttempts` behaviors preserved).
4. The Actions row's active-session branch: "End Session" button (existing
   `onPress` handler logic, unchanged) and "+ Add Climb" is NOT part of the
   active branch's actions row in the source — re-check: the current
   Actions row shows "End Session" OR "+ Add Climb" depending on `isActive`;
   since `ActiveSessionCard` is only ever active, it only needs "End
   Session", plus the existing "Share"/"Edit Date" secondary buttons.

Because this transplant requires `editingTitle`/`editingNotes`/`sessionTitle`/
`sessionNotes`/`sessionFriends`/`sessionLocation`/`sessionMediaItems`
(currently `SessionsScreen`-level state, shared/reused across whichever
session is "selected") to apply correctly to the ACTIVE session specifically
— and `ActiveSessionCard` is now rendered unconditionally (not gated behind
`selectedDay`) — this task must also ensure `SessionsScreen`'s existing
`useEffect` that syncs `sessionTitle`/`sessionNotes`/etc. from `selectedDay`
(search for `// Sync editing state when a different session is opened`)
ALSO initializes correctly for the active session on mount/load, since
`selectedDay` will no longer automatically equal the active session (that
concept is being retired — `selectedDay` is repurposed in Task 5 to mean
"the session currently open in the Edit modal", which is never the active
session). Concretely: `ActiveSessionCard` needs ITS OWN local state for
title/notes/friends/location/media editing (mirroring the `SessionCard`
pattern from Task 2, but interactive instead of read-only), NOT the shared
`SessionsScreen`-level state that Task 5's Edit modal will use — these are
two independent editing contexts that must not collide. Initialize this
local state from `activeSession` directly (via `useState(() =>
activeSession?.title ?? '')`-style lazy initializers, or a `useEffect` keyed
on `activeSession?.sessionId`), and call a save function equivalent to
`handleSaveSessionMeta`/`handleSaveTitle`/`handleSaveNotes` but targeting
`activeSession.sessionId` explicitly rather than relying on
`selectedDayRef`.

Given the complexity of this transplant, self-review carefully against the
Testing checklist at the end of this plan before considering this task
done, and flag anything ambiguous rather than guessing.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit -p . 2>&1 | grep "sessions.tsx"`
Expected: no new errors beyond the two known pre-existing baseline errors
and the expected `editModalVisible` reference from Task 3 (still not yet
defined until Task 5 — confirm this is the ONLY additional error beyond
baseline).

- [ ] **Step 3: Commit**

```bash
git add app/sessions.tsx
git commit -m "Make ActiveSessionCard fully inline-editable, remove tap-to-detail"
```

---

### Task 5: Build the Edit modal, wire Share/Edit Date/Delete Session

**Files:**
- Modify: `app/sessions.tsx`

- [ ] **Step 1: Add `editModalVisible` state**

Near the other `SessionsScreen`-level `useState` declarations (search for
`const [selectedDay, setSelectedDay] = useState<DaySession | null>(null);`),
add directly below it:

```tsx
  const [editModalVisible, setEditModalVisible] = useState(false);
```

`selectedDay` is now repurposed: it means "the session currently open in the
Edit modal" (previously it meant "the session currently open in the
full-screen detail view"). `SessionCard`'s `onEdit` callback (wired in Task
3) already does `setSelectedDay(day); setEditModalVisible(true);` — this
step just adds the missing state.

- [ ] **Step 2: Build the Edit modal component**

This modal's content is `DetailView`'s current Edit-mode rendering,
relocated. Read the CURRENT `app/sessions.tsx`'s `DetailView` function in
full before starting (it has had several rounds of changes today; do not
rely on stale line numbers). You need:

- The `notesSection`, `locationSection`, `friendsSection`, `mediaSection`
  consts (search for `const notesSection = (`, `const locationSection = (`,
  `const friendsSection = (`, `const mediaSection = (`) — these are already
  fully interactive (no gating), reuse verbatim.
- The full climbs-list rendering (`climbsSection` const, search for `const
  climbsSection = (`) — reuse verbatim; note it currently branches on
  `isActive` for swipe-to-send/increment-attempts, which should evaluate to
  the closed-session (non-active) behavior here, since the Edit modal only
  ever opens for closed sessions.
- The header (title, date label, stats row) — reuse the `canEditMeta`-true
  title-editing branch (search for the title's three-way ternary in the
  header) and the stats-row JSX, adapted to always show the editable title
  (no need for the `isActive`-branch date label, since this modal never
  opens for the active session).

Wrap all of this in a new `<Modal>`, added to `SessionsScreen`'s `return`
statement alongside the other shared modals (near `<ShareModal ... />`):

```tsx
      <Modal
        visible={editModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditModalVisible(false)}
      >
        {selectedDay && (
          <SessionEditModalContent
            day={selectedDay}
            onDone={() => { setEditModalVisible(false); setSelectedDay(null); }}
          />
        )}
      </Modal>
```

Define `SessionEditModalContent` as a new function component INSIDE
`SessionsScreen` (same module-scope-closure pattern `DetailView` and
`ActiveSessionCard` already use, so it retains access to all the shared
`SessionsScreen`-level state/handlers — `sessionTitle`, `sessionNotes`,
`handleSaveSessionMeta`, `handleSaveTitle`, `handleSaveNotes`,
`handlePickSessionMedia`, `openLogModal`, `setChangeDateSession`,
`setShareDay`, etc. — exactly as `DetailView` does today). Its content is:

1. A top bar with a "Done" button (calls the `onDone` prop) — no "Edit"
   toggle needed (this modal IS the edit view).
2. The header (editable title, stats row) as described above.
3. `notesSection`, `locationSection`, `friendsSection`, `mediaSection` (in
   that order, matching today's Edit-mode section order).
4. `climbsSection` (the full list).
5. A "+ Add Climb" button: `onPress={() => openLogModal(day.sessionId)}`.
6. "Edit Date" button: `onPress={() => setChangeDateSession(day)}` (reuses
   the EXISTING `changeDateSession` state and the already-rendered
   `<MiniCalendar visible={changeDateSession !== null} ... mode="pick" />`
   modal at the bottom of `SessionsScreen` — no new date-picker needed).
7. A new "Delete Session" button — see Step 3 below for its handler.

- [ ] **Step 3: Add the `handleDeleteSession` handler**

Near `handleShareDay` (search for `async function handleShareDay(day:
DaySession)`), add:

```tsx
  async function handleDeleteSession(day: DaySession) {
    Alert.alert('Delete Session', 'This will delete the session and all its climbs. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          for (const c of day.climbs) await deleteClimb(c.id);
          await deleteSession(day.sessionId);
          triggerStatsRefresh();
          setEditModalVisible(false);
          setSelectedDay(null);
          await load();
        },
      },
    ]);
  }
```

Wire it into `SessionEditModalContent`'s "Delete Session" button:
`onPress={() => handleDeleteSession(day)}`.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p . 2>&1 | grep "sessions.tsx"`
Expected: back down to ONLY the two known pre-existing baseline errors — the
`editModalVisible`-undefined error from Task 3 should now be resolved since
this task defines it.

- [ ] **Step 5: Commit**

```bash
git add app/sessions.tsx
git commit -m "Add Edit modal for closed sessions, wire Delete Session"
```

---

### Task 6: Remove `DetailView` and other now-dead code

**Files:**
- Modify: `app/sessions.tsx`

- [ ] **Step 1: Delete the `DetailView` function entirely**

Search for `function DetailView({ day }: { day: DaySession }) {` and delete
the whole function through its closing `}`. Every piece of its content has
been redistributed: the read-only sections → `SessionCard` (Task 2), the
active-session content → `ActiveSessionCard` (Task 4), the editable-boxes
content → `SessionEditModalContent` (Task 5).

- [ ] **Step 2: Remove the render-time reference to `DetailView`**

Find (in the `return` statement):

```tsx
      {/* List view — always mounted so FlatList never loses its scroll position */}
      <View style={{ flex: 1, display: selectedDay ? 'none' : 'flex' }}>
        ...
      </View>

      {/* Detail view */}
      {selectedDay && <DetailView day={selectedDay} />}
```

Change to (the list is now always visible — `selectedDay` no longer means
"a full-screen detail is open", so the `display: 'none'` toggle and the
`DetailView` render are both gone):

```tsx
      <View style={{ flex: 1 }}>
        ...
      </View>
```

(Keep everything that was inside that `<View>` — the top bar, the
`ScrollView` from Task 3, the `MiniCalendar` for `calendarVisible` —
unchanged; only the wrapping `display` style and the `DetailView` line
below it are removed.)

- [ ] **Step 3: Remove `goBackToList`**

Search for `function goBackToList()` and delete it — it was only ever
called from `DetailView`'s "← Back" button and its `PanResponder`
swipe-back gesture, both now gone. Confirm via `grep -n goBackToList
app/sessions.tsx` that no other call sites remain before deleting.

- [ ] **Step 4: Remove the now-unused `listRef` and `onScrollToIndexFailed`**

`listRef` (`const listRef = useRef<FlatList>(null);`) was only ever passed
to the old `FlatList` (removed in Task 3) and never called anywhere else —
confirm via `grep -n listRef app/sessions.tsx` (should show only the
declaration after Task 3's changes), then remove the declaration.

- [ ] **Step 5: Check `_detailScrollY` and other `DetailView`-only module state**

`_detailScrollY` (module-scope `let`, near the top of the file) was only
read/written inside `DetailView`. Confirm via `grep -n _detailScrollY
app/sessions.tsx` that no references remain after Step 1, then remove the
declaration.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit -p . 2>&1 | grep "sessions.tsx"`
Expected: exactly the two original pre-existing baseline errors (a
`days`-used-before-declaration error, and a `sessionIndex` property error in
a media union type) — confirm their line numbers still make sense in the
new, shorter file (they may have shifted). No other errors. Also run a full
`npx tsc --noEmit -p .` scan (not filtered) to confirm nothing else in the
repo references `DetailView`, `goBackToList`, or other removed symbols from
`app/sessions.tsx` (nothing should, since these were all module-private to
this file, but confirm).

- [ ] **Step 7: Commit**

```bash
git add app/sessions.tsx
git commit -m "Remove DetailView and other dead code after Sessions tab redesign"
```

---

### Task 7: Manual verification

No test framework in this repo. This is a native RN/Expo app — hand off to
the user for on-device testing:

- Sessions tab shows a scrollable feed: active session (if any) pinned at
  top, fully editable inline, no edit icon; closed sessions below as
  read-only cards.
- Tapping "View climbs" on a closed session's card expands the full climb
  list inline; tap a climb for detail, swipe a climb to delete it — both
  work without needing to open Edit mode.
- Tapping a closed session's edit icon opens the full-screen Edit modal;
  editing Notes/Location/Climbing With/Media there saves correctly and is
  reflected back in the card once the modal closes ("Done").
- "+ Add Climb", "Edit Date", and "Delete Session" all work from inside the
  Edit modal.
- Share (on the card, no edit needed) opens the existing share sheet
  correctly.
- Adding/liking/deleting a comment, and viewing likers, works directly on
  the card — confirm it matches what shows in the Activity feed for that
  same session.
- Tapping a liker/commenter avatar (not yourself) navigates to their
  profile.
- Ending an active session correctly moves it out of the pinned slot and
  into the regular closed-session feed (as a new read-only card).
- The `+ Session` and `Calendar` buttons at the top still work as before.
