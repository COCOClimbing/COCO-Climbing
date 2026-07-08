# Swipe-to-Send Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a climber swipe an `attempt`-outcome climb card right, during an active session, to convert it to a `send` and bump its attempt count by 1.

**Architecture:** Extend the existing `SwipeToDelete` component (currently left-swipe-only) with an optional `rightAction` prop that mirrors the existing Delete button/gesture in the opposite direction. Wire it up only in the active-session climb list in `app/sessions.tsx`, gated to `outcome === 'attempt'`. No other call sites of `SwipeToDelete` are touched — omitting `rightAction` preserves current behavior exactly.

**Tech Stack:** React Native, `Animated` + `PanResponder` (no new libraries). No test framework exists in this repo (no jest config, no `*.test.tsx` files) — verification is manual, via iOS simulator, matching how every other feature in this codebase is validated.

Spec: `docs/superpowers/specs/2026-07-07-swipe-to-send-design.md`

---

### Task 1: Add `rightAction` support to `SwipeToDelete`

**Files:**
- Modify: `components/SwipeToDelete.tsx`

- [ ] **Step 1: Add the `rightAction` prop to the interface**

In `components/SwipeToDelete.tsx`, update the `Props` interface (currently lines 12-19):

```ts
interface Props {
  children: React.ReactNode;
  onDelete: () => void;
  disabled?: boolean;
  heightOffset?: number;
  onSwipeStart?: () => void;
  onSwipeEnd?: () => void;
  rightAction?: { label: string; color: string; onPress: () => void };
}
```

- [ ] **Step 2: Destructure the new prop in the component signature**

Update the function signature (currently line 21):

```ts
export default function SwipeToDelete({ children, onDelete, disabled, heightOffset = SPACING.md, onSwipeStart, onSwipeEnd, rightAction }: Props) {
```

- [ ] **Step 3: Allow rightward drag when `rightAction` is present**

In `onMoveShouldSetPanResponder` (currently line 47-48) — no change needed, it already just checks drag distance/angle, not direction.

Update `onPanResponderMove` (currently lines 54-59) to clamp against `+REVEAL` when `rightAction` is provided, otherwise keep the existing left-only clamp:

```ts
onPanResponderMove: (_, g) => {
  const max = rightAction ? REVEAL : 0;
  const clamped = Math.min(max, Math.max(-REVEAL, currentX.current + g.dx));
  translateX.setValue(clamped - currentX.current);
},
```

- [ ] **Step 4: Handle release for the rightward direction**

Update `onPanResponderRelease` (currently lines 60-72):

```ts
onPanResponderRelease: (_, g) => {
  translateX.flattenOffset();
  const max = rightAction ? REVEAL : 0;
  const total = Math.min(max, Math.max(-REVEAL, currentX.current + g.dx));
  onSwipeEndRef.current?.();
  if (total < -(REVEAL / 2)) {
    currentX.current = -REVEAL;
    Animated.spring(translateX, {
      toValue: -REVEAL, useNativeDriver: true, bounciness: 0, speed: 20,
    }).start();
  } else if (rightAction && total > REVEAL / 2) {
    currentX.current = REVEAL;
    Animated.spring(translateX, {
      toValue: REVEAL, useNativeDriver: true, bounciness: 0, speed: 20,
    }).start();
  } else {
    snapClosed();
  }
},
```

- [ ] **Step 5: Add opacity interpolation for the left-side button**

After the existing `btnOpacity` (currently lines 83-87), add a second interpolation for the right-swipe button:

```ts
const rightBtnOpacity = translateX.interpolate({
  inputRange: [0, 8, REVEAL],
  outputRange: [0, 0.15, 1],
  extrapolate: 'clamp',
});
```

- [ ] **Step 6: Render the left-edge button when `rightAction` is provided**

In the JSX (currently lines 91-119), add a second `Animated.View` alongside the existing Delete button, positioned on the left instead of the right:

```tsx
return (
  <View style={styles.wrapper}>
    {btnHeight > 0 && !disabled && (
      <Animated.View style={[styles.btn, {
        backgroundColor: colors.danger,
        height: btnHeight,
        width: REVEAL - GAP,
        top: 0,
        opacity: btnOpacity,
      }]}>
        <TouchableOpacity
          style={styles.btnInner}
          onPress={() => { snapClosed(); setTimeout(onDelete, 150); }}
          activeOpacity={0.8}
        >
          <Text style={[styles.btnTxt, { fontFamily: FONTS.family.semibold }]}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
    )}

    {btnHeight > 0 && !disabled && rightAction && (
      <Animated.View style={[styles.btnLeft, {
        backgroundColor: rightAction.color,
        height: btnHeight,
        width: REVEAL - GAP,
        top: 0,
        opacity: rightBtnOpacity,
      }]}>
        <TouchableOpacity
          style={styles.btnInner}
          onPress={() => { snapClosed(); setTimeout(rightAction.onPress, 150); }}
          activeOpacity={0.8}
        >
          <Text style={[styles.btnTxt, { fontFamily: FONTS.family.semibold }]}>{rightAction.label}</Text>
        </TouchableOpacity>
      </Animated.View>
    )}

    <Animated.View
      style={{ transform: [{ translateX }] }}
      {...(disabled ? {} : panResponder.panHandlers)}
      onLayout={(e: LayoutChangeEvent) => setCardHeight(e.nativeEvent.layout.height)}
    >
      {children}
    </Animated.View>
  </View>
);
```

