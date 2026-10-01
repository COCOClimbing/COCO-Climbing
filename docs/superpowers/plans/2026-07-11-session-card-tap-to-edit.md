# Session Card Tap-to-Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the "View climbs" inline expand/collapse feature from `SessionCard` entirely (both condensed and expanded states), and make tapping anywhere on the non-interactive parts of a session card open the full editable session view (the same destination the edit-pencil icon already opens) — unifying condensed and expanded cards to a single "tap opens Edit" interaction.

**Architecture:** `components/SessionCard.tsx` drops its own inline climbs list/expand toggle (climbs are already fully visible in the Edit modal it now always opens on tap) and its `onOpenClimb`/`onDeleteClimb`/`onSwipeStart`/`onSwipeEnd` props, which existed solely to support that inline list. The card's outer container becomes a tap target that calls the existing `onEdit` prop; React Native's touch handling already gives nested `TouchableOpacity`s (partner chips, photos, likes, actions, comments) priority over an ancestor's `onPress`, so no gesture conflicts result. Both call sites (`app/sessions.tsx`'s Sessions tab list, `app/friends.tsx`'s own-profile SESSIONS list) drop the now-unused props, and `app/friends.tsx`'s `FriendDetailView` removes the `detailClimb`/`ClimbDetailModal` plumbing that existed only to serve `SessionCard`'s removed `onOpenClimb`.

**Tech Stack:** React Native / Expo, TypeScript.

---

### Task 1: Remove View climbs from `SessionCard`, make the card tap-to-edit

**Files:**
- Modify: `components/SessionCard.tsx`

- [ ] **Step 1: Remove the `climbsExpanded` state and `displayClimbs` computation**

Delete this line (currently `components/SessionCard.tsx:80`):

```ts
  const [climbsExpanded, setClimbsExpanded] = useState(false);
```

Delete this line (currently `components/SessionCard.tsx:77`):

```ts
  const displayClimbs = mergeClimbs(day.climbs);
```

- [ ] **Step 2: Remove the "View climbs" button and expanded climbs list JSX**

Delete this entire block (currently `components/SessionCard.tsx:253-276`):

```tsx
      {/* Climbs — collapsed by default */}
      <TouchableOpacity
        onPress={() => setClimbsExpanded(v => !v)}
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
          {displayClimbs.length === 0 ? (
            <Text style={[styles.noClimbs, { color: colors.textMuted }]}>No climbs logged yet</Text>
          ) : (
            displayClimbs.map(c => (
              <SwipeToDelete key={c.id} heightOffset={0} onDelete={() => onDeleteClimb(c.id)} onSwipeStart={onSwipeStart} onSwipeEnd={onSwipeEnd}>
                <ClimbCard climb={c} compact onPress={() => onOpenClimb(c)} />
              </SwipeToDelete>
            ))
          )}
        </View>
      )}

```

- [ ] **Step 3: Remove the now-dead props from `SessionCardProps` and the function signature**

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
  condensed?: boolean;
}

