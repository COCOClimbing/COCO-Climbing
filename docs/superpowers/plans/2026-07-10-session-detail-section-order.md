# Session Detail Section Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the session detail view, a closed session shows Notes, Location, Climbing With, and Media above the climbs list; an active session keeps its current order (climbs first).

**Architecture:** The five reorderable blocks in `DetailView` (`app/sessions.tsx`) — Climbs, Notes, Location, Climbing With, Media — are extracted into `const` JSX bindings computed once per render (moved from inline JSX into the function body, just before the `return`), then referenced in one of two fixed sequences depending on `isActive`. No section's internal JSX, logic, or state changes — only where each one is defined and in what order it's rendered.

**Tech Stack:** React Native. No test framework exists in this repo (no jest config, no `*.test.tsx` files) — verification is manual.

Spec: `docs/superpowers/specs/2026-07-10-session-detail-section-order-design.md`

---

### Task 1: Extract and reorder the five sections

**Files:**
- Modify: `app/sessions.tsx:681-933` (inside `DetailView`)

- [ ] **Step 1: Insert the five section consts before the `return` statement**

Currently, right before `DetailView`'s `return (` (line 683), the function body ends with (lines 674-681):

```tsx
    useEffect(() => {
      if (_detailScrollY > 0) {
        const t = setTimeout(() => {
          detailScrollRef.current?.scrollTo({ y: _detailScrollY, animated: false });
        }, 0);
        return () => clearTimeout(t);
      }
    }, []);

    return (
```

Insert the five section consts between that `useEffect` and `return (`:

```tsx
    useEffect(() => {
      if (_detailScrollY > 0) {
        const t = setTimeout(() => {
          detailScrollRef.current?.scrollTo({ y: _detailScrollY, animated: false });
        }, 0);
        return () => clearTimeout(t);
      }
    }, []);

    const climbsSection = (
      displayClimbs.length === 0
        ? <Text style={[styles.noClimbs, { color: colors.textMuted }]}>No climbs logged yet</Text>
        : displayClimbs.map(c => (
          <SwipeToDelete
            key={c.id}
            onSwipeStart={() => setDetailScrollEnabled(false)}
            onSwipeEnd={() => setDetailScrollEnabled(true)}
            onDelete={async () => { await deleteClimb(c.id); triggerStatsRefresh(); load(); }}
            rightAction={isActive && c.outcome === 'attempt' ? {
              label: 'Send',
              color: colors.accentGreen,
              onPress: async () => {
                await saveClimb({ ...c, outcome: 'send', attempts: (c.attempts ?? 1) + 1 });
                triggerStatsRefresh();
                load();
              },
            } : undefined}
          >
            <ClimbCard
              climb={c}
              compact
              onPress={() => {
                if (isActive) {
                  setEditingClimb(c); setLogModalVisible(true);
                } else {
                  setDetailClimb(c);
                }
              }}
              onIncrementAttempts={isActive ? async () => {
                await saveClimb({ ...c, attempts: (c.attempts ?? 1) + 1 });
                load();
              } : undefined}
            />
          </SwipeToDelete>
        ))
    );

    const notesSection = (
      <View ref={notesCardRef} style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <View style={styles.metaLabelRow}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>NOTES</Text>
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
        </View>
        {editingNotes ? (
          <TextInput
            key={day.sessionId}
            style={[styles.notesInput, { color: colors.textPrimary, borderColor: colors.border }]}
            defaultValue={sessionNotes}
            onChangeText={(t) => { notesInputValue.current = t; }}
            onEndEditing={(e) => handleSaveNotes(e.nativeEvent.text)}
            placeholder="Add session notes…"
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            autoFocus
          />
        ) : sessionNotes.trim() ? (
          <Text style={[styles.notesText, { color: colors.textSecondary }]}>{sessionNotes}</Text>
        ) : null}
      </View>
    );

    const locationSection = (
      <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Text style={[styles.metaLabel, { color: colors.textMuted }]}>LOCATION</Text>
        <LocationPicker
          value={sessionLocation}
          onChange={(loc) => {
            setSessionLocation(loc);
            handleSaveSessionMeta(sessionNotes, sessionFriends, loc, sessionMediaItems);
          }}
        />
      </View>
    );

    const friendsSection = (
      <View
        style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
        onLayout={(e) => { friendsCardY.current = e.nativeEvent.layout.y; }}
      >
        <Text style={[styles.metaLabel, { color: colors.textMuted }]}>CLIMBING WITH</Text>
        <SessionFriendPicker
          initialFriends={sessionFriends}
          onSave={(names) => {
            setSessionFriends(names);
            setSelectedDay(prev => prev ? { ...prev, friends: names } : null);
            handleSaveSessionMeta(sessionNotes, names, sessionLocation, sessionMediaItems);
          }}
          scrollToSelf={(keyboardHeight) => {
            if (friendsCardY.current > 0) {
              // Scroll so the friends card sits in the top third of the space
              // above the keyboard, leaving the dropdown visible below the input.
              const windowHeight = Dimensions.get('window').height;
              const visibleHeight = windowHeight - keyboardHeight;
              const scrollY = friendsCardY.current - visibleHeight * 0.25;
              detailScrollRef.current?.scrollTo({ y: Math.max(0, scrollY), animated: true });
            }
          }}
        />
      </View>
    );

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

    return (
```

- [ ] **Step 2: Replace the fixed inline block sequence with the conditional order**

Currently, between the session header's closing `</View>` and the `{/* Actions */}` comment (lines 772-933), the five sections are rendered inline in this fixed order:

```tsx
          {/* Climbs */}
          {displayClimbs.length === 0
            ? <Text style={[styles.noClimbs, { color: colors.textMuted }]}>No climbs logged yet</Text>
            : displayClimbs.map(c => (
              <SwipeToDelete
                key={c.id}
                onSwipeStart={() => setDetailScrollEnabled(false)}
                onSwipeEnd={() => setDetailScrollEnabled(true)}
                onDelete={async () => { await deleteClimb(c.id); triggerStatsRefresh(); load(); }}
                rightAction={isActive && c.outcome === 'attempt' ? {
                  label: 'Send',
                  color: colors.accentGreen,
                  onPress: async () => {
                    await saveClimb({ ...c, outcome: 'send', attempts: (c.attempts ?? 1) + 1 });
                    triggerStatsRefresh();
                    load();
                  },
                } : undefined}
              >
                <ClimbCard
                  climb={c}
                  compact
                  onPress={() => {
                    if (isActive) {
                      setEditingClimb(c); setLogModalVisible(true);
                    } else {
                      setDetailClimb(c);
                    }
                  }}
                  onIncrementAttempts={isActive ? async () => {
                    await saveClimb({ ...c, attempts: (c.attempts ?? 1) + 1 });
                    load();
                  } : undefined}
                />
              </SwipeToDelete>
            ))
          }

          {/* Notes */}
          <View ref={notesCardRef} style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={styles.metaLabelRow}>
              <Text style={[styles.metaLabel, { color: colors.textMuted }]}>NOTES</Text>
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
            </View>
            {editingNotes ? (
              <TextInput
                key={day.sessionId}
                style={[styles.notesInput, { color: colors.textPrimary, borderColor: colors.border }]}
                defaultValue={sessionNotes}
                onChangeText={(t) => { notesInputValue.current = t; }}
                onEndEditing={(e) => handleSaveNotes(e.nativeEvent.text)}
                placeholder="Add session notes…"
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical="top"
                autoFocus
              />
            ) : sessionNotes.trim() ? (
              <Text style={[styles.notesText, { color: colors.textSecondary }]}>{sessionNotes}</Text>
            ) : null}
          </View>

          {/* Location */}
          <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <Text style={[styles.metaLabel, { color: colors.textMuted }]}>LOCATION</Text>
            <LocationPicker
              value={sessionLocation}
              onChange={(loc) => {
                setSessionLocation(loc);
                handleSaveSessionMeta(sessionNotes, sessionFriends, loc, sessionMediaItems);
              }}
            />
          </View>

          {/* Friends */}
          <View
            style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
            onLayout={(e) => { friendsCardY.current = e.nativeEvent.layout.y; }}
          >
            <Text style={[styles.metaLabel, { color: colors.textMuted }]}>CLIMBING WITH</Text>
            <SessionFriendPicker
              initialFriends={sessionFriends}
              onSave={(names) => {
                setSessionFriends(names);
                setSelectedDay(prev => prev ? { ...prev, friends: names } : null);
                handleSaveSessionMeta(sessionNotes, names, sessionLocation, sessionMediaItems);
              }}
              scrollToSelf={(keyboardHeight) => {
                if (friendsCardY.current > 0) {
                  // Scroll so the friends card sits in the top third of the space
                  // above the keyboard, leaving the dropdown visible below the input.
                  const windowHeight = Dimensions.get('window').height;
                  const visibleHeight = windowHeight - keyboardHeight;
                  const scrollY = friendsCardY.current - visibleHeight * 0.25;
                  detailScrollRef.current?.scrollTo({ y: Math.max(0, scrollY), animated: true });
                }
              }}
            />
          </View>

          {/* Session Media */}
          {(() => {
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
          })()}
```

Replace that entire block (from `{/* Climbs */}` through the closing `})()}` of the media IIFE) with:

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

- [ ] **Step 3: Sanity-check the file compiles**

Run: `npx tsc --noEmit -p . 2>&1 | grep "sessions.tsx"`

Expected: the same two pre-existing baseline errors this file already has (a `days`-used-before-declaration error around line 122, and a `sessionIndex` property error — both unrelated to this change, present before it). No new errors — specifically no "cannot find name" errors for `climbsSection`/`notesSection`/`locationSection`/`friendsSection`/`mediaSection` (which would indicate the consts and their usage got out of sync), and no duplicate-declaration errors.

- [ ] **Step 4: Commit**

```bash
git add app/sessions.tsx
git commit -m "Reorder closed-session detail sections: metadata above climbs"
```

---

### Task 2: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Active session — order unchanged**

Start a session, log at least one climb, and open its detail view while it's still active. Confirm the order is: header → climbs list → Notes → Location → Climbing With → Media → action buttons (End Session, etc.) — same as before this change.

- [ ] **Step 2: Closed session — new order**

Open an already-ended session's detail view (or end the one from Step 1). Confirm the order is now: header → Notes → Location → Climbing With → Media → climbs list → action buttons (Add Climb, Share, etc.).

- [ ] **Step 3: Section behavior unchanged**

In the closed-session view, confirm each moved section still works exactly as before:
- Tap "Add Activity Note" / edit existing notes, save, confirm it persists.
- Change the location via the picker, confirm it saves.
- Add or remove a "climbing with" friend via the picker; while the picker's dropdown is open, bring up the keyboard and confirm the card still scrolls into view above it correctly.
- Add a photo via the Media section, confirm it appears and can be viewed/removed.
- Confirm swiping a climb card in the (now-lower) climbs list still reveals Delete (and Send, if applicable) as before.
