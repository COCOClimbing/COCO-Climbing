# Closed Session Compact View & Edit Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a closed session, Notes/Location/Climbing With/Media boxes only show if they have content; an "Edit"/"Done" toggle next to "← Back" reveals all four for adding to them.

**Architecture:** A local `editMode` boolean in `DetailView` (`app/sessions.tsx`), plus four `hasX` content-check flags (one of which requires hoisting an existing computation out of `mediaSection`'s IIFE so it's usable outside that section too), gate each of the four metadata section consts behind `isActive || editMode || hasX`. An Edit/Done button is added to the existing top bar, visible only for closed sessions.

**Tech Stack:** React Native. No test framework exists in this repo (no jest config, no `*.test.tsx` files) — verification is manual.

Spec: `docs/superpowers/specs/2026-07-10-closed-session-edit-mode-design.md`

---

### Task 1: Add edit mode, content flags, and visibility gating

**Files:**
- Modify: `app/sessions.tsx` (inside `DetailView`)

- [ ] **Step 1: Add `editMode` state**

Currently (line 641):

```tsx
    const isActive = day.sessionId === getActiveSessionId();
```

Change to:

```tsx
    const isActive = day.sessionId === getActiveSessionId();
    const [editMode, setEditMode] = useState(false);
```

- [ ] **Step 2: Hoist the media computation out of `mediaSection`, add content flags**

Currently, `mediaSection` (lines 796-846) computes `climbMedia`/`allMedia` internally:

```tsx
    const mediaSection = (() => {
      // Gather all climb photos for this session
      const climbMedia: { uri: string; type: 'photo' | 'video'; fromClimb: true; climbId: string }[] = [];
      for (const c of day.climbs) {
        if (c.mediaUris && c.mediaUris.length > 0) {
          c.mediaUris.forEach((uri, i) => climbMedia.push({ uri, type: c.mediaTypes?.[i] ?? 'photo', fromClimb: true, climbId: c.id }));
        } else if (c.mediaUri) {
          climbMedia.push({ uri: c.mediaUri, type: c.mediaType ?? 'photo', fromClimb: true, climbId: c.id });
        }
      }
      const allMedia = [
        ...sessionMediaItems.map((m, i) => ({ ...m, fromClimb: false as const, sessionIndex: i })),
        ...climbMedia,
      ];
      return (
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
    })();
```

Replace it with (the `climbMedia`/`allMedia` computation moved above and out of the IIFE, `mediaSection` now just uses the hoisted `allMedia`; nothing else inside changes):