export default function SessionCard({
  day, colors, currentUserId, myAvatar, onEdit, onShare, onOpenClimb, onDeleteClimb, onViewProfile, onSwipeStart, onSwipeEnd, condensed = false,
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
  onViewProfile: (profile: { id: string; name: string; username: string; avatar_url: string | null }) => void;
  condensed?: boolean;
}

export default function SessionCard({
  day, colors, currentUserId, myAvatar, onEdit, onShare, onViewProfile, condensed = false,
}: SessionCardProps) {
```

- [ ] **Step 4: Make the card's outer container a tap target for `onEdit`**

Change the opening tag (currently `components/SessionCard.tsx:154`):

```tsx
    <View style={[styles.card, { borderBottomColor: colors.border }]}>
```

to:

```tsx
    <TouchableOpacity activeOpacity={1} style={[styles.card, { borderBottomColor: colors.border }]} onPress={onEdit}>
```

and the matching closing tag (currently `components/SessionCard.tsx:366`):

```tsx
    </View>
  );
}
```

to:

```tsx
    </TouchableOpacity>
  );
}
```

`activeOpacity={1}` means the card itself shows no dimming/flash on tap (appropriate for a large tap region with many nested interactive elements already providing their own feedback) — this only changes the touch handling, not the visual appearance. The header's existing edit-pencil icon (its own separate `TouchableOpacity` calling `onEdit`, unchanged) keeps working exactly as before — nested touchables in React Native correctly claim taps aimed at them (partner chips, photos, likes avatars, comment/share buttons, comment rows, comment input) without triggering the outer card's `onPress`, so none of those need any changes.

- [ ] **Step 5: Remove now-unused imports**

Check each of the following for remaining usages in the file (after Steps 1-4) with `grep -c`, and remove any that have dropped to zero references beyond their own import line: `ClimbCard`, `SwipeToDelete`, `Climb` (from `../utils/theme`), `mergeClimbs` (from `../utils/sessionHelpers`). Do not remove `CLIMB_TYPES` (still used for `climbTypeLabel` in the stats row) or anything else still referenced.

- [ ] **Step 6: Remove now-dead styles**

Check `cardExpandBtn`, `cardExpandTxt`, and `noClimbs` in the `StyleSheet.create` block for remaining references with `grep -c "styles\.cardExpandBtn\|styles\.cardExpandTxt\|styles\.noClimbs"` — all three should now be zero (their only use was in the block removed in Step 2). Remove all three style definitions.

- [ ] **Step 7: Type-check**

Run `npx tsc --noEmit`. This will show errors in the two call sites (`app/sessions.tsx`, `app/friends.tsx`) still passing the now-removed props — that's expected and fixed in Tasks 2 and 3. Confirm the only NEW errors are exactly those two call sites failing to match `SessionCardProps` (extra `onOpenClimb`/`onDeleteClimb`/`onSwipeStart`/`onSwipeEnd` props), and nothing else in `components/SessionCard.tsx` itself has an error.

- [ ] **Step 8: Commit**

```bash
git add components/SessionCard.tsx
git commit -m "Remove View climbs from SessionCard, make the card tap-to-edit"
```

---

### Task 2: Update the Sessions tab's `SessionCard` usage

**Files:**
- Modify: `app/sessions.tsx`

- [ ] **Step 1: Remove the now-unused props**

Change (currently `app/sessions.tsx:1251-1263`):

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

to:

```tsx
              <SessionCard
                day={day}
                colors={colors}
                currentUserId={user?.id}
                myAvatar={localAvatarUri ?? avatarUrl}
                onEdit={() => { setSelectedDay(day); setEditModalVisible(true); }}
                onShare={() => setShareDay(day)}
                onViewProfile={viewFriendProfile}
                condensed={sessionsCondensed}
              />
```

Do not remove `setDetailClimb`, `ClimbDetailModal`, `deleteClimb`, `triggerStatsRefresh`, or `listScrollEnabled`/`setListScrollEnabled` from this file — all of them are still used elsewhere (`SessionEditModalContent`'s own climbs list, `ActiveSessionCard`'s own climbs list, and the main `ScrollView`'s `scrollEnabled` prop). Only this one JSX block changes.

- [ ] **Step 2: Type-check**

Run `npx tsc --noEmit`. Confirm the `app/sessions.tsx` errors from Task 1 (extra-prop errors on this `SessionCard` usage) are now gone. Confirm no other new errors versus the pre-Task-1 baseline (25 total `error TS` lines across the repo).

- [ ] **Step 3: Commit**

```bash
git add app/sessions.tsx
git commit -m "Drop removed SessionCard props from the Sessions tab list"
```

---

### Task 3: Update the own-profile `SessionCard` usage and clean up now-dead climb-detail plumbing

**Files:**
- Modify: `app/friends.tsx`

- [ ] **Step 1: Remove the now-unused props from the `SessionCard` usage**

Change (currently `app/friends.tsx:549-565`):

```tsx
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
                      onViewProfile={handleViewProfile}
                    />