- [ ] **Step 7: Add the `btnLeft` style**

Add alongside the existing `btn` style in the `StyleSheet.create` block (currently lines 122-132):

```ts
btnLeft: {
  position: 'absolute',
  left: 0,
  borderRadius: 12,
  overflow: 'hidden',
},
```

- [ ] **Step 8: Sanity-check the file compiles**

Run: `npx tsc --noEmit -p . 2>&1 | grep SwipeToDelete`
Expected: no output (no new errors referencing this file). Pre-existing unrelated errors elsewhere in the repo are fine and out of scope.

- [ ] **Step 9: Commit**

```bash
git add components/SwipeToDelete.tsx
git commit -m "Add optional rightAction to SwipeToDelete for swipe-right gestures"
```

---

### Task 2: Wire swipe-to-send into the active session climb list

**Files:**
- Modify: `app/sessions.tsx:776-792`

- [ ] **Step 1: Add `rightAction` to the `SwipeToDelete` wrapping each climb card**

In `app/sessions.tsx`, the climb list render currently reads:

```tsx
{displayClimbs.length === 0
  ? <Text style={[styles.noClimbs, { color: colors.textMuted }]}>No climbs logged yet</Text>
  : displayClimbs.map(c => (
    <SwipeToDelete key={c.id} onSwipeStart={() => setDetailScrollEnabled(false)} onSwipeEnd={() => setDetailScrollEnabled(true)} onDelete={async () => { await deleteClimb(c.id); triggerStatsRefresh(); load(); }}>
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
```

Change it to add a `rightAction` prop on the `SwipeToDelete`:

```tsx
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
```

Note: `triggerStatsRefresh()` is added to the new `onPress` because converting to a send changes the session's send count, which feeds the stats row above (same reasoning as why `onDelete` already calls it).

- [ ] **Step 2: Sanity-check the file compiles**

Run: `npx tsc --noEmit -p . 2>&1 | grep "sessions.tsx"`
Expected: same pre-existing errors as before this change (lines 122, 892 per the baseline captured during the prior activity-feed fix session), nothing new introduced by this edit.

- [ ] **Step 3: Commit**

```bash
git add app/sessions.tsx
git commit -m "Wire swipe-right-to-send into active session climb cards"
```

---

### Task 3: Manual verification in the simulator

**Files:** none (verification only)

- [ ] **Step 1: Launch the app**

Use the `run` skill (or `npx expo start` + iOS simulator) to launch COCO.

- [ ] **Step 2: Start a session and log an attempt**

Start a new session, log a climb with outcome "Attempt" (e.g. a boulder problem you didn't send).

- [ ] **Step 3: Verify swipe-right reveals Send**

On the climb card in the active session's climb list, swipe right. Confirm a green "Send" button is revealed on the left edge of the card, and swiping left still reveals the red "Delete" button on the right edge as before.

- [ ] **Step 4: Verify tapping Send converts the climb**

Tap the "Send" button. Confirm:
- The card's outcome badge changes to "Send".
- The attempt count shown on the card increases by 1 from what it was before the swipe.
- The session's "sends" stat at the top of the screen increments by 1.

- [ ] **Step 5: Verify the button disappears once converted**

Confirm that after conversion, swiping right on that same card no longer reveals anything (since `outcome` is no longer `attempt`), while swipe-left-to-delete still works.

- [ ] **Step 6: Verify other outcomes are unaffected**

Log a climb as "Flash" or "Hang". Confirm swiping right on that card does nothing (no button revealed).

- [ ] **Step 7: Verify other `SwipeToDelete` usages are unaffected**

Check the home screen recent-climbs list and a friend's activity comment (if easily reachable) still only support left-swipe-to-delete, with no new right-swipe behavior.

---

### Task 4: Finalize the activity-feed fix from the prior debugging session

This is already implemented and verified (no new type errors) in `app/friends.tsx` — it filters a friend's climbs to only those belonging to sessions with `ended_at` set, so an in-progress session can no longer leak into the activity feed. It was not yet committed.

**Files:**
- Modify (already done, needs commit): `app/friends.tsx`

- [ ] **Step 1: Review the diff one more time before committing**

Run: `git diff app/friends.tsx`
Expected: includes the `endedSessionIds` / `eligibleClimbs` filter added around the friend-climbs grouping logic, alongside other pre-existing uncommitted local changes (followers/following sheet, photo pre-fetch) already in the working tree from before this session.

- [ ] **Step 2: Commit**

```bash
git add app/friends.tsx
git commit -m "Exclude in-progress sessions' climbs from the activity feed"
```
