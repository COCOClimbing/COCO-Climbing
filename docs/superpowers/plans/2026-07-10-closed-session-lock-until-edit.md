# Closed Session: Lock Editing Until "Edit" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a closed session, Title/Notes/Location/Climbing With/Media are non-interactive (no rename, no add/change, no remove) until "Edit" is tapped; viewing existing content and climb deletion are unaffected.

**Architecture:** `LocationPicker` and `FriendPicker` each gain a new optional `editable` prop (default `true`, so every other call site is unaffected) that hides/disables their interactive affordances while still displaying their current value. `app/sessions.tsx`'s `DetailView` computes one shared `canEditMeta = isActive || editMode` flag and uses it to gate the title's tap-to-rename, the notes edit link, the media add/remove controls, and to pass `editable` through to the two picker components (via `SessionFriendPicker`, which forwards it to `FriendPicker`).

**Tech Stack:** React Native. No test framework exists in this repo (no jest config, no `*.test.tsx` files) — verification is manual.

Spec: `docs/superpowers/specs/2026-07-10-closed-session-lock-until-edit-design.md`

---

### Task 1: Add `editable` prop to `LocationPicker`

**Files:**
- Modify: `components/LocationPicker.tsx`

- [ ] **Step 1: Add the prop to the interface and destructure it with a default**

Currently (lines 80-85):

```tsx
interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function LocationPicker({ value, onChange }: Props) {
```

Change to:

```tsx
interface Props {
  value: string;
  onChange: (value: string) => void;
  editable?: boolean;
}

export default function LocationPicker({ value, onChange, editable = true }: Props) {
```

- [ ] **Step 2: Gate the field's interactivity**

Currently (lines 185-207):

```tsx
      <TouchableOpacity
        style={[styles.field, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="location-outline" size={16} color={value ? colors.textSecondary : colors.textMuted} />
        <Text
          style={[styles.fieldText, { color: value ? colors.textPrimary : colors.textMuted, fontFamily: FONTS.family.regular }]}
          numberOfLines={1}
        >
          {value || 'Location / gym / crag'}
        </Text>
        {value ? (
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation(); onChange(''); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        )}
      </TouchableOpacity>
```

Change to:

```tsx
      <TouchableOpacity
        style={[styles.field, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
        onPress={() => editable && setModalVisible(true)}
        activeOpacity={editable ? 0.7 : 1}
        disabled={!editable}
      >
        <Ionicons name="location-outline" size={16} color={value ? colors.textSecondary : colors.textMuted} />
        <Text
          style={[styles.fieldText, { color: value ? colors.textPrimary : colors.textMuted, fontFamily: FONTS.family.regular }]}
          numberOfLines={1}
        >
          {value || 'Location / gym / crag'}
        </Text>
        {editable ? (
          value ? (
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); onChange(''); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : (
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          )
        ) : null}
      </TouchableOpacity>
```

The `Modal` below this (the full search/picker screen) is untouched — it simply can never open when `editable` is `false`, since nothing triggers `setModalVisible(true)` in that state.

- [ ] **Step 3: Sanity-check the file compiles**

