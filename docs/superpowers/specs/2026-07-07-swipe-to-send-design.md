# Swipe-to-Send Design

## Problem

During an active session, a climb logged with outcome `attempt` can only be
updated via the `+` button, which increments the attempt count but never
changes the outcome. When a climber finally sends a route they've been
attempting, there's no quick gesture to convert that card to a `send` — they
have to reopen the log-climb modal and edit the outcome manually.

## Goal

Add a swipe-right gesture on climb cards in the active session view. Swiping
right on an `attempt`-outcome card reveals a "Send" button; tapping it:
- sets `outcome: 'send'`
- increments `attempts` by 1 (so the card reads as "sent on attempt N")

This is additive to the existing `+` attempts button, which is unchanged.

## Scope

Active session detail screen only ([app/sessions.tsx](../../../app/sessions.tsx)).
Not applied to the home screen's recent climbs list or any other
`SwipeToDelete` usage (session-list delete, comment delete).

Only climbs with `outcome === 'attempt'` get the right-swipe affordance.
Climbs with any other outcome (`send`, `flash`, `hang`, etc.) are unaffected —
right-swipe does nothing for them, matching how the `+` button is already
gated.

## Design

### 1. `SwipeToDelete` becomes bidirectional

[components/SwipeToDelete.tsx](../../../components/SwipeToDelete.tsx) gains an
optional prop:

```ts
rightAction?: { label: string; color: string; onPress: () => void };
```

Current behavior only allows leftward drag, clamped via
`Math.min(0, Math.max(-REVEAL, ...))`, revealing the red Delete button on the
right edge. When `rightAction` is provided, the clamp range extends to
`[-REVEAL, +REVEAL]`  so rightward drag is also allowed, revealing a second
button pinned to the **left** edge of the card using `rightAction.label` and
`rightAction.color`.

Release/threshold logic mirrors the existing delete behavior exactly, just
mirrored in sign:
- past `+REVEAL/2` on release → snap open to `+REVEAL`
- past `-REVEAL/2` on release → snap open to `-REVEAL` (existing delete path)
- otherwise → snap closed

Tapping the revealed "Send" button calls `snapClosed()` then fires
`rightAction.onPress()` after the same ~150ms delay the Delete button uses,
so the collapse animation isn't cut short.

When `rightAction` is omitted (all other call sites), behavior is byte-for-byte
identical to today — left-swipe-to-delete only.

### 2. Wiring in the active session view

In `app/sessions.tsx`, the climb card render (currently ~line 776-792) passes
`rightAction` conditionally:

```ts
rightAction={isActive && c.outcome === 'attempt' ? {
  label: 'Send',
  color: colors.accentGreen,
  onPress: async () => {
    await saveClimb({ ...c, outcome: 'send', attempts: (c.attempts ?? 1) + 1 });
    load();
  },
} : undefined}
```

`colors.accentGreen` is the same color already used for the `send` outcome
badge elsewhere in the app (see `components/UI.tsx`'s `OutcomeBadge`), so the
new button is visually consistent with existing send styling.

### 3. Data change

No schema changes. The update goes through the existing `saveClimb` function
(same one the `+` button already uses), setting both `outcome` and `attempts`
in a single write, followed by `load()` to refresh the screen state.

## Testing

- Manual verification in the iOS simulator/device:
  - Start a session, log a climb as an attempt.
  - Swipe the card right → "Send" button revealed on the left edge.
  - Tap it → card updates to `send` outcome, attempt count +1, no other
    fields change.
  - Confirm swipe-left-to-delete on the same card still works afterward.
  - Confirm cards with outcome `send`/`flash`/`hang` do not reveal a
    right-swipe button.
  - Confirm behavior is unaffected on the home screen recent-climbs list and
    in comment/session delete swipes elsewhere in the app.
