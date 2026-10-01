# Hold Color Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let climbers tag an indoor climb with the hold color of its route, and show that color on climb cards and the climb detail modal.

**Architecture:** A new optional `holdColor` field on `Climb` (11 preset ids), persisted locally with the climb and synced to a new nullable `hold_color` column on the Supabase `climbs` table. A single shared `HoldColorDot` component renders the swatch. Spec: `docs/superpowers/specs/2026-09-21-hold-color-design.md`.

**Tech Stack:** React Native (Expo 55), TypeScript, Supabase. No test runner exists in this repo, so each task is verified with `npx tsc --noEmit` and the iOS simulator.

**Deploy order:** the SQL migration (Task 2) must be applied in production Supabase BEFORE any OTA update ships.

---

### Task 1: Palette, type, and helper

**Files:**
- Modify: `utils/theme.ts` (after `CLIMB_STYLES`, the `StyleId` type block, and the `Climb` interface)

- [ ] **Step 1: Add `HOLD_COLORS` directly after `CLIMB_STYLES`**

```ts
export const HOLD_COLORS = [
  { id: 'red',    label: 'Red',    hex: '#E03131' },
  { id: 'orange', label: 'Orange', hex: '#F76707' },
  { id: 'yellow', label: 'Yellow', hex: '#FAB005' },
  { id: 'green',  label: 'Green',  hex: '#2F9E44' },
  { id: 'teal',   label: 'Teal',   hex: '#12A594' },
  { id: 'blue',   label: 'Blue',   hex: '#1C7ED6' },
  { id: 'purple', label: 'Purple', hex: '#7048E8' },
  { id: 'pink',   label: 'Pink',   hex: '#E64980' },
  { id: 'white',  label: 'White',  hex: '#FFFFFF' },
  { id: 'black',  label: 'Black',  hex: '#1A1A1A' },
  { id: 'gray',   label: 'Gray',   hex: '#868E96' },
] as const;
```

- [ ] **Step 2: Add the id type next to `StyleId`**

```ts
export type HoldColorId  = typeof HOLD_COLORS[number]['id'];
```

- [ ] **Step 3: Add the field to `Climb`, after `projectName`**

```ts
  holdColor?: HoldColorId;  // gym hold color of the route (indoor climbs only)
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "utils/theme" ; echo done`
Expected: no lines for `utils/theme`, then `done`.

---

### Task 2: Database migration file

**Files:**
- Create: `supabase_add_hold_color.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Hold color of the route for indoor climbs (e.g. 'red', 'teal'). Nullable; old rows stay NULL.
-- APPLY THIS IN PRODUCTION BEFORE SHIPPING THE OTA THAT SENDS hold_color.
alter table climbs add column if not exists hold_color text;
```

- [ ] **Step 2: (User) apply it** in the Supabase SQL editor. Not run by Claude.

---

### Task 3: Sync + row mappers

**Files:**
- Modify: `utils/cloudSync.ts` (`climbToRow` ~line 449, `rowToClimb` ~line 505)
- Modify: `app/friends.tsx` (two mappers, the `route_name: c.route_name` ones)
- Modify: `components/ActivityCard.tsx` (`mapToClimb`)
- Modify: `app/stats.tsx` (the two `r.route_name` mappers)

- [ ] **Step 1: `climbToRow` — add after `route_name`**

```ts
    // Only sent when set, so climbs without a hold color keep syncing even
    // if the hold_color column hasn't been added to the database yet.
    ...(c.holdColor ? { hold_color: c.holdColor } : {}),
```

- [ ] **Step 2: `rowToClimb` — add after `routeName`**

```ts
    holdColor: row.hold_color ?? undefined,
```

- [ ] **Step 3: friends.tsx, both mappers — add `holdColor: c.hold_color,` next to `routeName: c.route_name,`**

- [ ] **Step 4: ActivityCard.tsx `mapToClimb` — add `holdColor: c.hold_color,` next to `routeName: c.route_name,`**

- [ ] **Step 5: stats.tsx, the climbs mapper (it feeds `bulkSaveClimbs`, so omitting it would wipe the color locally on every Stats refresh) — add `holdColor: r.hold_color ?? undefined,` next to `routeName: r.route_name ?? undefined,`**

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "cloudSync|friends.tsx|ActivityCard|stats.tsx" ; echo done`
Expected: no lines, then `done`.

---

### Task 4: Shared `HoldColorDot` component

**Files:**
- Modify: `components/UI.tsx` (append after `GradeBadge`)

- [ ] **Step 1: Add the import of `HOLD_COLORS`/`HoldColorId` to the existing `../utils/theme` import in `UI.tsx`.**

- [ ] **Step 2: Add the component**

```tsx
// ─── Hold Color Dot ──────────────────────────────────────────────────────────

