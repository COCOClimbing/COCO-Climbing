# Sessions Tab Condensed View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent toggle to the Sessions tab that condenses every closed session card down to just its header/title/stats/"View climbs" button, hiding location, notes, partners, photos, likes/comments, and the comment thread — for fast scanning — with a button to expand back to full detail.

**Architecture:** `components/SessionCard.tsx` gets a new optional `condensed` prop (default `false`, so all other callers — e.g. `FriendDetailView`'s own-profile SESSIONS list — are unaffected) that conditionally hides specific sections. `app/sessions.tsx` owns the toggle button and the persisted boolean state, loaded from and saved to `AsyncStorage` via two new functions in `utils/storage.ts` that mirror the existing `getPreferredDisplayGrades`/`savePreferredDisplayGrades` pattern.

**Tech Stack:** React Native / Expo, TypeScript, AsyncStorage.

---

### Task 1: Persisted storage helpers

**Files:**
- Modify: `utils/storage.ts`

- [ ] **Step 1: Add the condensed-view preference key and get/set functions**

Add this at the end of `utils/storage.ts` (after the existing `getPreferredDisplayGrades` function, which ends the file):

```ts

// ─── Sessions Tab Condensed View ──────────────────────────────────────────────

const SESSIONS_CONDENSED_KEY = 'coco_sessions_condensed';

export async function saveSessionsCondensed(condensed: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSIONS_CONDENSED_KEY, JSON.stringify(condensed));
  } catch {}
}

export async function getSessionsCondensed(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SESSIONS_CONDENSED_KEY);
    if (!raw) return false;
    return JSON.parse(raw) === true;
  } catch { return false; }
}
```

- [ ] **Step 2: Type-check**

Run `npx tsc --noEmit`. This is a self-contained addition — confirm no new errors anywhere (compare against the current baseline, which as of this plan is 25 total `error TS` lines across the repo, none in `utils/storage.ts`).

- [ ] **Step 3: Commit**

```bash
git add utils/storage.ts
git commit -m "Add persisted sessions-condensed-view preference helpers"
```

---

### Task 2: `condensed` prop on `SessionCard`

**Files:**
- Modify: `components/SessionCard.tsx`

- [ ] **Step 1: Add the prop to `SessionCardProps` and the function signature**

Change:

```ts
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
  onSwipeStart?: () => void;
  onSwipeEnd?: () => void;
}

export default function SessionCard({
  day, colors, currentUserId, myAvatar, onEdit, onShare, onOpenClimb, onDeleteClimb, onViewProfile, onSwipeStart, onSwipeEnd,
}: SessionCardProps) {
```

to:

```ts
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
  onSwipeStart?: () => void;
  onSwipeEnd?: () => void;
  condensed?: boolean;
}

export default function SessionCard({
  day, colors, currentUserId, myAvatar, onEdit, onShare, onOpenClimb, onDeleteClimb, onViewProfile, onSwipeStart, onSwipeEnd, condensed = false,
}: SessionCardProps) {
```

- [ ] **Step 2: Wrap the sections that hide when condensed**

Six edits in the JSX, each wrapping an existing conditional block's condition with `!condensed &&`. Do not change anything else about these blocks — same content, same styles, just gated on an additional `!condensed` check.

**Location** — change:

```tsx
      {/* Location */}
      {hasLocation && (
```

to:

```tsx
      {/* Location */}
      {!condensed && hasLocation && (
```

**Notes** — change:

```tsx
      {/* Notes */}
      {hasNotes && (
```

to:

```tsx
      {/* Notes */}
      {!condensed && hasNotes && (
```

**Climbing with** — change:

```tsx
      {/* Climbing with */}
      {hasFriends && (
```

to:

```tsx
      {/* Climbing with */}
      {!condensed && hasFriends && (
```

**Photos** — change:

```tsx
      {/* Photos */}
      {hasMedia && (
```

to:

```tsx
      {/* Photos */}
      {!condensed && hasMedia && (
```

**Likes / comment counts** — change:

```tsx
      {/* Likes / comment counts */}
      {(sessionLikes.length > 0 || sessionComments.length > 0) && (
```

to:

```tsx
      {/* Likes / comment counts */}
      {!condensed && (sessionLikes.length > 0 || sessionComments.length > 0) && (
```

**Actions row** — change:

```tsx
      {/* Actions */}
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.cardActionBtn} activeOpacity={0.7} onPress={() => setCommentsExpanded(true)}>
          <Ionicons name="chatbubble-outline" size={22} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.cardActionBtn} activeOpacity={0.7} onPress={onShare}>
          <Ionicons name="share-outline" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
```

to:

```tsx
      {/* Actions */}
      {!condensed && (
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.cardActionBtn} activeOpacity={0.7} onPress={() => setCommentsExpanded(true)}>
            <Ionicons name="chatbubble-outline" size={22} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.cardActionBtn} activeOpacity={0.7} onPress={onShare}>
            <Ionicons name="share-outline" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}
```

**Comment thread** — change:

```tsx
      {/* Comment thread */}
      {sessionComments.length > 0 && (
```

to:

```tsx
      {/* Comment thread */}
      {!condensed && sessionComments.length > 0 && (
```

**Comment input** — change:

```tsx
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
```

to:

```tsx
      {/* Comment input */}
      {!condensed && (
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
      )}
```

Leave everything else untouched: the header, title, stats row, and the "View climbs" expand button + expanded climbs list must NOT be wrapped in any `condensed` check — they always render, and the climb-list expand/collapse (`climbsExpanded` state) is completely independent of `condensed`.

Do not add a `condensed` check around the `SessionCardPhotoViewer` render at the bottom (`{viewerUris && (...)}`) — leave it exactly as-is. It's already unreachable when condensed, since it only opens from a photo tap and the photo strip itself is hidden when condensed, so no behavior changes are needed there.

- [ ] **Step 3: Type-check**

Run `npx tsc --noEmit`, confirm no new errors.

- [ ] **Step 4: Commit**

```bash
git add components/SessionCard.tsx
git commit -m "Add condensed prop to SessionCard, hiding optional sections when set"
```

---

### Task 3: Wire the toggle button and persisted state into the Sessions tab

**Files:**
- Modify: `app/sessions.tsx`

- [ ] **Step 1: Import the new storage helpers**

Change the existing `utils/storage` import:

```ts
import {
  getAllSessions, getAllClimbs, deleteSession, deleteClimb,
  getOrCreateSessionForDate, createNewSession, saveSession, saveClimb,
  getTodayISO, setActiveSessionId, getActiveSessionId, endSession,
  setSessionsRefreshCallback, cleanupEmptySessions, restoreActiveSession,
  triggerFeedRefresh, triggerStatsRefresh,
} from '../utils/storage';
```

to:

```ts
import {
  getAllSessions, getAllClimbs, deleteSession, deleteClimb,
  getOrCreateSessionForDate, createNewSession, saveSession, saveClimb,
  getTodayISO, setActiveSessionId, getActiveSessionId, endSession,
  setSessionsRefreshCallback, cleanupEmptySessions, restoreActiveSession,
  triggerFeedRefresh, triggerStatsRefresh, getSessionsCondensed, saveSessionsCondensed,
} from '../utils/storage';
```

- [ ] **Step 2: Add condensed state**

Find `const [days, setDays] = useState<DaySession[]>(_cachedDays);` (near the top of `SessionsScreen`'s state declarations) and add a new state line immediately after it:

```ts
  const [days, setDays] = useState<DaySession[]>(_cachedDays);
  const [sessionsCondensed, setSessionsCondensed] = useState(false);
```

- [ ] **Step 3: Load the persisted value on mount**

Find the existing mount effect:

```ts
  useEffect(() => { load(); }, []);
```

Add a second effect right after it:

```ts
  useEffect(() => { load(); }, []);

  useEffect(() => {
    getSessionsCondensed().then(setSessionsCondensed);
  }, []);
```

- [ ] **Step 4: Add the toggle handler**

Add this function near the other handler functions (e.g. right before `handleNewSession`, or any other convenient spot among the component's other handler functions):

```ts
  async function handleToggleCondensed() {
    const next = !sessionsCondensed;
    setSessionsCondensed(next);
    await saveSessionsCondensed(next);
  }
```

- [ ] **Step 5: Add the toggle button to the top bar**

Change:

```tsx
        <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.addSessionBtn, { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}
            onPress={handleNewSession}
          >
            <Text style={[styles.addSessionTxt, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>+ Session</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCalendarVisible(true)} style={[styles.calTextBtn, { borderColor: colors.borderLight }]}>
            <Text style={[styles.calTxt, { color: colors.textPrimary, fontFamily: FONTS.family.medium }]}>Calendar</Text>
          </TouchableOpacity>
        </View>
```

to:

```tsx
        <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.addSessionBtn, { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}
            onPress={handleNewSession}
          >
            <Text style={[styles.addSessionTxt, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>+ Session</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleToggleCondensed}
            style={[styles.condenseToggleBtn, { borderColor: colors.borderLight }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={sessionsCondensed ? 'expand-outline' : 'contract-outline'} size={18} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCalendarVisible(true)} style={[styles.calTextBtn, { borderColor: colors.borderLight }]}>
            <Text style={[styles.calTxt, { color: colors.textPrimary, fontFamily: FONTS.family.medium }]}>Calendar</Text>
          </TouchableOpacity>
        </View>
```

`Ionicons` is already imported in this file (used extensively elsewhere), so no new import is needed for the icon.

- [ ] **Step 6: Add the new style**

Find:

```ts
  addSessionBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  addSessionTxt: { fontSize: FONTS.sizes.sm },
  calTextBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
```

and add a new style between `addSessionTxt` and `calTextBtn`:

```ts
  addSessionBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  addSessionTxt: { fontSize: FONTS.sizes.sm },
  condenseToggleBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm },
  calTextBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
```

- [ ] **Step 7: Pass `condensed` to `SessionCard`**

Change:

```tsx
              <SessionCard
                day={day}
                colors={colors}
                currentUserId={user?.id}
                myAvatar={localAvatarUri ?? avatarUrl}
                onEdit={() => { setSelectedDay(day); setEditModalVisible(true); }}
                onShare={() => setShareDay(day)}
                onOpenClimb={(climb) => setDetailClimb(climb)}
                onDeleteClimb={async (climbId) => { await deleteClimb(climbId); triggerStatsRefresh(); load(); }}
                onViewProfile={viewFriendProfile}
                onSwipeStart={() => setListScrollEnabled(false)}
                onSwipeEnd={() => setListScrollEnabled(true)}
              />
```

to:

```tsx
              <SessionCard
                day={day}
                colors={colors}
                currentUserId={user?.id}
                myAvatar={localAvatarUri ?? avatarUrl}
                onEdit={() => { setSelectedDay(day); setEditModalVisible(true); }}
                onShare={() => setShareDay(day)}
                onOpenClimb={(climb) => setDetailClimb(climb)}
                onDeleteClimb={async (climbId) => { await deleteClimb(climbId); triggerStatsRefresh(); load(); }}
                onViewProfile={viewFriendProfile}
                onSwipeStart={() => setListScrollEnabled(false)}
                onSwipeEnd={() => setListScrollEnabled(true)}
                condensed={sessionsCondensed}
              />
```

Do NOT touch `ActiveSessionCard`'s rendering — it doesn't use `SessionCard` at all (it's a separate always-editable component), so there's nothing to wire there, matching the design's explicit non-goal.

- [ ] **Step 8: Type-check**

Run `npx tsc --noEmit`. Confirm no new errors beyond the current baseline.

- [ ] **Step 9: Commit**

```bash
git add app/sessions.tsx
git commit -m "Add Sessions tab toggle to condense/expand all closed session cards"
```

---

### Task 4: Manual verification

**Files:** none (verification only)

This is a native Expo app — verification must happen in a simulator or on a physical device, not a browser preview.

- [ ] **Step 1: Start the app** and open the Sessions tab. Confirm the new icon button appears between "+ Session" and "Calendar", showing a "contract" icon.

- [ ] **Step 2: Tap the toggle.** Confirm every closed session card immediately shrinks to header (date + edit icon), title, stats row, and "View climbs" button only — even for sessions with photos, notes, location, climbing-with partners, or comments. Confirm the icon switches to an "expand" icon.

- [ ] **Step 3: Tap "View climbs"** on a condensed card. Confirm it still expands/collapses that card's climb list correctly.

- [ ] **Step 4: Tap the toggle again.** Confirm every card returns to full detail exactly as before (photos, notes, location, partners, likes/comments, comment thread, comment input all reappear).

- [ ] **Step 5: Confirm the active/in-progress session card** (if you have one running) is unaffected by the toggle in either state.

- [ ] **Step 6: Force-quit and reopen the app.** Confirm the last toggle state (condensed or expanded) is remembered.

- [ ] **Step 7: Open your own profile** (own-profile SESSIONS list, via `FriendDetailView`). Confirm it always shows full detail regardless of the Sessions tab's toggle state — the condensed prop's default (`false`) means this surface is unaffected.

- [ ] **Step 8: Report results.** Do not check this task off as complete until actually exercised in a simulator/device.