```tsx
    const climbMedia: { uri: string; type: 'photo' | 'video'; fromClimb: true; climbId: string }[] = [];
    for (const c of day.climbs) {
      if (c.mediaUris && c.mediaUris.length > 0) {
        c.mediaUris.forEach((uri, i) => climbMedia.push({ uri, type: c.mediaTypes?.[i] ?? 'photo', fromClimb: true, climbId: c.id }));
      } else if (c.mediaUri) {
        climbMedia.push({ uri: c.mediaUri, type: c.mediaType ?? 'photo', fromClimb: true, climbId: c.id });
      }
    }
    const allMedia = [
      ...sessionMediaItems.map((m, i) => ({ ...m, fromClimb: false as const, sessionIndex: i })),
      ...climbMedia,
    ];

    const hasNotes = sessionNotes.trim().length > 0;
    const hasLocation = sessionLocation.trim().length > 0;
    const hasFriends = sessionFriends.length > 0;
    const hasMedia = allMedia.length > 0;

    const showNotes = isActive || editMode || hasNotes;
    const showLocation = isActive || editMode || hasLocation;
    const showFriends = isActive || editMode || hasFriends;
    const showMedia = isActive || editMode || hasMedia;

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

Note this new block goes in the exact same location `const mediaSection = (() => {...})();` currently occupies (right after `friendsSection`'s closing `);`, right before `return (`).

- [ ] **Step 3: Gate each section's rendering on its `show` flag**

Currently (the conditional render block, right after the session header's closing `</View>`):

```tsx
          {isActive ? (
            <>
              {climbsSection}
              {notesSection}
              {locationSection}
              {friendsSection}
              {mediaSection}
            </>
          ) : (
            <>
              {notesSection}
              {locationSection}
              {friendsSection}
              {mediaSection}
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

(For active sessions, `showNotes`/`showLocation`/`showFriends`/`showMedia` are always `true` because `isActive` short-circuits each `||` chain, so the active branch's rendered output is unchanged from today.)

- [ ] **Step 4: Sanity-check the file compiles**

Run: `npx tsc --noEmit -p . 2>&1 | grep "sessions.tsx"`

Expected: the same two pre-existing baseline errors this file already has (a `days`-used-before-declaration error around line 122, and a `sessionIndex` property error inside the media section — both unrelated to this change). No new errors.

- [ ] **Step 5: Commit**

```bash
git add app/sessions.tsx
git commit -m "Hide empty Notes/Location/Climbing With/Media boxes on closed sessions"
```

---

### Task 2: Add the Edit/Done toggle button

**Files:**
- Modify: `app/sessions.tsx`

- [ ] **Step 1: Add the button to the top bar**

Currently (lines 850-855):

```tsx
        {/* Back bar */}
        <View style={[styles.detailTopBar, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={goBackToList} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={[styles.backBtnText, { color: colors.accent }]}>← Back</Text>
          </TouchableOpacity>
        </View>
```

Change to:

```tsx
        {/* Back bar */}
        <View style={[styles.detailTopBar, { borderBottomColor: colors.border, justifyContent: 'space-between' }]}>
          <TouchableOpacity onPress={goBackToList} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={[styles.backBtnText, { color: colors.accent }]}>← Back</Text>
          </TouchableOpacity>
          {!isActive && (
            <TouchableOpacity onPress={() => setEditMode(v => !v)} style={styles.backBtn} activeOpacity={0.7}>
              <Text style={[styles.backBtnText, { color: colors.accent }]}>{editMode ? 'Done' : 'Edit'}</Text>
            </TouchableOpacity>
          )}
        </View>
```

`detailTopBar`'s style already has `flexDirection: 'row', alignItems: 'center'` (see `app/sessions.tsx` styles), so adding `justifyContent: 'space-between'` here pushes "← Back" to the left and the new button to the right without needing a new style entry. `backBtn`/`backBtnText` are reused as-is for visual consistency with the existing Back button.

- [ ] **Step 2: Sanity-check the file compiles**

Run: `npx tsc --noEmit -p . 2>&1 | grep "sessions.tsx"`

Expected: same two pre-existing baseline errors as Task 1, nothing new.

- [ ] **Step 3: Commit**

```bash
git add app/sessions.tsx
git commit -m "Add Edit/Done toggle to reveal all sections on a closed session"
```

---

### Task 3: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Empty closed session**

Open a closed session with no notes, no location, no partners, and no media. Confirm none of those four boxes render — just the header, then the climbs list, then action buttons.

- [ ] **Step 2: Partially-filled closed session**

Open a closed session that has, say, only a location set. Confirm only the Location box shows (Notes/Climbing With/Media stay hidden).

- [ ] **Step 3: Edit mode reveals everything**

On a closed session with some sections hidden, tap "Edit" (top right). Confirm all four boxes now appear, including the previously-hidden empty ones, and the button now reads "Done".

- [ ] **Step 4: Adding content while in edit mode, then collapsing**

While in edit mode, add a note and set a location (if not already set). Tap "Done". Confirm the view collapses back, now showing Notes and Location (populated) plus whatever else already had content, with previously-empty boxes (Climbing With/Media, if still empty) hidden again.

- [ ] **Step 5: Active session unaffected**

Start or open an active session. Confirm there is no Edit/Done button in the top bar, and all four boxes (Notes/Location/Climbing With/Media) always show regardless of content, same as before this feature.

- [ ] **Step 6: Fresh state on reopen**

From a closed session in edit mode, tap "← Back", then reopen the same session. Confirm it opens back in the default (collapsed, non-edit) view — not still in edit mode from before.
