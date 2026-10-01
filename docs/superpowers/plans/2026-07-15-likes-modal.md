# Likes List Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tapping the likes row (any avatar, or the "N likes" text) on an activity feed card or a Sessions tab card opens a modal listing everyone who liked it, each row tappable to that person's profile — replacing today's behavior where only the frontmost (visually, the most recent) avatar is actually tappable, and only to that one person.

**Architecture:** Single-file change to `components/LikesAvatarRow.tsx`. It already receives the full `likers: Liker[]` array from both call sites (`ActivityCard.tsx`, `SessionCard.tsx`) — no new data fetching. The whole row becomes one `TouchableOpacity` that opens a self-contained `Modal` (local `useState`), styled to match the existing Following/Followers modal in `app/account.tsx`. Rows inside the modal call the same `onPressLiker` prop that avatars used to call directly — so `ActivityCard.tsx` and `SessionCard.tsx` need zero changes.

**Tech Stack:** React Native / Expo, TypeScript. No test framework in this repo — verification is manual, in a simulator or device.

---

### Task 1: Rewrite `LikesAvatarRow` to open a full-list modal

**Files:**
- Modify: `components/LikesAvatarRow.tsx` (full rewrite, currently 55 lines)

- [ ] **Step 1: Replace the entire file contents**

Current behavior being replaced: each of the first 3 avatars is its own `TouchableOpacity` calling `onPressLiker(l)` directly (skipped for the current user); the "N likes" text has no `onPress` at all.

Replace the full contents of `components/LikesAvatarRow.tsx` with:

```tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Modal, ScrollView } from 'react-native';
import { FONTS, SPACING } from '../utils/theme';

export interface Liker {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export default function LikesAvatarRow({
  likers,
  onPressLiker,
  currentUserId,
  colors,
}: {
  likers: Liker[];
  onPressLiker?: (liker: Liker) => void;
  currentUserId?: string;
  colors: any;
}) {
  const [modalVisible, setModalVisible] = useState(false);

  if (likers.length === 0) return null;

  return (
    <>
      <TouchableOpacity style={styles.likeCountRow} onPress={() => setModalVisible(true)} activeOpacity={0.7}>
        <View style={styles.avatarStack}>
          {likers.slice(0, 3).map((l, i) => (
            l.avatarUrl
              ? <Image key={l.id} source={{ uri: l.avatarUrl }} style={[styles.likeAvatar, { marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i }]} />
              : <View key={l.id} style={[styles.likeAvatar, styles.likeAvatarFallback, { marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i, backgroundColor: colors.border }]} />
          ))}
        </View>
        <Text style={[styles.cardCountTxt, { color: colors.textMuted }]}>
          {likers.length} {likers.length === 1 ? 'like' : 'likes'}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.bg }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Likes</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)} activeOpacity={0.7}>
              <Text style={[styles.modalDone, { color: colors.accent }]}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalList}>
            {likers.map(l => {
              const isSelf = l.userId === currentUserId;
              return (
                <TouchableOpacity
                  key={l.id}
                  style={[styles.modalRow, { borderBottomColor: colors.border }]}
                  activeOpacity={isSelf ? 1 : 0.7}
                  disabled={isSelf}
                  onPress={() => { setModalVisible(false); onPressLiker?.(l); }}
                >
                  <View style={[styles.modalAvatar, { backgroundColor: colors.accentSoft }]}>
                    {l.avatarUrl ? (
                      <Image source={{ uri: l.avatarUrl }} style={styles.modalAvatarImage} />
                    ) : (
                      <Text style={[styles.modalAvatarText, { color: colors.accent }]}>
                        {(l.name ?? '?')[0].toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.modalName, { color: colors.textPrimary }]}>{l.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  likeCountRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  likeAvatar: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#fff' },
  likeAvatarFallback: {},
  cardCountTxt: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.bold },
  modalDone: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.medium },
  modalList: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  modalAvatarImage: { width: '100%', height: '100%', borderRadius: 22 },
  modalAvatarText: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.bold },
  modalName: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.semibold },
});
```

Note what stayed the same: the `Liker` interface, the component's props signature (`likers`, `onPressLiker`, `currentUserId`, `colors`), the `likers.length === 0` early return, and the collapsed row's visual appearance (3 stacked avatars + "N likes" text) are all unchanged — only the interaction (whole row now opens a modal instead of per-avatar navigation) and the addition of the modal itself are new.

- [ ] **Step 2: Type-check**

Run `npx tsc --noEmit`. Confirm the total `error TS` count matches the pre-existing baseline (check with `npx tsc --noEmit 2>&1 | grep -c "error TS"` before and after this change — they should be equal; this file had zero errors before and should have zero after).

- [ ] **Step 3: Commit**

```bash
git add components/LikesAvatarRow.tsx
git commit -m "Show full likes list in a modal instead of only the frontmost avatar"
```

---

### Task 2: Manual verification

**Files:** none (verification only)

This is a native Expo app — verification must happen in a simulator or on a physical device, not a browser preview.

- [ ] **Step 1: Activity feed, 1 like.** Find (or create, by liking a session from a second test account) a session with exactly 1 like. Tap the likes row. Confirm the modal opens, titled "Likes", showing that one person's avatar (or initial-letter fallback if they have no avatar) and name.

- [ ] **Step 2: Activity feed, 3+ likes.** Find or create a session with 3 or more likes. Tap the likes row (try tapping an avatar in the stack, and separately tapping the "N likes" text) — confirm both open the same modal, and it lists *all* likers, not just 3.

- [ ] **Step 3: Tap a liker's row.** Confirm the modal closes and navigates to that person's profile. Repeat for a couple of different rows to confirm it's not always navigating to the same (e.g. first or last) person.

- [ ] **Step 4: Tap your own row (if you're one of the likers).** Confirm nothing happens — no navigation, no modal-close-then-reopen weirdness.

- [ ] **Step 5: Sessions tab.** Open a closed session card in non-condensed view with likes on it. Confirm the same likes row + modal behavior works identically there.

- [ ] **Step 6: Condensed session cards.** Toggle the Sessions tab to condensed view. Confirm cards with likes don't show the likes row at all (unrelated to this change — condensed view already hides it — just confirming no regression).

- [ ] **Step 7: Report results.** Do not check this task off as complete until actually exercised in a simulator/device.
