# Closed Session Compact View & Edit Mode Design

## Problem

For a closed session, the Notes/Location/Climbing With/Media boxes always
render, even when empty (e.g. "Add Activity Note" prompt shown with no
notes taken, an empty "Search friends…" box with no partners added). This
clutters the review view of a session with nothing to show.

## Goal

- **Closed session, default (view) state**: only show the Notes, Location,
  Climbing With, and Media boxes that actually have content. Empty ones are
  hidden entirely.
- **Closed session, edit mode**: an "Edit" button (top bar, same row as
  "← Back") reveals all four boxes, including empty ones, so the user can
  add to them. The button becomes "Done" while in this mode; tapping it
  again collapses back to the content-only view.
- **Active session**: unaffected — always shows all four boxes, no Edit
  button, matching current behavior.

## Non-goals

- No change to how any section is edited internally (Location picker,
  friend picker, notes input, media picker all work exactly as today).
- No separate "save" step — everything already auto-saves as it's edited
  (`onChange`/`onSave`/`onEndEditing` handlers already call
  `handleSaveSessionMeta`/`handleSaveNotes`). "Done" is purely a view-mode
  toggle, not a save trigger.
- No change to the Climbs section or its position (per the just-shipped
  closed-session reordering) — this only adds visibility conditions on top
  of the four metadata boxes.
- No change to the session Title's own edit affordance (the pencil icon) —
  unrelated to this feature.

## Design

### 1. Content-check flags

Using state already present in `DetailView`:

```ts
const hasNotes = sessionNotes.trim().length > 0;
const hasLocation = sessionLocation.trim().length > 0;
const hasFriends = sessionFriends.length > 0;
```

For Media, `allMedia` (session-level photos + climb photos) is currently
computed *inside* the `mediaSection` IIFE, not accessible elsewhere. It's
hoisted out to its own `const` above the five section consts, computed
once, and referenced both by a `hasMedia` flag and by `mediaSection` itself
(no duplicate computation):

```ts
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
const hasMedia = allMedia.length > 0;
```

(This is the exact same loop already inside the `mediaSection` IIFE today —
hoisted out verbatim, not rewritten, so `mediaSection` itself no longer
needs its own copy of this computation and just reuses `allMedia`.)

### 2. Edit mode state

```ts
const [editMode, setEditMode] = useState(false);
```

Local to `DetailView`. Since a fresh `DetailView` instance mounts each time
a session is opened (going back to the list and reopening unmounts it),
this naturally resets to `false` every time — no explicit reset logic
needed.

### 3. Visibility per section

```ts
const showNotes = isActive || editMode || hasNotes;
const showLocation = isActive || editMode || hasLocation;
const showFriends = isActive || editMode || hasFriends;
const showMedia = isActive || editMode || hasMedia;
```

Each of the four section consts (`notesSection`, `locationSection`,
`friendsSection`, `mediaSection`) is rendered conditionally using its flag,
e.g. `{showNotes && notesSection}`, in both branches of the existing
`isActive ? (...) : (...)` render block (the active branch's flags are
always `true` since `isActive` short-circuits each one, so its rendered
output is unchanged from today).

### 4. Edit/Done button

Added to the existing top bar (`detailTopBar`, which currently only
contains "← Back"), only when `!isActive`:

```tsx
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

(Reuses the existing `backBtn`/`backBtnText` styles for visual consistency
— same tap target size and text style as "← Back", just right-aligned.)

## Testing

No test framework exists in this repo. Manual verification:

- Open a closed session with no notes, no location, no partners, and no
  media — confirm none of those four boxes render, and there's no "Edit"-
  mode-adjacent clutter.
- Open a closed session with, say, only a location set — confirm only the
  Location box shows in the default view.
- Tap "Edit" — confirm all four boxes appear (including previously-hidden
  empty ones) and the button now reads "Done".
- While in edit mode, add a note and a location — tap "Done" — confirm the
  view collapses back showing only Notes and Location (now populated) plus
  whatever else already had content.
- Confirm active sessions show no Edit/Done button and always show all
  four boxes, unchanged from before this feature.
- Leave the session (Back) and reopen it — confirm it starts back in the
  default (non-edit) collapsed view, not wherever it was left.
