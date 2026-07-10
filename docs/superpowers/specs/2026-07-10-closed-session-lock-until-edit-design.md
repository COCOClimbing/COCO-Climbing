# Closed Session: Lock Editing Until "Edit" Design

## Problem

A prior feature made a closed session's Notes/Location/Climbing With/Media
boxes only *appear* when they have content, with an "Edit"/"Done" toggle to
reveal empty ones. But even in the default (non-edit) view, every visible
box is still fully interactive: the title can be tapped to rename, Location
can be tapped to change, Climbing With can be tapped to add/remove a
partner, and Media still has a "+" to add another photo — none of that
requires tapping "Edit" first.

## Goal

On a closed session, outside of Edit mode:

- Title is plain, non-tappable text (no pencil icon).
- Notes has no "Add/Edit Activity Note" action (existing note text, if any,
  still displays).
- Location is not tappable, has no clear ("×") icon or chevron (existing
  value, if any, still displays as plain text).
- Climbing With shows partners as plain (non-removable) chips, with no
  search box or dropdown.
- Media has no "+" tile to add another photo, and long-pressing an existing
  photo does not offer to remove it.

Tapping "Edit" reveals full interactivity again (identical to today's
always-editable behavior). An active session is completely unaffected —
it's always editable, matching current behavior, since it has no Edit
button in the first place.

## Non-goals

- Viewing existing content is unaffected: tapping a photo to view it
  full-screen, and tapping a climb card to see its details, keep working
  regardless of Edit mode (confirmed explicitly in scope discussion).
- Deleting a climb (swipe-to-reveal-Delete on a climb card) is unaffected —
  stays available regardless of Edit mode, per explicit decision to leave
  it as-is.
- No change to `LocationPicker` or `FriendPicker`'s behavior anywhere else
  they're used in the app — both get a new `editable` prop that defaults to
  `true`, so every other call site is unaffected.
- No change to the visibility gating from the prior feature (`showNotes`/
  `showLocation`/`showFriends`/`showMedia`) — this is a separate,
  additional layer of interactivity gating on top of it.

## Design

### 1. One shared flag

```ts
const canEditMeta = isActive || editMode;
```

Declared once in `DetailView` (`app/sessions.tsx`), reused everywhere below
instead of repeating `isActive || editMode` five times.

### 2. Title

Currently, the non-editing title render is a `TouchableOpacity` (tap to
start renaming) with a pencil icon. When `!canEditMeta`, this becomes a
plain `Text` — no touch handler, no pencil icon.

### 3. Notes

The "Add Activity Note"/"Edit Activity Note" link (inside `notesSection`)
only renders when `canEditMeta`. The note text below it (if any) is
unaffected — it already renders independently of that link.

### 4. Location

`LocationPicker` (`components/LocationPicker.tsx`) gains a new prop:

```ts
interface Props {
  value: string;
  onChange: (value: string) => void;
  editable?: boolean; // defaults to true
}
```

When `editable` is `false`: the field's `TouchableOpacity` becomes
non-interactive (`disabled`), and the trailing icon (the clear "×" when a
value is set, or the chevron when empty) is hidden — just the location
icon and text remain. The modal itself is unaffected (it simply can't be
opened when not editable, since nothing triggers `setModalVisible(true)`).

`locationSection` passes `editable={canEditMeta}`.

### 5. Climbing With

`FriendPicker` (`components/FriendPicker.tsx`) gains the same kind of prop:

```ts
interface Props {
  selected: SelectedFriend[];
  onChange: (friends: SelectedFriend[]) => void;
  onFocus?: () => void;
  onDropdownChange?: (open: boolean) => void;
  dropup?: boolean;
  editable?: boolean; // defaults to true
}
```

When `editable` is `false`: the search input row and dropdown are not
rendered at all, and each selected-friend chip renders as a plain,
non-touchable `View` (name only, no "×" remove button) instead of a
`TouchableOpacity`.

`SessionFriendPicker` (defined locally in `app/sessions.tsx`, wraps
`FriendPicker`) gains a matching `editable?: boolean` prop and forwards it
straight through. `friendsSection` passes `editable={canEditMeta}`.

### 6. Media

Inside `mediaSection`'s non-empty branch: the "+" add tile (rendered after
the existing thumbnails in the horizontal scroll) only renders when
`canEditMeta`. Each thumbnail's `onLongPress` (which triggers removal) is
only wired up when `canEditMeta` (`undefined` otherwise, so long-pressing
does nothing) — `onPress` (opening the full-screen viewer) is untouched.

The empty-state "+ Add Photo" fallback button is *not* separately gated —
it's only reachable when `showMedia` is true with zero media, which by the
prior feature's own logic can only happen when `canEditMeta` is already
true (an empty Media box is hidden entirely otherwise), so no additional
check is needed there.

## Testing

No test framework exists in this repo. Manual verification:

- On a closed session outside Edit mode: confirm the title has no pencil
  icon and tapping it does nothing; confirm Notes has no "Edit Activity
  Note" link (if a note exists, it still displays); confirm Location has no
  clear icon/chevron and tapping it does nothing; confirm Climbing With
  shows plain chips with no "×" and no search box; confirm Media has no "+"
  tile and long-pressing a photo does nothing.
- Tap "Edit" — confirm all of the above become interactive again exactly as
  they behave today (title pencil, notes link, location tap, friend
  search/remove, media add/remove).
- While in Edit mode, confirm tapping an existing photo still opens the
  full-screen viewer, and tapping a climb card still opens its detail view.
- Confirm swiping a climb card still reveals Delete regardless of Edit
  mode.
- Confirm an active session is unaffected — title/notes/location/friends/
  media are all fully interactive with no Edit button present, same as
  before this change.
- Spot-check `LocationPicker` and `FriendPicker` at their other call sites
  elsewhere in the app (e.g. the main "Friends" search screen, the log-climb
  flow) to confirm they're unaffected by the new `editable` prop defaulting
  to `true`.
