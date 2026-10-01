# Custom Grade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Custom" grade system with a free-text input, counted as climbs but never as "hardest".

**Architecture:** `'custom'` becomes a value of `GradeSystem`/`Climb.gradeSystem`. `GradePicker` swaps its wheel for a text input when Custom is active. A tiny helper `isCustomGrade()` in `utils/gradeUtils.ts` is used to exclude custom climbs from every hardest/average calculation. No DB migration (`grade_system` is unconstrained text). Spec: `docs/superpowers/specs/2026-09-21-custom-grade-design.md`.

**Tech Stack:** React Native (Expo 55), TypeScript. No test runner; verify with `npx tsc --noEmit` and the iOS simulator.

---

### Task 1: Type + helper

**Files:** `utils/theme.ts` (Climb interface), `utils/gradeUtils.ts`

- [ ] In `Climb`, change `gradeSystem: 'v-scale' | 'yds' | 'french' | 'british' | 'font';` to include `| 'custom'`.
- [ ] Append to `utils/gradeUtils.ts`:

```ts
// Custom (gym-specific) grades are free text and can't be ranked, so they're
// left out of every "hardest"/average calculation. They still count as climbs.
export function isCustomGrade(system?: string | null): boolean {
  return system === 'custom';
}
```

### Task 2: `GradePicker`

**Files:** `components/GradePicker.tsx`

- [ ] Add `TextInput` to the react-native import.
- [ ] `export type GradeSystem = 'v-scale' | 'yds' | 'french' | 'british' | 'font' | 'custom';` and `export const CUSTOM_GRADE_MAX_LENGTH = 12;`
- [ ] Add `allowCustom?: boolean;` to `Props` (default `true`), and `const CUSTOM_SYSTEM = { id: 'custom' as GradeSystem, label: 'Custom' };`
- [ ] `getGrades`: add `case 'custom': return [];`
- [ ] In the component: `const systems = [...(isBoulder ? BOULDER_SYSTEMS : ROPE_SYSTEMS), ...(allowCustom ? [CUSTOM_SYSTEM] : [])];` and `const isCustom = gradeSystem === 'custom';` and only compute `validSelected` for non-custom.
- [ ] `handleSystemChange`: `onChange(system === 'custom' ? '' : getGrades(system)[0]);`
- [ ] Right column: when `isCustom`, render instead of `<Picker>`:

```tsx
<View style={styles.customCol}>
  <TextInput
    style={[styles.customInput, { color: colors.textPrimary, backgroundColor: colors.bgCard, borderColor: colors.border, fontFamily: FONTS.family.bold }]}
    value={selected}
    onChangeText={onChange}
    placeholder="e.g. Purple, Level 4"
    placeholderTextColor={colors.textMuted}
    maxLength={CUSTOM_GRADE_MAX_LENGTH}
    autoCorrect={false}
    returnKeyType="done"
  />
</View>
```

- [ ] Styles: `customCol: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACING.md }`, `customInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, fontSize: 20 }`.

### Task 3: `LogClimbModal`

**Files:** `components/LogClimbModal.tsx`

- [ ] `import GradePicker, { GradeSystem } from './GradePicker';`
- [ ] `const [gradeSystem, setGradeSystem] = useState<GradeSystem>('v-scale');` (also clears two pre-existing tsc errors).
- [ ] `restoreLastGrade`: boulder valid list `['v-scale', 'font', 'custom']`, rope valid list `['yds', 'french', 'british', 'custom']`; default grade for `custom` is `''` (`resolved === 'custom' ? '' : …` in both branches); use `setGradeSystem(resolved as GradeSystem)`.
- [ ] After the existing `useEffect`s add: when `isProject` turns on while system is custom, reset to `v-scale`/`V3` (boulder) or `yds`/`5.10a`.
- [ ] `handleSave`: before `setSaving(true)`, if `!isTraining && gradeSystem === 'custom' && !grade.trim()` → `Alert.alert('Enter a grade', 'Type the grade your gym uses, or pick another grade system.'); return;`
- [ ] Save `grade.trim()` (both `saveLastGrade(climbType, grade.trim())` and the `climb.grade`).
- [ ] `<GradePicker … allowCustom={!isProject && !editProjectMode} />`

### Task 4: `AddProjectModal`

**Files:** `components/AddProjectModal.tsx`

- [ ] Pass `allowCustom={false}` to `<GradePicker>`.

### Task 5: Exclude custom from "hardest"/averages

**Files:** `utils/friendsApi.ts`, `utils/sessionHelpers.ts`, `components/SessionCard.tsx`, `app/account.tsx`, `app/friends.tsx`, `app/stats.tsx`, `components/SessionShareCard.tsx`, `SessionShareCardVertical.tsx`, `SessionShareCardStrava.tsx`

- [ ] `friendsApi.ts` (feed summaries): add `&& !isCustomGrade(c.grade_system)` to the `gradedClimbs` filter.
- [ ] `sessionHelpers.ts` `sessionStats`: add `&& !isCustomGrade(c.gradeSystem)` to the `hardest` filter.
- [ ] `SessionCard.tsx`: type label falls back when `hardest` is missing — `const typeSource = hardest ?? day.climbs.find(c => c.type !== 'hangboard' && c.type !== 'lift'); const climbTypeLabel = CLIMB_TYPES.find(t => t.id === typeSource?.type)?.label ?? '—';`
- [ ] `account.tsx`: `typeSends` filter adds `&& !isCustomGrade(c.gradeSystem)`; `sysCounts` built from `sends.filter(c => !isCustomGrade(c.gradeSystem))`.
- [ ] `friends.tsx` (profile hardest by type): `typeSends` adds `&& !isCustomGrade(c.grade_system)`.
- [ ] `stats.tsx`: `sysCounts` built from non-custom sends; per-style `hardest` sorted over non-custom climbs only.
- [ ] Three share cards: `hardestLabel` candidates add `&& !isCustomGrade(c.gradeSystem)`.

### Task 6: Verify

- [ ] `npx tsc --noEmit` shows no new errors (and the two `LogClimbModal` gradeSystem errors are gone).
- [ ] Sim: open Log Climb → Custom appears for boulder and for Top Rope; picking it swaps the wheel for a text box; Save with empty box alerts; with "Purple" saves without error (custom grade syncs, no migration needed).
- [ ] Sim: a session with only custom climbs shows Type + Climbs but no Hardest; mixed with V3 shows Hardest V3.
- [ ] Sim: the Project pill hides Custom; Custom is not offered in Add Project.