Run: `npx tsc --noEmit -p . 2>&1 | grep "LocationPicker.tsx"`

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add components/LocationPicker.tsx
git commit -m "Add editable prop to LocationPicker"
```

---

### Task 2: Add `editable` prop to `FriendPicker`

**Files:**
- Modify: `components/FriendPicker.tsx`

- [ ] **Step 1: Add the prop to the interface and destructure it with a default**

Currently (lines 12-20):

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

Change to:

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

- [ ] **Step 2: Render chips as non-removable when not editable, hide the search/dropdown entirely**

Currently (lines 62-142, the full render):

```tsx
  return (
    <View style={{ position: 'relative', zIndex: focused ? 100 : 1 }}>
      {/* Selected friend chips */}
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
        <TextInput
          style={[styles.input, { color: colors.textPrimary }]}
          value={query}
          onChangeText={setQuery}
          onFocus={() => { setFocused(true); onFocus?.(); }}
          onBlur={handleBlur}
          placeholder="Search friends…"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {loading
          ? <ActivityIndicator size="small" color={colors.textMuted} style={{ marginRight: SPACING.sm }} />
          : query.trim().length > 0
            ? (
              <TouchableOpacity onPress={() => setQuery('')} style={{ marginRight: SPACING.sm }}>
                <Text style={[styles.clearBtn, { color: colors.textMuted }]}>×</Text>
              </TouchableOpacity>
            )
            : null
        }
      </View>

      {/* Dropdown results */}
      {focused && (
        <ScrollView
          style={[styles.dropdown, { backgroundColor: colors.bgCard, borderColor: colors.border }, dropup && styles.dropup]}
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          {suggestions.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              {following.length === 0 ? 'Follow someone to tag them' : 'No matching friends'}
            </Text>
          ) : (
            suggestions.map((f, i) => (
              <TouchableOpacity
                key={f.id}
                onPress={() => handleSelect(f)}
                style={[styles.row, { borderTopColor: colors.border }, i === 0 && { borderTopWidth: 0 }]}
                activeOpacity={0.7}
              >
                <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
                  <Text style={[styles.avatarLetter, { color: colors.accent }]}>
                    {f.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.info}>
                  <Text style={[styles.name, { color: colors.textPrimary }]}>{f.name}</Text>
                  {f.username ? <Text style={[styles.username, { color: colors.textMuted }]}>@{f.username}</Text> : null}
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
```

Change to:

```tsx
  return (
    <View style={{ position: 'relative', zIndex: focused ? 100 : 1 }}>
      {/* Selected friend chips */}
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
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              value={query}
              onChangeText={setQuery}
              onFocus={() => { setFocused(true); onFocus?.(); }}
              onBlur={handleBlur}
              placeholder="Search friends…"
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {loading
              ? <ActivityIndicator size="small" color={colors.textMuted} style={{ marginRight: SPACING.sm }} />
              : query.trim().length > 0
                ? (
                  <TouchableOpacity onPress={() => setQuery('')} style={{ marginRight: SPACING.sm }}>
                    <Text style={[styles.clearBtn, { color: colors.textMuted }]}>×</Text>
                  </TouchableOpacity>
                )
                : null
            }
          </View>

          {/* Dropdown results */}
          {focused && (
            <ScrollView
              style={[styles.dropdown, { backgroundColor: colors.bgCard, borderColor: colors.border }, dropup && styles.dropup]}
              keyboardShouldPersistTaps="always"
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {suggestions.length === 0 ? (
                <Text style={[styles.empty, { color: colors.textMuted }]}>
                  {following.length === 0 ? 'Follow someone to tag them' : 'No matching friends'}
                </Text>
              ) : (
                suggestions.map((f, i) => (
                  <TouchableOpacity
                    key={f.id}
                    onPress={() => handleSelect(f)}
                    style={[styles.row, { borderTopColor: colors.border }, i === 0 && { borderTopWidth: 0 }]}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
                      <Text style={[styles.avatarLetter, { color: colors.accent }]}>
                        {f.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.info}>
                      <Text style={[styles.name, { color: colors.textPrimary }]}>{f.name}</Text>
                      {f.username ? <Text style={[styles.username, { color: colors.textMuted }]}>@{f.username}</Text> : null}
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
```

- [ ] **Step 3: Sanity-check the file compiles**

Run: `npx tsc --noEmit -p . 2>&1 | grep "FriendPicker.tsx"`

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add components/FriendPicker.tsx
git commit -m "Add editable prop to FriendPicker"
```

---

### Task 3: Wire `canEditMeta` through `DetailView`

**Files:**
- Modify: `app/sessions.tsx`

- [ ] **Step 1: Add the shared flag**

Currently (line 642):

```tsx
    const [editMode, setEditMode] = useState(false);
```

Add a line right after it:

```tsx
    const [editMode, setEditMode] = useState(false);
    const canEditMeta = isActive || editMode;
```

- [ ] **Step 2: Forward `editable` through `SessionFriendPicker`**

Currently (lines 48-79):

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
  const [friends, setFriends] = useState<{ id: string; name: string }[]>(initialFriends);
  const isFocused = useRef(false);
  const scrollToSelfRef = useRef(scrollToSelf);
  scrollToSelfRef.current = scrollToSelf;

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e: KeyboardEvent) => {
      if (isFocused.current) scrollToSelfRef.current?.(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      isFocused.current = false;
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  return (
    <FriendPicker
      selected={friends}
      onChange={(names) => { setFriends(names); onSave(names); }}
      onFocus={() => { isFocused.current = true; }}
    />
  );
}
```

Change to:

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
  const [friends, setFriends] = useState<{ id: string; name: string }[]>(initialFriends);
  const isFocused = useRef(false);
  const scrollToSelfRef = useRef(scrollToSelf);
  scrollToSelfRef.current = scrollToSelf;

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e: KeyboardEvent) => {
      if (isFocused.current) scrollToSelfRef.current?.(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      isFocused.current = false;
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

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

- [ ] **Step 3: Gate the title's tap-to-rename**

Currently (lines 907-917):

```tsx
            ) : (
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
            )}
```

Change to:

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
              <Text style={[styles.detailTitle, { color: colors.textPrimary, flex: 1 }]}>
                {sessionTitle.trim() || sessionTimeOfDay(day)}
              </Text>
            )}
```

(This is the tail end of the `{editingTitle ? (...) : ...}` conditional at line 894 — only the final `else` branch changes, splitting it into a `canEditMeta`-gated interactive version and a plain-text fallback.)

- [ ] **Step 4: Gate the Notes edit link**

Currently (lines 726-736):

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

Change to:

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

- [ ] **Step 5: Pass `editable` to `LocationPicker`**

Currently (lines 757-768):

```tsx
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
```

Change to:

```tsx
    const locationSection = (
      <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Text style={[styles.metaLabel, { color: colors.textMuted }]}>LOCATION</Text>
        <LocationPicker
          value={sessionLocation}
          onChange={(loc) => {
            setSessionLocation(loc);
            handleSaveSessionMeta(sessionNotes, sessionFriends, loc, sessionMediaItems);
          }}
          editable={canEditMeta}
        />
      </View>
    );
```

- [ ] **Step 6: Pass `editable` to `SessionFriendPicker`**

Currently (lines 770-795):

```tsx
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
```

Change to (only the new `editable` prop line is added):

```tsx
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
          editable={canEditMeta}
        />
      </View>
    );
```

- [ ] **Step 7: Gate the media "+" tile and long-press-to-remove**

Currently (lines 820-855):

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

Change to:

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

(The empty-state "+ Add Photo" button is intentionally left ungated — per the design spec, it's only reachable when `showMedia` is true with zero media, which can only happen when `canEditMeta` is already true.)

- [ ] **Step 8: Sanity-check the file compiles**

Run: `npx tsc --noEmit -p . 2>&1 | grep "sessions.tsx"`

Expected: the same two pre-existing baseline errors this file already has (a `days`-used-before-declaration error around line 122, and a `sessionIndex` property error inside the media section — both unrelated to this change). No new errors.

- [ ] **Step 9: Commit**

```bash
git add app/sessions.tsx
git commit -m "Lock title/notes/location/friends/media editing behind canEditMeta"
```

---

### Task 4: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Closed session, outside Edit mode — everything locked**

Open a closed session with a title, a note, a location, a partner, and at least one photo, without tapping "Edit". Confirm:
- No pencil icon next to the title; tapping the title does nothing.
- No "Edit Activity Note" link (the note text still shows).
- Location has no clear "×" icon or chevron; tapping it does nothing.
- The partner shows as a plain chip with no "×"; there's no search box below it.
- Media has no "+" tile; long-pressing the existing photo does nothing.

- [ ] **Step 2: Tap Edit — everything unlocks**

Tap "Edit". Confirm all of the above become interactive again: pencil icon appears and tapping the title opens the rename input; "Edit Activity Note" link appears; Location shows its clear icon/chevron and opens the picker on tap; the partner chip shows its "×" and the search box/dropdown appear; Media shows its "+" tile and long-press-to-remove works again.

- [ ] **Step 3: Viewing still works either way**

Both outside and inside Edit mode: confirm tapping an existing photo opens the full-screen viewer, and tapping a climb card opens its detail view.

- [ ] **Step 4: Climb deletion unaffected**

Both outside and inside Edit mode: confirm swiping a climb card still reveals Delete and deleting still works.

- [ ] **Step 5: Active session unaffected**

Start or open an active session. Confirm title/notes/location/friends/media are all fully interactive as before, with no Edit button present.

- [ ] **Step 6: Other `LocationPicker`/`FriendPicker` call sites unaffected**

Spot-check the main "Friends" search screen and the log-climb flow (or any other screen using `FriendPicker`/`LocationPicker`) to confirm they behave exactly as before — the new `editable` prop defaults to `true` everywhere it isn't explicitly passed.
