# Custom grade system — design

**Goal:** Let climbers log a grade in a gym-specific scale (e.g. "Purple", "Level 4") by choosing **Custom** next to the built-in systems, then typing free text instead of using the scroll wheel.

## Decisions

- **Scope:** boulders (V Scale / Font / **Custom**) and rope types (YDS / French / British / **Custom**).
- **Storage:** `gradeSystem: 'custom'`, `grade: <trimmed text>`. `grade_system` is an unconstrained text column in Supabase, so **no migration**.
- **Input:** when Custom is active the wheel is replaced by a text input (same 140pt box, placeholder "e.g. Purple, Level 4", max 12 chars). Empty custom grade blocks Save with an alert.
- **Counting:** custom climbs count toward climb totals, sends, and per-grade breakdowns.
- **Not counted as "hardest" or in grade averages:** they can't be ranked. Excluded from every hardest/average calculation (feed summaries, Sessions cards, profile hardest list and grade chart, Stats tab, share cards).
- **Custom-only session:** the Activity card and Sessions card show only Type and Climbs (the Hardest column is omitted, as for any session with no graded send). Type falls back to the session's first non-training climb.
- **Remembered:** last-used grade system per climb type includes Custom, and its last text is restored.
- **Projects:** Custom is not offered when logging/editing a project (project records store only grade text and re-infer the system from it, which would lose "custom"). Switching a form to Project while Custom is selected resets to the default grade.

## Out of scope

Converting custom grades to other systems, ranking/ordering custom grades, a per-gym custom scale, preferred-display-grade setting for custom.