```

to:

```tsx
                    <SessionCard
                      key={day.sessionId}
                      day={day}
                      colors={colors}
                      currentUserId={user?.id}
                      myAvatar={myAvatar}
                      onEdit={() => navigateToSession(day.sessionId)}
                      onShare={() => setShareDay(day)}
                      onViewProfile={handleViewProfile}
                    />
```

- [ ] **Step 2: Remove the now-fully-dead `detailClimb`/`ClimbDetailModal` plumbing**

Unlike `app/sessions.tsx`, `FriendDetailView` has no other climbs list of its own — `detailClimb`/`ClimbDetailModal`/the `onDeleteClimb` handler's `deleteClimb`/`triggerStatsRefresh` calls existed solely to support the `SessionCard` props just removed in Step 1. Delete this state line (currently `app/friends.tsx:215`):

```ts
  const [detailClimb, setDetailClimb] = useState<Climb | null>(null);
```

Delete this block (currently `app/friends.tsx:685-694`):

```tsx
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

- [ ] **Step 3: Remove now-unused imports**

Check each of the following for remaining usages in the whole file with `grep -c` (not just `FriendDetailView` — `Climb` and `deleteClimb`/`triggerStatsRefresh` are module-level imports shared with `FriendsScreen` later in the file, so confirm zero references anywhere, not just in the edited component):
- `ClimbDetailModal` (component import)
- `Climb` (from `../utils/theme` — check it's not still needed for some other type annotation elsewhere in the file before removing; if `FONTS, SPACING, CLIMB_TYPES, getGradeDifficulty, convertGrade, Climb` is the import line, only remove `Climb` from the list if it truly has zero remaining references, leave the rest of that import line untouched)
- `deleteClimb`, `triggerStatsRefresh` (from `../utils/storage` — same caution: these were added specifically for this feature earlier tonight; confirm no other code path in `FriendsScreen` also calls them before removing)

Only remove what's genuinely at zero references — leave anything still used.

- [ ] **Step 4: Type-check**

Run `npx tsc --noEmit`. Confirm no errors remain anywhere related to `SessionCard`'s prop types, and the full-repo error count is back to the original baseline of 25 (Task 1 intentionally introduced temporary errors in this file that this task resolves).

- [ ] **Step 5: Commit**

```bash
git add app/friends.tsx
git commit -m "Drop removed SessionCard props and now-dead climb-detail plumbing from own-profile view"
```

---

### Task 4: Manual verification

**Files:** none (verification only)

This is a native Expo app — verification must happen in a simulator or on a physical device, not a browser preview.

- [ ] **Step 1: Sessions tab, condensed mode.** Confirm there is no "View climbs" button on any card. Tap anywhere on a card's header/title/stats area — confirm it opens the Edit modal with full media and climbs, editable.

- [ ] **Step 2: Sessions tab, expanded mode.** Confirm there is no "View climbs" button anywhere. Tap the card's title, location, notes, or stats row — confirm it opens the Edit modal. Confirm tapping a photo still opens the photo viewer (not Edit). Confirm tapping a partner chip still opens their profile (not Edit). Confirm tapping the like/comment/share buttons, a comment row, or the comment input still do their own specific things (not Edit).

- [ ] **Step 3: Tap the edit-pencil icon directly** — confirm it still opens the Edit modal (unchanged, now redundant with the whole-card tap but harmless).

- [ ] **Step 4: Own profile's SESSIONS list.** Repeat Steps 1-3 there — confirm tapping a card navigates to the Sessions tab and scrolls to that session (existing `navigateToSession` behavior via `onEdit`), and that partner chips/photos/likes/comments/share still all work independently of the card-tap.

- [ ] **Step 5: Confirm no regression** to the active/in-progress session card at the top of the Sessions tab (unaffected — it doesn't use `SessionCard`).

- [ ] **Step 6: Report results.** Do not check this task off as complete until actually exercised in a simulator/device.