export function HoldColorDot({ colorId, size = 14 }: { colorId: HoldColorId; size?: number }) {
  const hex = HOLD_COLORS.find(c => c.id === colorId)?.hex;
  if (!hex) return null;
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: hex,
        // Neutral ring so white/black stay visible on both light and dark themes.
        borderWidth: 1, borderColor: 'rgba(128,128,128,0.55)',
      }}
    />
  );
}
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit 2>&1 | grep "components/UI" ; echo done` → no lines.

---

### Task 5: Form section in `LogClimbModal`

**Files:**
- Modify: `components/LogClimbModal.tsx`

- [ ] **Step 1: Imports** — add `HOLD_COLORS` to the theme value import and `HoldColorId` to the theme type import; add `HoldColorDot` to `import { Pill, Divider } from './UI';`.

- [ ] **Step 2: State** — after `const [routine, setRoutine] = useState('');`:

```tsx
  const [holdColor, setHoldColor]           = useState<HoldColorId | undefined>();
```

- [ ] **Step 3: Prefill when editing** — in the "Load existing climb data" effect, after `setSelectedStyles(existingClimb.styles);`:

```tsx
      setHoldColor(existingClimb.holdColor);
```

- [ ] **Step 4: Reset** — in `resetForm()`, after `setSelectedStyles([]);`:

```tsx
    setHoldColor(undefined);
```

- [ ] **Step 5: Save** — in the `climb: Climb = {...}` object, after `projectName: ...`:

```tsx
        holdColor: environment === 'indoor' && !isTraining ? holdColor : undefined,
```

(This also guarantees a color picked earlier and then hidden by switching to Outdoor/training is never saved.)

- [ ] **Step 6: Section markup** — directly after the closing `)}` of the "Style — hidden for training" block and before the "Routine" block:

```tsx
            {/* Hold color — indoor, non-training only */}
            {!isTraining && environment === 'indoor' && (
              <>
                <Text style={[styles.label, { color: colors.textMuted }]}>HOLD COLOR (optional)</Text>
                <View style={styles.row}>
                  {HOLD_COLORS.map(c => {
                    const selected = holdColor === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => setHoldColor(selected ? undefined : c.id)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`${c.label} holds${selected ? ', selected' : ''}`}
                        style={[
                          styles.swatchWrap,
                          { borderColor: selected ? colors.accent : 'transparent' },
                        ]}
                      >
                        <HoldColorDot colorId={c.id} size={28} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Divider />
              </>
            )}
```

- [ ] **Step 7: Style** — add to the `StyleSheet` next to `pill`:

```tsx
  swatchWrap: { borderWidth: 2, borderRadius: 22, padding: 3, marginRight: SPACING.sm, marginBottom: SPACING.sm },
```

- [ ] **Step 8: Typecheck** — `npx tsc --noEmit 2>&1 | grep LogClimbModal ; echo done` → no lines.

---

### Task 6: Display on `ClimbCard` and `ClimbDetailModal`

**Files:**
- Modify: `components/ClimbCard.tsx`
- Modify: `components/ClimbDetailModal.tsx`

- [ ] **Step 1: ClimbCard** — import `HoldColorDot` (`import { GradeBadge, OutcomeBadge, HoldColorDot } from './UI';`). Replace the grade badge line in `topRow`:

```tsx
        {!isTraining && (
          <View style={styles.gradeGroup}>
            <GradeBadge grade={climb.grade} outcome={climb.outcome} />
            {climb.holdColor ? <HoldColorDot colorId={climb.holdColor} /> : null}
          </View>
        )}
```

and add the style: `gradeGroup: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },`

- [ ] **Step 2: ClimbDetailModal** — import `HoldColorDot`, `HOLD_COLORS`. Add a card after the Styles card and before Notes:

```tsx
          {/* Hold color */}
          {climb.holdColor ? (
            <View style={[ss.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <Text style={[ss.sectionLabel, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>HOLD COLOR</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                <HoldColorDot colorId={climb.holdColor} size={18} />
                <Text style={[ss.notesText, { color: colors.textPrimary, fontFamily: FONTS.family.medium }]}>
                  {HOLD_COLORS.find(c => c.id === climb.holdColor)?.label ?? climb.holdColor}
                </Text>
              </View>
            </View>
          ) : null}
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit 2>&1 | grep -E "ClimbCard|ClimbDetailModal" ; echo done` → no lines.

---

### Task 7: Verify in the simulator

- [ ] **Step 1:** Log a new indoor boulder climb with **Teal**; save. The section appears under Style; the card shows a teal dot next to the grade.
- [ ] **Step 2:** Open the climb; the detail modal shows "Hold color · Teal". Edit it; teal is pre-selected; tapping it clears it.
- [ ] **Step 3:** Switch Environment to Outdoor and pick Hangboard/Lift; the section disappears.
- [ ] **Step 4:** Existing climbs with no color look unchanged.
- [ ] **Step 5:** After the migration is applied, confirm the color survives a sync round trip (log out/in) and shows on a friend's expanded "View climbs".
